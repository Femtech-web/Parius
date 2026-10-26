-- Ownership proof is separate from connection and never authorizes transfers.
create table private.wallet_challenges (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 address text not null check(address ~ '^0x[0-9a-f]{64}$'),
 network text not null check(network in ('testnet','mainnet')),
 origin text not null check(length(origin) between 8 and 300),
 nonce text not null default gen_random_uuid()::text,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes',
 consumed_at timestamptz, signature_hash text check(signature_hash ~ '^[0-9a-f]{64}$'),
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);
create index wallet_challenges_owner_time on private.wallet_challenges(owner_id,created_at desc);
revoke all on private.wallet_challenges from public,anon,authenticated,service_role;
create table public.wallet_bindings (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 address text not null check(address ~ '^0x[0-9a-f]{64}$'),
 network text not null check(network in ('testnet','mainnet')),
 challenge_id uuid not null references private.wallet_challenges(id),
 verified_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 unique(owner_id,network,address)
);
alter table public.wallet_bindings enable row level security;
create policy wallet_bindings_owner_read on public.wallet_bindings for select to authenticated using(owner_id=auth.uid());
revoke all on public.wallet_bindings from public,anon,authenticated;
grant select(id,address,network,verified_at,revoked_at) on public.wallet_bindings to authenticated;

create function public.begin_wallet_challenge(p_owner uuid,p_address text,p_network text,p_origin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result private.wallet_challenges;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,67007));
 if exists(select 1 from private.wallet_challenges where owner_id=p_owner and created_at>clock_timestamp()-interval '10 seconds')
 or (select count(*) from private.wallet_challenges where owner_id=p_owner and created_at>clock_timestamp()-interval '1 hour')>=20
 then raise exception 'Wait before requesting another wallet signature.';end if;
 update private.wallet_challenges set consumed_at=clock_timestamp() where owner_id=p_owner and consumed_at is null;
 insert into private.wallet_challenges(owner_id,address,network,origin)
 values(p_owner,p_address,p_network,p_origin) returning * into result;
 return to_jsonb(result)-'signature_hash';
end $$;
create function public.read_wallet_challenge(p_id uuid,p_owner uuid)
returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(c)-'signature_hash' from private.wallet_challenges c where id=p_id and owner_id=p_owner
$$;
create function public.complete_wallet_challenge(p_id uuid,p_owner uuid,p_signature_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare challenge private.wallet_challenges;result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,67007));
 select * into challenge from private.wallet_challenges where id=p_id and owner_id=p_owner for update;
 if not found or challenge.consumed_at is not null or challenge.expires_at<=clock_timestamp() then
 raise exception 'Wallet challenge expired or was already used.';end if;
 if p_signature_hash is null or p_signature_hash !~ '^[0-9a-f]{64}$' then raise exception 'Missing verified signature.';end if;
 update private.wallet_challenges set consumed_at=clock_timestamp(),signature_hash=p_signature_hash where id=p_id;
 insert into public.wallet_bindings(owner_id,address,network,challenge_id)
 values(p_owner,challenge.address,challenge.network,challenge.id)
 on conflict(owner_id,network,address) do update set challenge_id=excluded.challenge_id,verified_at=clock_timestamp(),revoked_at=null
 returning id into result;
 return result;
end $$;
create function public.unlink_wallet(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,67007));
 update public.wallet_bindings set revoked_at=clock_timestamp() where id=p_id and owner_id=auth.uid() and revoked_at is null;
 update private.wallet_challenges set consumed_at=clock_timestamp() where owner_id=auth.uid() and consumed_at is null;
end $$;
revoke all on function public.begin_wallet_challenge(uuid,text,text,text),public.read_wallet_challenge(uuid,uuid),public.complete_wallet_challenge(uuid,uuid,text),public.unlink_wallet(uuid) from public,anon,authenticated;
grant execute on function public.begin_wallet_challenge(uuid,text,text,text),public.read_wallet_challenge(uuid,uuid),public.complete_wallet_challenge(uuid,uuid,text) to service_role;
grant execute on function public.unlink_wallet(uuid) to authenticated;

-- New instructions require an address whose control the client proved.
-- Historical instructions/receipts remain immutable and readable.
alter function public.prepare_payment_request(uuid,text,text) set schema private;
revoke all on function private.prepare_payment_request(uuid,text,text) from public,anon,authenticated;
create function public.prepare_payment_request(p_invoice uuid,p_payer text,p_amount text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.wallet_bindings b join public.invoices i on i.id=p_invoice
 where b.owner_id=auth.uid() and b.address=p_payer and b.network=i.network and b.revoked_at is null)
 then raise exception 'Verify ownership of this wallet on the invoice network first.';end if;
 return private.prepare_payment_request(p_invoice,p_payer,p_amount);
end $$;
revoke all on function public.prepare_payment_request(uuid,text,text) from public,anon;
grant execute on function public.prepare_payment_request(uuid,text,text) to authenticated;
