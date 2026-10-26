-- Apply through Supabase migrations. Business writes use narrowly scoped RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 3 and 100),
  description text not null default '' check (length(description) <= 2000),
  client_name text not null check (length(client_name) between 2 and 100),
  created_by uuid not null references auth.users(id),
  active_agreement_id uuid,
  created_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('freelancer','client')),
  display_name text not null check (length(display_name) between 1 and 100),
  primary key (project_id,user_id), unique(project_id,role)
);
create table public.project_invites (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  token_hash text not null unique check (length(token_hash)=64),
  created_by uuid not null references auth.users(id), expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  author_id uuid not null references auth.users(id), author_name text not null,
  body text not null check (length(body) between 1 and 6000),
  source text not null default 'chat' check (source in ('chat','imported')),
  idempotency_key uuid not null, created_at timestamptz not null default now(),
  unique(project_id,author_id,idempotency_key)
);
create index messages_history on public.messages(project_id,created_at,id);
create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  version integer not null, base_version_id uuid,
  title text not null check (length(title) between 3 and 150),
  scope text not null check (length(scope) between 20 and 12000),
  amount_atomic text not null check (amount_atomic ~ '^[0-9]{1,18}$' and amount_atomic::numeric > 0),
  currency text not null check (currency in ('USDC','USD','NGN')),
  decimals integer not null check (decimals between 0 and 6),
  revision_limit integer not null check (revision_limit between 0 and 100),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(project_id,version), unique(project_id,id),
  foreign key(project_id,base_version_id) references public.agreement_versions(project_id,id),
  check ((currency='USDC' and decimals=6) or (currency in ('USD','NGN') and decimals=2))
);
alter table public.projects add constraint active_agreement_project foreign key(id,active_agreement_id) references public.agreement_versions(project_id,id);
create table public.agreement_approvals (
  project_id uuid not null, agreement_id uuid not null, actor_id uuid not null references auth.users(id),
  role text not null check (role in ('freelancer','client')), created_at timestamptz not null default now(),
  primary key(agreement_id,actor_id), unique(agreement_id,role),
  foreign key(project_id,agreement_id) references public.agreement_versions(project_id,id)
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  title text not null check (length(title) between 3 and 150), due_date date,
  state text not null default 'planned' check (state in ('planned','in_progress','ready_for_review','accepted','changes_requested')),
  created_at timestamptz not null default now()
);
create table public.activity_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  actor_id uuid not null references auth.users(id), kind text not null, record_id uuid,
  created_at timestamptz not null default now()
);

create function private.member_role(p_project uuid) returns text language sql stable security definer set search_path='' as $$
  select role from public.project_members where project_id=p_project and user_id=auth.uid()
