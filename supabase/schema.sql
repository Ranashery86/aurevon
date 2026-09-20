-- Aurevon database schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL) to create
-- the required tables with public-read policies and seed data.

-- ── plans ──────────────────────────────────────────────────────
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null default 0,
  monthly_credits integer not null default 0,
  stripe_price_id text,
  created_at timestamptz not null default now()
);

-- Allow public read access (unauthenticated visitors)
alter table public.plans enable row level security;

drop policy if exists "Plans are publicly readable" on public.plans;
create policy "Plans are publicly readable"
  on public.plans
  for select
  using (true);

-- Migration for existing databases: add stripe_price_id if missing.
alter table public.plans
  add column if not exists stripe_price_id text;

-- ── services ───────────────────────────────────────────────────
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key text not null unique,
  status text not null default 'active'
    check (status in ('active', 'coming_soon')),
  credit_cost integer not null default 0,
  webhook_url text,
  created_at timestamptz not null default now()
);

-- Migration for existing databases: add credit_cost if missing.
alter table public.services
  add column if not exists credit_cost integer not null default 0;

-- The n8n trigger webhook URL for this service is stored here (per service_key)
-- so repointing a service is a pure data change — no redeploy needed.
alter table public.services
  add column if not exists webhook_url text;

alter table public.services enable row level security;

drop policy if exists "Services are publicly readable" on public.services;
create policy "Services are publicly readable"
  on public.services
  for select
  using (true);

-- ── service_requests ───────────────────────────────────────────
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  uuid uuid not null references auth.users(id) on delete cascade,
  service_name text,
  service_key text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  input jsonb,
  output jsonb,
  created_at timestamptz not null default now()
);

-- Migration for existing databases: add input/output JSONB columns if missing.
alter table public.service_requests
  add column if not exists input jsonb;

alter table public.service_requests
  add column if not exists output jsonb;

alter table public.service_requests enable row level security;

drop policy if exists "Users can read their own requests" on public.service_requests;
create policy "Users can read their own requests"
  on public.service_requests
  for select
  using (auth.uid() = uuid);

drop policy if exists "Users can insert their own requests" on public.service_requests;
create policy "Users can insert their own requests"
  on public.service_requests
  for insert
  with check (auth.uid() = uuid);

-- ── subscription ──────────────────────────────────────────────
-- One row per user, representing their current plan subscription.
create table if not exists public.subscription (
  id uuid primary key default gen_random_uuid(),
  uuid uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription enable row level security;

drop policy if exists "Users can read their own subscriptions" on public.subscription;
create policy "Users can read their own subscriptions"
  on public.subscription
  for select
  using (auth.uid() = uuid);

-- ── credit_transactions ────────────────────────────────────────
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  uuid uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null default 'adjustment'
    check (type in ('plan_purchase', 'bonus', 'adjustment', 'usage', 'deduction')),
  created_at timestamptz not null default now()
);

-- Migration for existing databases: add type column if missing.
alter table public.credit_transactions
  add column if not exists type text not null default 'adjustment'
  check (type in ('plan_purchase', 'bonus', 'adjustment', 'usage', 'deduction'));

-- Migration: widen the type check constraint for existing databases so the
-- async workflow callback can record 'deduction' rows (per-service usage).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'credit_transactions_type_check'
      and conrelid = 'public.credit_transactions'::regclass
  ) then
    alter table public.credit_transactions
      drop constraint credit_transactions_type_check;
  end if;
end $$;

alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('plan_purchase', 'bonus', 'adjustment', 'usage', 'deduction'));

-- Which service a usage deduction was for (for per-service charts).
alter table public.credit_transactions
  add column if not exists service_key text;

-- Which Stripe Checkout Session granted a credit row, so webhook retries
-- can never double-credit a customer.
alter table public.credit_transactions
  add column if not exists stripe_session_id text;

create index if not exists credit_transactions_stripe_session_idx
  on public.credit_transactions (stripe_session_id);

alter table public.credit_transactions enable row level security;

drop policy if exists "Users can read their own transactions" on public.credit_transactions;
create policy "Users can read their own transactions"
  on public.credit_transactions
  for select
  using (auth.uid() = uuid);

-- ── profile ────────────────────────────────────────────────────
-- One row per auth user. Created automatically on signup via the
-- handle_new_user trigger below (name + phone come from the signup form).
create table if not exists public.profile (
  uuid uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile enable row level security;

drop policy if exists "Users can read their own profile" on public.profile;
create policy "Users can read their own profile"
  on public.profile
  for select
  using (auth.uid() = uuid);

drop policy if exists "Users can insert their own profile" on public.profile;
create policy "Users can insert their own profile"
  on public.profile
  for insert
  with check (auth.uid() = uuid);

drop policy if exists "Users can update their own profile" on public.profile;
create policy "Users can update their own profile"
  on public.profile
  for update
  using (auth.uid() = uuid)
  with check (auth.uid() = uuid);

-- Deleting a profile row deletes the auth account too. auth.users has
-- ON DELETE CASCADE FKs, so sessions, refresh tokens, identities,
-- subscription, credit_transactions and service_requests are removed
-- together with it.
create or replace function public.handle_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from auth.users where id = old.uuid) then
    delete from auth.users where id = old.uuid;
  end if;
  return old;
