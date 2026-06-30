-- CORHAUS PILATES PLATFORM - Swap Admin Email
-- =============================================
-- Demotes kandukurisrikar10@gmail.com to member
-- Promotes srikarkandukuri07@gmail.com to admin
-- Updates the trigger function for future signups

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
    CASE WHEN NEW.email = 'srikarkandukuri07@gmail.com' THEN 'admin' ELSE 'member' END
  );
  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET role = 'member'
WHERE email = 'kandukurisrikar10@gmail.com';

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'srikarkandukuri07@gmail.com';
