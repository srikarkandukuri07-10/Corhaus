-- CORHAUS PLATFORM - Fix Auth User Creation Trigger & Profiles Constraints
-- Migration 037

-- 1. Remove NOT NULL constraints from profiles table columns so auto-inserts never fail on missing fields
ALTER TABLE public.profiles ALTER COLUMN full_name DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone_number DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN phone_number SET DEFAULT '';

-- 2. Re-create handle_new_user function with search_path = public, pg_catalog and EXCEPTION handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_role TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));
  v_phone := COALESCE(NEW.raw_user_meta_data->>'phone_number', '');
  
  IF LOWER(NEW.email) IN ('srikarkandukuri07@gmail.com', 'vkalladi@gmail.com', 'admin@corhaus.com') THEN
    v_role := 'admin';
  ELSIF LOWER(NEW.email) = 'kandukurisrikar10@gmail.com' THEN
    v_role := 'developer';
  ELSE
    v_role := 'member';
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone_number, role)
    VALUES (NEW.id, NEW.email, v_full_name, v_phone, v_role)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger exception: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 3. Ensure trigger is attached AFTER INSERT ON auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