end;
$$;

drop trigger if exists on_profile_delete on public.profile;
create trigger on_profile_delete
  after delete on public.profile
  for each row execute function public.handle_profile_delete();

-- Auto-create a profile whenever a new auth user signs up. If the signup
-- form picked the free Trial plan (or no plan at all), the Trial subscription
-- and starting credits are granted here at the database level. If the signup
-- form picked a paid plan (plan_id is in user metadata and price > 0), NOTHING
-- is granted yet — the Stripe webhook assigns plan + credits only after the
-- payment succeeds.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_id uuid;
  v_trial_credits integer;
  v_selected_id uuid;
  v_selected_price numeric;
begin
  insert into public.profile (uuid, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  );

  begin
    v_selected_id := (new.raw_user_meta_data ->> 'plan_id')::uuid;
  exception when others then
    v_selected_id := null;
  end;

  if v_selected_id is not null then
    select price into v_selected_price
    from public.plans
    where id = v_selected_id;

    -- Paid plan selected → grant nothing yet; the webhook does it.
    if v_selected_price is not null and v_selected_price > 0 then
      return new;
    end if;

    -- Explicit Trial selection.
    v_trial_id := v_selected_id;
    select monthly_credits into v_trial_credits
    from public.plans
    where id = v_selected_id;
  else
    -- No plan picked → fall back to the default free Trial plan.
    select id, monthly_credits into v_trial_id, v_trial_credits
    from public.plans
    where price = 0
    order by monthly_credits desc
    limit 1;
  end if;

  if v_trial_id is not null then
    insert into public.subscription (uuid, plan_id, status)
    values (new.id, v_trial_id, 'active');

    insert into public.credit_transactions (uuid, amount, type)
    values (new.id, v_trial_credits, 'plan_purchase');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── seed data (safe to re-run with on conflict) ───────────────
-- NOTE: stripe_price_id is optional. The /api/checkout route creates a
-- Stripe Price inline from plans.price (in cents), so paid plans work
-- without pre-creating Stripe prices.
insert into public.plans (id, name, price, monthly_credits, stripe_price_id)
values
  ('00000000-0000-0000-0000-000000000000', 'Trial',    0,   50, null),
  ('00000000-0000-0000-0000-000000000001', 'Starter',  29,  500,  null),
  ('00000000-0000-0000-0000-000000000002', 'Pro',       79, 2000, null),
  ('00000000-0000-0000-0000-000000000003', 'Business', 199, 8000, null)
on conflict (id) do nothing;

insert into public.services (id, name, key, status)
values
  ('00000000-0000-0000-0000-000000000010', 'Website Crawler',   'website-crawler',  'active'),
  ('00000000-0000-0000-0000-000000000011', 'Lead Generation',   'lead-generation',  'active'),
  ('00000000-0000-0000-0000-000000000012', 'AI Content Writing','ai-content-writing','active')
on conflict (id) do nothing;

-- Migration for existing databases: the crawler service was previously keyed
-- 'crawler'; the dashboard and trigger routes now use 'website-crawler'.
update public.services set key = 'website-crawler' where key = 'crawler';

-- Per-service credit cost. This is the FALLBACK cost per run; services that
-- charge dynamically compute their own cost at submit time and only fall
-- back to this column when the input can't be resolved:
--   lead-generation = 1 credit per lead (leads_count)
--   ai-content-writing = 2/4/6 by Length
--   website-crawler = 1 credit per URL (urls.length, clamped 1–50)
update public.services set credit_cost = 10 where key = 'lead-generation';
update public.services set credit_cost = 5  where key = 'website-crawler';
update public.services set credit_cost = 4  where key = 'ai-content-writing';

-- ── existing user backfill (safe to re-run) ────────────────────
-- Grants the Trial plan + starting credits to users who signed up
-- before subscriptions/credit_transactions existed (no row yet).
-- A profile row is also ensured for every auth user.

insert into public.profile (uuid, name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', ''), u.email
from auth.users u
on conflict (uuid) do nothing;

insert into public.subscription (uuid, plan_id, status)
select u.id, tp.id, 'active'
from auth.users u
cross join lateral (
  select id from public.plans where price = 0 order by monthly_credits desc limit 1
) tp
where not exists (
  select 1 from public.subscription s
  where s.uuid = u.id and s.status = 'active'
);

insert into public.credit_transactions (uuid, amount, type)
select s.uuid, p.monthly_credits, 'plan_purchase'
from public.subscription s
join public.plans p on p.id = s.plan_id
where p.price = 0
and not exists (
  select 1 from public.credit_transactions c
  where c.uuid = s.uuid and c.type = 'plan_purchase'
);