$$;
revoke all on function private.member_role(uuid) from public;
grant execute on function private.member_role(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.messages enable row level security;
alter table public.agreement_versions enable row level security;
alter table public.agreement_approvals enable row level security;
alter table public.milestones enable row level security;
alter table public.activity_events enable row level security;

create policy projects_read on public.projects for select to authenticated using (private.member_role(id) is not null);
create policy members_read on public.project_members for select to authenticated using (private.member_role(project_id) is not null);
create policy messages_read on public.messages for select to authenticated using (private.member_role(project_id) is not null);
create policy agreements_read on public.agreement_versions for select to authenticated using (private.member_role(project_id) is not null);
create policy approvals_read on public.agreement_approvals for select to authenticated using (private.member_role(project_id) is not null);
create policy milestones_read on public.milestones for select to authenticated using (private.member_role(project_id) is not null);
create policy activity_read on public.activity_events for select to authenticated using (private.member_role(project_id) is not null);
-- Invite hashes are deliberately not readable, even to members.
revoke all on public.projects, public.project_members, public.project_invites, public.messages, public.agreement_versions, public.agreement_approvals, public.milestones, public.activity_events from anon, authenticated;
grant select on public.projects, public.project_members, public.messages, public.agreement_versions, public.agreement_approvals, public.milestones, public.activity_events to authenticated;

create function public.create_project(p_name text,p_description text,p_client_name text,p_display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.projects(name,description,client_name,created_by) values(trim(p_name),trim(p_description),trim(p_client_name),auth.uid()) returning id into result;
  insert into public.project_members values(result,auth.uid(),'freelancer',trim(p_display_name));
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(result,auth.uid(),'project_created',result);
  return result;
end $$;

create function public.create_project_invite(p_project uuid,p_token_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.projects where id=p_project for update;
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can invite a client.'; end if;
  if exists(select 1 from public.project_members where project_id=p_project and role='client') then raise exception 'This project already has a client.'; end if;
  update public.project_invites set expires_at=now() where project_id=p_project and accepted_by is null;
  insert into public.project_invites(project_id,token_hash,created_by) values(p_project,p_token_hash,auth.uid());
end $$;
create function public.accept_project_invite(p_token_hash text,p_display_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.project_invites;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into invitation from public.project_invites where token_hash=p_token_hash;
  if not found then raise exception 'This invitation is expired or already used.'; end if;
  -- Consistent project-then-invite lock order avoids racing invite rotation deadlocks.
  perform 1 from public.projects where id=invitation.project_id for update;
  select * into invitation from public.project_invites where token_hash=p_token_hash for update;
  if invitation.expires_at <= now() or invitation.accepted_by is not null then raise exception 'This invitation is expired or already used.'; end if;
  if exists(select 1 from public.project_members where project_id=invitation.project_id and (user_id=auth.uid() or role='client')) then raise exception 'A separate client account is required.'; end if;
  insert into public.project_members values(invitation.project_id,auth.uid(),'client',trim(p_display_name));
  update public.project_invites set accepted_by=auth.uid() where id=invitation.id;
  insert into public.activity_events(project_id,actor_id,kind) values(invitation.project_id,auth.uid(),'client_joined');
  return invitation.project_id;
end $$;

create function public.send_message(p_project uuid,p_body text,p_key uuid,p_source text default 'chat') returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; actor_name text;
begin
  select display_name into actor_name from public.project_members where project_id=p_project and user_id=auth.uid();
  if not found then raise exception 'Project access required.'; end if;
  insert into public.messages(project_id,author_id,author_name,body,idempotency_key,source) values(p_project,auth.uid(),actor_name,trim(p_body),p_key,p_source)
    on conflict(project_id,author_id,idempotency_key) do nothing returning id into result;
  if result is null then select id into result from public.messages where project_id=p_project and author_id=auth.uid() and idempotency_key=p_key; end if;
  return result;
end $$;

create function public.propose_agreement(p_project uuid,p_title text,p_scope text,p_amount text,p_currency text,p_decimals integer,p_revisions integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; project public.projects; next_version integer;
begin
  select * into project from public.projects where id=p_project for update;
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can propose terms.'; end if;
  select coalesce(max(version),0)+1 into next_version from public.agreement_versions where project_id=p_project;
  insert into public.agreement_versions(project_id,version,base_version_id,title,scope,amount_atomic,currency,decimals,revision_limit,created_by)
  values(p_project,next_version,project.active_agreement_id,trim(p_title),trim(p_scope),p_amount,p_currency,p_decimals,p_revisions,auth.uid()) returning id into result;
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'agreement_proposed',result);
  return result;
end $$;
create function public.approve_agreement(p_project uuid,p_agreement uuid) returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; agreement public.agreement_versions; actor_role text;
begin
  select * into project from public.projects where id=p_project for update;
  actor_role:=private.member_role(p_project);
  if actor_role is null then raise exception 'Project access required.'; end if;
  select * into agreement from public.agreement_versions where id=p_agreement and project_id=p_project;
  if not found then raise exception 'Agreement not found.'; end if;
  if project.active_agreement_id=p_agreement then return; end if;
  if agreement.base_version_id is distinct from project.active_agreement_id then raise exception 'These terms are stale. Propose a new version.'; end if;
  insert into public.agreement_approvals(project_id,agreement_id,actor_id,role) values(p_project,p_agreement,auth.uid(),actor_role) on conflict do nothing;
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'agreement_approved',p_agreement);
  if (select count(*) from public.agreement_approvals where agreement_id=p_agreement)=2 then
    update public.projects set active_agreement_id=p_agreement where id=p_project;
    insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'agreement_activated',p_agreement);
  end if;
end $$;

create function public.add_milestone(p_project uuid,p_title text,p_due date default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can add milestones.'; end if;
  insert into public.milestones(project_id,title,due_date) values(p_project,trim(p_title),p_due) returning id into result;
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'milestone_created',result);
  return result;
end $$;
create function public.transition_milestone(p_project uuid,p_milestone uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare current_state text; actor_role text;
begin
  actor_role:=private.member_role(p_project);
  select state into current_state from public.milestones where id=p_milestone and project_id=p_project for update;
  if not found or actor_role is null then raise exception 'Milestone not found.'; end if;
  if not ((actor_role='freelancer' and ((current_state in ('planned','changes_requested') and p_state='in_progress') or (current_state='in_progress' and p_state='ready_for_review')))
    or (actor_role='client' and current_state='ready_for_review' and p_state in ('accepted','changes_requested'))) then raise exception 'This transition requires the appropriate participant and review state.'; end if;
  update public.milestones set state=p_state where id=p_milestone;
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'milestone_'||p_state,p_milestone);
end $$;

revoke all on function public.create_project(text,text,text,text),public.create_project_invite(uuid,text),public.accept_project_invite(text,text),public.send_message(uuid,text,uuid,text),public.propose_agreement(uuid,text,text,text,text,integer,integer),public.approve_agreement(uuid,uuid),public.add_milestone(uuid,text,date),public.transition_milestone(uuid,uuid,text) from public;
grant execute on function public.create_project(text,text,text,text),public.create_project_invite(uuid,text),public.accept_project_invite(text,text),public.send_message(uuid,text,uuid,text),public.propose_agreement(uuid,text,text,text,text,integer,integer),public.approve_agreement(uuid,uuid),public.add_milestone(uuid,text,date),public.transition_milestone(uuid,uuid,text) to authenticated;
