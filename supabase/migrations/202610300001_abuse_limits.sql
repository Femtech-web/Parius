-- Adversarial review, 30 October 2026: per-account write budgets, one-account sponsorship cap,
-- single-request receipt matching and Supabase default-privilege cleanup.
create table private.write_budget (
 owner_id uuid not null,action text not null,created_at timestamptz not null default now()
);
create index write_budget_recent on private.write_budget(owner_id,action,created_at desc);
revoke all on private.write_budget from public,anon,authenticated,service_role;

-- Failed calls roll back their own budget entry, so only completed writes are counted.
create function private.spend_write_budget(p_action text,p_per_minute integer,p_per_hour integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_action,0));
 if (select count(*) from private.write_budget where owner_id=auth.uid() and action=p_action and created_at>now()-interval '1 minute')>=p_per_minute
  or (select count(*) from private.write_budget where owner_id=auth.uid() and action=p_action and created_at>now()-interval '1 hour')>=p_per_hour
 then raise exception 'Too many requests. Please wait a minute and try again.';end if;
 delete from private.write_budget where owner_id=auth.uid() and action=p_action and created_at<=now()-interval '1 hour';
 insert into private.write_budget(owner_id,action) values(auth.uid(),p_action);
end $$;
revoke all on function private.spend_write_budget(text,integer,integer) from public,anon,authenticated,service_role;

alter function public.create_project(text,text,text,text) set schema private;
alter function public.create_project_invite(uuid,text) set schema private;
alter function public.send_message(uuid,text,uuid,text) set schema private;
alter function public.propose_agreement(uuid,text,text,text,text,integer,integer,uuid) set schema private;
alter function public.add_milestone(uuid,text,date) set schema private;
alter function public.reserve_payment_check(uuid,text) set schema private;
revoke all on function private.create_project(text,text,text,text),private.create_project_invite(uuid,text),private.send_message(uuid,text,uuid,text),private.propose_agreement(uuid,text,text,text,text,integer,integer,uuid),private.add_milestone(uuid,text,date),private.reserve_payment_check(uuid,text) from public,anon,authenticated,service_role;

create function public.create_project(p_name text,p_description text,p_client_name text,p_display_name text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform private.spend_write_budget('project',5,20);
 return private.create_project(p_name,p_description,p_client_name,p_display_name);
end $$;
create function public.create_project_invite(p_project uuid,p_token_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.spend_write_budget('invite',5,30);
 perform private.create_project_invite(p_project,p_token_hash);
end $$;
create function public.send_message(p_project uuid,p_body text,p_key uuid,p_source text default 'chat') returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform private.spend_write_budget('message',20,300);
 return private.send_message(p_project,p_body,p_key,p_source);
end $$;
create function public.propose_agreement(
 p_project uuid,p_title text,p_scope text,p_amount text,p_currency text,
 p_decimals integer,p_revisions integer,p_expected_base uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.spend_write_budget('agreement',10,60);
 return private.propose_agreement(p_project,p_title,p_scope,p_amount,p_currency,p_decimals,p_revisions,p_expected_base);
end $$;
create function public.add_milestone(p_project uuid,p_title text,p_due date default null) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 perform private.spend_write_budget('milestone',20,120);
 return private.add_milestone(p_project,p_title,p_due);
end $$;
create or replace function public.prepare_payment_request(p_invoice uuid,p_payer text,p_amount text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wallet_bindings b join public.invoices i on i.id=p_invoice
 where b.owner_id=auth.uid() and b.address=p_payer and b.network=i.network and b.revoked_at is null)
 then raise exception 'Verify ownership of this wallet on the invoice network first.';end if;
 perform private.spend_write_budget('payment_request',5,30);
 return private.prepare_payment_request(p_invoice,p_payer,p_amount);
end $$;

-- A transfer matched to one payment request can never be matched to another.
create function public.reserve_payment_check(p_request uuid,p_digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.payment_requests;request_network text;
begin
 select * into request from public.payment_requests where id=p_request;
 if private.member_role(request.project_id) is null then raise exception 'Project access required.';end if;
 select i.network into request_network from public.invoices i where i.id=request.invoice_id;
 if exists(select 1 from public.payment_claims c join public.payment_requests r on r.id=c.request_id join public.invoices i on i.id=r.invoice_id
  where c.digest=p_digest and c.request_id<>p_request and c.status in ('verified','credited') and i.network=request_network)
 then raise exception 'This transaction is already matched to another payment request.';end if;
 return private.reserve_payment_check(p_request,p_digest);
end $$;
create unique index one_matched_claim_per_digest on public.payment_claims(digest) where status in ('verified','credited');

-- The shared 0.5 SUI reservation must not be exhausted by one account.
create function private.limit_owner_sponsorship() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.mode='sponsored' and (select count(*) from public.payment_checkouts where owner_id=new.owner_id and mode='sponsored' and created_at>now()-interval '48 hours'
  and not(status='failed' and reason in ('preparation_unavailable','expired_unsigned')))>=2
 then raise exception 'Your gas sponsorship allowance is in use. You may explicitly choose wallet-paid gas.';end if;
 return new;
end $$;
create trigger owner_sponsorship_limit before insert on public.payment_checkouts for each row execute function private.limit_owner_sponsorship();
revoke all on function private.limit_owner_sponsorship() from public,anon,authenticated;

-- Supabase grants new public objects to anon/authenticated by default; keep only intended access.
revoke all on public.invoice_balances from authenticated;
grant select on public.invoice_balances to authenticated;
revoke all on function public.create_project(text,text,text,text),public.create_project_invite(uuid,text),public.send_message(uuid,text,uuid,text),public.propose_agreement(uuid,text,text,text,text,integer,integer,uuid),public.add_milestone(uuid,text,date),public.reserve_payment_check(uuid,text),public.accept_project_invite(text,text),public.transition_milestone(uuid,uuid,text) from public,anon;
grant execute on function public.create_project(text,text,text,text),public.create_project_invite(uuid,text),public.send_message(uuid,text,uuid,text),public.propose_agreement(uuid,text,text,text,text,integer,integer,uuid),public.add_milestone(uuid,text,date),public.reserve_payment_check(uuid,text) to authenticated;
