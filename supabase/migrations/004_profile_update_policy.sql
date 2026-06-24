-- Allow members to update their own profile
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Verify
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
