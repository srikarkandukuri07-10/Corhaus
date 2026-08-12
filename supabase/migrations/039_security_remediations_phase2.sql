-- Migration 039: Phase 2 Security Hardening & RLS Overhaul

-- A. Lock search_path for SQL SECURITY DEFINER functions in migration 017
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_code TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INTEGER;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE member_email = LOWER(NEW.email)) THEN
    new_code := public.generate_referral_code();
    INSERT INTO public.referral_codes (member_email, code)
    VALUES (LOWER(NEW.email), new_code);
  END IF;
  RETURN NEW;
END;
$$;


-- B. Create is_owner_or_manager() security helper
CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Super-administrator and developer bypass list
  IF LOWER(v_email) IN ('srikarkandukuri07@gmail.com', 'vkalladi@gmail.com', 'kandukurisrikar10@gmail.com') THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO v_role
  FROM public.staff_members
  WHERE LOWER(email) = LOWER(v_email)
    AND employment_status = 'Active';

  RETURN v_role IN ('Owner', 'Manager');
END;
$$;


-- C. Create has_database_permission(action_key) security helper
CREATE OR REPLACE FUNCTION public.has_database_permission(p_action_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
BEGIN
  v_email := auth.jwt() ->> 'email';
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Super-administrator and developer bypass list
  IF LOWER(v_email) IN ('srikarkandukuri07@gmail.com', 'vkalladi@gmail.com', 'kandukurisrikar10@gmail.com') THEN
    RETURN TRUE;
  END IF;

  -- 2. Owner or Manager bypass
  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE LOWER(email) = LOWER(v_email)
      AND role IN ('Owner', 'Manager')
      AND employment_status = 'Active'
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Check granular staff permissions mappings
  RETURN EXISTS (
    SELECT 1
    FROM public.staff_roles sr
    JOIN public.role_permissions rp ON rp.role_id = sr.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE sr.user_id = auth.uid()
      AND p.action_key = p_action_key
  );
END;
$$;


-- D. Set Support Attachments bucket to Private
UPDATE storage.buckets SET public = false WHERE id = 'support_attachments';


-- E. Revoke overly permissive RLS policies & implement proper permission checking

-- 1. Profiles Table Policies
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles" ON public.profiles 
  FOR SELECT USING (public.has_database_permission('members.view') OR public.has_database_permission('staff.view'));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (public.is_owner_or_manager() OR role = 'member'));


-- 2. Classes Table Policies
DROP POLICY IF EXISTS "Admin can insert classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can update classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can delete classes" ON public.classes;
DROP POLICY IF EXISTS "Admin can manage classes" ON public.classes;

CREATE POLICY "Admin can insert classes" ON public.classes FOR INSERT TO authenticated WITH CHECK (public.has_database_permission('classes.create'));
CREATE POLICY "Admin can update classes" ON public.classes FOR UPDATE TO authenticated USING (public.has_database_permission('classes.edit'));
CREATE POLICY "Admin can delete classes" ON public.classes FOR DELETE TO authenticated USING (public.has_database_permission('classes.delete'));


-- 3. Bookings Table Policies
DROP POLICY IF EXISTS "Admin can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admin can manage bookings" ON public.bookings;

CREATE POLICY "Admin can view all bookings" ON public.bookings FOR SELECT TO authenticated USING (public.has_database_permission('members.history'));
CREATE POLICY "Admin can manage bookings" ON public.bookings FOR ALL TO authenticated USING (public.has_database_permission('classes.bookings')) WITH CHECK (public.has_database_permission('classes.bookings'));


-- 4. Approved Members Table Policies
DROP POLICY IF EXISTS "Admin can view approved members" ON public.approved_members;
DROP POLICY IF EXISTS "Users and admins can view approved members" ON public.approved_members;
CREATE POLICY "Users and admins can view approved members" ON public.approved_members
  FOR SELECT TO authenticated USING (
    LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid()) 
    OR public.has_database_permission('members.view')
  );

