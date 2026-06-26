-- CORHAUS PILATES PLATFORM - Security Remediations
-- =============================================

-- Step 1: Ensure tables exist on active database (for forgot password & admin notifications)
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

-- Step 2: Enable RLS on both tables
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE forgot_login_requests ENABLE ROW LEVEL SECURITY;

-- Step 3: Add attempts column to forgot_login_requests
ALTER TABLE forgot_login_requests ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

-- Step 4: Drop overly permissive policies
-- Drop RLS policy that lets anyone read/write reset codes (Finding #5)
DROP POLICY IF EXISTS "Service role can manage forgot requests" ON forgot_login_requests;

-- Drop RLS policy that lets any authenticated user insert notifications (Finding #6)
DROP POLICY IF EXISTS "Service role can insert notifications" ON admin_notifications;

-- Step 5: Secure admin notifications policy
-- Only admins can select notifications
DROP POLICY IF EXISTS "Admins can read notifications" ON admin_notifications;
CREATE POLICY "Admins can read notifications" ON admin_notifications
  FOR SELECT TO authenticated USING (public.is_admin());

-- Only admins can update notifications (e.g. mark as read)
DROP POLICY IF EXISTS "Admins can update notifications" ON admin_notifications;
CREATE POLICY "Admins can update notifications" ON admin_notifications
  FOR UPDATE TO authenticated USING (public.is_admin());

-- Step 6: Fix UPDATE policy on bookings (Finding #9)
-- Add WITH CHECK to ensure members can only update bookings to their own member_id
DROP POLICY IF EXISTS "Members can update own bookings" ON bookings;
CREATE POLICY "Members can update own bookings" ON bookings
  FOR UPDATE TO authenticated
  USING (member_id = auth.uid())
  WITH CHECK (member_id = auth.uid());

-- Step 7: Fix UPDATE policy on profiles (Finding #10)
-- Add WITH CHECK to ensure users can only update their own profile and cannot escalate role to admin
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND (public.is_admin() OR role = 'member'));

-- Step 8: Ensure Realtime is configured for admin_notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
  END IF;
END $$;
