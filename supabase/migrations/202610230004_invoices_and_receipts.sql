create table public.invoices (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),agreement_id uuid not null,milestone_id uuid references public.milestones(id),
 title text not null check(length(title) between 3 and 150),amount_atomic text not null check(amount_atomic~'^[0-9]{1,18}$' and amount_atomic::numeric>0),currency text not null,decimals integer not null,
 status text not null default 'draft' check(status in ('draft','issued','void')),due_date date,recipient text,network text check(network in ('testnet','mainnet')),coin_type text,
 created_at timestamptz not null default now(),issued_at timestamptz,
 foreign key(project_id,agreement_id) references public.agreement_versions(project_id,id),unique(project_id,id),
 check((recipient is null and network is null and coin_type is null) or (currency='USDC' and recipient is not null and recipient~'^0x[0-9a-f]{64}$' and network is not null and coin_type is not null))
);
create table public.payment_records (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,invoice_id uuid not null,amount_atomic text not null check(amount_atomic~'^[0-9]{1,18}$' and amount_atomic::numeric>0),source text not null check(source in ('manual','sui')),
 note text not null default '' check(length(note)<=500),paid_at timestamptz not null,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),idempotency_key uuid not null,
 reversed_at timestamptz,network text,digest text,foreign key(project_id,invoice_id) references public.invoices(project_id,id),unique(created_by,idempotency_key),unique(network,digest),
 check((source='manual' and network is null and digest is null) or (source='sui' and network in ('testnet','mainnet') and digest is not null))
);
create table public.payment_requests (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,invoice_id uuid not null,payer text not null check(payer~'^0x[0-9a-f]{64}$'),amount_atomic text not null check(amount_atomic~'^[0-9]{1,18}$' and amount_atomic::numeric>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
 foreign key(project_id,invoice_id) references public.invoices(project_id,id)
);
create table public.payment_claims (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),request_id uuid not null references public.payment_requests(id),digest text not null check(length(digest) between 40 and 50),
 status text not null default 'checking' check(status in ('checking','retryable','rejected','verified','credited')),reason text,proof jsonb,created_at timestamptz not null default now(),checked_at timestamptz,
 lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default now()+interval '60 seconds',unique(request_id,digest)
);
create index invoices_project on public.invoices(project_id,created_at desc);
create index payments_invoice on public.payment_records(invoice_id);
create index requests_invoice on public.payment_requests(invoice_id,created_at desc);
create index claims_project on public.payment_claims(project_id,created_at desc);
create table private.payment_attempts(owner_id uuid not null,created_at timestamptz not null default now());
create index payment_attempts_actor on private.payment_attempts(owner_id,created_at desc);
revoke all on private.payment_attempts from public,anon,authenticated;
alter table public.invoices enable row level security;
alter table public.payment_records enable row level security;
alter table public.payment_requests enable row level security;
alter table public.payment_claims enable row level security;
create policy invoices_read on public.invoices for select to authenticated using(private.member_role(project_id) is not null and (issued_at is not null or private.member_role(project_id)='freelancer'));
create policy payment_records_read on public.payment_records for select to authenticated using(private.member_role(project_id) is not null);
create policy payment_requests_read on public.payment_requests for select to authenticated using(private.member_role(project_id) is not null);
create policy payment_claims_read on public.payment_claims for select to authenticated using(private.member_role(project_id) is not null);
revoke all on public.invoices,public.payment_records,public.payment_requests,public.payment_claims from public,anon,authenticated;
grant select on public.invoices,public.payment_records,public.payment_requests to authenticated;
grant select(id,project_id,request_id,digest,status,reason,proof,created_at,checked_at) on public.payment_claims to authenticated;
create function public.draft_invoice(p_project uuid,p_agreement uuid,p_title text,p_amount text,p_due date default null,p_milestone uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare agreement public.agreement_versions;total numeric;result uuid;
begin
 perform 1 from public.projects where id=p_project for update;
 if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can draft an invoice.'; end if;
 if not exists(select 1 from public.projects where id=p_project and active_agreement_id=p_agreement) then raise exception 'Use the current approved agreement.'; end if;
 select * into agreement from public.agreement_versions where id=p_agreement;
 if p_amount is null or p_amount!~'^[0-9]{1,18}$' or p_amount::numeric<=0 then raise exception 'Enter a positive exact amount.'; end if;
 if exists(select 1 from public.invoices where project_id=p_project and status<>'void' and currency<>agreement.currency) then raise exception 'Existing invoices use another currency. Reconcile them before changing invoice currency.'; end if;
 select coalesce(sum(amount_atomic::numeric),0) into total from public.invoices where project_id=p_project and status<>'void';
 if total+p_amount::numeric>agreement.amount_atomic::numeric then raise exception 'The invoice would exceed the approved project total.'; end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where id=p_milestone and project_id=p_project) then raise exception 'Milestone not found in this project.'; end if;
 insert into public.invoices(project_id,agreement_id,milestone_id,title,amount_atomic,currency,decimals,due_date) values(p_project,p_agreement,p_milestone,btrim(p_title),p_amount,agreement.currency,agreement.decimals,p_due) returning id into result;return result;
