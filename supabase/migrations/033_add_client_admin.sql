-- CORHAUS PILATES PLATFORM - Add Client Admin Access
-- ====================================================
-- Grants admin access to srikarkandukuri07@gmail.com and vkalladi@gmail.com

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
    CASE 
      WHEN LOWER(NEW.email) IN ('srikarkandukuri07@gmail.com', 'vkalladi@gmail.com') THEN 'admin' 
      ELSE 'member' 
    END
  );
  RETURN NEW;
END;
$$;

UPDATE public.profiles
SET role = 'admin'
WHERE LOWER(email) IN ('srikarkandukuri07@gmail.com', 'vkalladi@gmail.com');
