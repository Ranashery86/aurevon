-- Aurevon seed data
-- If your tables already exist (plans, services are visible in the Dashboard),
-- run ONLY this file in the Supabase SQL Editor to populate them.

-- ── plans ──────────────────────────────────────────────────────
-- NOTE: stripe_price_id is optional. The /api/checkout route creates a
-- Stripe Price inline from plans.price (in cents), so paid plans work
-- without pre-creating Stripe prices.
insert into public.plans (id, name, price, monthly_credits, stripe_price_id)
values
  ('00000000-0000-0000-0000-000000000000', 'Trial', 0, 50, null),
  ('00000000-0000-0000-0000-000000000001', 'Starter', 29, 500, null),
  ('00000000-0000-0000-0000-000000000002', 'Pro', 79, 2000, null),
  ('00000000-0000-0000-0000-000000000003', 'Business', 199, 8000, null)
on conflict (id) do nothing;

-- ── services ───────────────────────────────────────────────────
insert into public.services (id, name, key, status)
values
  ('00000000-0000-0000-0000-000000000010', 'Website Crawler', 'crawler', 'active'),
  ('00000000-0000-0000-0000-000000000011', 'Lead Generation', 'lead-generation', 'active'),
  ('00000000-0000-0000-0000-000000000012', 'AI Content Writing', 'ai-content-writing', 'active')
on conflict (id) do nothing;

-- Per-service credit cost. Each service costs its credit_cost per run.
update public.services set credit_cost = 10 where key = 'lead-generation';
update public.services set credit_cost = 5  where key = 'crawler';
update public.services set credit_cost = 10 where key = 'ai-content-writing';