-- Short-lived authorization codes. Tokens are encrypted by the application;
-- only the service may exchange a code, and every exchange consumes it atomically.
create table private.agent_oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  connection_id uuid not null unique references public.agent_connections(id),
  client_id text not null check (length(client_id) between 1 and 9000),
  redirect_uri text not null check (length(redirect_uri) between 1 and 1000),
  resource text not null check (length(resource) between 1 and 1100),
  challenge text not null check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  encrypted_token text not null check (length(encrypted_token) between 50 and 500),
  expires_at timestamptz not null default now() + interval '3 minutes'
);
revoke all on private.agent_oauth_codes from public, anon, authenticated, service_role;

create function public.authorize_agent_oauth(
  p_project uuid,
  p_label text,
  p_token_hash text,
  p_code_hash text,
  p_client text,
  p_redirect text,
  p_resource text,
  p_challenge text,
  p_encrypted_token text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  connection uuid;
begin
  -- The existing function enforces current membership and the ten-connection cap.
  -- OAuth consent can create read-only access only, never a payment delegation.
  connection := public.create_agent_connection(p_project, p_label, p_token_hash, null);
  delete from private.agent_oauth_codes where expires_at <= now();
  insert into private.agent_oauth_codes (
    code_hash, connection_id, client_id, redirect_uri, resource, challenge, encrypted_token
  ) values (
    p_code_hash, connection, p_client, p_redirect, p_resource, p_challenge, p_encrypted_token
  );
  return connection;
end;
$$;

create function public.exchange_agent_oauth(
  p_code_hash text,
  p_client text,
  p_redirect text,
  p_resource text,
  p_challenge text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  saved private.agent_oauth_codes;
  connection public.agent_connections;
begin
  select * into saved
  from private.agent_oauth_codes
  where code_hash = p_code_hash
  for update;

  if saved.code_hash is null
    or saved.expires_at <= now()
    or saved.client_id is distinct from p_client
    or saved.redirect_uri is distinct from p_redirect
    or saved.resource is distinct from p_resource
    or saved.challenge is distinct from p_challenge then
    raise exception 'Invalid or expired authorization code.';
  end if;

  select * into connection
  from public.agent_connections
  where id = saved.connection_id;

  if connection.id is null
    or connection.revoked_at is not null
    or connection.expires_at <= now()
    or connection.request_id is not null
    or not exists (
      select 1 from public.project_members
      where project_id = connection.project_id
        and user_id = connection.owner_id
    ) then
    raise exception 'Agent connection unavailable.';
  end if;

  delete from private.agent_oauth_codes where code_hash = p_code_hash;
  return jsonb_build_object(
    'encrypted_token', saved.encrypted_token,
    'expires_in', floor(extract(epoch from connection.expires_at - now()))
  );
end;
$$;

revoke all on function public.authorize_agent_oauth(uuid,text,text,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.authorize_agent_oauth(uuid,text,text,text,text,text,text,text,text)
  to authenticated;
revoke all on function public.exchange_agent_oauth(text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.exchange_agent_oauth(text,text,text,text,text) to service_role;
