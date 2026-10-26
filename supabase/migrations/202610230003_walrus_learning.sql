create table public.memory_state (
  owner_id uuid primary key references auth.users(id), revision bigint not null default 0
);
create table public.memory_references (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),
  project_id uuid not null references public.projects(id),scope text not null check(scope in ('personal','project')),
  lesson text not null check(length(lesson) between 10 and 600),
  status text not null default 'pending' check(status in ('pending','indexing','ready','failed','suppressed')),
  job_id text,blob_id text,replaces_id uuid references public.memory_references(id),
  idempotency_key uuid not null,created_at timestamptz not null default now(),
  lease_token uuid,lease_until timestamptz,
  unique(owner_id,idempotency_key),check(status<>'ready' or (job_id is not null and blob_id is not null))
);
create index memory_owner_scope on public.memory_references(owner_id,scope,project_id,created_at desc);
alter table public.memory_state enable row level security;
alter table public.memory_references enable row level security;
create policy memory_state_read on public.memory_state for select to authenticated using(owner_id=(select auth.uid()));
create policy memory_references_read on public.memory_references for select to authenticated using(owner_id=(select auth.uid()) and (scope='personal' or private.member_role(project_id)='freelancer'));
revoke all on public.memory_state,public.memory_references from public,anon,authenticated;
grant select on public.memory_state to authenticated;
grant select(id,owner_id,project_id,scope,lesson,status,job_id,blob_id,replaces_id,created_at) on public.memory_references to authenticated;

