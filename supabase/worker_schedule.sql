-- Run ONLY after deployment and after adding Vault secrets in the Supabase UI:
-- parius_worker_url = https://YOUR-DEPLOYMENT/api/internal/jobs
-- parius_worker_secret = the server-only BACKGROUND_WORKER_SECRET value.
-- Never paste real secret literals into this SQL file or Git.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create or replace function private.invoke_parius_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;secret text;request_id bigint;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='parius_worker_url';
 select decrypted_secret into secret from vault.decrypted_secrets where name='parius_worker_secret';
 if endpoint is null or endpoint!~'^https://[a-zA-Z0-9.-]+/api/internal/jobs$' or secret is null or length(secret)<32 then raise exception 'Configure the worker URL and authorization in Vault first.';end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=55000) into request_id;
 return request_id;
end $$;
revoke all on function private.invoke_parius_worker() from public,anon,authenticated,service_role;
-- Check Vault configuration before activating the recurring job, without sending a request.
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='parius_worker_url' and decrypted_secret~'^https://[a-zA-Z0-9.-]+/api/internal/jobs$') or not exists(select 1 from vault.decrypted_secrets where name='parius_worker_secret' and length(decrypted_secret)>=32) then raise exception 'Add the two worker Vault secrets before scheduling.';end if;
end $$;
select cron.schedule('parius-background','*/2 * * * *','select private.invoke_parius_worker()');
-- Pause later with: select cron.unschedule('parius-background');
