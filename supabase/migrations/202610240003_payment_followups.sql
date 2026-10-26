create table public.payment_promises (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,invoice_id uuid not null,created_by uuid not null references auth.users(id),
 recorded_role text not null check(recorded_role in ('client','freelancer')),amount_atomic text not null check(amount_atomic~'^[0-9]{1,18}$' and amount_atomic::numeric>0),
 promised_date date not null,note text not null default '' check(length(note)<=500),status text not null check(status in ('reported','confirmed','fulfilled','withdrawn','superseded')),
 paid_baseline text not null check(paid_baseline~'^[0-9]+$'),confirmed_by uuid references auth.users(id),confirmed_at timestamptz,
 closed_by uuid references auth.users(id),closed_at timestamptz,created_at timestamptz not null default now(),idempotency_key uuid not null,
 foreign key(project_id,invoice_id) references public.invoices(project_id,id),unique(created_by,idempotency_key)
);
create unique index payment_promise_active on public.payment_promises(invoice_id) where status in ('reported','confirmed');
create index payment_promises_history on public.payment_promises(invoice_id,created_at desc,id desc);
alter table public.payment_promises enable row level security;
create policy payment_promises_read on public.payment_promises for select to authenticated using(private.member_role(project_id) is not null and exists(select 1 from public.invoices i where i.id=invoice_id and i.issued_at is not null));
revoke all on public.payment_promises from public,anon,authenticated;
grant select on public.payment_promises to authenticated;

