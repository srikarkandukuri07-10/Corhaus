-- CORHAUS PILATES PLATFORM - Seed Membership Plans
-- Migration 020: Add Membership Plans from business data
-- Run this in Supabase SQL Editor after migration 019
-- ============================================================

INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('Membership Plans', 'Monthly',         'Strength Training. Valid for 30 days.',              1500,  NULL, NULL, 30,  true, NULL,    10),
  ('Membership Plans', 'Quarterly',        'Strength Training, Cardio. Valid for 90 days.',       4000,  NULL, NULL, 90,  true, NULL,    20),
  ('Membership Plans', 'Half Yearly',      'Full access membership. Valid for 180 days.',          6000,  NULL, NULL, 180, true, NULL,    30),
  ('Membership Plans', 'Couple Package',   'Joint membership for two. Valid for 60 days.',         6000,  NULL, NULL, 60,  true, 'Couple', 40),
  ('Membership Plans', 'Annually',         'Best value membership. Valid for 365 days.',           8999,  NULL, NULL, 365, true, NULL,    50)
ON CONFLICT DO NOTHING;

-- Verify
SELECT name, price, validity_days, grants_member_dashboard_access, subcategory
FROM public.billing_plan_items
WHERE category = 'Membership Plans'
ORDER BY sort_order;
