-- CORHAUS PILATES PLATFORM - Profile Photos Bucket Setup
-- ============================================================

-- Step 1: Create a public storage bucket for profile-photos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Step 2: Create RLS policies for storage objects in the profile-photos bucket
-- 1. Anyone can view profile photos
DROP POLICY IF EXISTS "Public Access Photos" ON storage.objects;
CREATE POLICY "Public Access Photos" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'profile-photos');

-- 2. Authenticated users can upload their own profile photo
DROP POLICY IF EXISTS "Users can upload their own profile photo" ON storage.objects;
CREATE POLICY "Users can upload their own profile photo" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'profile-photos' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );

-- 3. Authenticated users can update their own profile photo
DROP POLICY IF EXISTS "Users can update their own profile photo" ON storage.objects;
CREATE POLICY "Users can update their own profile photo" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'profile-photos' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );

-- 4. Authenticated users can delete their own profile photo
DROP POLICY IF EXISTS "Users can delete their own profile photo" ON storage.objects;
CREATE POLICY "Users can delete their own profile photo" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'profile-photos' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );
