-- Private, immutable objects. Browser uploads are insert-only into a reserved path.
-- Downloads are server-issued after current membership/release checks; no SELECT
-- policy exists for this bucket, so direct authenticated downloads cannot bypass gates.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('parius-project-files','parius-project-files',false,10485760,
 array['application/pdf','image/png','image/jpeg','image/webp','text/plain','application/zip']) ;

create table public.project_files (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
 uploaded_by uuid not null references auth.users(id),name text not null check(length(name) between 1 and 160 and name !~ '[[:cntrl:]/\\]'),
 object_path text not null unique,mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp','text/plain','application/zip')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),
 kind text not null check(kind in ('attachment','preview','final')),milestone_id uuid references public.milestones(id),
 agreement_id uuid,release_rule text check(release_rule in ('on_approval','invoice_paid')),invoice_id uuid references public.invoices(id),
 terms_quote text check(length(terms_quote) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','ready','removed')),
 idempotency_key uuid not null,sha256 text check(sha256~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),
 ready_at timestamptz,released_at timestamptz,released_by uuid references auth.users(id),removed_at timestamptz,object_deleted_at timestamptz,
 unique(uploaded_by,idempotency_key),foreign key(project_id,agreement_id) references public.agreement_versions(project_id,id),
 check((kind='final' and milestone_id is not null and agreement_id is not null and release_rule is not null and terms_quote is not null and ((release_rule='invoice_paid' and invoice_id is not null) or (release_rule='on_approval' and invoice_id is null)))
 or (kind<>'final' and agreement_id is null and release_rule is null and invoice_id is null and terms_quote is null)),
 check((status='ready' and sha256 is not null and ready_at is not null) or status<>'ready')
);
create index project_files_history on public.project_files(project_id,created_at desc,id desc);
create index project_files_owner_attempts on public.project_files(uploaded_by,created_at desc);
alter table public.project_files enable row level security;
create policy project_files_read on public.project_files for select to authenticated using
 (private.member_role(project_id) is not null and (status='ready' or uploaded_by=(select auth.uid())));
revoke all on public.project_files from public,anon,authenticated;
grant select on public.project_files to authenticated;

create function public.reserve_project_file(p_project uuid,p_name text,p_mime text,p_size integer,p_kind text,p_milestone uuid,p_rule text,p_invoice uuid,p_quote text,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.project_files;a public.agreement_versions;role_name text;new_id uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended('parius-file-quota',0));
 perform 1 from public.projects where id=p_project for update;
 role_name:=private.member_role(p_project);
 if role_name is null then raise exception 'Project membership required.';end if;
 select * into f from public.project_files where uploaded_by=auth.uid() and idempotency_key=p_key;
 if found then
  if f.project_id<>p_project or f.name is distinct from p_name or f.mime is distinct from p_mime or f.size_bytes is distinct from p_size or f.kind is distinct from p_kind or f.milestone_id is distinct from p_milestone or f.release_rule is distinct from p_rule or f.invoice_id is distinct from p_invoice or f.terms_quote is distinct from p_quote then raise exception 'This upload retry does not match the original file.';end if;
  if f.status='removed' or (f.status='pending' and f.created_at<now()-interval '30 minutes') then raise exception 'This upload expired. Choose the file again.';end if;
  return jsonb_build_object('id',f.id,'path',f.object_path,'status',f.status);
 end if;
 if (select count(*) from public.project_files where uploaded_by=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Upload limit reached. Try again later.';end if;
 if (select coalesce(sum(size_bytes),0) from public.project_files where object_deleted_at is null)+p_size>524288000 then raise exception 'File storage is at its current limit.';end if;
 if p_milestone is not null and not exists(select 1 from public.milestones where id=p_milestone and project_id=p_project) then raise exception 'Choose a milestone in this project.';end if;
 if p_kind in ('preview','final') and (role_name<>'freelancer' or p_milestone is null) then raise exception 'Only the freelancer can upload milestone deliverables.';end if;
 if p_kind='final' then
  select a1.* into a from public.agreement_versions a1 join public.projects p on p.active_agreement_id=a1.id where p.id=p_project;
  if a.id is null or p_quote is null or length(btrim(p_quote))=0 or position(p_quote in a.scope)=0 then raise exception 'Select release terms quoted exactly from the approved agreement.';end if;
  if p_rule='invoice_paid' and not exists(select 1 from public.invoices i where i.id=p_invoice and i.project_id=p_project and i.agreement_id=a.id and i.status='issued') then raise exception 'Choose an issued invoice for this approved agreement.';end if;
 end if;
 insert into public.project_files(id,project_id,uploaded_by,name,object_path,mime,size_bytes,kind,milestone_id,agreement_id,release_rule,invoice_id,terms_quote,idempotency_key)
 values(new_id,p_project,auth.uid(),p_name,p_project::text||'/'||new_id::text||'/file',p_mime,p_size,p_kind,p_milestone,case when p_kind='final' then a.id end,p_rule,p_invoice,p_quote,p_key) returning * into f;
 return jsonb_build_object('id',f.id,'path',f.object_path,'status',f.status);
end $$;

create function private.file_upload_allowed(p_path text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare f public.project_files;
begin
 select * into f from public.project_files where object_path=p_path;
 if f.id is null then return false;end if;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where object_path=p_path;
 return f.uploaded_by=auth.uid() and f.status='pending' and f.created_at>now()-interval '30 minutes' and private.member_role(f.project_id) is not null;
end $$;
revoke all on function private.file_upload_allowed(text) from public,anon;
grant execute on function private.file_upload_allowed(text) to authenticated;
create policy parius_files_insert on storage.objects for insert to authenticated with check
 (bucket_id='parius-project-files' and private.file_upload_allowed(name));
-- Restrictive policies prevent other, broader bucket policies from granting a bypass.
create policy parius_files_no_read on storage.objects as restrictive for select to authenticated using(bucket_id<>'parius-project-files');
create policy parius_files_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'parius-project-files') with check(bucket_id<>'parius-project-files');
create policy parius_files_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'parius-project-files');
create policy parius_files_reserved_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'parius-project-files' or private.file_upload_allowed(name));
create policy parius_files_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'parius-project-files') with check(bucket_id<>'parius-project-files');

