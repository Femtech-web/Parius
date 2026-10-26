-- Private evidence summaries and controlled paired comparisons. No human terms are mutated.
alter table public.scope_assessments add column memory_influences jsonb not null default '[]' check(jsonb_typeof(memory_influences)='array');
alter table public.scope_assessments drop constraint scope_assessments_prompt_version_check;
alter table public.scope_assessments add constraint scope_assessments_prompt_version_check check(prompt_version in ('scope-v1','scope-v2','scope-v3'));
grant select(prompt_version,memory_influences) on public.scope_assessments to authenticated;
create table public.scope_comparisons (
 id uuid primary key default gen_random_uuid(),assessment_id uuid not null unique references public.scope_assessments(id) on delete cascade,
 owner_id uuid not null references auth.users(id),project_id uuid not null references public.projects(id),
 memory_revision bigint not null,prompt_version text not null default 'scope-v3' check(prompt_version='scope-v3'),
 status text not null default 'running' check(status in ('running','completed','failed','no_matches','unavailable')),
 without_memory jsonb,with_memory jsonb,memory_influences jsonb not null default '[]',recalled_memory_ids uuid[] not null default '{}',
 model text,context_hash text,created_at timestamptz not null default now(),completed_at timestamptz,
 lease_token uuid not null default gen_random_uuid(),lease_until timestamptz not null default now()+interval '120 seconds'
);
alter table public.scope_comparisons enable row level security;
create policy comparison_owner_read on public.scope_comparisons for select to authenticated using(owner_id=(select auth.uid()) and private.member_role(project_id)='freelancer');
revoke all on public.scope_comparisons from public,anon,authenticated;
grant select(id,assessment_id,status,without_memory,with_memory,memory_influences,recalled_memory_ids,model,context_hash,prompt_version,completed_at,memory_revision) on public.scope_comparisons to authenticated;
create table private.scope_comparison_attempts(owner_id uuid not null,created_at timestamptz not null default now());
create index comparison_attempts_owner_time on private.scope_comparison_attempts(owner_id,created_at desc);
revoke all on private.scope_comparison_attempts from public,anon,authenticated;
create function private.assert_memory_influences(p_owner uuid,p_project uuid,p_ids uuid[],p_influences jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb;
begin
 if p_ids is null or cardinality(p_ids)>5 or p_influences is null or jsonb_typeof(p_influences)<>'array' or jsonb_array_length(p_influences)>5 then raise exception 'Invalid memory attribution.';end if;
 if exists(select 1 from jsonb_array_elements(p_influences) i group by i->>'memory_id' having count(*)>1) then raise exception 'Duplicate memory attribution.';end if;
 for item in select * from jsonb_array_elements(p_influences) loop
  if jsonb_typeof(item)<>'object' or (select count(*) from jsonb_object_keys(item))<>3 or not(item ?& array['memory_id','quote','reason']) or exists(select 1 from jsonb_each(item) where jsonb_typeof(value)<>'string') or length(coalesce(item->>'quote','')) not between 1 and 600 or length(coalesce(item->>'reason','')) not between 5 and 400
  or not exists(select 1 from public.memory_references m where m.id=(item->>'memory_id')::uuid and m.id=any(p_ids) and m.owner_id=p_owner and m.status='ready' and (m.scope='personal' or m.project_id=p_project) and strpos(m.lesson,item->>'quote')>0)
  then raise exception 'Unverified memory attribution.';end if;
 end loop;
end $$;
revoke all on function private.assert_memory_influences(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
create or replace function public.reserve_scope_review(p_project uuid,p_message uuid,p_agreement uuid,p_memory_revision bigint default 0)
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
  select * into assessment from public.scope_assessments where owner_id=auth.uid() and project_id=p_project and agreement_id=p_agreement and message_id=p_message and prompt_version='scope-v3' and memory_revision=revision for update;
  if found and assessment.status='completed' and assessment.recall_status<>'unavailable' then return jsonb_build_object('id',assessment.id,'cached',true); end if;
  if found and assessment.status='running' and assessment.lease_until>now() then raise exception 'This request is already being reviewed. Please wait a moment.'; end if;
  if exists(select 1 from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 minute') then raise exception 'Please wait a minute before requesting another review.'; end if;
  if (select count(*) from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')+2*(select count(*) from private.scope_comparison_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'The hourly review limit has been reached.'; end if;
  insert into private.scope_review_attempts(owner_id,project_id) values(auth.uid(),p_project);
  if assessment.id is null then insert into public.scope_assessments(project_id,owner_id,agreement_id,message_id,prompt_version,memory_revision) values(p_project,auth.uid(),p_agreement,p_message,'scope-v3',revision) returning * into assessment;
  else update public.scope_assessments set status='running',result=null,model=null,completed_at=null,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=assessment.id returning * into assessment; end if;
  return jsonb_build_object('id',assessment.id,'lease_token',assessment.lease_token,'cached',false);
end $$;

alter function public.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text) set schema private;
revoke all on function private.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text) from public,anon,authenticated,service_role;
create function public.finish_scope_review(p_id uuid,p_token uuid,p_result jsonb,p_model text,p_memory_ids uuid[] default '{}',p_recall_status text default 'unused',p_influences jsonb default '[]') returns void language plpgsql security definer set search_path='' as $$
declare assessment public.scope_assessments;
begin
 select * into assessment from public.scope_assessments where id=p_id;
 if p_result is not null then perform private.assert_memory_influences(assessment.owner_id,assessment.project_id,p_memory_ids,p_influences);end if;
 perform private.finish_scope_review(p_id,p_token,p_result,p_model,p_memory_ids,p_recall_status);
 update public.scope_assessments set memory_influences=case when p_result is null then '[]'::jsonb else p_influences end where id=p_id;
end $$;
create function public.reserve_scope_comparison(p_assessment uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.scope_assessments;c public.scope_comparisons;revision bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into a from public.scope_assessments where id=p_assessment and owner_id=auth.uid();
 if not found or a.status<>'completed' or private.member_role(a.project_id) is distinct from 'freelancer' then raise exception 'Review this request privately first.';end if;
 perform 1 from public.projects where id=a.project_id and active_agreement_id=a.agreement_id for update;
 if not found then raise exception 'The approved agreement changed. Review the current version.';end if;
 select coalesce((select ms.revision from public.memory_state ms where owner_id=auth.uid()),0) into revision;
 if revision<>a.memory_revision then raise exception 'Your memories changed. Review the request again.';end if;
 select * into c from public.scope_comparisons where assessment_id=a.id for update;
 if found and c.status in ('completed','no_matches') then return jsonb_build_object('id',c.id,'cached',true);end if;
 if found and c.status='running' and c.lease_until>now() then raise exception 'This comparison is already running.';end if;
 if exists(select 1 from private.scope_comparison_attempts where owner_id=auth.uid() and created_at>now()-interval '1 minute') then raise exception 'Wait a minute before another comparison.';end if;
 if (select count(*) from private.scope_comparison_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=5 or (select count(*) from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')+2*(select count(*) from private.scope_comparison_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')+2>30 then raise exception 'The hourly comparison limit has been reached.';end if;
 insert into private.scope_comparison_attempts(owner_id) values(auth.uid());
 if c.id is null then insert into public.scope_comparisons(assessment_id,owner_id,project_id,memory_revision) values(a.id,auth.uid(),a.project_id,revision) returning * into c;
 else update public.scope_comparisons set status='running',without_memory=null,with_memory=null,memory_influences='[]',recalled_memory_ids='{}',model=null,context_hash=null,completed_at=null,lease_token=gen_random_uuid(),lease_until=now()+interval '120 seconds' where id=c.id returning * into c;end if;
 return jsonb_build_object('id',c.id,'cached',false,'lease_token',c.lease_token);
end $$;
create function private.assert_scope_result(p_result jsonb,p_scope text,p_body text) returns void language plpgsql set search_path='' as $$
begin
 if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'Invalid comparison evidence.';end if;
 if (select count(*) from jsonb_object_keys(p_result))<>6 or not(p_result ?& array['classification','title','explanation','agreement_quote','message_quote','suggested_reply']) or exists(select 1 from jsonb_each(p_result) where jsonb_typeof(value)<>'string') or p_result->>'classification' not in ('within_scope','possible_change','needs_clarification') or length(p_result->>'title') not between 3 and 100 or length(p_result->>'explanation') not between 10 and 1200 or length(p_result->>'suggested_reply') not between 1 and 1500 or length(p_result->>'agreement_quote') not between 1 and 1000 or length(p_result->>'message_quote') not between 1 and 1000 or strpos(p_scope,p_result->>'agreement_quote')=0 or strpos(p_body,p_result->>'message_quote')=0 then raise exception 'Invalid comparison evidence.';end if;
end $$;
revoke all on function private.assert_scope_result(jsonb,text,text) from public,anon,authenticated;
create function public.finish_scope_comparison(p_id uuid,p_token uuid,p_status text,p_without jsonb default null,p_with jsonb default null,p_ids uuid[] default '{}',p_influences jsonb default '[]',p_model text default null,p_hash text default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.scope_comparisons;a public.scope_assessments;revision bigint;scope_text text;body_text text;
begin
 select * into c from public.scope_comparisons where id=p_id;
 if not found then raise exception 'Comparison not found.';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.owner_id::text,0));
 select * into c from public.scope_comparisons where id=p_id for update;
 if c.status<>'running' or c.lease_token is distinct from p_token or c.lease_until<now() then raise exception 'Comparison lease expired.';end if;
 if p_status is null or p_status not in ('completed','failed','no_matches','unavailable') then raise exception 'Invalid comparison status.';end if;
 if p_status<>'failed' then
  select * into a from public.scope_assessments where id=c.assessment_id;
  select coalesce((select ms.revision from public.memory_state ms where owner_id=c.owner_id),0) into revision;
  perform 1 from public.projects where id=c.project_id and active_agreement_id=a.agreement_id for update;
  if not found or revision<>c.memory_revision then raise exception 'Context changed during comparison.';end if;
 end if;
 if p_status='completed' then
  if p_model is null or p_model not in ('openai/gpt-oss-120b','openai/gpt-oss-20b') or p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_ids is null or cardinality(p_ids) not between 1 and 5 or exists(select 1 from unnest(p_ids) mid where not exists(select 1 from public.memory_references m where m.id=mid and m.owner_id=c.owner_id and m.status='ready' and (m.scope='personal' or m.project_id=c.project_id))) then raise exception 'Private recalled evidence required.';end if;
  select scope into scope_text from public.agreement_versions where id=a.agreement_id;
  select body into body_text from public.messages where id=a.message_id;
  perform private.assert_scope_result(p_without,scope_text,body_text);perform private.assert_scope_result(p_with,scope_text,body_text);
  perform private.assert_memory_influences(c.owner_id,c.project_id,p_ids,p_influences);
 elsif p_without is not null or p_with is not null or cardinality(p_ids)<>0 or p_influences<>'[]'::jsonb then raise exception 'No paired result is available.';end if;
 update public.scope_comparisons set status=p_status,without_memory=p_without,with_memory=p_with,recalled_memory_ids=p_ids,memory_influences=p_influences,model=p_model,context_hash=p_hash,completed_at=now() where id=p_id;
end $$;
revoke all on function public.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text,jsonb),public.reserve_scope_comparison(uuid),public.finish_scope_comparison(uuid,uuid,text,jsonb,jsonb,uuid[],jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finish_scope_review(uuid,uuid,jsonb,text,uuid[],text,jsonb),public.finish_scope_comparison(uuid,uuid,text,jsonb,jsonb,uuid[],jsonb,text,text) to service_role;
grant execute on function public.reserve_scope_comparison(uuid) to authenticated;

-- Removal requests immediately stop recall. Permanent Walrus deletion remains an owner-signed operation.
alter table public.memory_references add column deletion_requested_at timestamptz;
grant select(deletion_requested_at) on public.memory_references to authenticated;
create table public.memory_deletion_requests (
 memory_id uuid primary key references public.memory_references(id),owner_id uuid not null references auth.users(id),
 blob_id text,job_id text,status text not null default 'requested' check(status='requested'),requested_at timestamptz not null default now()
);
alter table public.memory_deletion_requests enable row level security;
create policy deletion_owner_read on public.memory_deletion_requests for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.memory_deletion_requests from public,anon,authenticated;
grant select on public.memory_deletion_requests to authenticated;
create function public.request_memory_deletion(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.memory_references;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into m from public.memory_references where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Private memory access required.';end if;
 if m.deletion_requested_at is not null then return;end if;
 perform public.suppress_memory(p_id);
 insert into public.memory_deletion_requests(memory_id,owner_id,blob_id,job_id) values(m.id,m.owner_id,m.blob_id,m.job_id);
 -- Clear this lesson's private derived caches; shared messages/agreements/payments are untouched.
 delete from public.scope_comparisons where owner_id=auth.uid() and p_id=any(recalled_memory_ids);
 delete from public.scope_assessments where owner_id=auth.uid() and p_id=any(recalled_memory_ids);
 update public.memory_references set lesson='Removal requested by you.',deletion_requested_at=now() where id=p_id;
end $$;
revoke all on function public.request_memory_deletion(uuid) from public,anon;
grant execute on function public.request_memory_deletion(uuid) to authenticated;
alter function public.record_memory_progress(uuid,uuid,text,text,text) set schema private;
revoke all on function private.record_memory_progress(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
create function public.record_memory_progress(p_id uuid,p_token uuid,p_job text,p_blob text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare m public.memory_references;
begin
 select * into m from public.memory_references where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended(m.owner_id::text,0));
 select * into m from public.memory_references where id=p_id for update;
 if m.deletion_requested_at is not null then
  if m.lease_token is not distinct from p_token and p_token is not null and m.lease_until>=now() and (m.job_id is null or m.job_id=p_job) then
   update public.memory_references set job_id=coalesce(job_id,p_job),blob_id=coalesce(blob_id,p_blob),lease_token=null,lease_until=null where id=p_id;
   update public.memory_deletion_requests set job_id=coalesce(job_id,p_job),blob_id=coalesce(blob_id,p_blob) where memory_id=p_id;
  end if;
  return;
 end if;
 perform private.record_memory_progress(p_id,p_token,p_job,p_blob,p_status);
end $$;
revoke all on function public.record_memory_progress(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_memory_progress(uuid,uuid,text,text,text) to service_role;
