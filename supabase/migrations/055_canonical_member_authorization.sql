-- Migration 055: Canonical Member Authorization & Hardening
-- ===========================================================================
-- Enforces the canonical business rule:
-- Authenticated user AND matching email AND matching phone AND active membership
-- Prevents unauthorized/inactive/deleted members from accessing Corhaus resources.
-- ===========================================================================

-- 1. Deterministic phone normalization function (extracts last 10 digits)
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits TEXT;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN '';
  END IF;
  -- Strip non-digit characters
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  IF length(v_digits) >= 10 THEN
    RETURN substring(v_digits from length(v_digits) - 9 for 10);
  END IF;
  RETURN v_digits;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone(TEXT) TO authenticated, anon;

-- 2. Update is_active_member() to enforce canonical rules
CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_phone TEXT;
  v_role TEXT;
BEGIN
  -- Read caller identity from profiles and auth JWT
  SELECT role, email, phone_number INTO v_role, v_email, v_phone
  FROM public.profiles
  WHERE id = auth.uid();

  -- Fallback to auth.jwt() if profile row is not yet populated
  IF v_email IS NULL OR v_email = '' THEN
    v_email := auth.jwt() ->> 'email';
  END IF;
  IF v_phone IS NULL OR v_phone = '' THEN
    v_phone := auth.jwt() ->> 'phone';
  END IF;

  -- Admins and Staff are authorized
  IF v_role = 'admin' OR v_role = 'developer' OR public.is_staff() THEN
    RETURN TRUE;
  END IF;

  IF v_email IS NULL OR trim(v_email) = '' THEN
    RETURN FALSE;
  END IF;

  -- Canonical check against approved_members
  -- 1. Matching email (case-insensitive)
  -- 2. Matching phone (if phone is present on both sides)
  -- 3. Strictly 'active' membership status
  RETURN EXISTS (
    SELECT 1 FROM public.approved_members am
    WHERE lower(trim(am.email)) = lower(trim(v_email))
      AND am.membership_status = 'active'
      AND (
        v_phone IS NULL
        OR trim(v_phone) = ''
        OR am.phone_number IS NULL
        OR trim(am.phone_number) = ''
        OR public.normalize_phone(am.phone_number) = public.normalize_phone(v_phone)
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated, anon;

-- 3. Hardened user_location_ids() — Inactive or deleted members NEVER receive location IDs
CREATE OR REPLACE FUNCTION public.user_location_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT l.id
  FROM public.locations l
  WHERE l.status = 'active'
    AND (
      lower(auth.jwt() ->> 'email') IN (
        'srikarkandukuri07@gmail.com', 'vkalladi@gmail.com', 'kandukurisrikar10@gmail.com'
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_members s
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND s.role = 'Owner'
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_locations sl
        JOIN public.staff_members s ON s.id = sl.staff_id
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND sl.location_id = l.id
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_members s
        WHERE lower(s.email) = lower(auth.jwt() ->> 'email')
          AND s.employment_status <> 'Inactive'
          AND s.location_id = l.id
      )
      OR EXISTS (
        SELECT 1 FROM public.approved_members am
        WHERE lower(am.email) = lower(auth.jwt() ->> 'email')
          AND am.membership_status = 'active'
          AND am.location_id = l.id
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.user_location_ids() TO authenticated, anon;

-- 4. Hardened bookings RLS policies
DROP POLICY IF EXISTS "Members can view own bookings" ON public.bookings;
CREATE POLICY "Members can view own bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    (member_id = auth.uid() AND public.is_active_member())
    OR public.has_database_permission('members.history')
  );

DROP POLICY IF EXISTS "Members can insert own bookings" ON public.bookings;
CREATE POLICY "Members can insert own bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid() AND public.is_active_member()
  );

DROP POLICY IF EXISTS "Members can update own bookings" ON public.bookings;
CREATE POLICY "Members can update own bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    member_id = auth.uid() AND public.is_active_member()
  )
  WITH CHECK (
    member_id = auth.uid() AND public.is_active_member()
  );

-- 5. Hardened classes RLS policy
DROP POLICY IF EXISTS "Branch members and staff can view classes" ON public.classes;
CREATE POLICY "Branch members and staff can view classes" ON public.classes
  FOR SELECT TO authenticated
  USING (
    location_id IN (SELECT public.user_location_ids())
    AND (public.is_staff() OR public.is_active_member())
  );

-- 6. Fix auto_create_referral_code trigger & relax referral_codes location_id NOT NULL constraint
ALTER TABLE public.referral_codes ALTER COLUMN location_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.auto_create_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_code TEXT;
  v_loc UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE member_email = LOWER(NEW.email)) THEN
    new_code := public.generate_referral_code();
    v_loc := NEW.location_id;
    IF v_loc IS NULL THEN
      SELECT id INTO v_loc FROM public.locations WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
    END IF;
    INSERT INTO public.referral_codes (member_email, code, location_id)
    VALUES (LOWER(NEW.email), new_code, v_loc);
  END IF;
  RETURN NEW;
END;
$$;
