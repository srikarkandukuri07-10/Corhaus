-- CORHAUS PILATES PLATFORM - Complete Member Deletion
-- ============================================================

-- Step 1: Create delete_member_completely trigger function
CREATE OR REPLACE FUNCTION public.delete_member_completely(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete members.';
  END IF;

  -- Get user ID from profiles
  SELECT id INTO v_user_id FROM public.profiles WHERE LOWER(email) = LOWER(p_email);

  -- Delete from approved_members
  DELETE FROM public.approved_members WHERE LOWER(email) = LOWER(p_email);

  -- If user has a signup account, delete from auth.users (which cascades to profiles, bookings, and attendance)
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  ELSE
    -- Just in case they registered but profile wasn't created, check auth.users by email
    DELETE FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  END IF;

  RETURN TRUE;
END;
$$;