create function public.confirm_memory(p_project uuid,p_lesson text,p_scope text,p_key uuid,p_replaces uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; old public.memory_references;
begin
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can confirm a private lesson.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select id into result from public.memory_references where owner_id=auth.uid() and idempotency_key=p_key;
  if found then return result; end if;
  if p_scope is null or p_scope not in ('personal','project') or p_lesson is null or length(btrim(p_lesson)) not between 10 and 600 or p_key is null then raise exception 'Check the lesson and its visibility.'; end if;
  if (select count(*) from public.memory_references where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'The hourly memory limit has been reached.'; end if;
  if p_replaces is not null then
    select * into old from public.memory_references where id=p_replaces and owner_id=auth.uid();
    if not found or old.status='suppressed' or old.scope<>p_scope or (old.scope='project' and old.project_id<>p_project) then raise exception 'That lesson cannot be corrected here.'; end if;
    update public.memory_references set status='suppressed' where id=p_replaces;
  end if;
  insert into public.memory_references(owner_id,project_id,scope,lesson,idempotency_key,replaces_id) values(auth.uid(),p_project,p_scope,btrim(p_lesson),p_key,p_replaces) returning id into result;
  insert into public.memory_state(owner_id,revision) values(auth.uid(),1) on conflict(owner_id) do update set revision=public.memory_state.revision+1;
  return result;
end $$;
create function public.suppress_memory(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select owner_id into owner from public.memory_references where id=p_id and owner_id=auth.uid();
  if not found then raise exception 'Private memory access required.'; end if;
  update public.memory_references set status='suppressed' where id=p_id and status<>'suppressed';
  if found then insert into public.memory_state(owner_id,revision) values(owner,1) on conflict(owner_id) do update set revision=public.memory_state.revision+1; end if;
end $$;
create function public.claim_memory_job(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare memory public.memory_references;
begin
  select * into memory from public.memory_references where id=p_id and owner_id=auth.uid() for update;
  if not found or memory.status in ('ready','suppressed') or (memory.scope='project' and private.member_role(memory.project_id) is distinct from 'freelancer') then raise exception 'This memory is not available for processing.'; end if;
  if memory.lease_until>now() then raise exception 'Memory is already being processed. Please wait.'; end if;
  update public.memory_references set lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where id=p_id returning * into memory;
  return jsonb_build_object('id',memory.id,'owner_id',memory.owner_id,'project_id',memory.project_id,'scope',memory.scope,'lesson',memory.lesson,'job_id',memory.job_id,'lease_token',memory.lease_token);
end $$;
create function public.record_memory_progress(p_id uuid,p_token uuid,p_job text,p_blob text,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare memory public.memory_references;
begin
  -- Same owner advisory lock as confirmation/reservation, then row lock.
  select * into memory from public.memory_references where id=p_id;
  if not found then raise exception 'Memory not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(memory.owner_id::text,0));
  select * into memory from public.memory_references where id=p_id for update;
  if memory.status='suppressed' then return; end if;
  if memory.lease_token is distinct from p_token or p_token is null or memory.lease_until<now() then raise exception 'The memory lease expired.'; end if;
  if p_status is null or p_status not in ('indexing','ready','failed') or (memory.job_id is not null and p_job is distinct from memory.job_id) or (p_status in ('indexing','ready') and nullif(p_job,'') is null) or (p_status='ready' and nullif(p_blob,'') is null) then raise exception 'Invalid provider progress.'; end if;
  update public.memory_references set status=p_status,job_id=p_job,blob_id=p_blob,lease_until=null,lease_token=null where id=p_id;
  if p_status='ready' then insert into public.memory_state(owner_id,revision) values(memory.owner_id,1) on conflict(owner_id) do update set revision=public.memory_state.revision+1; end if;
end $$;
-- A changed or suppressed lesson invalidates cached analysis. Old evidence stays
-- preserved, but is never reused as current learning.
alter table public.scope_assessments add column memory_revision bigint not null default 0;
alter table public.scope_assessments add column recalled_memory_ids uuid[] not null default '{}';
alter table public.scope_assessments add column recall_status text not null default 'unused' check(recall_status in ('unused','recalled','no_matches','unavailable'));
alter table public.scope_assessments drop constraint scope_assessments_prompt_version_check;
alter table public.scope_assessments add constraint scope_assessments_prompt_version_check check(prompt_version in ('scope-v1','scope-v2'));
do $$ declare cname text; begin
  select conname into cname from pg_constraint where conrelid='public.scope_assessments'::regclass and contype='u';
  execute format('alter table public.scope_assessments drop constraint %I',cname);
end $$;
alter table public.scope_assessments add constraint scope_memory_cache unique(owner_id,project_id,agreement_id,message_id,prompt_version,memory_revision);
grant select(memory_revision,recalled_memory_ids,recall_status) on public.scope_assessments to authenticated;
drop function public.reserve_scope_review(uuid,uuid,uuid);
create function public.reserve_scope_review(p_project uuid,p_message uuid,p_agreement uuid,p_memory_revision bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare assessment public.scope_assessments;active_id uuid;revision bigint;
begin
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can review scope.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select coalesce((select ms.revision from public.memory_state ms where owner_id=auth.uid()),0) into revision;
  if p_memory_revision is distinct from revision then raise exception 'Your confirmed lessons changed. Reload and review again.'; end if;
  select active_agreement_id into active_id from public.projects where id=p_project for update;
  if active_id is null or active_id is distinct from p_agreement then raise exception 'Review requires the current approved agreement. Reload and try again.'; end if;
  if not exists(select 1 from public.messages m join public.project_members pm on pm.project_id=m.project_id and pm.user_id=m.author_id where m.id=p_message and m.project_id=p_project and (pm.role='client' or (m.source='imported' and pm.role='freelancer'))) then raise exception 'Choose a client message or labeled import from this project.'; end if;
  select * into assessment from public.scope_assessments where owner_id=auth.uid() and project_id=p_project and agreement_id=p_agreement and message_id=p_message and prompt_version='scope-v2' and memory_revision=revision for update;
  if found and assessment.status='completed' and assessment.recall_status<>'unavailable' then return jsonb_build_object('id',assessment.id,'cached',true); end if;
  if found and assessment.status='running' and assessment.lease_until>now() then raise exception 'This request is already being reviewed. Please wait a moment.'; end if;
  if exists(select 1 from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 minute') then raise exception 'Please wait a minute before requesting another review.'; end if;
  if (select count(*) from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'The hourly review limit has been reached.'; end if;
  insert into private.scope_review_attempts(owner_id,project_id) values(auth.uid(),p_project);
  if assessment.id is null then insert into public.scope_assessments(project_id,owner_id,agreement_id,message_id,prompt_version,memory_revision) values(p_project,auth.uid(),p_agreement,p_message,'scope-v2',revision) returning * into assessment;
  else update public.scope_assessments set status='running',result=null,model=null,completed_at=null,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=assessment.id returning * into assessment; end if;
  return jsonb_build_object('id',assessment.id,'lease_token',assessment.lease_token,'cached',false);
end $$;
-- Retain the existing trusted completion/evidence validation, extend it with
-- revision and recalled-ID authorization. Only this wrapper is service-exposed.
alter function public.finish_scope_review(uuid,uuid,jsonb,text) rename to finish_scope_review_v1;
revoke all on function public.finish_scope_review_v1(uuid,uuid,jsonb,text) from service_role;
create function public.finish_scope_review(p_id uuid,p_token uuid,p_result jsonb,p_model text,p_memory_ids uuid[] default '{}',p_recall_status text default 'unused') returns void language plpgsql security definer set search_path='' as $$
declare assessment public.scope_assessments; revision bigint;
begin
  select * into assessment from public.scope_assessments where id=p_id;
  if not found then raise exception 'Review not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(assessment.owner_id::text,0));
  select coalesce((select ms.revision from public.memory_state ms where owner_id=assessment.owner_id),0) into revision;
  if p_result is not null then
    if assessment.memory_revision<>revision then raise exception 'Confirmed lessons changed during review. Please retry.'; end if;
    if p_recall_status is null or p_recall_status not in ('unused','recalled','no_matches','unavailable') or p_memory_ids is null or cardinality(p_memory_ids)>5 or (p_recall_status<>'recalled' and cardinality(p_memory_ids)>0) then raise exception 'Invalid recall evidence.'; end if;
    if exists(select 1 from unnest(p_memory_ids) mid where not exists(select 1 from public.memory_references m where m.id=mid and m.owner_id=assessment.owner_id and m.status='ready' and (m.scope='personal' or m.project_id=assessment.project_id))) then raise exception 'Private memory evidence required.'; end if;
  end if;
  perform public.finish_scope_review_v1(p_id,p_token,p_result,p_model);
  update public.scope_assessments set recalled_memory_ids=p_memory_ids,recall_status=p_recall_status where id=p_id;
end $$;
revoke all on function public.confirm_memory(uuid,text,text,uuid,uuid),public.suppress_memory(uuid),public.claim_memory_job(uuid),public.record_memory_progress(uuid,uuid,text,text,text),public.reserve_scope_review(uuid,uuid,uuid,bigint),public.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.confirm_memory(uuid,text,text,uuid,uuid),public.suppress_memory(uuid),public.claim_memory_job(uuid),public.reserve_scope_review(uuid,uuid,uuid,bigint) to authenticated;
grant execute on function public.record_memory_progress(uuid,uuid,text,text,text),public.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text) to service_role;
