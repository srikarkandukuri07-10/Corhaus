-- Migration 054: Multi-branch architecture — locations, branch isolation, backfill
-- =============================================================================
-- DESIGN (see implementation report for full classification):
--   GLOBAL (no location_id): roles, permissions, role_permissions, staff_roles,
--     profiles, class_types, membership_credit_tiers, expense_categories,
--     business_profile, attendance_config, admin_notifications,
--     forgot_login_requests.
--   BRANCH-SCOPED (+location_id): approved_members, staff_members (+staff_locations
--     for multi-branch staff), classes, bookings, attendance, member_purchased_plans,
--     invoices, invoice_items, customers, billing_plan_items, member_discounts,
--     expenses, membership_freezes, freeze_requests, trial_members, leads,
--     pt_assignments, pt_sessions, referral_codes, referral_requests,
--   support_tickets (+messages via ticket), waitlists, booking_history.
--   admin_notifications carries an OPTIONAL location_id (NULL = unattributed
--   operational notices such as applicant emails; those stay visible to
--   authorized staff, everything attributable is branch-scoped).
-- All existing rows are backfilled to the initial "Main Studio" location
-- (single-branch operation to date), then NOT NULL is enforced.
-- The migration tolerates partially-migrated databases: every table-specific
-- step is guarded, missing tables are reported via NOTICE and skipped, and a
-- failed run can simply be re-run (all steps are idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A. locations table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.locations FROM anon, authenticated;
GRANT SELECT ON TABLE public.locations TO authenticated;
GRANT ALL ON TABLE public.locations TO service_role;

-- Seed the initial real location (the single branch operated to date)
INSERT INTO public.locations (name, slug, city, status)
VALUES ('Main Studio', 'main-studio', NULL, 'active')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- B. staff_locations (multi-branch access incl. explicit Owner mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(staff_id, location_id)
);

ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.staff_locations FROM anon, authenticated;
GRANT SELECT ON TABLE public.staff_locations TO authenticated;
GRANT ALL ON TABLE public.staff_locations TO service_role;

-- ---------------------------------------------------------------------------
-- C. location_id columns (+FK RESTRICT so branches with data can't be deleted)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'approved_members', 'staff_members', 'classes', 'bookings', 'attendance',
    'member_purchased_plans', 'invoices', 'invoice_items', 'customers',
    'billing_plan_items', 'member_discounts', 'expenses',
    'membership_freezes', 'freeze_requests', 'trial_members', 'leads',
    'pt_assignments', 'pt_sessions', 'referral_codes', 'referral_requests',
    'support_tickets', 'waitlists', 'booking_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(('public.' || t)::text) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE RESTRICT', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_location ON public.%I (location_id)', t, t);
    ELSE
      RAISE NOTICE '054: table public.% missing — skipping location_id', t;
    END IF;
  END LOOP;
  -- Operational notifications: optional branch tag (NULL = unattributed).
  EXECUTE 'ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE RESTRICT';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_admin_notifications_location ON public.admin_notifications (location_id)';
END $$;

-- ---------------------------------------------------------------------------
-- D. Backfill every existing row to the initial location.
-- Every block is guarded by to_regclass so databases missing optional tables
-- (e.g. waitlists) backfill cleanly instead of aborting.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_init UUID;
BEGIN
  SELECT id INTO v_init FROM public.locations WHERE slug = 'main-studio';

  -- Direct backfills (single-branch history: everything belongs to Main Studio)
  IF to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.approved_members SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.classes') IS NOT NULL THEN
    UPDATE public.classes SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.staff_members') IS NOT NULL THEN
    UPDATE public.staff_members SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.trial_members') IS NOT NULL THEN
    UPDATE public.trial_members SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.leads') IS NOT NULL THEN
    UPDATE public.leads SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    UPDATE public.expenses SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.billing_plan_items') IS NOT NULL THEN
    UPDATE public.billing_plan_items SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.member_discounts') IS NOT NULL THEN
    UPDATE public.member_discounts SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.support_tickets') IS NOT NULL THEN
    UPDATE public.support_tickets SET location_id = v_init WHERE location_id IS NULL;
  END IF;

  -- Relationship-based backfills (branch derived from the owning record)
  IF to_regclass('public.bookings') IS NOT NULL AND to_regclass('public.classes') IS NOT NULL THEN
    UPDATE public.bookings b SET location_id = c.location_id
    FROM public.classes c WHERE b.class_id = c.id AND b.location_id IS NULL;
  END IF;

  IF to_regclass('public.attendance') IS NOT NULL AND to_regclass('public.classes') IS NOT NULL THEN
    UPDATE public.attendance a SET location_id = c.location_id
    FROM public.classes c WHERE a.class_id = c.id AND a.location_id IS NULL;
  END IF;

  IF to_regclass('public.member_purchased_plans') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.member_purchased_plans p SET location_id = am.location_id
    FROM public.approved_members am WHERE p.approved_member_id = am.id AND p.location_id IS NULL;
  END IF;

  IF to_regclass('public.pt_assignments') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.pt_assignments pa SET location_id = am.location_id
    FROM public.approved_members am WHERE pa.member_id = am.id AND pa.location_id IS NULL;
  END IF;

  IF to_regclass('public.pt_sessions') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.pt_sessions ps SET location_id = am.location_id
    FROM public.approved_members am WHERE ps.member_id = am.id AND ps.location_id IS NULL;
  END IF;

  IF to_regclass('public.waitlists') IS NOT NULL AND to_regclass('public.classes') IS NOT NULL THEN
    UPDATE public.waitlists w SET location_id = c.location_id
    FROM public.classes c WHERE w.class_id = c.id AND w.location_id IS NULL;
  END IF;

  IF to_regclass('public.booking_history') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.booking_history bh SET location_id = am.location_id
    FROM public.approved_members am WHERE bh.member_id = am.id AND bh.location_id IS NULL;
  END IF;

  IF to_regclass('public.referral_codes') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.referral_codes rc SET location_id = am.location_id
    FROM public.approved_members am WHERE lower(rc.member_email) = lower(am.email) AND rc.location_id IS NULL;
  END IF;

  IF to_regclass('public.referral_requests') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.referral_requests rr SET location_id = am.location_id
    FROM public.approved_members am WHERE lower(rr.referrer_email) = lower(am.email) AND rr.location_id IS NULL;
  END IF;

  IF to_regclass('public.customers') IS NOT NULL AND to_regclass('public.approved_members') IS NOT NULL THEN
    UPDATE public.customers c SET location_id = am.location_id
    FROM public.approved_members am WHERE c.approved_member_id = am.id AND c.location_id IS NULL;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL AND to_regclass('public.customers') IS NOT NULL THEN
    UPDATE public.invoices i SET location_id = c.location_id
    FROM public.customers c WHERE i.customer_id = c.id AND c.location_id IS NOT NULL AND i.location_id IS NULL;
  END IF;

  IF to_regclass('public.invoice_items') IS NOT NULL AND to_regclass('public.invoices') IS NOT NULL THEN
    UPDATE public.invoice_items ii SET location_id = i.location_id
    FROM public.invoices i WHERE ii.invoice_id = i.id AND ii.location_id IS NULL;
  END IF;

  -- Anything still NULL (e.g. walk-in customers/invoices with no member link)
  -- belongs to the initial branch as well — no orphans allowed.
  IF to_regclass('public.customers') IS NOT NULL THEN
    UPDATE public.customers SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.invoices') IS NOT NULL THEN
    UPDATE public.invoices SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.bookings') IS NOT NULL THEN
    UPDATE public.bookings SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.attendance') IS NOT NULL THEN
    UPDATE public.attendance SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.member_purchased_plans') IS NOT NULL THEN
    UPDATE public.member_purchased_plans SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.pt_assignments') IS NOT NULL THEN
    UPDATE public.pt_assignments SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.pt_sessions') IS NOT NULL THEN
    UPDATE public.pt_sessions SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.waitlists') IS NOT NULL THEN
    UPDATE public.waitlists SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.booking_history') IS NOT NULL THEN
    UPDATE public.booking_history SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.referral_codes') IS NOT NULL THEN
    UPDATE public.referral_codes SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.referral_requests') IS NOT NULL THEN
    UPDATE public.referral_requests SET location_id = v_init WHERE location_id IS NULL;
  END IF;

  -- Operational notifications: tag by the notified email's branch where known.
  UPDATE public.admin_notifications n SET location_id = am.location_id
  FROM public.approved_members am
  WHERE n.location_id IS NULL AND lower(n.email) = lower(am.email);
  UPDATE public.admin_notifications n SET location_id = s.location_id
  FROM public.staff_members s
  WHERE n.location_id IS NULL AND lower(n.email) = lower(s.email);

  IF to_regclass('public.membership_freezes') IS NOT NULL THEN
    UPDATE public.membership_freezes mf SET location_id = am.location_id
    FROM public.approved_members am WHERE mf.member_id = am.id AND mf.location_id IS NULL;
    UPDATE public.membership_freezes SET location_id = v_init WHERE location_id IS NULL;
  END IF;
  IF to_regclass('public.freeze_requests') IS NOT NULL THEN
    UPDATE public.freeze_requests fr SET location_id = am.location_id
    FROM public.approved_members am WHERE fr.member_id = am.id AND fr.location_id IS NULL;
    UPDATE public.freeze_requests SET location_id = v_init WHERE location_id IS NULL;
  END IF;

  -- Staff branch access: every active staff member can access their branch.
  -- Owners additionally resolve to ALL active branches inside user_location_ids().
  INSERT INTO public.staff_locations (staff_id, location_id)
  SELECT s.id, COALESCE(s.location_id, v_init)
  FROM public.staff_members s
  WHERE s.employment_status <> 'Inactive'
  ON CONFLICT (staff_id, location_id) DO NOTHING;
END $$;

-- Tolerant orphan report (-1 = table missing, -2 = column missing).
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'approved_members','staff_members','classes','bookings','attendance',
    'member_purchased_plans','invoices','invoice_items','customers',
    'billing_plan_items','member_discounts','expenses',
    'trial_members','leads','pt_assignments','pt_sessions',
    'referral_codes','referral_requests','support_tickets',
    'waitlists','booking_history','membership_freezes','freeze_requests'
  ];
  c BIGINT;
  msg TEXT := '';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      IF to_regclass(('public.' || t)::text) IS NULL THEN
        c := -1;
      ELSE
        EXECUTE format('SELECT count(*) FROM public.%I WHERE location_id IS NULL', t) INTO c;
      END IF;
    EXCEPTION WHEN undefined_column OR undefined_table THEN
      c := -2;
    END;
    msg := msg || t || '=' || c::text || ' ';
  END LOOP;
  RAISE NOTICE '054 orphans (NULL location_id; -1 = table missing, -2 = column missing): %', msg;
END $$;

-- Enforce NOT NULL now that backfill is complete (guarded per table)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'approved_members','staff_members','classes','bookings','attendance',
    'member_purchased_plans','invoices','invoice_items','customers',
    'billing_plan_items','member_discounts','expenses',
    'trial_members','leads','pt_assignments','pt_sessions',
    'referral_codes','referral_requests','support_tickets',
    'waitlists','booking_history','membership_freezes','freeze_requests'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(('public.' || t)::text) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN location_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- Hot composite indexes for branch-scoped list queries
CREATE INDEX IF NOT EXISTS idx_bookings_loc_status ON public.bookings (location_id, booking_status);
CREATE INDEX IF NOT EXISTS idx_classes_loc_date ON public.classes (location_id, class_date);
CREATE INDEX IF NOT EXISTS idx_invoices_loc_created ON public.invoices (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approved_loc_status ON public.approved_members (location_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_leads_loc_created ON public.leads (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trials_loc_created ON public.trial_members (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_loc_class ON public.attendance (location_id, class_id);

-- ---------------------------------------------------------------------------
-- E. user_location_ids(): branches the current JWT identity may access
-- SECURITY DEFINER so it bypasses RLS (no recursion). Owners (hardcoded
-- super-admins + active Owner-role staff) resolve to ALL active branches.
-- Staff resolve to primary + mapped branches. Members to their own branch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_location_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id
  FROM public.locations l
  WHERE l.status = 'active'
    AND (
      lower(auth.jwt() ->> 'email') IN (
        'srikarkandukuri07@gmail.com', 'vkalladi@gmail.com', 'kandukurisrikar10@gmail.com'
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_members s
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND s.role = 'Owner'
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_locations sl
        JOIN public.staff_members s ON s.id = sl.staff_id
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND sl.location_id = l.id
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_members s
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND s.location_id = l.id
      )
      OR EXISTS (
        SELECT 1 FROM public.approved_members am
        WHERE lower(am.email) = lower(auth.jwt() ->> 'email')
          AND am.location_id = l.id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_location_ids() TO authenticated, anon;

-- Helper: drop every policy on a table (used to guarantee no permissive
-- leftovers survive branch hardening)
CREATE OR REPLACE FUNCTION public._drop_all_policies(p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, p_table);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- F. Branch RLS: drop-all + recreate with (role check AND branch) semantics.
-- Member self-policies (own rows) are preserved — they are inherently isolated.
-- UPDATE/DELETE always carry WITH CHECK/USING on BOTH clauses so rows can
-- neither be touched cross-branch nor moved across branches.
-- ---------------------------------------------------------------------------

-- locations: readable iff accessible; writes via service_role API only
SELECT public._drop_all_policies('locations');
CREATE POLICY "Locations readable if accessible" ON public.locations
  FOR SELECT TO authenticated USING (id IN (SELECT public.user_location_ids()));

-- staff_locations: any active staff may read mappings (needed for switcher)
SELECT public._drop_all_policies('staff_locations');
CREATE POLICY "Staff can read branch mappings" ON public.staff_locations
  FOR SELECT TO authenticated USING (public.is_staff());

-- approved_members
SELECT public._drop_all_policies('approved_members');
CREATE POLICY "Users and admins can view approved members" ON public.approved_members
  FOR SELECT TO authenticated USING (
    LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    OR (public.has_database_permission('members.view') AND location_id IN (SELECT public.user_location_ids()))
  );
CREATE POLICY "Admin can insert approved members" ON public.approved_members
  FOR INSERT TO authenticated WITH CHECK (public.has_database_permission('members.add') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admins can update approved members" ON public.approved_members
  FOR UPDATE TO authenticated
  USING (public.has_database_permission('members.edit') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('members.edit') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admins can delete approved members" ON public.approved_members
  FOR DELETE TO authenticated USING (public.has_database_permission('members.delete') AND location_id IN (SELECT public.user_location_ids()));

-- classes
SELECT public._drop_all_policies('classes');
CREATE POLICY "Branch members and staff can view classes" ON public.classes
  FOR SELECT TO authenticated USING (location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admin can insert classes" ON public.classes
  FOR INSERT TO authenticated WITH CHECK (public.has_database_permission('classes.create') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admin can update classes" ON public.classes
  FOR UPDATE TO authenticated
  USING (public.has_database_permission('classes.edit') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('classes.edit') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admin can delete classes" ON public.classes
  FOR DELETE TO authenticated USING (public.has_database_permission('classes.delete') AND location_id IN (SELECT public.user_location_ids()));

-- bookings (member own-rows preserved; staff conjoined with branch)
SELECT public._drop_all_policies('bookings');
CREATE POLICY "Members can view own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (member_id = auth.uid());
CREATE POLICY "Admin can view all bookings" ON public.bookings
  FOR SELECT TO authenticated USING (public.has_database_permission('members.history') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Members can insert own bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY "Members can update own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());
CREATE POLICY "Admin can manage bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_database_permission('classes.bookings') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('classes.bookings') AND location_id IN (SELECT public.user_location_ids()));

-- attendance
SELECT public._drop_all_policies('attendance');
CREATE POLICY "Members can view own attendance" ON public.attendance
  FOR SELECT TO authenticated USING (auth.uid() = member_id);
CREATE POLICY "Members can insert own pending attendance" ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = member_id AND attendance_status = 'pending');
CREATE POLICY "Admins can read all attendance" ON public.attendance
  FOR SELECT TO authenticated USING (public.has_database_permission('attendance.view') AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admins can update attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (public.has_database_permission('attendance.manual') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('attendance.manual') AND location_id IN (SELECT public.user_location_ids()));

-- member_purchased_plans (member-own read preserved from 019 pattern)
SELECT public._drop_all_policies('member_purchased_plans');
CREATE POLICY "Members can view own plans" ON public.member_purchased_plans
  FOR SELECT TO authenticated USING (
    approved_member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Admin can manage member purchased plans" ON public.member_purchased_plans
  FOR ALL TO authenticated
  USING (public.has_database_permission('members.edit') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('members.edit') AND location_id IN (SELECT public.user_location_ids()));

-- invoices + invoice_items + customers (member-own reads preserved)
SELECT public._drop_all_policies('invoices');
CREATE POLICY "Members can view own invoices" ON public.invoices
  FOR SELECT TO authenticated USING (
    customer_id IN (
      SELECT c.id FROM public.customers c
      INNER JOIN public.approved_members am ON am.id = c.approved_member_id
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Admin can manage invoices" ON public.invoices
  FOR ALL TO authenticated
  USING (public.has_database_permission('billing.view') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('billing.view') AND location_id IN (SELECT public.user_location_ids()));

SELECT public._drop_all_policies('invoice_items');
CREATE POLICY "Members can view own invoice items" ON public.invoice_items
  FOR SELECT TO authenticated USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      INNER JOIN public.customers c ON c.id = i.customer_id
      INNER JOIN public.approved_members am ON am.id = c.approved_member_id
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Admin can manage invoice items" ON public.invoice_items
  FOR ALL TO authenticated
  USING (public.has_database_permission('billing.view') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('billing.view') AND location_id IN (SELECT public.user_location_ids()));

SELECT public._drop_all_policies('customers');
CREATE POLICY "Members can view own customer record" ON public.customers
  FOR SELECT TO authenticated USING (
    approved_member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Admin can manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.has_database_permission('members.view') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('members.view') AND location_id IN (SELECT public.user_location_ids()));

-- billing_plan_items (branch catalogue: members see active items of own branch)
SELECT public._drop_all_policies('billing_plan_items');
CREATE POLICY "Branch members can view active plan items" ON public.billing_plan_items
  FOR SELECT TO authenticated USING (is_active = true AND location_id IN (SELECT public.user_location_ids()));
CREATE POLICY "Admin can manage billing plan items" ON public.billing_plan_items
  FOR ALL TO authenticated
  USING (public.has_database_permission('packages.manage') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('packages.manage') AND location_id IN (SELECT public.user_location_ids()));

-- member_discounts
SELECT public._drop_all_policies('member_discounts');
CREATE POLICY "Admin can manage member discounts" ON public.member_discounts
  FOR ALL TO authenticated
  USING (public.has_database_permission('billing.apply_discounts') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('billing.apply_discounts') AND location_id IN (SELECT public.user_location_ids()));

-- expenses (any expenses.* permission, branch-scoped)
SELECT public._drop_all_policies('expenses');
CREATE POLICY "Admin can manage expenses" ON public.expenses
  FOR ALL TO authenticated
  USING ((
    public.has_database_permission('expenses.view') OR public.has_database_permission('expenses.create')
    OR public.has_database_permission('expenses.edit') OR public.has_database_permission('expenses.delete')
  ) AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK ((
    public.has_database_permission('expenses.view') OR public.has_database_permission('expenses.create')
    OR public.has_database_permission('expenses.edit') OR public.has_database_permission('expenses.delete')
  ) AND location_id IN (SELECT public.user_location_ids()));

-- trial_members + leads
SELECT public._drop_all_policies('trial_members');
CREATE POLICY "Admin can manage trial members" ON public.trial_members
  FOR ALL TO authenticated
  USING (public.has_database_permission('members.trial') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('members.trial') AND location_id IN (SELECT public.user_location_ids()));

SELECT public._drop_all_policies('leads');
CREATE POLICY "Leads: staff can manage" ON public.leads
  FOR ALL TO authenticated
  USING (public.has_database_permission('members.trial') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('members.trial') AND location_id IN (SELECT public.user_location_ids()));

-- pt_assignments + pt_sessions (member-own + staff branch)
SELECT public._drop_all_policies('pt_assignments');
CREATE POLICY "Members can view own PT assignments" ON public.pt_assignments
  FOR SELECT TO authenticated USING (
    member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Staff can manage PT assignments" ON public.pt_assignments
  FOR ALL TO authenticated
  USING (public.has_database_permission('pt.view') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('pt.view') AND location_id IN (SELECT public.user_location_ids()));

SELECT public._drop_all_policies('pt_sessions');
CREATE POLICY "Members can view own PT sessions" ON public.pt_sessions
  FOR SELECT TO authenticated USING (
    member_id IN (
      SELECT am.id FROM public.approved_members am
      INNER JOIN public.profiles p ON lower(p.email) = lower(am.email)
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "Staff can manage PT sessions" ON public.pt_sessions
  FOR ALL TO authenticated
  USING (public.has_database_permission('pt.log') AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.has_database_permission('pt.log') AND location_id IN (SELECT public.user_location_ids()));

-- referral_codes + referral_requests (member-own by email preserved)
SELECT public._drop_all_policies('referral_codes');
CREATE POLICY "Members can view own referral codes" ON public.referral_codes
  FOR SELECT TO authenticated USING (member_email = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Admin full access on referral_codes" ON public.referral_codes
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager() AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.is_owner_or_manager() AND location_id IN (SELECT public.user_location_ids()));

SELECT public._drop_all_policies('referral_requests');
CREATE POLICY "Members can view own referral requests" ON public.referral_requests
  FOR SELECT TO authenticated USING (
    referrer_email = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
    OR applicant_email = (SELECT lower(email) FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Admin full access on referral_requests" ON public.referral_requests
  FOR ALL TO authenticated
  USING (public.is_owner_or_manager() AND location_id IN (SELECT public.user_location_ids()))
  WITH CHECK (public.is_owner_or_manager() AND location_id IN (SELECT public.user_location_ids()));

-- support_tickets + support_messages (039 logic + branch conjunct)
SELECT public._drop_all_policies('support_tickets');
CREATE POLICY "Users can view relevant tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (
    (created_by = auth.uid() AND location_id IN (SELECT public.user_location_ids()))
    OR (public.has_database_permission('support.view') AND location_id IN (SELECT public.user_location_ids()))
  )
  WITH CHECK (
    (created_by = auth.uid() OR public.has_database_permission('support.view'))
    AND location_id IN (SELECT public.user_location_ids())
  );

SELECT public._drop_all_policies('support_messages');
CREATE POLICY "Users can view relevant messages" ON public.support_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = support_messages.ticket_id
      AND st.location_id IN (SELECT public.user_location_ids())
      AND (
        st.created_by = auth.uid()
        OR public.has_database_permission('support.view')
      )
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR (
      public.has_database_permission('support.view')
      AND EXISTS (
        SELECT 1 FROM public.support_tickets st
        WHERE st.id = support_messages.ticket_id
          AND st.location_id IN (SELECT public.user_location_ids())
      )
    )
  );

-- waitlists (member-own via approved join + staff branch) — table is optional
DO $$
BEGIN
  IF to_regclass('public.waitlists') IS NOT NULL THEN
    PERFORM public._drop_all_policies('waitlists');
    EXECUTE 'CREATE POLICY "Members can view own waitlist entries" ON public.waitlists FOR SELECT TO authenticated USING (member_id IN (SELECT am.id FROM public.approved_members am INNER JOIN public.profiles p ON lower(p.email) = lower(am.email) WHERE p.id = auth.uid()))';
    EXECUTE 'CREATE POLICY "Members can join own waitlist" ON public.waitlists FOR INSERT TO authenticated WITH CHECK (member_id IN (SELECT am.id FROM public.approved_members am INNER JOIN public.profiles p ON lower(p.email) = lower(am.email) WHERE p.id = auth.uid() AND am.location_id = waitlists.location_id) AND location_id IN (SELECT public.user_location_ids()))';
    EXECUTE 'CREATE POLICY "Admin can manage waitlists" ON public.waitlists FOR ALL TO authenticated USING (public.has_database_permission(''classes.bookings'') AND location_id IN (SELECT public.user_location_ids())) WITH CHECK (public.has_database_permission(''classes.bookings'') AND location_id IN (SELECT public.user_location_ids()))';
  ELSE
    RAISE NOTICE '054: public.waitlists missing — skipping branch RLS';
  END IF;
END $$;

-- booking_history — table is optional
DO $$
BEGIN
  IF to_regclass('public.booking_history') IS NOT NULL THEN
    PERFORM public._drop_all_policies('booking_history');
    EXECUTE 'CREATE POLICY "Admin can view booking history" ON public.booking_history FOR SELECT TO authenticated USING (public.has_database_permission(''members.history'') AND location_id IN (SELECT public.user_location_ids()))';
    EXECUTE 'CREATE POLICY "Admin can insert booking history" ON public.booking_history FOR INSERT TO authenticated WITH CHECK (public.has_database_permission(''classes.bookings'') AND location_id IN (SELECT public.user_location_ids()))';
  ELSE
    RAISE NOTICE '054: public.booking_history missing — skipping branch RLS';
  END IF;
END $$;

-- staff_members (041 SELECT + self-row + branch; writes stay service-role only)
SELECT public._drop_all_policies('staff_members');
CREATE POLICY "Staff can view staff directory" ON public.staff_members
  FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND (
      location_id IN (SELECT public.user_location_ids())
      OR lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- admin_notifications: attributable notices are branch-scoped, unattributed
-- operational notices (NULL branch) stay visible to authorized staff.
SELECT public._drop_all_policies('admin_notifications');
CREATE POLICY "Admins can read notifications" ON public.admin_notifications
  FOR SELECT TO authenticated USING (
    public.is_owner_or_manager()
    AND (location_id IS NULL OR location_id IN (SELECT public.user_location_ids()))
  );
CREATE POLICY "Admins can update notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (
    public.is_owner_or_manager()
    AND (location_id IS NULL OR location_id IN (SELECT public.user_location_ids()))
  )
  WITH CHECK (public.is_owner_or_manager());
CREATE POLICY "Admins can insert notifications" ON public.admin_notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_owner_or_manager());

-- staff_roles / roles / permissions / role_permissions: global RBAC infra (unchanged)

-- profiles: global identity (unchanged)

-- class_types / membership_credit_tiers / expense_categories: global catalogues (unchanged)

-- business_profile / attendance_config / admin_notifications / forgot_login_requests:
-- global operational tables (unchanged)

NOTIFY pgrst, 'reload schema';