DROP POLICY IF EXISTS "Admin can insert approved members" ON public.approved_members;
CREATE POLICY "Admin can insert approved members" ON public.approved_members FOR INSERT TO authenticated WITH CHECK (public.has_database_permission('members.add'));

DROP POLICY IF EXISTS "Admins can update approved members" ON public.approved_members;
CREATE POLICY "Admins can update approved members" ON public.approved_members FOR UPDATE TO authenticated USING (public.has_database_permission('members.edit')) WITH CHECK (public.has_database_permission('members.edit'));

DROP POLICY IF EXISTS "Admins can delete approved members" ON public.approved_members;
CREATE POLICY "Admins can delete approved members" ON public.approved_members FOR DELETE TO authenticated USING (public.has_database_permission('members.delete'));


-- 5. Attendance Table Policies
DROP POLICY IF EXISTS "Admins can read all attendance" ON public.attendance;
CREATE POLICY "Admins can read all attendance" ON public.attendance FOR SELECT TO authenticated USING (public.has_database_permission('attendance.view'));

DROP POLICY IF EXISTS "Admins can update attendance" ON public.attendance;
CREATE POLICY "Admins can update attendance" ON public.attendance FOR UPDATE TO authenticated USING (public.has_database_permission('attendance.manual')) WITH CHECK (public.has_database_permission('attendance.manual'));


