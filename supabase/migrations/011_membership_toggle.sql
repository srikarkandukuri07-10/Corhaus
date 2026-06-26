-- CORHAUS PILATES PLATFORM - Membership Toggle RLS Policy
-- =============================================
-- Allows admins to update membership_status on approved_members.
-- The proxy middleware already filters by membership_status = 'active',
-- so toggling to 'inactive' instantly blocks member portal access.

DROP POLICY IF EXISTS "Admins can update approved members" ON approved_members;
CREATE POLICY "Admins can update approved members" ON approved_members
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete approved members" ON approved_members;
CREATE POLICY "Admins can delete approved members" ON approved_members
  FOR DELETE TO authenticated USING (public.is_admin());
