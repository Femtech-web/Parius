-- Unconfirmed suggestions are private proposals, never Walrus memories.
create table public.memory_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),
  assessment_id uuid references public.scope_assessments(id) on delete set null,
  kind text not null check(kind in ('possible_change','needs_clarification')),
  lesson text not null check(length(lesson) between 10 and 600),
  status text not null default 'pending' check(status in ('pending','confirmed','dismissed')),
  memory_id uuid references public.memory_references(id),
  created_at timestamptz not null default now(),resolved_at timestamptz,
  -- A policy is suggested once per project, even after refresh/review/revision.
  unique(owner_id,project_id,kind)
);
create index memory_suggestions_inbox on public.memory_suggestions(owner_id,project_id,created_at desc) where status='pending';
alter table public.memory_suggestions enable row level security;
create policy memory_suggestions_read on public.memory_suggestions for select to authenticated
  using(owner_id=(select auth.uid()) and private.member_role(project_id)='freelancer');
revoke all on public.memory_suggestions from public,anon,authenticated;
grant select on public.memory_suggestions to authenticated;

create function private.propose_scope_lesson() returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text; source_kind text;
begin
  if new.status<>'completed' then return new; end if;
  source_kind := new.result->>'classification';
  candidate := case source_kind
    when 'possible_change' then 'Before accepting an extra feature in this project, ask for a separately priced change proposal.'
    when 'needs_clarification' then 'Clarify whether a request changes this project’s scope before committing to the work.'
    else null end;
  if candidate is null then return new; end if;
  if exists(select 1 from public.memory_references m where m.owner_id=new.owner_id
    and m.status<>'suppressed' and (m.scope='personal' or m.project_id=new.project_id)
    and lower(btrim(m.lesson))=lower(candidate)) then return new; end if;
  insert into public.memory_suggestions(owner_id,project_id,assessment_id,kind,lesson)
    values(new.owner_id,new.project_id,new.id,source_kind,candidate)
    on conflict(owner_id,project_id,kind) do nothing;
  return new;
end $$;
revoke all on function private.propose_scope_lesson() from public,anon,authenticated,service_role;
create trigger scope_lesson_suggestion after insert or update of status,result on public.scope_assessments
  for each row execute function private.propose_scope_lesson();

-- Include existing completed reviews without rerunning AI or writing any memory.
with candidates as (
 select a.owner_id,a.project_id,a.id,a.result->>'classification' as kind,a.created_at,
 case a.result->>'classification'
 when 'possible_change' then 'Before accepting an extra feature in this project, ask for a separately priced change proposal.'
 else 'Clarify whether a request changes this project’s scope before committing to the work.' end as lesson
from public.scope_assessments a
where a.status='completed' and a.result->>'classification' in ('possible_change','needs_clarification')
)
insert into public.memory_suggestions(owner_id,project_id,assessment_id,kind,lesson)
select distinct on(a.owner_id,a.project_id,a.kind) a.owner_id,a.project_id,a.id,a.kind,a.lesson
from candidates a where not exists(select 1 from public.memory_references m where m.owner_id=a.owner_id
 and m.status<>'suppressed' and (m.scope='personal' or m.project_id=a.project_id) and lower(btrim(m.lesson))=lower(a.lesson))
order by a.owner_id,a.project_id,a.kind,a.created_at desc,a.id desc
on conflict(owner_id,project_id,kind) do nothing;

create function public.resolve_memory_suggestion(p_id uuid,p_action text,p_lesson text default null,p_scope text default 'project')
returns uuid language plpgsql security definer set search_path='' as $$
declare suggestion public.memory_suggestions; result uuid; stored public.memory_references;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  -- Match confirm_memory's owner lock before taking the suggestion row lock.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into suggestion from public.memory_suggestions where id=p_id and owner_id=auth.uid() for update;
  if not found or private.member_role(suggestion.project_id) is distinct from 'freelancer' then
    raise exception 'Private suggestion access required.';
  end if;
  if p_action is null or p_action not in ('confirm','dismiss') then raise exception 'Choose confirm or dismiss.'; end if;
  if suggestion.status='confirmed' and p_action='confirm' then return suggestion.memory_id; end if;
  if suggestion.status='dismissed' and p_action='dismiss' then return null; end if;
  if suggestion.status<>'pending' then raise exception 'This suggestion has already been resolved.'; end if;
  if p_action='dismiss' then
    update public.memory_suggestions set status='dismissed',resolved_at=now() where id=p_id;
    return null;
  end if;
  if p_scope is null or p_scope not in ('project','personal') or p_lesson is null
    or length(btrim(p_lesson)) not between 10 and 600
    or p_lesson ~* '(suiprivkey1|\m(sk|gsk)_[a-z0-9]{16,}|-----BEGIN .*PRIVATE KEY)' then
    raise exception 'Use a short lesson without credentials.';
  end if;
  -- No duplicate stored lesson when the same policy was already confirmed manually.
  select id into result from public.memory_references where owner_id=auth.uid()
    and status<>'suppressed' and scope=p_scope and (p_scope='personal' or project_id=suggestion.project_id)
    and lower(btrim(lesson))=lower(btrim(p_lesson)) order by created_at limit 1;
  if result is null then
    result := public.confirm_memory(suggestion.project_id,btrim(p_lesson),p_scope,p_id,null);
    select * into stored from public.memory_references where id=result;
    if stored.project_id<>suggestion.project_id or stored.lesson<>btrim(p_lesson) or stored.scope<>p_scope then
      raise exception 'The confirmation identity has already been used.';
    end if;
  end if;
  update public.memory_suggestions set status='confirmed',memory_id=result,resolved_at=now() where id=p_id;
  return result;
end $$;
revoke all on function public.resolve_memory_suggestion(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_memory_suggestion(uuid,text,text,text) to authenticated;
