-- CORHAUS PILATES PLATFORM - Fix RLS infinite recursion
-- =============================================
-- PROBLEM:
-- Every policy that does EXISTS (SELECT 1 FROM profiles WHERE ...)
-- triggers RLS on the profiles table, which re-evaluates
-- the same recursive policy -> infinite recursion (42P17).
--
-- This affects 5 policies (profiles, classes, bookings).
-- 
-- SOLUTION:
-- Replace all recursive subqueries with a SECURITY DEFINER
-- helper function that queries profiles BYPASSING RLS.
-- =============================================

-- =============================================
-- STEP 1: Drop ALL recursive admin-check policies
-- =============================================
DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can insert classes" ON classes;
DROP POLICY IF EXISTS "Admin can update classes" ON classes;
DROP POLICY IF EXISTS "Admin can delete classes" ON classes;
DROP POLICY IF EXISTS "Admin can view all bookings" ON bookings;

-- =============================================
-- STEP 2: Create SECURITY DEFINER helper
-- Runs as owner (superuser/service_role), bypasses RLS.
-- Fully qualifies all identifiers so search_path is irrelevant.
-- =============================================
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

-- =============================================
-- STEP 3: Recreate all admin policies using the safe helper
-- =============================================

-- Profiles: admin can view all
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (public.is_admin());

-- Classes: admin CRUD
CREATE POLICY "Admin can insert classes" ON classes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update classes" ON classes FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can delete classes" ON classes FOR DELETE TO authenticated USING (public.is_admin());

-- Bookings: admin can view all
CREATE POLICY "Admin can view all bookings" ON bookings FOR SELECT TO authenticated USING (public.is_admin());

-- =============================================
-- STEP 4: Verify
-- =============================================
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE tablename IN ('profiles', 'classes', 'bookings')
ORDER BY tablename, policyname;
