-- CORHAUS PILATES PLATFORM - Active Membership Enforcement
-- ============================================================

-- Step 1: Create active membership check function
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_role TEXT;
BEGIN
  -- Get user's role and email from profiles
  SELECT role, email INTO v_role, v_email
  FROM public.profiles
  WHERE id = auth.uid();

  -- Admins are always authorized
  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Check if they are active in approved_members
  RETURN EXISTS (
    SELECT 1 FROM public.approved_members
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(v_email))
      AND membership_status = 'active'
  );
END;
$$;

-- Step 2: Update Classes RLS Policies
DROP POLICY IF EXISTS "Anyone authenticated can view classes" ON public.classes;
CREATE POLICY "Anyone authenticated can view classes" ON public.classes
  FOR SELECT TO authenticated USING (public.is_active_member());

-- Step 3: Update Bookings RLS Policies
DROP POLICY IF EXISTS "Members can view own bookings" ON public.bookings;
CREATE POLICY "Members can view own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (member_id = auth.uid() AND public.is_active_member());

DROP POLICY IF EXISTS "Members can insert own bookings" ON public.bookings;
CREATE POLICY "Members can insert own bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid() AND public.is_active_member());

DROP POLICY IF EXISTS "Members can update own bookings" ON public.bookings;
CREATE POLICY "Members can update own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (member_id = auth.uid() AND public.is_active_member()) WITH CHECK (member_id = auth.uid() AND public.is_active_member());

-- Step 4: Update Attendance RLS Policies
DROP POLICY IF EXISTS "Members can insert own pending attendance" ON public.attendance;
CREATE POLICY "Members can insert own pending attendance" ON public.attendance
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = member_id AND attendance_status = 'pending' AND public.is_active_member());

DROP POLICY IF EXISTS "Members can read own attendance" ON public.attendance;
CREATE POLICY "Members can read own attendance" ON public.attendance
  FOR SELECT TO authenticated USING (auth.uid() = member_id AND public.is_active_member());

-- Step 5: Update Approved Members RLS SELECT Policy so members can read their own status
DROP POLICY IF EXISTS "Admin can view approved members" ON public.approved_members;
DROP POLICY IF EXISTS "Users and admins can view approved members" ON public.approved_members;
CREATE POLICY "Users and admins can view approved members" ON public.approved_members
  FOR SELECT TO authenticated USING (
    LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid()) 
    OR public.is_admin()
  );

-- Step 6: Enable Realtime for approved_members table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'approved_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.approved_members;
  END IF;
END $$;
