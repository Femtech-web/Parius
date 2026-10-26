-- One immutable prepared transaction per active invoice; signatures stay out of storage.
create table public.payment_checkouts (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.payment_requests(id),
 project_id uuid not null references public.projects(id),invoice_id uuid not null references public.invoices(id),owner_id uuid not null references auth.users(id),
 mode text not null check(mode in ('wallet','sponsored')),status text not null default 'building' check(status in ('building','ready','uncertain','submitted','verified','credited','failed')),
 network text not null check(network in ('testnet','mainnet')),payer text not null,recipient text not null,coin_type text not null,amount_atomic text not null,
 digest text,gas_budget text,expires_epoch text,reason text,failure_evidence jsonb,created_at timestamptz not null default now(),last_attempt_at timestamptz,attempts integer not null default 0,
 unique(network,digest)
);
create unique index one_active_invoice_checkout on public.payment_checkouts(invoice_id) where status not in ('credited','failed');
create index checkouts_owner_time on public.payment_checkouts(owner_id,created_at desc);
create table private.payment_checkout_bytes (
 id uuid primary key references public.payment_checkouts(id),bytes text,
 lease_token uuid not null default gen_random_uuid(),lease_expires_at timestamptz not null default now()+interval '2 minutes'
);
revoke all on private.payment_checkout_bytes from public,anon,authenticated,service_role;
alter table public.payment_checkouts enable row level security;
create policy checkouts_members_read on public.payment_checkouts for select to authenticated using(private.member_role(project_id) is not null);
revoke all on public.payment_checkouts from public,anon,authenticated;
grant select on public.payment_checkouts to authenticated;