end $$;
create function public.issue_invoice(p_id uuid,p_network text default null,p_recipient text default null) returns void language plpgsql security definer set search_path='' as $$
declare invoice public.invoices;asset text;
begin
 select * into invoice from public.invoices where id=p_id;
 perform 1 from public.projects where id=invoice.project_id for update;
 if private.member_role(invoice.project_id) is distinct from 'freelancer' then raise exception 'Only the freelancer can issue an invoice.'; end if;
 select * into invoice from public.invoices where id=p_id for update;
 if invoice.status='issued' then return; end if;
 if invoice.status<>'draft' then raise exception 'This invoice cannot be issued.'; end if;
 if not exists(select 1 from public.projects where id=invoice.project_id and active_agreement_id=invoice.agreement_id) then raise exception 'The approved agreement changed. Void this draft and prepare a current invoice.'; end if;
 if p_network is not null or p_recipient is not null then
  if invoice.currency<>'USDC' or p_network is null or p_network not in ('mainnet','testnet') or p_recipient is null or p_recipient!~'^0x[0-9a-f]{64}$' then raise exception 'Check the Sui recipient and network.'; end if;
  asset:=case when p_network='testnet' then '0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC' else '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC' end;
 end if;
 update public.invoices set status='issued',issued_at=now(),recipient=p_recipient,network=p_network,coin_type=asset where id=p_id;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(invoice.project_id,auth.uid(),'invoice_issued',p_id);
