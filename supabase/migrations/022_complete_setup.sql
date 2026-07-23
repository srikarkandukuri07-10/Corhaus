-- CORHAUS PILATES PLATFORM - Self-Contained Complete Setup & Package Assignment
-- Migration 022: Ensures approved_members & billing tables exist, seeds packages, and assigns to members
-- ====================================================================================================

-- 1. Ensure approved_members exists
CREATE TABLE IF NOT EXISTS public.approved_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  membership_status TEXT NOT NULL DEFAULT 'active',
  membership_level TEXT DEFAULT 'Beginner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure billing tables exist
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT,
  is_walkin BOOLEAN NOT NULL DEFAULT false,
  approved_member_id UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.billing_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  original_price NUMERIC(10,2),
  sessions INTEGER,
  validity_days INTEGER,
  grants_member_dashboard_access BOOLEAN NOT NULL DEFAULT true,
  stock_quantity INTEGER,
  subcategory TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  grand_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'paid',
  payment_method TEXT,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  transaction_reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  billing_plan_item_id UUID REFERENCES public.billing_plan_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  grants_member_dashboard_access BOOLEAN NOT NULL DEFAULT true,
  validity_days INTEGER,
  sessions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.member_purchased_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  category TEXT NOT NULL,
  sessions_total INTEGER,
  sessions_remaining INTEGER,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Seed Plan Items Catalogue
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('PT Packages', 'Private Duo Class (4)', '144 sessions at ₹868/session. Valid for 365 days.', 125000, NULL, 144, 365, true, 'Couple', 10),
  ('PT Packages', 'Private Duo Class (3)', '36 sessions at ₹2,056/session. Valid for 180 days.', 74000, NULL, 36, 180, true, 'Couple', 20),
  ('PT Packages', 'Private Duo Class (2)', '24 sessions at ₹2,292/session. Valid for 60 days.', 55000, NULL, 24, 60, true, 'Couple', 30),
  ('PT Packages', 'Private Duo Class', '12 sessions at ₹2,500/session. Valid for 30 days.', 30000, NULL, 12, 30, true, 'Couple', 40),
  ('PT Packages', 'Private Reformer Class (5)', '144 sessions at ₹625/session. Valid for 365 days.', 90000, NULL, 144, 365, true, NULL, 50),
  ('PT Packages', 'Private Reformer Class (4)', '72 sessions at ₹972/session. Valid for 180 days.', 70000, NULL, 72, 180, true, NULL, 60),
  ('PT Packages', 'Private Reformer Class (3)', '36 sessions at ₹1,167/session. Valid for 30 days.', 42000, NULL, 36, 30, true, NULL, 70),
  ('Class Packages', 'Single Session', '1 session at ₹1,000/session. Valid for 30 days.', 1000, NULL, 1, 30, true, NULL, 10),
  ('Class Packages', 'Beginner Pack', '4 sessions at ₹1,000/session. Valid for 30 days.', 4000, NULL, 4, 30, true, NULL, 20),
  ('Class Packages', 'Trial Session', 'Try a class for just ₹500. Valid for 1 day.', 500, NULL, 1, 1, true, NULL, 5),
  ('Class Packages', 'Reformer Group Class (5)', '144 sessions at ₹333/session. Valid for 365 days.', 48000, NULL, 144, 365, true, 'Evening Reformer Group Class', 50),
  ('Class Packages', 'Reformer Group Class (4)', '72 sessions at ₹500/session. Valid for 180 days.', 36000, NULL, 72, 180, true, 'Evening Reformer Group Class', 60),
  ('Class Packages', 'Reformer Group Class (3)', '36 sessions at ₹625/session. Valid for 90 days.', 22500, NULL, 36, 90, true, 'Morning Reformer Group Class', 70),
  ('Membership Plans', 'Monthly', 'Strength Training. Valid for 30 days.', 1500, NULL, NULL, 30, true, NULL, 10),
  ('Membership Plans', 'Quarterly', 'Strength Training, Cardio. Valid for 90 days.', 4000, NULL, 40, 90, true, NULL, 20),
  ('Membership Plans', 'Half Yearly', 'Full access membership. Valid for 180 days.', 6000, NULL, NULL, 180, true, NULL, 30),
  ('Membership Plans', 'Annually', 'Best value membership. Valid for 365 days.', 8999, NULL, NULL, 365, true, NULL, 50)
