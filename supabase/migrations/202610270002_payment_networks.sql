-- One settlement network per project. Test tokens must never settle real invoices.
alter table public.projects add column payment_network text not null default 'testnet'
  check (payment_network in ('testnet', 'mainnet'));

do $$
begin
  if exists (
    select project_id from public.invoices where network is not null
    group by project_id having count(distinct network) > 1
  ) then
    raise exception 'Mixed-network project found. Review existing invoices before migration.';
  end if;
end $$;

update public.projects p set payment_network = i.network
from (select project_id, min(network) as network from public.invoices
      where network is not null group by project_id) i
where p.id = i.project_id;

create function public.set_project_payment_network(p_project uuid, p_network text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_network text;
begin
  select payment_network into current_network from public.projects
  where id = p_project for update;
  if private.member_role(p_project) is distinct from 'freelancer' then
    raise exception 'Only the freelancer can choose the payment mode.';
  end if;
  if p_network is null or p_network not in ('testnet', 'mainnet') then
    raise exception 'Choose Testnet or Mainnet.';
  end if;
  if current_network = p_network then return; end if;
  if exists (select 1 from public.invoices where project_id = p_project and issued_at is not null) then
    raise exception 'Payment mode is fixed after the first invoice is issued. Use a separate project for the other network.';
  end if;
  update public.projects set payment_network = p_network where id = p_project;
  insert into public.activity_events(project_id, actor_id, kind, record_id)
  values (p_project, auth.uid(), 'payment_network_changed', p_project);
end $$;

create function private.enforce_project_payment_network()
returns trigger language plpgsql security definer set search_path = '' as $$
declare configured text;
begin
  select payment_network into configured from public.projects
  where id = new.project_id for update;
  if new.network is not null and new.network <> configured then
    raise exception 'Invoice network must match the project payment mode.';
  end if;
  return new;
end $$;
create trigger invoice_project_payment_network before insert or update of network, status
on public.invoices for each row execute function private.enforce_project_payment_network();

revoke all on function public.set_project_payment_network(uuid,text) from public, anon, authenticated;
grant execute on function public.set_project_payment_network(uuid,text) to authenticated;
revoke all on function private.enforce_project_payment_network() from public, anon, authenticated;
