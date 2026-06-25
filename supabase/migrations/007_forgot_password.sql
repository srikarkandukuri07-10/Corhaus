-- Forgot-password / admin-assisted login flow

-- Ensure is_admin() helper exists (defined in 003_fix_rls_recursion.sql)
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

CREATE TABLE IF NOT EXISTS forgot_login_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'forgot_password',
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forgot_login_requests ENABLE ROW LEVEL SECURITY;

-- Only admins / service_role can manage these
DROP POLICY IF EXISTS "Admins can read notifications" ON admin_notifications;
CREATE POLICY "Admins can read notifications" ON admin_notifications
  FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS "Service role can insert notifications" ON admin_notifications;
CREATE POLICY "Service role can insert notifications" ON admin_notifications
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Admins can update notifications" ON admin_notifications;
CREATE POLICY "Admins can update notifications" ON admin_notifications
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Service role can manage forgot requests" ON forgot_login_requests;
CREATE POLICY "Service role can manage forgot requests" ON forgot_login_requests
  FOR ALL USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS admin_notifications;
