-- ============================================================
-- 030: Fix admin RLS for bookings table
-- Ensures admins can always read all bookings via their client.
-- Also adds a robust email-based admin check fallback.
-- ============================================================

-- 1. Make sure is_admin() function is correct and SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Drop all conflicting booking policies first
DROP POLICY IF EXISTS "Admin can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admin can manage bookings" ON public.bookings;
DROP POLICY IF EXISTS "Members can view own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Members can insert own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Members can update own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Service role bypass" ON public.bookings;

-- 3. Recreate clean policies
-- Admins can do everything on bookings
CREATE POLICY "Admin can manage all bookings"
  ON public.bookings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Members can view their own bookings (by auth uid OR approved_members id)
CREATE POLICY "Members can view own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    member_id = auth.uid()
    OR member_id IN (
      SELECT am.id FROM public.approved_members am WHERE am.email = (
        SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  );

-- Members can insert bookings for themselves
CREATE POLICY "Members can insert own bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (member_id = auth.uid());

-- Members can update their own bookings
CREATE POLICY "Members can update own bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = auth.uid()
    OR member_id IN (
      SELECT am.id FROM public.approved_members am WHERE am.email = (
        SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  );

-- 4. Make sure RLS is enabled
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
