-- CORHAUS PILATES PLATFORM - Final Schema
-- Works on completely empty OR partially-set-up projects.

-- =============================================
-- STEP 1: Drop everything for a clean slate
-- Order matters because of foreign keys.
-- =============================================
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- =============================================
-- STEP 2: Create tables with correct schema
-- =============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  instructor TEXT NOT NULL,
  class_date DATE NOT NULL,
  class_time TIME NOT NULL,
  max_capacity INTEGER NOT NULL CHECK (max_capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_status TEXT NOT NULL DEFAULT 'booked' CHECK (booking_status IN ('booked', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(class_id, member_id)
);

-- =============================================
-- STEP 3: Row Level Security
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Classes policies
CREATE POLICY "Anyone authenticated can view classes" ON classes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert classes" ON classes FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can update classes" ON classes FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin can delete classes" ON classes FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Bookings policies
CREATE POLICY "Members can view own bookings" ON bookings FOR SELECT TO authenticated USING (member_id = auth.uid());
CREATE POLICY "Admin can view all bookings" ON bookings FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Members can insert own bookings" ON bookings FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY "Members can update own bookings" ON bookings FOR UPDATE TO authenticated USING (member_id = auth.uid());

-- =============================================
-- STEP 4: Enable Realtime
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE classes;

-- =============================================
-- STEP 5: Auto-profile trigger on signup
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- STEP 6: Backfill profiles for EXISTING users
-- (Your admin account and any others)
-- =============================================

INSERT INTO public.profiles (id, full_name, phone_number, email, role)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', ''),
  COALESCE(raw_user_meta_data->>'phone_number', ''),
  email,
  CASE WHEN email = 'kandukurisrikar10@gmail.com' THEN 'admin' ELSE 'member' END
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- =============================================
-- STEP 7: Verify
-- =============================================

SELECT email, role FROM public.profiles ORDER BY created_at;
