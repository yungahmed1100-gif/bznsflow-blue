-- Additive, owner pilot only. PREPARED ONLY: never run against production without release authorization.
begin;
create table if not exists public.layla_meta_state (
  key text primary key check (key in ('bznsflow:mock', 'bznsflow:live')),
  revision bigint not null check (revision > 0),
  state jsonb not null check (jsonb_typeof(state) = 'object' and state->>'schema' = '1'),
  updated_at timestamptz not null default now(),
  check (octet_length(state::text) <= 12000000)
);
alter table public.layla_meta_state enable row level security;
revoke all on public.layla_meta_state from public, anon, authenticated;
grant select, insert, update on public.layla_meta_state to service_role;
create or replace function public.layla_meta_read(p_key text) returns jsonb
language sql security invoker set search_path = pg_catalog, public
as $$ select jsonb_build_object('revision', revision, 'state', state) from public.layla_meta_state where key = p_key $$;
create or replace function public.layla_meta_cas(p_key text, p_revision bigint, p_state jsonb) returns boolean
language plpgsql security invoker set search_path = pg_catalog, public set statement_timeout = '2s' set lock_timeout = '1s'
as $$
declare changed integer;
begin
  if p_revision = 0 then
    insert into public.layla_meta_state(key, revision, state) values(p_key, 1, p_state) on conflict do nothing;
  else
    update public.layla_meta_state set state = p_state, revision = revision + 1, updated_at = now()
    where key = p_key and revision = p_revision;
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end $$;
revoke all on function public.layla_meta_read(text), public.layla_meta_cas(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.layla_meta_read(text), public.layla_meta_cas(text,bigint,jsonb) to service_role;
commit;
