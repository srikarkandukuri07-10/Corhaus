-- CORHAUS PILATES PLATFORM - Billing Module
-- Migration 019: Customers, Billing Items, Invoices, Purchased Plans
-- ============================================================

-- =============================================
-- 1. CUSTOMERS TABLE
-- Every person ever billed: members or walk-ins.
-- Walk-ins may later be upgraded to members
-- by linking approved_member_id.
-- =============================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT,
  is_walkin BOOLEAN NOT NULL DEFAULT false,
  approved_member_id UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone_number);
CREATE INDEX IF NOT EXISTS idx_customers_approved_member ON public.customers(approved_member_id);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage customers" ON public.customers;
CREATE POLICY "Admin can manage customers" ON public.customers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members can view own customer record" ON public.customers;
CREATE POLICY "Members can view own customer record" ON public.customers
  FOR SELECT TO authenticated
  USING (
    approved_member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- 2. BILLING PLAN ITEMS TABLE
-- Admin-managed catalogue of every billable item.
-- grants_member_dashboard_access is configurable
-- per item — no hardcoding.
-- =============================================
CREATE TABLE IF NOT EXISTS public.billing_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN (
    'Membership Plans', 'PT Packages', 'Class Packages',
    'Services', 'Combo Packages', 'Products', 'Other Charges'
  )),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  original_price NUMERIC(10,2),            -- MRP / strikethrough price
  sessions INTEGER,                         -- for packages (null = not applicable)
  validity_days INTEGER,                    -- validity in days (null = unlimited)
  grants_member_dashboard_access BOOLEAN NOT NULL DEFAULT false,
  stock_quantity INTEGER,                   -- null = unlimited inventory
  subcategory TEXT,                         -- e.g. Apparel, Bottle, Couple
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.billing_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage billing plan items" ON public.billing_plan_items;
CREATE POLICY "Admin can manage billing plan items" ON public.billing_plan_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Authenticated can view active billing plan items" ON public.billing_plan_items;
CREATE POLICY "Authenticated can view active billing plan items" ON public.billing_plan_items
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin());

-- =============================================
-- 3. INVOICE NUMBER SEQUENCE
-- =============================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