ON CONFLICT DO NOTHING;

-- 4. If approved_members is completely empty, insert initial members
INSERT INTO public.approved_members (full_name, email, phone_number, membership_status, membership_level)
VALUES
  ('MS.POOJA REDDY', 'pooja.reddy@example.com', '917702355344', 'active', 'Beginner'),
  ('MS.ANJANI', 'anjani@example.com', '919550741245', 'active', 'Intermediate'),
  ('MS.RAGINI', 'ragini@example.com', '919876543210', 'active', 'Advanced')
ON CONFLICT DO NOTHING;

-- 5. Auto-assign packages to all members
DO $$
DECLARE
  m RECORD;
  plan_rec RECORD;
  cust_id UUID;
  inv_id UUID;
  inv_item_id UUID;
  inv_num TEXT;
  used_sessions INT;
  rem_sessions INT;
  valid_days INT;
  valid_until_date DATE;
BEGIN
  FOR m IN SELECT * FROM public.approved_members LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.member_purchased_plans WHERE approved_member_id = m.id
    ) THEN
      SELECT * INTO plan_rec
      FROM public.billing_plan_items
      WHERE is_active = true AND grants_member_dashboard_access = true
      ORDER BY random()
      LIMIT 1;

      IF FOUND THEN
        SELECT id INTO cust_id FROM public.customers WHERE approved_member_id = m.id LIMIT 1;
        IF cust_id IS NULL THEN
          INSERT INTO public.customers (full_name, email, phone_number, is_walkin, approved_member_id)
          VALUES (m.full_name, m.email, m.phone_number, false, m.id)
          RETURNING id INTO cust_id;
        END IF;

        inv_num := 'COR-' || to_char(NOW(), 'YYYY') || '-' || lpad((floor(random()*9000)+1000)::text, 4, '0');
        INSERT INTO public.invoices (
          invoice_number, customer_id, customer_name, customer_email, customer_phone,
          subtotal, discount_amount, grand_total, payment_status, payment_method, amount_paid
        ) VALUES (
          inv_num, cust_id, m.full_name, m.email, m.phone_number,
          plan_rec.price, 0, plan_rec.price, 'paid', 'UPI', plan_rec.price
        ) RETURNING id INTO inv_id;

        INSERT INTO public.invoice_items (
          invoice_id, billing_plan_item_id, name, category, quantity, unit_price, total_price,
          grants_member_dashboard_access, validity_days, sessions
        ) VALUES (
          inv_id, plan_rec.id, plan_rec.name, plan_rec.category, 1, plan_rec.price, plan_rec.price,
          true, plan_rec.validity_days, plan_rec.sessions
        ) RETURNING id INTO inv_item_id;

        valid_days := COALESCE(plan_rec.validity_days, 60);
        valid_until_date := CURRENT_DATE + (valid_days || ' days')::INTERVAL;

        IF plan_rec.sessions IS NOT NULL THEN
          used_sessions := floor(random() * (plan_rec.sessions / 2));
          rem_sessions := plan_rec.sessions - used_sessions;
        ELSE
          rem_sessions := NULL;
        END IF;

        INSERT INTO public.member_purchased_plans (
          approved_member_id, invoice_id, invoice_item_id, plan_name, category,
          sessions_total, sessions_remaining, valid_from, valid_until, status
        ) VALUES (
          m.id, inv_id, inv_item_id, plan_rec.name, plan_rec.category,
          plan_rec.sessions, rem_sessions, CURRENT_DATE - INTERVAL '10 days', valid_until_date, 'active'
        );

        UPDATE public.approved_members SET membership_status = 'active' WHERE id = m.id;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Verification Summary
SELECT m.full_name, m.phone_number, p.plan_name, p.category, p.sessions_remaining, p.sessions_total, p.valid_until, p.status
FROM public.approved_members m
LEFT JOIN public.member_purchased_plans p ON p.approved_member_id = m.id;
