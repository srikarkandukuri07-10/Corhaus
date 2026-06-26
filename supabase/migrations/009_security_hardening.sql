-- CORHAUS PILATES PLATFORM - Security Hardening
-- =============================================

-- Fix handle_new_user() SECURITY DEFINER to lock search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone_number, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.email,
    CASE WHEN NEW.email = 'kandukurisrikar10@gmail.com' THEN 'admin' ELSE 'member' END
  );
  RETURN NEW;
END;
$$;

-- Add admin-only INSERT policy for admin_notifications
DROP POLICY IF EXISTS "Admins can insert notifications" ON admin_notifications;
CREATE POLICY "Admins can insert notifications" ON admin_notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Add admin-only policies for forgot_login_requests (defense-in-depth)
DROP POLICY IF EXISTS "Admins can view forgot login requests" ON forgot_login_requests;
CREATE POLICY "Admins can view forgot login requests" ON forgot_login_requests
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert forgot login requests" ON forgot_login_requests;
CREATE POLICY "Admins can insert forgot login requests" ON forgot_login_requests
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update forgot login requests" ON forgot_login_requests;
CREATE POLICY "Admins can update forgot login requests" ON forgot_login_requests
  FOR UPDATE TO authenticated USING (public.is_admin());
