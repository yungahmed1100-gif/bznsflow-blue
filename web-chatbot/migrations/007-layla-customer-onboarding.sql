-- Additive customer integration boundary. Existing auth tables are referenced,
-- never altered. Execute only after local migration/isolation tests pass.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
create table public.layla_tenants (
  account_id uuid primary key references public.web_accounts(id),
  profile jsonb not null default '{}'::jsonb check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 5000),
  paused boolean not null default true,
  trial_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.layla_onboarding_attempts (
  id uuid primary key,
  account_id uuid not null references public.layla_tenants(account_id),
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  path text not null check (path in ('coexistence', 'new_number')),
  status text not null check (status in ('prepared', 'working', 'completed', 'failed', 'expired')),
  code text check (code ~ '^[a-z_]{1,60}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  unique(account_id, id)
);
create unique index layla_one_signup_at_a_time on public.layla_onboarding_attempts(account_id) where status in ('prepared', 'working');
create table public.layla_integrations (
  id uuid primary key,
  account_id uuid not null references public.layla_tenants(account_id),
  attempt_id uuid not null,
  app_id text not null check(app_id ~ '^[0-9]{1,30}$'),
  waba_id text not null check(waba_id ~ '^[0-9]{1,30}$'),
  phone_id text not null check(phone_id ~ '^[0-9]{1,30}$'),
  sender text not null check(sender ~ '^[0-9]{7,15}$'),
  path text not null check(path in ('coexistence', 'new_number')),
  coexistence_verified boolean not null default false,
  active boolean not null default true,
  status text not null default 'checking' check(status in ('checking','ready','needs_registration','needs_attention','revoked')),
  credential jsonb not null check(jsonb_typeof(credential) = 'object' and octet_length(credential::text) <= 15000),
  readiness jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, id),
  foreign key(account_id, attempt_id) references public.layla_onboarding_attempts(account_id, id),
  check(path <> 'coexistence' or coexistence_verified)
);
create unique index layla_sender_exclusive on public.layla_integrations(phone_id) where active;
create unique index layla_number_exclusive on public.layla_integrations(sender) where active;
create unique index layla_one_active_integration on public.layla_integrations(account_id) where active;
create table public.layla_customer_inbox (
  account_id uuid not null,
  integration_id uuid not null,
  event_id text not null check(length(event_id) between 1 and 220),
  event jsonb not null check(octet_length(event::text) <= 5000),
  received_at timestamptz not null default now(),
  primary key(account_id, integration_id, event_id),
  foreign key(account_id, integration_id) references public.layla_integrations(account_id, id)
);
create table public.layla_customer_outbox (
  id uuid primary key,
  account_id uuid not null,
  integration_id uuid not null,
  source_event_id text not null,
  status text not null check(status in ('queued','attempting','submitted','sent','delivered','read','failed','ambiguous','blocked')),
  result jsonb not null default '{}'::jsonb check(octet_length(result::text) <= 5000),
  attempted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(account_id, integration_id, source_event_id),
  unique(account_id, id),
  foreign key(account_id, integration_id, source_event_id) references public.layla_customer_inbox(account_id, integration_id, event_id)
);
create table public.layla_customer_feedback (
  account_id uuid not null,
  outbox_id uuid not null,
  rating text not null check(rating in ('correct','incorrect','missing_information','poor_clarification','handoff')),
  updated_at timestamptz not null default now(),
  primary key(account_id, outbox_id),
  foreign key(account_id, outbox_id) references public.layla_customer_outbox(account_id, id) on delete cascade
);
create index layla_inbox_retention on public.layla_customer_inbox(received_at);
create index layla_outbox_pending on public.layla_customer_outbox(created_at) where status='queued';
do $$ declare t text; begin
  foreach t in array array['layla_tenants','layla_onboarding_attempts','layla_integrations','layla_customer_inbox','layla_customer_outbox','layla_customer_feedback'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
  end loop;
end $$;
create function public.layla_signup_begin(p_account uuid,p_id uuid,p_hash text,p_path text) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='3s' set lock_timeout='1s'
as $$ begin
  perform 1 from public.layla_tenants where account_id=p_account for update;
  if not found then return false; end if;
  if exists(select 1 from public.layla_integrations where account_id=p_account and active) then return false; end if;
  update public.layla_onboarding_attempts set status='expired' where account_id=p_account and expires_at<=now() and status in ('prepared','working');
  if (select count(*) from public.layla_onboarding_attempts where account_id=p_account and created_at>now()-interval '1 hour')>=4 then return false; end if;
  if exists(select 1 from public.layla_onboarding_attempts where account_id=p_account and status in ('prepared','working')) then return false; end if;
  insert into public.layla_onboarding_attempts(id,account_id,state_hash,path,status) values(p_id,p_account,p_hash,p_path,'prepared');
  return true;
end $$;
create function public.layla_signup_claim(p_account uuid,p_id uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='3s' set lock_timeout='1s'
as $$ declare attempt public.layla_onboarding_attempts; begin
  update public.layla_onboarding_attempts set status='working' where account_id=p_account and id=p_id and state_hash=p_hash and status='prepared' and expires_at>now() returning * into attempt;
  if not found then return null; end if;
  return jsonb_build_object('id',attempt.id,'path',attempt.path);
end $$;
create function public.layla_signup_finish(p_account uuid,p_attempt uuid,p_integration jsonb) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public set statement_timeout='3s' set lock_timeout='1s'
as $$ declare attempt public.layla_onboarding_attempts; begin
  select * into attempt from public.layla_onboarding_attempts where account_id=p_account and id=p_attempt and status='working' and expires_at>now() for update;
  if not found or attempt.path<>p_integration->>'path' then return false; end if;
  insert into public.layla_integrations(id,account_id,attempt_id,app_id,waba_id,phone_id,sender,path,coexistence_verified,credential)
  values((p_integration->>'id')::uuid,p_account,p_attempt,p_integration->>'app',p_integration->>'waba',p_integration->>'phone',p_integration->>'sender',attempt.path,(p_integration->>'coexistence')::boolean,p_integration->'credential');
  update public.layla_onboarding_attempts set status='completed' where id=p_attempt;
  update public.layla_tenants set paused=true,updated_at=now() where account_id=p_account;
  return true;
end $$;
revoke all on function public.layla_signup_begin(uuid,uuid,text,text),public.layla_signup_claim(uuid,uuid,text),public.layla_signup_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.layla_signup_begin(uuid,uuid,text,text),public.layla_signup_claim(uuid,uuid,text),public.layla_signup_finish(uuid,uuid,jsonb) to service_role;
commit;