-- =============================================
-- 4. INVOICES TABLE
-- One record per completed billing transaction.
-- =============================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  grand_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'due', 'partial')),
  payment_method TEXT
    CHECK (payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer')),
  amount_paid NUMERIC(10,2) DEFAULT 0,
  transaction_reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage invoices" ON public.invoices;
CREATE POLICY "Admin can manage invoices" ON public.invoices
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members can view own invoices" ON public.invoices;
CREATE POLICY "Members can view own invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM public.customers c
      INNER JOIN public.approved_members am ON am.id = c.approved_member_id
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- 5. INVOICE ITEMS TABLE
-- Line items for each invoice.
-- =============================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  billing_plan_item_id UUID REFERENCES public.billing_plan_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  total_price NUMERIC(10,2) NOT NULL,
  grants_member_dashboard_access BOOLEAN NOT NULL DEFAULT false,
  validity_days INTEGER,
  sessions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage invoice items" ON public.invoice_items;
CREATE POLICY "Admin can manage invoice items" ON public.invoice_items
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members can view own invoice items" ON public.invoice_items;
CREATE POLICY "Members can view own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      INNER JOIN public.customers c ON c.id = i.customer_id
      INNER JOIN public.approved_members am ON am.id = c.approved_member_id
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- 6. MEMBER PURCHASED PLANS TABLE
-- Active plans per member. Dashboard access is
-- determined entirely by having at least one
-- active record here.
-- =============================================
CREATE TABLE IF NOT EXISTS public.member_purchased_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_member_id UUID NOT NULL
    REFERENCES public.approved_members(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES public.invoice_items(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  category TEXT NOT NULL,
  sessions_total INTEGER,
  sessions_remaining INTEGER,
  valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mpp_member ON public.member_purchased_plans(approved_member_id);
CREATE INDEX IF NOT EXISTS idx_mpp_status ON public.member_purchased_plans(status);
CREATE INDEX IF NOT EXISTS idx_mpp_valid_until ON public.member_purchased_plans(valid_until);

ALTER TABLE public.member_purchased_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage member purchased plans" ON public.member_purchased_plans;
CREATE POLICY "Admin can manage member purchased plans" ON public.member_purchased_plans
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Members can view own purchased plans" ON public.member_purchased_plans;
CREATE POLICY "Members can view own purchased plans" ON public.member_purchased_plans
  FOR SELECT TO authenticated
  USING (
    approved_member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );

-- =============================================
-- 7. FUNCTION: Generate invoice number
-- Format: COR-YYYY-NNNN (e.g. COR-2025-0001)
-- =============================================
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  year_str TEXT;
  seq_val BIGINT;
BEGIN
  year_str := to_char(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYY');
  seq_val := nextval('public.invoice_number_seq');
  RETURN 'COR-' || year_str || '-' || lpad(seq_val::TEXT, 4, '0');
END;
$$;

-- Grant execute to authenticated users (called from client after auth)
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated;

-- =============================================
-- 8. FUNCTION: Daily plan expiry check
-- Called by Supabase Scheduled Edge Function
-- at midnight IST daily.
-- Marks expired plans and revokes dashboard
-- access for members with no remaining active plans.
-- =============================================
CREATE OR REPLACE FUNCTION public.check_plan_expiry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_member RECORD;
  active_count INTEGER;
  expired_count INTEGER := 0;
  deactivated_count INTEGER := 0;
BEGIN
  -- Step 1: Mark plans whose valid_until has passed
  UPDATE public.member_purchased_plans
  SET status = 'expired'
  WHERE status = 'active'
    AND valid_until IS NOT NULL
    AND valid_until < CURRENT_DATE;

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  -- Step 2: For each member with freshly expired plans,
  --         check if they still have at least one active plan.
  --         If not, revoke dashboard access.
  FOR affected_member IN
    SELECT DISTINCT approved_member_id
    FROM public.member_purchased_plans
    WHERE status = 'expired'
      AND valid_until >= (CURRENT_DATE - INTERVAL '1 day')
      AND valid_until < CURRENT_DATE
  LOOP
    SELECT COUNT(*) INTO active_count
    FROM public.member_purchased_plans
    WHERE approved_member_id = affected_member.approved_member_id
      AND status = 'active';

    IF active_count = 0 THEN
      UPDATE public.approved_members
      SET membership_status = 'inactive'
      WHERE id = affected_member.approved_member_id
        AND membership_status = 'active';

      IF FOUND THEN
        deactivated_count := deactivated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'plans_expired', expired_count,
    'members_deactivated', deactivated_count,
    'checked_at', NOW()
  );
END;
$$;

-- =============================================
-- 9. REALTIME for invoices
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'invoices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'billing_plan_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.billing_plan_items;
  END IF;
END $$;

-- =============================================
-- 10. SEED: Billing plan items (from screenshots)
-- =============================================

-- PT Packages
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('PT Packages', 'Private Duo Class (4)', '144 sessions at ₹868/session. Valid for 365 days.', 125000, NULL, 144, 365, true, 'Couple', 10),
  ('PT Packages', 'Private Duo Class (3)', '36 sessions at ₹2,056/session. Valid for 180 days.', 74000, NULL, 36, 180, true, 'Couple', 20),
  ('PT Packages', 'Private Duo Class (2)', '24 sessions at ₹2,292/session. Valid for 60 days.', 55000, NULL, 24, 60, true, 'Couple', 30),
  ('PT Packages', 'Private Duo Class', '12 sessions at ₹2,500/session. Valid for 30 days.', 30000, NULL, 12, 30, true, 'Couple', 40),
  ('PT Packages', 'Private Reformer Class (5)', '144 sessions at ₹625/session. Valid for 365 days.', 90000, NULL, 144, 365, true, NULL, 50),
  ('PT Packages', 'Private Reformer Class (4)', '72 sessions at ₹972/session. Valid for 180 days.', 70000, NULL, 72, 180, true, NULL, 60)
ON CONFLICT DO NOTHING;

-- Class Packages
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('Class Packages', 'Single Session', '1 session at ₹1,000/session. Valid for 30 days.', 1000, NULL, 1, 30, true, NULL, 10),
  ('Class Packages', 'Beginner Pack', '4 sessions at ₹1,000/session. Valid for 30 days.', 4000, NULL, 4, 30, true, NULL, 20),
  ('Class Packages', 'Trial Session', 'Try a class for just ₹500. Valid for 1 day.', 500, NULL, 1, 1, true, NULL, 5),
  ('Class Packages', 'Reformer Group Class (5)', '144 sessions at ₹333/session. Valid for 365 days.', 48000, NULL, 144, 365, true, 'Evening Reformer Group Class', 50),
  ('Class Packages', 'Reformer Group Class (4)', '72 sessions at ₹500/session. Valid for 180 days.', 36000, NULL, 72, 180, true, 'Evening Reformer Group Class', 60),
  ('Class Packages', 'Reformer Group Class (3)', '36 sessions at ₹625/session. Valid for 90 days.', 22500, NULL, 36, 90, true, 'Morning Reformer Group Class', 70)
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, stock_quantity, subcategory, sort_order)
VALUES
  ('Products', 'Bodyscale', 'Body composition scale.', 899, 1998.77, NULL, NULL, false, 7, 'Bodyscale', 10),
  ('Products', 'Grip Socks', 'Non-slip Pilates grip socks.', 450, 899, NULL, NULL, false, 20, 'Apparel', 20),
  ('Products', 'Waterbottle 1000ml', 'Stainless steel water bottle 1L.', 500, 799, NULL, NULL, false, 8, 'Bottle', 30),
  ('Products', 'Waterbottle 750ml', 'Stainless steel water bottle 750ml.', 450, 599, NULL, NULL, false, 8, 'Bottle', 40)
ON CONFLICT DO NOTHING;

-- Verification
SELECT category, name, price, grants_member_dashboard_access
FROM public.billing_plan_items
ORDER BY category, sort_order;
