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
  ('00000000-0000-0000-0000-000000000010', 'Website Crawler', 'website-crawler', 'active'),
  ('00000000-0000-0000-0000-000000000011', 'Lead Generation', 'lead-generation', 'active'),
  ('00000000-0000-0000-0000-000000000012', 'AI Content Writing', 'ai-content-writing', 'active'),
  ('00000000-0000-0000-0000-000000000013', 'Site Health & AI Audit', 'site-health-audit', 'active')
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
--   site-health-audit = 5/15/30 by audit depth (max_pages)
update public.services set credit_cost = 10 where key = 'lead-generation';
update public.services set credit_cost = 5  where key = 'website-crawler';
update public.services set credit_cost = 4  where key = 'ai-content-writing';
update public.services set credit_cost = 15 where key = 'site-health-audit';