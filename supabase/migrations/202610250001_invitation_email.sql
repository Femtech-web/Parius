-- Explicit project emails, separate from Supabase Auth SMTP. No raw invite token is stored here.
create table private.invitation_emails (
 id uuid primary key default gen_random_uuid(),invite_id uuid not null references public.project_invites(id),
 project_id uuid not null references public.projects(id),owner_id uuid not null references auth.users(id),
 recipient text not null,payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','accepted')),
 attempts integer not null default 0,created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,provider_id text,
 unique(invite_id,recipient)
);
create index invitation_email_budget on private.invitation_emails(created_at,owner_id);
revoke all on private.invitation_emails from public,anon,authenticated,service_role;
create function public.reserve_invitation_email(p_project uuid,p_token_hash text,p_email text,p_payload_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.project_invites;e private.invitation_emails;target_email text:=lower(btrim(p_email));
begin
 -- One global budget lock bounds races across accounts; then use the existing project lock order.
 perform pg_advisory_xact_lock(hashtextextended('parius-invitation-email',0));
 perform 1 from public.projects where id=p_project for update;
 if private.member_role(p_project) is distinct from 'freelancer' then raise exception 'Only the freelancer can email an invitation.';end if;
 if target_email is null or length(target_email)>254 or target_email!~'^[^[:space:]<>@]+@[^[:space:]<>@]+[.][^[:space:]<>@]+$' or p_payload_hash is null or p_payload_hash!~'^[a-f0-9]{64}$' then raise exception 'Enter a valid client email address.';end if;
 select * into i from public.project_invites where project_id=p_project and token_hash=p_token_hash for update;
 if i.id is null or i.expires_at<=now() or i.accepted_by is not null or exists(select 1 from public.project_members where project_id=p_project and role='client') then raise exception 'This invitation expired or was used. Reopen the project to create a fresh link if no client has joined.';end if;
 select * into e from private.invitation_emails where invite_id=i.id and invitation_emails.recipient=target_email for update;
 if e.id is not null then
  if e.payload_hash is distinct from p_payload_hash then raise exception 'This email retry changed. Use the original settings or copy the invitation link.';end if;
  if e.status='accepted' then return jsonb_build_object('id',e.id,'cached',true);end if;
  if e.lease_until>now() or e.next_attempt_at>now() then raise exception 'Please wait a minute before retrying this email.';end if;
  -- Provider idempotency lasts24hours. Never retry an uncertain send beyond that window.
  if e.created_at<now()-interval '23 hours' or e.attempts>=3 then raise exception 'Email delivery is uncertain. Check Resend delivery logs or copy the invitation link instead.';end if;
 else
  if (select count(*) from private.invitation_emails where owner_id=auth.uid() and created_at>now()-interval '1 hour')>=10 or (select count(*) from private.invitation_emails where created_at>now()-interval '24 hours')>=80 then raise exception 'Invitation email limit reached. You can still copy the link.';end if;
  insert into private.invitation_emails(invite_id,project_id,owner_id,recipient,payload_hash) values(i.id,p_project,auth.uid(),target_email,p_payload_hash) returning * into e;
 end if;
 update private.invitation_emails set attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds',next_attempt_at=now()+interval '1 minute' where id=e.id returning * into e;
 return jsonb_build_object('id',e.id,'lease_token',e.lease_token,'cached',false);
end $$;
create function public.complete_invitation_email(p_id uuid,p_lease uuid,p_provider text) returns void language plpgsql security definer set search_path='' as $$
declare e private.invitation_emails;
begin
 select * into e from private.invitation_emails where id=p_id for update;
 if e.id is null or p_lease is null or e.lease_token is distinct from p_lease or e.lease_until<now() or nullif(p_provider,'') is null or length(p_provider)>200 then raise exception 'Invitation email confirmation unavailable.';end if;
 update private.invitation_emails set status='accepted',provider_id=p_provider,lease_token=null,lease_until=null where id=p_id;
end $$;
revoke all on function public.reserve_invitation_email(uuid,text,text,text) from public,anon;
grant execute on function public.reserve_invitation_email(uuid,text,text,text) to authenticated;
revoke all on function public.complete_invitation_email(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_invitation_email(uuid,uuid,text) to service_role;
