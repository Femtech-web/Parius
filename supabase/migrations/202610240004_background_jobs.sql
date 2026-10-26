alter table public.memory_references add column task_attempts integer not null default 0;
alter table public.memory_references add column task_failures integer not null default 0;
alter table public.memory_references add column next_attempt_at timestamptz not null default now();
alter table public.memory_references add column task_error text;
alter table public.project_files add column cleanup_attempts integer not null default 0;
alter table public.project_files add column cleanup_after timestamptz not null default now();
alter table public.project_files add column cleanup_token uuid;
alter table public.project_files add column cleanup_until timestamptz;
create index memory_task_due on public.memory_references(next_attempt_at,created_at) where status in ('pending','indexing','failed');
create index file_cleanup_due on public.project_files(cleanup_after,created_at) where object_deleted_at is null and status in ('pending','removed');
create table private.background_state(
 id boolean primary key default true check(id),token uuid,lease_until timestamptz,started_at timestamptz,finished_at timestamptz,
 last_outcome text not null default 'never_run',runs bigint not null default 0,memories integer not null default 0,files integer not null default 0,errors integer not null default 0
);
insert into private.background_state(id) values(true);
revoke all on private.background_state from public,anon,authenticated,service_role;
create function public.claim_background_run() returns uuid language plpgsql security definer set search_path='' as $$
declare s private.background_state;result uuid:=gen_random_uuid();
begin
 select * into s from private.background_state where id for update;
 if s.lease_until>now() or s.started_at>now()-interval '50 seconds' then return null;end if;
 update private.background_state set token=result,lease_until=now()+interval '150 seconds',started_at=now(),finished_at=null,last_outcome='running',runs=runs+1,memories=0,files=0,errors=0 where id;
 return result;
