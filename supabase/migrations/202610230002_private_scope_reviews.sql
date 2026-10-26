-- Private, on-demand analysis. No agreement/payment RPC is invoked by this flow.
create table public.scope_assessments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  owner_id uuid not null references auth.users(id), agreement_id uuid not null,
  message_id uuid not null references public.messages(id), prompt_version text not null check(prompt_version='scope-v1'),
  status text not null default 'running' check(status in ('running','completed','failed')),
  result jsonb, model text, lease_token uuid not null default gen_random_uuid(),
  lease_until timestamptz not null default now()+interval '90 seconds',
  created_at timestamptz not null default now(), completed_at timestamptz,
  foreign key(project_id,agreement_id) references public.agreement_versions(project_id,id),
  unique(owner_id,project_id,agreement_id,message_id,prompt_version),
  check((status='completed' and result is not null and model is not null and completed_at is not null) or (status<>'completed' and result is null))
);
create index scope_assessments_project on public.scope_assessments(project_id,created_at desc);
alter table public.scope_assessments enable row level security;
create policy scope_assessments_read on public.scope_assessments for select to authenticated
  using(owner_id=(select auth.uid()) and private.member_role(project_id)='freelancer');
revoke all on public.scope_assessments from public, anon, authenticated;
-- Lease tokens stay server-side even when the owner reads their private results.
grant select(id,project_id,owner_id,agreement_id,message_id,prompt_version,status,result,model,created_at,completed_at) on public.scope_assessments to authenticated;
create table private.scope_review_attempts (
  owner_id uuid not null references auth.users(id), project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now()
);
create index scope_attempts_owner on private.scope_review_attempts(owner_id,created_at desc);
revoke all on private.scope_review_attempts from public,anon,authenticated;

create function public.reserve_scope_review(p_project uuid,p_message uuid,p_agreement uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare assessment public.scope_assessments; active_id uuid;
begin
  if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can review scope.'; end if;
  -- Serialize reservations by authenticated actor, including across projects.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select active_agreement_id into active_id from public.projects where id=p_project for update;
  if active_id is null or active_id is distinct from p_agreement then raise exception 'Review requires the current approved agreement. Reload and try again.'; end if;
  if not exists(select 1 from public.messages m join public.project_members pm on pm.project_id=m.project_id and pm.user_id=m.author_id where m.id=p_message and m.project_id=p_project and (pm.role='client' or (m.source='imported' and pm.role='freelancer'))) then raise exception 'Choose a client message or labeled import from this project.'; end if;
  select * into assessment from public.scope_assessments where owner_id=auth.uid() and project_id=p_project and agreement_id=p_agreement and message_id=p_message and prompt_version='scope-v1' for update;
  if found and assessment.status='completed' then return jsonb_build_object('id',assessment.id,'cached',true); end if;
  if found and assessment.status='running' and assessment.lease_until>now() then raise exception 'This request is already being reviewed. Please wait a moment.'; end if;
  if exists(select 1 from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 minute') then raise exception 'Please wait a minute before requesting another review.'; end if;
  if (select count(*) from private.scope_review_attempts where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'The hourly review limit has been reached. Please try later.'; end if;
  insert into private.scope_review_attempts(owner_id,project_id) values(auth.uid(),p_project);
  if assessment.id is null then
    insert into public.scope_assessments(project_id,owner_id,agreement_id,message_id,prompt_version) values(p_project,auth.uid(),p_agreement,p_message,'scope-v1') returning * into assessment;
  else
    update public.scope_assessments set status='running',result=null,model=null,completed_at=null,lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=assessment.id returning * into assessment;
  end if;
  return jsonb_build_object('id',assessment.id,'lease_token',assessment.lease_token,'cached',false);
end $$;

-- Only the trusted server may record provider output. A leaked/public action
-- cannot manufacture a successful provider assessment through the user's JWT.
create function public.finish_scope_review(p_id uuid,p_token uuid,p_result jsonb,p_model text)
returns void language plpgsql security definer set search_path='' as $$
declare assessment public.scope_assessments; message_body text; agreement_scope text;
begin
  select * into assessment from public.scope_assessments where id=p_id for update;
  if not found or assessment.status<>'running' or assessment.lease_token is distinct from p_token or assessment.lease_until<now() then raise exception 'The review lease is no longer valid.'; end if;
  if p_result is not null then
    if jsonb_typeof(p_result)<>'object' then raise exception 'Invalid analysis evidence.'; end if;
    select scope into agreement_scope from public.agreement_versions where id=assessment.agreement_id;
    select body into message_body from public.messages where id=assessment.message_id;
    if p_model is null or p_model not in ('openai/gpt-oss-120b','openai/gpt-oss-20b')
      or jsonb_typeof(p_result)<>'object'
      or not (p_result ?& array['classification','title','explanation','agreement_quote','message_quote','suggested_reply'])
      or coalesce(p_result->>'classification','') not in ('within_scope','possible_change','needs_clarification')
      or pg_column_size(p_result)>10000
      or exists(select 1 from jsonb_each(p_result) where jsonb_typeof(value)<>'string')
      or length(coalesce(p_result->>'title','')) not between 3 and 100
      or length(coalesce(p_result->>'explanation','')) not between 10 and 1200
      or length(coalesce(p_result->>'suggested_reply','')) not between 1 and 1500
      or length(coalesce(p_result->>'agreement_quote','')) not between 1 and 1000 or length(coalesce(p_result->>'message_quote','')) not between 1 and 1000
      or strpos(agreement_scope,p_result->>'agreement_quote')=0 or strpos(message_body,p_result->>'message_quote')=0 then
      raise exception 'Invalid analysis evidence.';
    end if;
  end if;
  update public.scope_assessments set status=case when p_result is null then 'failed' else 'completed' end,result=p_result,model=p_model,completed_at=now() where id=p_id;
end $$;
revoke all on function public.reserve_scope_review(uuid,uuid,uuid),public.finish_scope_review(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_scope_review(uuid,uuid,uuid) to authenticated;
grant execute on function public.finish_scope_review(uuid,uuid,jsonb,text) to service_role;