create function public.record_payment_promise(p_invoice uuid,p_amount text,p_date date,p_note text,p_key uuid,p_expected uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invoices;old public.payment_promises;existing public.payment_promises;actor text;paid numeric;result uuid;
begin
 select * into i from public.invoices where id=p_invoice;
 perform 1 from public.projects where id=i.project_id for update;
 select * into i from public.invoices where id=p_invoice;
 actor:=private.member_role(i.project_id);
 if actor is null or i.status<>'issued' then raise exception 'An issued invoice and project membership are required.';end if;
 select * into existing from public.payment_promises where created_by=auth.uid() and idempotency_key=p_key;
 if found then
  if existing.invoice_id<>p_invoice or existing.amount_atomic is distinct from p_amount or existing.promised_date is distinct from p_date or existing.note is distinct from btrim(p_note) then raise exception 'This retry differs from the saved promise.';end if;
  return existing.id;
 end if;
 if (select count(*) from public.payment_promises where created_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Promise update limit reached. Try again later.';end if;
 select * into old from public.payment_promises where invoice_id=p_invoice and status in ('reported','confirmed');
 if old.id is distinct from p_expected then raise exception 'The current promise changed. Refresh before saving.';end if;
 if actor='freelancer' and old.status='confirmed' then raise exception 'Only the client can replace a confirmed promise.';end if;
 select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=p_invoice and reversed_at is null;
 if p_amount is null or p_amount!~'^[0-9]{1,18}$' or p_amount::numeric<=0 or p_amount::numeric>greatest(0,i.amount_atomic::numeric-paid) then raise exception 'The promised amount must fit the current outstanding balance.';end if;
 if p_date is null or p_date<((now() at time zone 'UTC')::date-365) or p_date>((now() at time zone 'UTC')::date+365) then raise exception 'Choose a payment date within one year of today.';end if;
 if old.id is not null then update public.payment_promises set status='superseded',closed_at=now(),closed_by=auth.uid() where id=old.id;end if;
 insert into public.payment_promises(project_id,invoice_id,created_by,recorded_role,amount_atomic,promised_date,note,status,paid_baseline,confirmed_by,confirmed_at,idempotency_key)
 values(i.project_id,i.id,auth.uid(),actor,p_amount,p_date,btrim(p_note),case when actor='client' then 'confirmed' else 'reported' end,paid::text,case when actor='client' then auth.uid() end,case when actor='client' then now() end,p_key) returning id into result;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(i.project_id,auth.uid(),case when actor='client' then 'payment_promise_confirmed' else 'payment_promise_reported' end,result);
 return result;
end $$;
create function public.update_payment_promise(p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare p public.payment_promises;actor text;i public.invoices;paid numeric;
begin
 select * into p from public.payment_promises where id=p_id;
 perform 1 from public.projects where id=p.project_id for update;
 select * into p from public.payment_promises where id=p_id for update;
 actor:=private.member_role(p.project_id);
 if actor is null then raise exception 'Project membership required.';end if;
 if p_action='confirm' and p.status='confirmed' and actor='client' then return;end if;
 if p_action='withdraw' and p.status='withdrawn' and (actor='client' or p.created_by=auth.uid()) then return;end if;
 if p_action='fulfill' and p.status='fulfilled' and actor='freelancer' then return;end if;
 if p.status not in ('reported','confirmed') then raise exception 'This promise is no longer active. Refresh to see the latest.';end if;
 select * into i from public.invoices where id=p.invoice_id;
 if p_action='confirm' then
  if actor<>'client' or p.status<>'reported' or i.status<>'issued' then raise exception 'Only the client can confirm a reported promise.';end if;
  select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=i.id and reversed_at is null;
  if p.amount_atomic::numeric>greatest(0,i.amount_atomic::numeric-paid) then raise exception 'The invoice balance changed. Record a new promise.';end if;
  update public.payment_promises set status='confirmed',paid_baseline=paid::text,confirmed_by=auth.uid(),confirmed_at=now() where id=p_id;
 elsif p_action='withdraw' then
  if actor<>'client' and not (p.created_by=auth.uid() and p.status='reported') then raise exception 'Only the client can withdraw a confirmed promise.';end if;
  update public.payment_promises set status='withdrawn',closed_by=auth.uid(),closed_at=now() where id=p_id;
 elsif p_action='fulfill' then
  if actor<>'freelancer' or i.status<>'issued' then raise exception 'Only the freelancer can acknowledge recorded payment.';end if;
  select coalesce(sum(amount_atomic::numeric),0) into paid from public.payment_records where invoice_id=i.id and reversed_at is null;
  if paid<p.paid_baseline::numeric+p.amount_atomic::numeric then raise exception 'Record the received payment first. A promise is not a receipt.';end if;
  update public.payment_promises set status='fulfilled',closed_by=auth.uid(),closed_at=now() where id=p_id;
 else raise exception 'Unknown promise action.';
 end if;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(p.project_id,auth.uid(),'payment_promise_'||p_action,p_id);
end $$;

create function private.followup_context(p_invoice uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('invoice',jsonb_build_object('id',i.id,'title',i.title,'currency',i.currency,'decimals',i.decimals,'due_date',i.due_date,'status',i.status),
 'paid',coalesce((select sum(r.amount_atomic::numeric) from public.payment_records r where r.invoice_id=i.id and r.reversed_at is null),0)::text,
 'outstanding',greatest(0,i.amount_atomic::numeric-coalesce((select sum(r.amount_atomic::numeric) from public.payment_records r where r.invoice_id=i.id and r.reversed_at is null),0))::text,
 'promise',(select jsonb_build_object('id',p.id,'amount_atomic',p.amount_atomic,'promised_date',p.promised_date,'status',p.status,'note',p.note) from public.payment_promises p where p.invoice_id=i.id and p.status in ('reported','confirmed')))
 from public.invoices i where i.id=p_invoice
$$;
revoke all on function private.followup_context(uuid) from public,anon,authenticated;
create table public.payment_followups (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),invoice_id uuid not null references public.invoices(id),owner_id uuid not null references auth.users(id),
 body text not null default '' check(length(body)<=2000),revision integer not null default 0,context jsonb not null,
 status text not null default 'draft' check(status in ('draft','sent','discarded')),source text check(source in ('template','groq')),model text,
 lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default now()+interval '60 seconds',
 message_id uuid references public.messages(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index followup_one_draft on public.payment_followups(invoice_id,owner_id) where status='draft';
create index followup_owner_history on public.payment_followups(owner_id,created_at desc);
create table private.followup_attempts(owner_id uuid not null,created_at timestamptz not null default now());
create index followup_attempts_owner on private.followup_attempts(owner_id,created_at desc);
revoke all on private.followup_attempts from public,anon,authenticated;
alter table public.payment_followups enable row level security;
create policy followups_owner on public.payment_followups for select to authenticated using(owner_id=(select auth.uid()) and private.member_role(project_id)='freelancer');
revoke all on public.payment_followups from public,anon,authenticated;
grant select(id,project_id,invoice_id,owner_id,body,revision,context,status,source,model,message_id,created_at,updated_at) on public.payment_followups to authenticated;
create function public.reserve_payment_followup(p_invoice uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invoices;d public.payment_followups;ctx jsonb;
begin
 select * into i from public.invoices where id=p_invoice;
 perform 1 from public.projects where id=i.project_id for update;
 if private.member_role(i.project_id) is distinct from 'freelancer' then raise exception 'Only the freelancer can prepare a follow-up.';end if;
 ctx:=private.followup_context(p_invoice);
 if ctx->'invoice'->>'status'<>'issued' or (ctx->>'outstanding')::numeric<=0 then raise exception 'Follow-ups require an outstanding issued invoice.';end if;
 select * into d from public.payment_followups where invoice_id=p_invoice and owner_id=auth.uid() and status='draft' for update;
 if found and (d.revision>0 or d.lease_until>now()) then return jsonb_build_object('id',d.id,'cached',true);end if;
 if (select count(*) from private.followup_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Draft limit reached. Edit an existing draft or try later.';end if;
 insert into private.followup_attempts(owner_id) values(auth.uid());
 if d.id is null then
  insert into public.payment_followups(project_id,invoice_id,owner_id,context) values(i.project_id,i.id,auth.uid(),ctx) returning * into d;
 else
  update public.payment_followups set context=ctx,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',updated_at=now() where id=d.id returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'cached',false,'token',d.lease_token,'context',d.context);
end $$;
create function public.finish_payment_followup(p_id uuid,p_token uuid,p_body text,p_source text,p_model text) returns void language plpgsql security definer set search_path='' as $$
declare d public.payment_followups;
begin
 select * into d from public.payment_followups where id=p_id;
 perform 1 from public.projects where id=d.project_id for update;
 select * into d from public.payment_followups where id=p_id for update;
 if d.id is null or d.status<>'draft' or d.revision<>0 or d.lease_token is distinct from p_token or d.lease_until<now() then raise exception 'Draft preparation expired.';end if;
 if d.context is distinct from private.followup_context(d.invoice_id) then raise exception 'Invoice or promise changed. Prepare a new draft.';end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 2000 or p_source is null or p_source not in ('template','groq') or (p_source='groq' and p_model is distinct from 'openai/gpt-oss-20b') then raise exception 'Invalid draft.';end if;
 update public.payment_followups set body=btrim(p_body),source=p_source,model=p_model,revision=1,updated_at=now() where id=p_id;
end $$;
create function public.save_payment_followup(p_id uuid,p_revision integer,p_body text) returns integer language plpgsql security definer set search_path='' as $$
declare d public.payment_followups;result integer;
begin
 select * into d from public.payment_followups where id=p_id;
 perform 1 from public.projects where id=d.project_id for update;
 select * into d from public.payment_followups where id=p_id for update;
 if d.owner_id is distinct from auth.uid() or private.member_role(d.project_id) is distinct from 'freelancer' then raise exception 'Private draft access required.';end if;
 if d.status<>'draft' or d.revision=0 or d.revision is distinct from p_revision then raise exception 'This draft changed. Reload it before editing.';end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Use a message of 1 to 2000 characters.';end if;
 update public.payment_followups set body=btrim(p_body),revision=revision+1,updated_at=now() where id=p_id returning revision into result;return result;
end $$;
create function public.discard_payment_followup(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=(select project_id from public.payment_followups where id=p_id) for update;
 if not exists(select 1 from public.payment_followups where id=p_id and owner_id=auth.uid() and private.member_role(project_id)='freelancer') then raise exception 'Private draft access required.';end if;
 update public.payment_followups set status='discarded',updated_at=now() where id=p_id and status='draft';
end $$;
create function public.send_payment_followup(p_id uuid,p_revision integer,p_body text,p_confirm boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.payment_followups;message uuid;
begin
 select * into d from public.payment_followups where id=p_id;
 perform 1 from public.projects where id=d.project_id for update;
 select * into d from public.payment_followups where id=p_id for update;
 if d.owner_id is distinct from auth.uid() or private.member_role(d.project_id) is distinct from 'freelancer' or p_confirm is distinct from true then raise exception 'Freelancer review and confirmation required.';end if;
 if d.status='sent' then return d.message_id;end if;
 if d.status<>'draft' or d.revision=0 or d.revision is distinct from p_revision then raise exception 'This draft changed. Reload it before sending.';end if;
 if d.context is distinct from private.followup_context(d.invoice_id) then raise exception 'Invoice or promise changed. Discard this draft and prepare a fresh one.';end if;
 if p_body is null or length(btrim(p_body)) not between 1 and 2000 then raise exception 'Review a message of 1 to 2000 characters.';end if;
 message:=public.send_message(d.project_id,btrim(p_body),d.id,'chat');
 update public.payment_followups set status='sent',body=btrim(p_body),revision=revision+1,message_id=message,updated_at=now() where id=p_id;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(d.project_id,auth.uid(),'payment_followup_sent',p_id);
 return message;
end $$;
revoke all on function public.record_payment_promise(uuid,text,date,text,uuid,uuid),public.update_payment_promise(uuid,text),public.reserve_payment_followup(uuid),public.finish_payment_followup(uuid,uuid,text,text,text),public.save_payment_followup(uuid,integer,text),public.discard_payment_followup(uuid),public.send_payment_followup(uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.record_payment_promise(uuid,text,date,text,uuid,uuid),public.update_payment_promise(uuid,text),public.reserve_payment_followup(uuid),public.save_payment_followup(uuid,integer,text),public.discard_payment_followup(uuid),public.send_payment_followup(uuid,integer,text,boolean) to authenticated;
grant execute on function public.finish_payment_followup(uuid,uuid,text,text,text) to service_role;