end $$;
create function private.check_background(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_token is null or not exists(select 1 from private.background_state where id and token=p_token and lease_until>now()) then raise exception 'Worker lease unavailable.';end if;
end $$;
revoke all on function private.check_background(uuid) from public,anon,authenticated,service_role;
create function public.finish_background_run(p_token uuid,p_memories integer,p_files integer,p_errors integer) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.check_background(p_token);
 if p_memories not between 0 and 2 or p_files not between 0 and 2 or p_errors not between 0 and 4 then raise exception 'Invalid worker counts.';end if;
 update private.background_state set token=null,lease_until=null,finished_at=now(),last_outcome=case when p_errors>0 then 'needs_retry' else 'completed' end,memories=p_memories,files=p_files,errors=p_errors where id and token=p_token;
end $$;
create function public.background_status() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('started_at',started_at,'finished_at',finished_at,'outcome',case when last_outcome='running' and lease_until<now() then 'interrupted' else last_outcome end,'runs',runs,'memories',memories,'files',files,'errors',errors,
 'memory_waiting',(select count(*) from public.memory_references where status in ('pending','indexing','failed') and task_attempts<60 and task_failures<8),
 'memory_attention',(select count(*) from public.memory_references where status in ('pending','indexing','failed') and (task_attempts>=60 or task_failures>=8)),
 'file_attention',(select count(*) from public.project_files where object_deleted_at is null and cleanup_attempts>=8 and status='removed'),
 'file_waiting',(select count(*) from public.project_files where object_deleted_at is null and cleanup_attempts<8 and (status='removed' or (status='pending' and created_at<now()-interval '1 hour'))))
 from private.background_state where id
$$;
create function public.claim_background_memory(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memory_references;
begin
 perform private.check_background(p_token);
 -- Consistent owner lock -> row lock order, shared with correction/deletion/completion.
 select * into m from public.memory_references r where r.status in ('pending','indexing','failed') and r.next_attempt_at<=now() and r.task_attempts<60 and r.task_failures<8 and (r.lease_until is null or r.lease_until<=now()) and (r.scope='personal' or exists(select 1 from public.project_members pm where pm.project_id=r.project_id and pm.user_id=r.owner_id and pm.role='freelancer')) order by next_attempt_at,created_at,id limit 1;
 if m.id is null then return null;end if;
 if not pg_try_advisory_xact_lock(hashtextextended(m.owner_id::text,0)) then return null;end if;
 select * into m from public.memory_references where id=m.id for update;
 if m.status not in ('pending','indexing','failed') or m.next_attempt_at>now() or m.task_attempts>=60 or m.task_failures>=8 or m.lease_until>now() then return null;end if;
 update public.memory_references set lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',task_attempts=task_attempts+1 where id=m.id returning * into m;
 return jsonb_build_object('id',m.id,'owner_id',m.owner_id,'project_id',m.project_id,'scope',m.scope,'lesson',m.lesson,'job_id',m.job_id,'lease_token',m.lease_token);
end $$;
create or replace function public.claim_memory_job(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memory_references;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into m from public.memory_references where id=p_id and owner_id=auth.uid() for update;
 if m.id is null or m.status in ('ready','suppressed') or (m.scope='project' and private.member_role(m.project_id) is distinct from 'freelancer') then raise exception 'Private memory access required.';end if;
 if m.lease_until>now() then raise exception 'Storage is being checked. Please wait.';end if;
 if m.next_attempt_at>now() then raise exception 'Storage retry is waiting briefly. Please try later.';end if;
 update public.memory_references set lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',task_attempts=case when task_attempts>=60 then 1 else task_attempts+1 end,task_failures=case when task_failures>=8 then 0 else task_failures end where id=p_id returning * into m;
 return jsonb_build_object('id',m.id,'owner_id',m.owner_id,'project_id',m.project_id,'scope',m.scope,'lesson',m.lesson,'job_id',m.job_id,'lease_token',m.lease_token);
end $$;
create function public.complete_memory_task(p_id uuid,p_token uuid,p_job text,p_blob text,p_status text,p_failed boolean) returns void language plpgsql security definer set search_path='' as $$
declare m public.memory_references;
begin
 select * into m from public.memory_references where id=p_id;
 perform pg_advisory_xact_lock(hashtextextended(m.owner_id::text,0));
 select * into m from public.memory_references where id=p_id for update;
 if m.id is null or m.lease_token is distinct from p_token or p_token is null or m.lease_until<now() then raise exception 'Memory lease unavailable.';end if;
 perform public.record_memory_progress(p_id,p_token,p_job,p_blob,p_status);
 -- Existing trusted completion handles deletion/suppression races and provenance.
 if m.status='suppressed' then return;end if;
 update public.memory_references set task_failures=case when p_failed then task_failures+1 else 0 end,
 next_attempt_at=now()+make_interval(secs=>case when p_failed then least(3600,30*power(2,least(task_failures+1,7)))::integer else 60 end),
 task_error=case when p_failed then 'provider_retry' else null end,
 status=case when (p_failed and task_failures+1>=8) or (task_attempts>=60 and p_status<>'ready') then 'failed' else status end where id=p_id;
end $$;
create function public.claim_file_cleanup(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.project_files;
begin
 perform private.check_background(p_token);
 select * into f from public.project_files where object_deleted_at is null and cleanup_after<=now() and cleanup_attempts<8 and (cleanup_until is null or cleanup_until<=now()) and (status='removed' or (status='pending' and created_at<now()-interval '1 hour')) order by cleanup_after,created_at,id limit 1;
 if f.id is null then return null;end if;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=f.id for update;
 if f.object_deleted_at is not null or f.cleanup_until>now() or f.cleanup_attempts>=8 or not (f.status='removed' or (f.status='pending' and f.created_at<now()-interval '1 hour')) then return null;end if;
 update public.project_files set status='removed',removed_at=coalesce(removed_at,now()),cleanup_attempts=cleanup_attempts+1,cleanup_token=gen_random_uuid(),cleanup_until=now()+interval '90 seconds' where id=f.id returning * into f;
 return jsonb_build_object('id',f.id,'path',f.object_path,'token',f.cleanup_token);
end $$;
create function public.complete_file_cleanup(p_id uuid,p_token uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files;
begin
 select * into f from public.project_files where id=p_id;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=p_id for update;
 if f.id is null or f.cleanup_token is distinct from p_token or p_token is null or f.cleanup_until<now() or f.status<>'removed' then raise exception 'Cleanup lease unavailable.';end if;
 update public.project_files set object_deleted_at=case when p_success then now() else object_deleted_at end,cleanup_token=null,cleanup_until=null,cleanup_after=now()+make_interval(secs=>least(3600,60*power(2,least(cleanup_attempts,6)))::integer) where id=p_id;
end $$;
revoke all on function public.claim_background_run(),public.finish_background_run(uuid,integer,integer,integer),public.background_status(),public.claim_background_memory(uuid),public.complete_memory_task(uuid,uuid,text,text,text,boolean),public.claim_file_cleanup(uuid),public.complete_file_cleanup(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_background_run(),public.finish_background_run(uuid,integer,integer,integer),public.background_status(),public.claim_background_memory(uuid),public.complete_memory_task(uuid,uuid,text,text,text,boolean),public.claim_file_cleanup(uuid),public.complete_file_cleanup(uuid,uuid,boolean) to service_role;