create function public.finish_project_file(p_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files;
begin
 select * into f from public.project_files where id=p_id;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=p_id for update;
 if f.id is null or f.status='removed' then raise exception 'Upload unavailable.';end if;
 if f.status='ready' then return;end if;
 if f.created_at<now()-interval '30 minutes' or not exists(select 1 from public.project_members where project_id=f.project_id and user_id=f.uploaded_by) then raise exception 'Upload expired or uploader no longer has access.';end if;
 if not exists(select 1 from storage.objects where bucket_id='parius-project-files' and name=f.object_path) then raise exception 'Upload not found in private storage.';end if;
 update public.project_files set status='ready',ready_at=now(),sha256=p_hash where id=p_id;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(f.project_id,f.uploaded_by,'file_uploaded',f.id);
end $$;

create function private.final_release_eligible(f public.project_files) returns boolean language sql stable security definer set search_path='' as $$
 select f.kind='final' and f.status='ready'
 and exists(select 1 from public.projects p where p.id=f.project_id and p.active_agreement_id=f.agreement_id)
 and exists(select 1 from public.milestones m where m.id=f.milestone_id and m.project_id=f.project_id and m.state='accepted')
 and (f.release_rule='on_approval' or (f.release_rule='invoice_paid' and exists(select 1 from public.invoices i where i.id=f.invoice_id and i.project_id=f.project_id and i.agreement_id=f.agreement_id and i.status='issued' and
 coalesce((select sum(r.amount_atomic::numeric) from public.payment_records r where r.invoice_id=i.id and r.reversed_at is null),0)>=i.amount_atomic::numeric)))
$$;
revoke all on function private.final_release_eligible(public.project_files) from public,anon,authenticated;

create function public.release_project_file(p_id uuid,p_confirm boolean) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files;
begin
 select * into f from public.project_files where id=p_id;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=p_id for update;
 if private.member_role(f.project_id) is distinct from 'freelancer' or p_confirm is distinct from true then raise exception 'Freelancer confirmation required.';end if;
 if not private.final_release_eligible(f) then raise exception 'Release needs the current approved agreement, client-accepted milestone and any required invoice payment.';end if;
 if f.released_at is not null then return;end if;
 update public.project_files set released_at=now(),released_by=auth.uid() where id=p_id;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(f.project_id,auth.uid(),'file_released',p_id);
end $$;

create function public.authorize_file_download(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.project_files;role_name text;
begin
 select * into f from public.project_files where id=p_id;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=p_id;
 role_name:=private.member_role(f.project_id);
 if role_name is null or f.status<>'ready' then raise exception 'File unavailable.';end if;
 if f.kind='final' and role_name<>'freelancer' and (f.released_at is null or not private.final_release_eligible(f)) then raise exception 'This final file is not available for download yet.';end if;
 return jsonb_build_object('path',f.object_path,'name',f.name);
end $$;

create function public.remove_project_file(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.project_files;
begin
 select * into f from public.project_files where id=p_id;
 perform 1 from public.projects where id=f.project_id for update;
 select * into f from public.project_files where id=p_id for update;
 if private.member_role(f.project_id) is null or f.uploaded_by is distinct from auth.uid() then raise exception 'Only the uploader can remove this file.';end if;
 if f.status='removed' then return;end if;
 update public.project_files set status='removed',removed_at=now() where id=p_id;
 insert into public.activity_events(project_id,actor_id,kind,record_id) values(f.project_id,auth.uid(),'file_removed',p_id);
end $$;
create function public.finish_file_removal(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.project_files set object_deleted_at=now() where id=p_id and status='removed'
$$;
revoke all on function public.reserve_project_file(uuid,text,text,integer,text,uuid,text,uuid,text,uuid),public.finish_project_file(uuid,text),public.release_project_file(uuid,boolean),public.authorize_file_download(uuid),public.remove_project_file(uuid),public.finish_file_removal(uuid) from public,anon,authenticated;
grant execute on function public.reserve_project_file(uuid,text,text,integer,text,uuid,text,uuid,text,uuid),public.release_project_file(uuid,boolean),public.authorize_file_download(uuid),public.remove_project_file(uuid) to authenticated;
grant execute on function public.finish_project_file(uuid,text),public.finish_file_removal(uuid) to service_role;