-- 6. Forgot Password & Notifications Policies (Only Owner/Manager)
DROP POLICY IF EXISTS "Admins can read notifications" ON public.admin_notifications;
CREATE POLICY "Admins can read notifications" ON public.admin_notifications FOR SELECT TO authenticated USING (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admins can update notifications" ON public.admin_notifications;
CREATE POLICY "Admins can update notifications" ON public.admin_notifications FOR UPDATE TO authenticated USING (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admins can insert notifications" ON public.admin_notifications;
CREATE POLICY "Admins can insert notifications" ON public.admin_notifications FOR INSERT TO authenticated WITH CHECK (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admins can view forgot login requests" ON public.forgot_login_requests;
CREATE POLICY "Admins can view forgot login requests" ON public.forgot_login_requests FOR SELECT TO authenticated USING (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admins can insert forgot login requests" ON public.forgot_login_requests;
CREATE POLICY "Admins can insert forgot login requests" ON public.forgot_login_requests FOR INSERT TO authenticated WITH CHECK (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admins can update forgot login requests" ON public.forgot_login_requests;
CREATE POLICY "Admins can update forgot login requests" ON public.forgot_login_requests FOR UPDATE TO authenticated USING (public.is_owner_or_manager());


-- 7. Referral Codes Table Policies
DROP POLICY IF EXISTS "Admin full access on referral_codes" ON public.referral_codes;
CREATE POLICY "Admin full access on referral_codes" ON public.referral_codes FOR ALL TO authenticated USING (public.is_owner_or_manager()) WITH CHECK (public.is_owner_or_manager());

DROP POLICY IF EXISTS "Admin full access on referral_requests" ON public.referral_requests;
CREATE POLICY "Admin full access on referral_requests" ON public.referral_requests FOR ALL TO authenticated USING (public.is_owner_or_manager()) WITH CHECK (public.is_owner_or_manager());


-- 8. Class Types Policies
DROP POLICY IF EXISTS "Admins can manage class_types" ON public.class_types;
DROP POLICY IF EXISTS "Admin can manage class types" ON public.class_types;
CREATE POLICY "Admin can manage class types" ON public.class_types FOR ALL TO authenticated USING (public.has_database_permission('packages.manage')) WITH CHECK (public.has_database_permission('packages.manage'));


-- 9. Membership Credit Tiers Policies
DROP POLICY IF EXISTS "Admins can manage membership_credit_tiers" ON public.membership_credit_tiers;
CREATE POLICY "Admins can manage membership_credit_tiers" ON public.membership_credit_tiers FOR ALL TO authenticated USING (public.is_owner_or_manager()) WITH CHECK (public.is_owner_or_manager());


-- 10. Billing Module Policies
DROP POLICY IF EXISTS "Admin can manage customers" ON public.customers;
CREATE POLICY "Admin can manage customers" ON public.customers FOR ALL TO authenticated USING (public.has_database_permission('members.view')) WITH CHECK (public.has_database_permission('members.view'));

DROP POLICY IF EXISTS "Admin can manage billing plan items" ON public.billing_plan_items;
CREATE POLICY "Admin can manage billing plan items" ON public.billing_plan_items FOR ALL TO authenticated USING (public.has_database_permission('packages.manage')) WITH CHECK (public.has_database_permission('packages.manage'));

DROP POLICY IF EXISTS "Admin can manage invoices" ON public.invoices;
CREATE POLICY "Admin can manage invoices" ON public.invoices FOR ALL TO authenticated USING (public.has_database_permission('billing.view')) WITH CHECK (public.has_database_permission('billing.view'));

DROP POLICY IF EXISTS "Admin can manage invoice items" ON public.invoice_items;
CREATE POLICY "Admin can manage invoice items" ON public.invoice_items FOR ALL TO authenticated USING (public.has_database_permission('billing.view')) WITH CHECK (public.has_database_permission('billing.view'));

DROP POLICY IF EXISTS "Admin can manage member purchased plans" ON public.member_purchased_plans;
CREATE POLICY "Admin can manage member purchased plans" ON public.member_purchased_plans FOR ALL TO authenticated USING (public.has_database_permission('members.edit')) WITH CHECK (public.has_database_permission('members.edit'));


-- 12. Trial Members Table Policies
DROP POLICY IF EXISTS "Admin can manage trial members" ON public.trial_members;
CREATE POLICY "Admin can manage trial members" ON public.trial_members FOR ALL TO authenticated USING (public.has_database_permission('members.trial')) WITH CHECK (public.has_database_permission('members.trial'));


-- 13. Expense Module Policies
DROP POLICY IF EXISTS "Admin can manage expense categories" ON public.expense_categories;
CREATE POLICY "Admin can manage expense categories" ON public.expense_categories FOR ALL TO authenticated USING (public.has_database_permission('expenses.create')) WITH CHECK (public.has_database_permission('expenses.create'));

DROP POLICY IF EXISTS "Admin can manage expenses" ON public.expenses;
CREATE POLICY "Admin can manage expenses" ON public.expenses FOR ALL TO authenticated USING (public.has_database_permission('expenses.create')) WITH CHECK (public.has_database_permission('expenses.create'));


-- 14. Support Tickets Table Policies
DROP POLICY IF EXISTS "Users can view relevant tickets" ON public.support_tickets;
CREATE POLICY "Users can view relevant tickets" ON public.support_tickets
FOR ALL TO authenticated
USING (
  created_by = auth.uid()
  -- Or has staff view support permission
  OR public.has_database_permission('support.view')
)
WITH CHECK (
  created_by = auth.uid()
  OR public.has_database_permission('support.view')
);

DROP POLICY IF EXISTS "Users can view relevant messages" ON public.support_messages;
CREATE POLICY "Users can view relevant messages" ON public.support_messages
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets st
    WHERE st.id = support_messages.ticket_id
    AND (
      st.created_by = auth.uid()
      OR public.has_database_permission('support.view')
    )
  )
)
WITH CHECK (
  sender_id = auth.uid()
  OR public.has_database_permission('support.view')
);


-- 15. Support Attachment Storage RLS Policies
DROP POLICY IF EXISTS "Support attachments select policy" ON storage.objects;
DROP POLICY IF EXISTS "Support attachments insert policy" ON storage.objects;

-- Prevent direct client reads/writes on support bucket (only service key allowed)
CREATE POLICY "Service-only upload access to support" ON storage.objects
  FOR ALL TO public USING (bucket_id = 'support_attachments') WITH CHECK (bucket_id = 'support_attachments');

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
