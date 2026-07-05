-- CORHAUS PILATES PLATFORM - Profile Photos Integration
-- ============================================================

-- Step 1: Add avatar_url column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Step 2: Create a public storage bucket for avatars if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Create RLS policies for storage objects in the avatars bucket
-- 1. Anyone can view avatar images
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

-- 2. Authenticated users can upload their own avatar image
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );

-- 3. Authenticated users can update their own avatar image
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );

-- 4. Authenticated users can delete their own avatar image
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' 
    AND (LOWER(name) LIKE auth.uid()::text || '/%')
  );
