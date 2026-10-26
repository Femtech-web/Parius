-- Published snapshots/approvals remain immutable. A separate append-only record
-- closes a proposal without rewriting its contents or changing the active terms.
create table public.agreement_resolutions (
  project_id uuid not null,
  agreement_id uuid primary key,
  actor_id uuid not null references auth.users(id),
  kind text not null check (kind in ('rejected','withdrawn')),
  reason text check (reason is null or (length(reason) between 1 and 1000 and reason=btrim(reason))),
  created_at timestamptz not null default now(),
  foreign key(project_id,agreement_id) references public.agreement_versions(project_id,id)
);
create index agreement_resolutions_project on public.agreement_resolutions(project_id);
alter table public.agreement_resolutions enable row level security;
create policy agreement_resolutions_read on public.agreement_resolutions for select to authenticated
  using (private.member_role(project_id) is not null);
revoke all on public.agreement_resolutions from public, anon, authenticated;
grant select on public.agreement_resolutions to authenticated;
create index activity_project_history on public.activity_events(project_id,created_at desc,id desc);
create index activity_agreement_kind on public.activity_events(project_id,record_id,kind);

-- Require the form's base version, so publishing after a concurrent agreement
-- activation fails rather than silently rebasing a draft the user hasn't reviewed.
drop function public.propose_agreement(uuid,text,text,text,text,integer,integer);
create function public.propose_agreement(
  p_project uuid,p_title text,p_scope text,p_amount text,p_currency text,
  p_decimals integer,p_revisions integer,p_expected_base uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; project public.projects; next_version integer;
begin
  select * into project from public.projects where id=p_project for update;
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can propose terms.'; end if;
  if p_expected_base is distinct from project.active_agreement_id then
    raise exception 'The active agreement changed. Reload and review the current terms before publishing.';
  end if;
  select coalesce(max(version),0)+1 into next_version from public.agreement_versions where project_id=p_project;
  insert into public.agreement_versions(project_id,version,base_version_id,title,scope,amount_atomic,currency,decimals,revision_limit,created_by)
  values(p_project,next_version,project.active_agreement_id,trim(p_title),trim(p_scope),p_amount,p_currency,p_decimals,p_revisions,auth.uid()) returning id into result;
  insert into public.activity_events(project_id,actor_id,kind,record_id) values(p_project,auth.uid(),'agreement_proposed',result);
  return result;
end $$;

create or replace function public.approve_agreement(p_project uuid,p_agreement uuid)
returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; agreement public.agreement_versions; actor_role text;
begin
  -- Approval and closure both lock the project first, so they cannot race to
  -- activate terms that another participant has already rejected/withdrawn.
  select * into project from public.projects where id=p_project for update;
  actor_role:=private.member_role(p_project);
  if actor_role is null then raise exception 'Project access required.'; end if;
  select * into agreement from public.agreement_versions where id=p_agreement and project_id=p_project;
  if not found then raise exception 'Agreement not found.'; end if;
  if exists(select 1 from public.agreement_resolutions where agreement_id=p_agreement) then
    raise exception 'This proposal is closed. Review a new proposal instead.';
  end if;
  if project.active_agreement_id=p_agreement then return; end if;
  if agreement.base_version_id is distinct from project.active_agreement_id then
    raise exception 'These terms are stale. Propose a new version.';
  end if;
  insert into public.agreement_approvals(project_id,agreement_id,actor_id,role)
    values(p_project,p_agreement,auth.uid(),actor_role) on conflict do nothing;
  if not found then return; end if;
  insert into public.activity_events(project_id,actor_id,kind,record_id)
    values(p_project,auth.uid(),'agreement_approved',p_agreement);
  if (select count(*) from public.agreement_approvals where agreement_id=p_agreement)=2 then
    update public.projects set active_agreement_id=p_agreement where id=p_project;
    insert into public.activity_events(project_id,actor_id,kind,record_id)
      values(p_project,auth.uid(),'agreement_activated',p_agreement);
  end if;
end $$;

create function public.resolve_agreement_proposal(
  p_project uuid,p_agreement uuid,p_kind text,p_reason text default null
) returns void language plpgsql security definer set search_path='' as $$
declare actor_role text; existing public.agreement_resolutions;
begin
  perform 1 from public.projects where id=p_project for update;
  actor_role:=private.member_role(p_project);
  if actor_role is null then raise exception 'Project access required.'; end if;
  if p_kind is null or p_kind not in ('rejected','withdrawn') then raise exception 'Invalid proposal decision.'; end if;
  if (p_kind='rejected' and actor_role<>'client') or (p_kind='withdrawn' and actor_role<>'freelancer') then
    raise exception 'Only the client can reject, and only the freelancer can withdraw a proposal.';
  end if;
  if length(btrim(p_reason))>1000 then raise exception 'Use a reason of at most 1,000 characters.'; end if;
  if not exists(select 1 from public.agreement_versions where id=p_agreement and project_id=p_project) then
    raise exception 'Agreement not found.';
  end if;
  if exists(select 1 from public.projects where id=p_project and active_agreement_id=p_agreement)
     or exists(select 1 from public.activity_events where project_id=p_project and record_id=p_agreement and kind='agreement_activated') then
    raise exception 'An active or previously active agreement cannot be rejected or withdrawn.';
  end if;
  select * into existing from public.agreement_resolutions where agreement_id=p_agreement;
  if found then
    if existing.actor_id=auth.uid() and existing.kind=p_kind then return; end if;
    raise exception 'This proposal is already closed.';
  end if;
  insert into public.agreement_resolutions(project_id,agreement_id,actor_id,kind,reason)
    values(p_project,p_agreement,auth.uid(),p_kind,nullif(btrim(p_reason),''));
  insert into public.activity_events(project_id,actor_id,kind,record_id)
    values(p_project,auth.uid(),'agreement_'||p_kind,p_agreement);
end $$;

-- Bounded keyset pagination preserves timestamp ties without interpolated filters.
create function public.read_project_activity(
  p_project uuid,p_before_time timestamptz default null,p_before_id uuid default null,p_limit integer default 50
) returns setof public.activity_events language plpgsql stable security invoker set search_path='' as $$
begin
  if private.member_role(p_project) is null then raise exception 'Project access required.'; end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid page size.'; end if;
  if (p_before_time is null)<>(p_before_id is null) then raise exception 'A complete activity cursor is required.'; end if;
  return query select e.* from public.activity_events e where e.project_id=p_project
    and (p_before_time is null or (e.created_at,e.id)<(p_before_time,p_before_id))
    order by e.created_at desc,e.id desc limit p_limit;
end $$;

revoke all on function public.propose_agreement(uuid,text,text,text,text,integer,integer,uuid),
  public.approve_agreement(uuid,uuid),public.resolve_agreement_proposal(uuid,uuid,text,text),
  public.read_project_activity(uuid,timestamptz,uuid,integer) from public, anon;
grant execute on function public.propose_agreement(uuid,text,text,text,text,integer,integer,uuid),
  public.approve_agreement(uuid,uuid),public.resolve_agreement_proposal(uuid,uuid,text,text),
  public.read_project_activity(uuid,timestamptz,uuid,integer) to authenticated;
