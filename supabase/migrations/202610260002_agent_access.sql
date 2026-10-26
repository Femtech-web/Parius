-- Project-scoped agent access. Raw keys never reach the database.
create table public.agent_connections (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 owner_id uuid not null references auth.users(id), label text not null check(length(label) between 2 and 80),
 request_id uuid references public.payment_requests(id), expires_at timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default now()
);
create table private.agent_keys (
 id uuid primary key references public.agent_connections(id), token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$')
);
create table private.agent_digests (
 connection_id uuid primary key references public.agent_connections(id), network text not null,
 digest text not null, unique(network,digest)
);
revoke all on private.agent_keys,private.agent_digests from public,anon,authenticated,service_role;
alter table public.agent_connections enable row level security;
create policy agent_owner_read on public.agent_connections for select to authenticated using(owner_id=auth.uid() and private.member_role(project_id) is not null);
revoke all on public.agent_connections from public,anon,authenticated;
grant select on public.agent_connections to authenticated;

create function public.create_agent_connection(p_project uuid,p_label text,p_hash text,p_request uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; req public.payment_requests; inv public.invoices; deadline timestamptz := now()+interval '1 hour';
begin
 perform 1 from public.projects where id=p_project for update;
 if private.member_role(p_project) is null then raise exception 'Project access required.'; end if;
 if p_label is null or length(btrim(p_label)) not between 2 and 80 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Check the agent name.';end if;
 if (select count(*) from public.agent_connections where owner_id=auth.uid() and revoked_at is null and expires_at>now())>=10 then raise exception 'Revoke an existing connection first.';end if;
 if p_request is not null then
  select * into req from public.payment_requests where id=p_request and project_id=p_project and created_by=auth.uid();
  select * into inv from public.invoices where id=req.invoice_id;
  if private.member_role(p_project) is distinct from 'client' or req.id is null or req.expires_at<=now() or inv.status<>'issued' or inv.network is null then raise exception 'Confirm active payment instructions as the client first.';end if;
  if exists(select 1 from public.agent_connections a join public.payment_requests r on r.id=a.request_id where r.invoice_id=inv.id and a.revoked_at is null and a.expires_at>now())
   or exists(select 1 from public.payment_checkouts where invoice_id=inv.id and status not in ('failed','credited'))
   or exists(select 1 from public.payment_claims c join public.payment_requests r on r.id=c.request_id where r.invoice_id=inv.id and c.status in ('checking','retryable','verified','credited'))
   then raise exception 'Resolve the existing payment attempt before delegating another.';end if;
  if req.amount_atomic::numeric>(inv.amount_atomic::numeric-(select coalesce(sum(amount_atomic::numeric),0) from public.payment_records where invoice_id=inv.id and reversed_at is null)) then raise exception 'Refresh the invoice balance first.';end if;
  deadline := least(deadline,req.expires_at);
 end if;
 insert into public.agent_connections(project_id,owner_id,label,request_id,expires_at) values(p_project,auth.uid(),btrim(p_label),p_request,deadline) returning id into result;
 insert into private.agent_keys values(result,p_hash);
 return result;
end $$;
create function public.revoke_agent_connection(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.agent_connections set revoked_at=coalesce(revoked_at,now()) where id=p_id and owner_id=auth.uid();
 if not found then raise exception 'Agent connection unavailable.';end if;
end $$;

-- Service-only dispatcher: authorization and field selection stay in one database transaction.
create function public.agent_context(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.agent_connections; req public.payment_requests; inv public.invoices; result jsonb; actor_role text;
begin
 select c.* into a from public.agent_connections c join private.agent_keys k on k.id=c.id where k.token_hash=p_hash;
 if a.id is null or a.revoked_at is not null or a.expires_at<=now() then raise exception 'Agent key expired, revoked or invalid.';end if;
 select role into actor_role from public.project_members where project_id=a.project_id and user_id=a.owner_id;
 if actor_role is null then raise exception 'Project access required.';end if;
 result := jsonb_build_object('connection',to_jsonb(a),'role',actor_role,
  'project',(select jsonb_build_object('id',id,'name',name,'description',description) from public.projects where id=a.project_id),
  'agreement',(select to_jsonb(v) from public.agreement_versions v join public.projects p on p.active_agreement_id=v.id where p.id=a.project_id),
  'milestones',coalesce((select jsonb_agg(x) from (select id,title,state,due_date from public.milestones where project_id=a.project_id order by created_at desc limit 50)x),'[]'::jsonb),
  'messages',coalesce((select jsonb_agg(x) from (select id,author_name,body,created_at from public.messages where project_id=a.project_id order by created_at desc,id desc limit 30)x),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(x) from (select id,title,status,amount_atomic,currency,decimals,due_date from public.invoices where project_id=a.project_id and (issued_at is not null or actor_role='freelancer') order by created_at desc limit 50)x),'[]'::jsonb));
 if a.request_id is not null then
  select * into req from public.payment_requests where id=a.request_id;
  select * into inv from public.invoices where id=req.invoice_id;
  result := result || jsonb_build_object('payment',jsonb_build_object('request',to_jsonb(req),'invoice',to_jsonb(inv),
   'digest',(select digest from private.agent_digests where connection_id=a.id),
   'claim',(select jsonb_build_object('id',id,'status',status,'reason',reason,'digest',digest) from public.payment_claims where request_id=req.id order by created_at desc limit 1)));
 end if;
 return result;
end $$;
create function public.reserve_agent_receipt(p_hash text,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; a public.agent_connections; req public.payment_requests; saved private.agent_digests; result jsonb; previous text;
begin
 ctx:=public.agent_context(p_hash);
 select * into a from public.agent_connections where id=(ctx->'connection'->>'id')::uuid;
 if a.request_id is null then raise exception 'This connection has read-only access.';end if;
 select * into req from public.payment_requests where id=a.request_id;
 perform 1 from public.projects where id=a.project_id for update;
 if p_digest is null or p_digest!~'^[1-9A-HJ-NP-Za-km-z]{40,50}$' then raise exception 'Invalid transaction digest.';end if;
 select * into saved from private.agent_digests where connection_id=a.id;
 if saved.connection_id is not null and saved.digest<>p_digest then raise exception 'Resume the saved digest. A second payment is not authorized.';end if;
 if exists(select 1 from public.payment_claims c join public.payment_requests r on r.id=c.request_id join public.invoices i on i.id=r.invoice_id where i.network=ctx->'payment'->'invoice'->>'network' and c.digest=p_digest and r.id<>req.id) then raise exception 'This digest belongs to another payment request.';end if;
 insert into private.agent_digests(connection_id,network,digest) values(a.id,ctx->'payment'->'invoice'->>'network',p_digest) on conflict(connection_id) do nothing;
 previous:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',a.owner_id::text,true);
 result:=public.reserve_payment_check(req.id,p_digest);
 perform set_config('request.jwt.claim.sub',coalesce(previous,''),true);
 return result;
end $$;
-- Browser checkout and agent delegation cannot independently prepare the same invoice.
create function private.prevent_agent_double_checkout() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.agent_connections a join public.payment_requests r on r.id=a.request_id where r.invoice_id=new.invoice_id and a.revoked_at is null and a.expires_at>now()) then raise exception 'Revoke the agent connection before preparing a browser payment. Check any saved digest first.';end if;
 return new;
end $$;
create trigger agent_checkout_guard before insert on public.payment_checkouts for each row execute function private.prevent_agent_double_checkout();
revoke all on function public.create_agent_connection(uuid,text,text,uuid),public.revoke_agent_connection(uuid),public.agent_context(text),public.reserve_agent_receipt(text,text),private.prevent_agent_double_checkout() from public,anon,authenticated;
grant execute on function public.create_agent_connection(uuid,text,text,uuid),public.revoke_agent_connection(uuid) to authenticated;
grant execute on function public.agent_context(text),public.reserve_agent_receipt(text,text) to service_role;
