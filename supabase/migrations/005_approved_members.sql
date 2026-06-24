-- RUN THIS ENTIRE BLOCK AT ONCE
CREATE TABLE IF NOT EXISTS approved_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approved_members_email ON approved_members (email);
CREATE INDEX IF NOT EXISTS idx_approved_members_phone ON approved_members (phone_number);

ALTER TABLE approved_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view approved members" ON approved_members;
CREATE POLICY "Admin can view approved members" ON approved_members FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert approved members" ON approved_members;
CREATE POLICY "Admin can insert approved members" ON approved_members FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Also add the profile update policy if not exists
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Verification queries
SELECT 'approved_members' AS table_name, COUNT(*) AS row_count FROM approved_members;
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'approved_members';