end $$;
create function public.void_invoice(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare invoice public.invoices;
begin
 select * into invoice from public.invoices where id=p_id;perform 1 from public.projects where id=invoice.project_id for update;
 if private.member_role(invoice.project_id) is distinct from 'freelancer' then raise exception 'Only the freelancer can void invoices.'; end if;
 if exists(select 1 from public.payment_records where invoice_id=p_id and reversed_at is null) or exists(select 1 from public.payment_requests where invoice_id=p_id and expires_at>now()) or exists(select 1 from public.payment_claims pc join public.payment_requests pr on pr.id=pc.request_id where pr.invoice_id=p_id and pc.status in ('checking','verified','credited')) then raise exception 'Reconcile existing payments and payment requests before voiding this invoice.'; end if;
 update public.invoices set status='void' where id=p_id and status<>'void';
 if found and invoice.status='issued' then insert into public.activity_events(project_id,actor_id,kind,record_id) values(invoice.project_id,auth.uid(),'invoice_voided',p_id);end if;
end $$;
create function public.record_manual_payment(p_invoice uuid,p_amount text,p_note text,p_paid_at timestamptz,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare invoice public.invoices;result uuid;
begin
 select * into invoice from public.invoices where id=p_invoice;perform 1 from public.projects where id=invoice.project_id for update;
 if private.member_role(invoice.project_id) is distinct from 'freelancer' then raise exception 'Only the freelancer can record received payments.';end if;
 select * into invoice from public.invoices where id=p_invoice;
 if invoice.status<>'issued' then raise exception 'Issue the invoice first.'; end if;
 select id into result from public.payment_records where created_by=auth.uid() and idempotency_key=p_key;if found then return result;end if;
 if p_paid_at is null or p_paid_at>now()+interval '5 minutes' then raise exception 'Use the actual received payment date.';end if;
 insert into public.payment_records(project_id,invoice_id,amount_atomic,source,note,paid_at,created_by,idempotency_key) values(invoice.project_id,p_invoice,p_amount,'manual',btrim(p_note),p_paid_at,auth.uid(),p_key) returning id into result;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(invoice.project_id,auth.uid(),'manual_payment_recorded',result);return result;
end $$;
create function public.reverse_manual_payment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare payment public.payment_records;
begin
 select * into payment from public.payment_records where id=p_id;perform 1 from public.projects where id=payment.project_id for update;
 if private.member_role(payment.project_id) is distinct from 'freelancer' or payment.source<>'manual' then raise exception 'Only manual payments can be reversed by the freelancer.';end if;
 update public.payment_records set reversed_at=now() where id=p_id and reversed_at is null;
 if found then insert into public.activity_events(project_id,actor_id,kind,record_id) values(payment.project_id,auth.uid(),'manual_payment_reversed',p_id);end if;
end $$;
create function public.prepare_payment_request(p_invoice uuid,p_payer text,p_amount text) returns uuid language plpgsql security definer set search_path='' as $$
declare invoice public.invoices;paid numeric;result uuid;
begin
 select * into invoice from public.invoices where id=p_invoice;perform 1 from public.projects where id=invoice.project_id for update;
 if private.member_role(invoice.project_id) is distinct from 'client' then raise exception 'Only the client can confirm payment instructions.';end if;
 select * into invoice from public.invoices where id=p_invoice;
 if invoice.status<>'issued' or invoice.recipient is null then raise exception 'This invoice has no active Sui instructions.';end if;
 if p_amount is null or p_amount!~'^[0-9]{1,18}$' or p_amount::numeric<=0 then raise exception 'Enter a positive exact amount.';end if;
 select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=p_invoice and reversed_at is null;
 if p_amount::numeric>greatest(0,invoice.amount_atomic::numeric-paid) then raise exception 'The requested amount exceeds the remaining invoice balance.';end if;
 insert into public.payment_requests(project_id,invoice_id,payer,amount_atomic,created_by) values(invoice.project_id,p_invoice,p_payer,p_amount,auth.uid()) returning id into result;return result;
end $$;
create function public.reserve_payment_check(p_request uuid,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare request public.payment_requests;claim public.payment_claims;
begin
 select * into request from public.payment_requests where id=p_request;
 if private.member_role(request.project_id) is null then raise exception 'Project access required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));perform 1 from public.projects where id=request.project_id for update;
 if not exists(select 1 from public.invoices where id=request.invoice_id and status='issued') then raise exception 'This invoice is no longer issued.';end if;
 if p_digest is null or p_digest!~'^[1-9A-HJ-NP-Za-km-z]{40,50}$' then raise exception 'Enter a Sui transaction digest.';end if;
 select * into claim from public.payment_claims where request_id=p_request and digest=p_digest for update;
 if found and claim.status in ('verified','credited','rejected') then return jsonb_build_object('id',claim.id,'cached',true);end if;
 if found and claim.status='checking' and claim.lease_until>now() then raise exception 'This receipt is already being checked.';end if;
 if (select count(*) from private.payment_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 or exists(select 1 from private.payment_attempts where owner_id=auth.uid() and created_at>now()-interval '10 seconds') then raise exception 'Please wait before checking another receipt.';end if;
 insert into private.payment_attempts(owner_id) values(auth.uid());
 if claim.id is null then insert into public.payment_claims(project_id,request_id,digest) values(request.project_id,p_request,p_digest) returning * into claim;
 else update public.payment_claims set status='checking',lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where id=claim.id returning * into claim;end if;
 return jsonb_build_object('id',claim.id,'lease_token',claim.lease_token,'cached',false);
end $$;
create function public.finish_payment_check(p_id uuid,p_token uuid,p_proof jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare claim public.payment_claims;request public.payment_requests;invoice public.invoices;
begin
 select * into claim from public.payment_claims where id=p_id;perform 1 from public.projects where id=claim.project_id for update;
 select * into claim from public.payment_claims where id=p_id for update;
 if claim.id is null or claim.status<>'checking' or p_token is null or claim.lease_token is distinct from p_token or claim.lease_until<now() then raise exception 'The verification lease expired.';end if;
 select * into request from public.payment_requests where id=claim.request_id;select * into invoice from public.invoices where id=request.invoice_id;
 if p_proof is not null then
  if invoice.status<>'issued' then raise exception 'The invoice is no longer issued.';end if;
  if coalesce(p_proof->>'provider','')<>'Tatum' or coalesce(p_proof->>'digest','')<>claim.digest or coalesce(p_proof->>'network','')<>invoice.network or coalesce(p_proof->>'chainId','')<>(case when invoice.network='testnet' then '4c78adac' else '35834a8a' end) or coalesce(p_proof->>'recipient','')<>invoice.recipient or coalesce(p_proof->>'sender','')<>request.payer or coalesce(p_proof->>'coinType','')<>invoice.coin_type or coalesce(p_proof->>'amountAtomic','')<>request.amount_atomic or nullif(p_proof->>'checkpoint','') is null or nullif(p_proof->>'timestamp','') is null or (p_proof->>'timestamp')::timestamptz not between request.created_at and request.expires_at then raise exception 'Payment proof does not match the immutable instructions.';end if;
 end if;
 update public.payment_claims set status=case when p_proof is not null then 'verified' when p_reason='mismatch' then 'rejected' else 'retryable' end,proof=p_proof,reason=p_reason,checked_at=now() where id=p_id;
end $$;
create function public.reconcile_verified_receipt(p_claim uuid,p_replace_manual uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare claim public.payment_claims;request public.payment_requests;invoice public.invoices;result uuid;manual public.payment_records;
begin
 select * into claim from public.payment_claims where id=p_claim;perform 1 from public.projects where id=claim.project_id for update;
 if private.member_role(claim.project_id) is distinct from 'freelancer' then raise exception 'Only the freelancer can reconcile a receipt.';end if;
 select * into claim from public.payment_claims where id=p_claim for update;
 if claim.status='credited' then select id into result from public.payment_records where network=claim.proof->>'network' and digest=claim.digest;return result;end if;
 if claim.status<>'verified' then raise exception 'A Tatum-verified receipt is required.';end if;
 select * into request from public.payment_requests where id=claim.request_id;select * into invoice from public.invoices where id=request.invoice_id;
 if invoice.status<>'issued' then raise exception 'The invoice is no longer issued.';end if;
 if p_replace_manual is not null then
  select * into manual from public.payment_records where id=p_replace_manual;
  if not found or manual.invoice_id<>invoice.id or manual.source<>'manual' or manual.reversed_at is not null or manual.amount_atomic<>request.amount_atomic then raise exception 'Choose the matching manual record on this invoice.';end if;
  update public.payment_records set reversed_at=now() where id=p_replace_manual;
 end if;
 insert into public.payment_records(project_id,invoice_id,amount_atomic,source,note,paid_at,created_by,idempotency_key,network,digest) values(claim.project_id,invoice.id,request.amount_atomic,'sui','Tatum verified; freelancer reconciled',(claim.proof->>'timestamp')::timestamptz,auth.uid(),p_claim,invoice.network,claim.digest) returning id into result;
 update public.payment_claims set status='credited' where id=p_claim;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(claim.project_id,auth.uid(),'sui_payment_reconciled',result);return result;
end $$;
revoke all on function public.draft_invoice(uuid,uuid,text,text,date,uuid),public.issue_invoice(uuid,text,text),public.void_invoice(uuid),public.record_manual_payment(uuid,text,text,timestamptz,uuid),public.reverse_manual_payment(uuid),public.prepare_payment_request(uuid,text,text),public.reserve_payment_check(uuid,text),public.finish_payment_check(uuid,uuid,jsonb,text),public.reconcile_verified_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.draft_invoice(uuid,uuid,text,text,date,uuid),public.issue_invoice(uuid,text,text),public.void_invoice(uuid),public.record_manual_payment(uuid,text,text,timestamptz,uuid),public.reverse_manual_payment(uuid),public.prepare_payment_request(uuid,text,text),public.reserve_payment_check(uuid,text),public.reconcile_verified_receipt(uuid,uuid) to authenticated;
grant execute on function public.finish_payment_check(uuid,uuid,jsonb,text) to service_role;

-- Authoritative totals include every receipt, even when the displayed history
-- is paginated. The invoker retains the underlying invoice/record RLS.
create view public.invoice_balances with (security_invoker=true) as
select i.id as invoice_id,i.project_id,
 coalesce(sum(p.amount_atomic::numeric) filter(where p.reversed_at is null),0)::text as paid,
 coalesce(sum(p.amount_atomic::numeric) filter(where p.reversed_at is null and p.source='manual'),0)::text as manual,
 coalesce(sum(p.amount_atomic::numeric) filter(where p.reversed_at is null and p.source='sui'),0)::text as verified,
 greatest(0,i.amount_atomic::numeric-coalesce(sum(p.amount_atomic::numeric) filter(where p.reversed_at is null),0))::text as outstanding,
 greatest(0,coalesce(sum(p.amount_atomic::numeric) filter(where p.reversed_at is null),0)-i.amount_atomic::numeric)::text as surplus
from public.invoices i left join public.payment_records p on p.invoice_id=i.id group by i.id;
revoke all on public.invoice_balances from public,anon;
grant select on public.invoice_balances to authenticated;