create function public.reserve_payment_checkout(p_request uuid,p_mode text) returns jsonb language plpgsql security definer set search_path='' as $$
declare req public.payment_requests;inv public.invoices;result public.payment_checkouts;payload private.payment_checkout_bytes;paid numeric;
begin
 select * into req from public.payment_requests where id=p_request;
 perform 1 from public.projects where id=req.project_id for update;
 if private.member_role(req.project_id) is distinct from 'client' or req.created_by is distinct from auth.uid() then raise exception 'Only the client who confirmed these instructions can pay.';end if;
 select * into inv from public.invoices where id=req.invoice_id;
 if p_mode is null or p_mode not in ('wallet','sponsored') or inv.status<>'issued' or req.expires_at<=clock_timestamp() then raise exception 'Use active invoice instructions.';end if;
 if inv.recipient=req.payer then raise exception 'The sender and recipient must be different.';end if;
 if not exists(select 1 from public.wallet_bindings where owner_id=auth.uid() and address=req.payer and network=inv.network and revoked_at is null) then raise exception 'Verify this sender wallet first.';end if;
 if exists(select 1 from public.payment_claims c join public.payment_requests r on r.id=c.request_id where r.invoice_id=inv.id and (c.status='verified' or (r.id=req.id and c.status='credited'))) then raise exception 'Reconcile the existing receipt before preparing another payment.';end if;
 select * into result from public.payment_checkouts where invoice_id=inv.id and status not in ('credited','failed') for update;
 if found then
  if result.request_id<>p_request then raise exception 'Resume or reconcile the existing payment on this invoice first.';end if;
  select * into payload from private.payment_checkout_bytes where id=result.id for update;
  if result.status='building' then
   if payload.lease_expires_at>clock_timestamp() then raise exception 'This payment is being prepared. Please retry shortly.';end if;
   update private.payment_checkout_bytes set lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes' where id=result.id returning * into payload;
  end if;
  return to_jsonb(result)||jsonb_build_object('lease_token',payload.lease_token,'bytes',payload.bytes,'request_expires_at',req.expires_at);
 end if;
 if (select count(*) from public.payment_checkouts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Payment preparation limit reached. Try later.';end if;
 if p_mode='sponsored' then
  perform pg_advisory_xact_lock(81701);
  -- Conservative aggregate reservation: at most 0.5 SUI of gas budgets per rolling 48h.
  -- Include confirmed transaction failures (gas can still be charged). Only never-submitted failures release budget.
  if (select coalesce(sum(coalesce(gas_budget,'50000000')::numeric),0) from public.payment_checkouts where mode='sponsored' and created_at>now()-interval '48 hours' and not(status='failed' and reason in ('preparation_unavailable','expired_unsigned')))+50000000>500000000
  then raise exception 'Gas sponsorship capacity is reached. You may explicitly choose wallet-paid gas.';end if;
 end if;
 select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=inv.id and reversed_at is null;
 if req.amount_atomic::numeric>greatest(0,inv.amount_atomic::numeric-paid) then raise exception 'The invoice balance changed. Review it before paying.';end if;
 insert into public.payment_checkouts(request_id,project_id,invoice_id,owner_id,mode,network,payer,recipient,coin_type,amount_atomic)
 values(req.id,req.project_id,inv.id,auth.uid(),p_mode,inv.network,req.payer,inv.recipient,inv.coin_type,req.amount_atomic) returning * into result;
 insert into private.payment_checkout_bytes(id) values(result.id) returning * into payload;
 return to_jsonb(result)||jsonb_build_object('lease_token',payload.lease_token,'bytes',null,'request_expires_at',req.expires_at);
end $$;
create function public.finish_payment_preparation(p_id uuid,p_token uuid,p_bytes text,p_digest text,p_budget text,p_epoch text,p_failed boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare plan public.payment_checkouts;payload private.payment_checkout_bytes;
begin
 select * into plan from public.payment_checkouts where id=p_id;
 perform 1 from public.projects where id=plan.project_id for update;
 select * into payload from private.payment_checkout_bytes where id=p_id for update;
 if plan.status<>'building' or payload.lease_token is distinct from p_token or payload.lease_expires_at<=clock_timestamp() then raise exception 'Preparation expired.';end if;
 if p_failed then update public.payment_checkouts set status='failed',reason='preparation_unavailable' where id=p_id;return;end if;
 if p_bytes is null or length(p_bytes) not between 20 and 32768 or p_digest is null or p_digest!~'^[1-9A-HJ-NP-Za-km-z]{32,44}$' or p_budget is null or p_budget!~'^[0-9]{1,10}$' or p_budget::numeric not between 1 and 50000000 or p_epoch is null or p_epoch!~'^[0-9]{1,16}$' then raise exception 'Invalid prepared payment.';end if;
 update private.payment_checkout_bytes set bytes=p_bytes where id=p_id;
 update public.payment_checkouts set status='ready',digest=p_digest,gas_budget=p_budget,expires_epoch=p_epoch where id=p_id;
end $$;
create function public.read_payment_checkout(p_id uuid,p_owner uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('bytes',b.bytes,'request_expires_at',r.expires_at)
 from public.payment_checkouts p join private.payment_checkout_bytes b on b.id=p.id join public.payment_requests r on r.id=p.request_id
 where p.id=p_id and p.owner_id=p_owner and exists(select 1 from public.project_members where project_id=p.project_id and user_id=p_owner and role='client')
$$;
create function public.authorize_payment_submission(p_id uuid,p_owner uuid) returns void language plpgsql security definer set search_path='' as $$
declare plan public.payment_checkouts;req public.payment_requests;inv public.invoices;paid numeric;
begin
 select * into plan from public.payment_checkouts where id=p_id;
 perform 1 from public.projects where id=plan.project_id for update;
 select * into plan from public.payment_checkouts where id=p_id for update;
 if plan.owner_id is distinct from p_owner or plan.status not in ('ready','uncertain') then raise exception 'Resume the saved receipt check.';end if;
 if not exists(select 1 from public.project_members where project_id=plan.project_id and user_id=p_owner and role='client') or not exists(select 1 from public.wallet_bindings where owner_id=p_owner and address=plan.payer and network=plan.network and revoked_at is null) then raise exception 'Verify this sender wallet first.';end if;
 select * into req from public.payment_requests where id=plan.request_id;
 select * into inv from public.invoices where id=plan.invoice_id;
 select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=inv.id and reversed_at is null;
 if req.expires_at<=clock_timestamp() or inv.status<>'issued' or plan.amount_atomic::numeric>greatest(0,inv.amount_atomic::numeric-paid) then raise exception 'Payment instructions or balance changed. Check the original receipt before doing anything else.';end if;
 if plan.last_attempt_at>clock_timestamp()-interval '10 seconds' or plan.attempts>=20 then raise exception 'Wait before retrying this exact payment.';end if;
 -- Persist uncertainty BEFORE the first possible broadcast. Retries use these same bytes/digest.
 update public.payment_checkouts set status='uncertain',last_attempt_at=clock_timestamp(),attempts=attempts+1 where id=p_id;
end $$;
create function public.mark_payment_submitted(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.payment_checkouts set status='submitted' where id=p_id and status='uncertain'
$$;
create function public.resolve_checkout_failure(p_id uuid,p_proof jsonb) returns void language plpgsql security definer set search_path='' as $$
declare plan public.payment_checkouts;
begin
 select * into plan from public.payment_checkouts where id=p_id;
 perform 1 from public.projects where id=plan.project_id for update;
 select * into plan from public.payment_checkouts where id=p_id for update;
 if plan.status not in ('ready','uncertain','submitted') or coalesce(p_proof->>'provider','')<>'Tatum' or coalesce(p_proof->>'network','')<>plan.network or coalesce(p_proof->>'digest','')<>plan.digest then raise exception 'A trusted outcome is required.';end if;
 if p_proof->>'kind'='failed_transaction' and p_proof->>'sender'=plan.payer and p_proof->>'checkpoint'~'^[0-9]+$' then
  update public.payment_checkouts set status='failed',reason='transaction_failed',failure_evidence=p_proof where id=p_id;
 elsif p_proof->>'kind'='expired_unsigned' and plan.status='ready' and p_proof->>'currentEpoch'~'^[0-9]{1,16}$' and (p_proof->>'currentEpoch')::numeric>plan.expires_epoch::numeric then
  -- Only a never-submitted plan can be released this way. Ambiguous broadcasts remain reserved.
  update public.payment_checkouts set status='failed',reason='expired_unsigned',failure_evidence=p_proof where id=p_id;
 else raise exception 'The payment outcome remains uncertain.';end if;
end $$;
-- Reuse the established trusted proof path. Only an exact Tatum proof can mark a checkout verified.
alter function public.finish_payment_check(uuid,uuid,jsonb,text) set schema private;
revoke all on function private.finish_payment_check(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
create function public.finish_payment_check(p_id uuid,p_token uuid,p_proof jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.finish_payment_check(p_id,p_token,p_proof,p_reason);
 update public.payment_checkouts p set status='verified' from public.payment_claims c where c.id=p_id and c.status='verified' and p.request_id=c.request_id and p.digest=c.digest and p.status in ('ready','uncertain','submitted');
end $$;
alter function public.reconcile_verified_receipt(uuid,uuid) set schema private;
revoke all on function private.reconcile_verified_receipt(uuid,uuid) from public,anon,authenticated;
create function public.reconcile_verified_receipt(p_claim uuid,p_replace_manual uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 result:=private.reconcile_verified_receipt(p_claim,p_replace_manual);
 update public.payment_checkouts p set status='credited' from public.payment_records r where r.id=result and p.network=r.network and p.digest=r.digest;
 return result;
end $$;
revoke all on function public.reserve_payment_checkout(uuid,text),public.finish_payment_preparation(uuid,uuid,text,text,text,text,boolean),public.read_payment_checkout(uuid,uuid),public.authorize_payment_submission(uuid,uuid),public.mark_payment_submitted(uuid),public.finish_payment_check(uuid,uuid,jsonb,text),public.reconcile_verified_receipt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_payment_checkout(uuid,text),public.reconcile_verified_receipt(uuid,uuid) to authenticated;
grant execute on function public.finish_payment_preparation(uuid,uuid,text,text,text,text,boolean),public.read_payment_checkout(uuid,uuid),public.authorize_payment_submission(uuid,uuid),public.mark_payment_submitted(uuid),public.finish_payment_check(uuid,uuid,jsonb,text) to service_role;
revoke all on function public.resolve_checkout_failure(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_checkout_failure(uuid,jsonb) to service_role;
