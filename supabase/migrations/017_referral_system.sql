-- ============================================================
-- CORHAUS PILATES - Referral Code System
-- Migration 017
-- ============================================================

-- ============================================================
-- 1. REFERRAL CODES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_email TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  successful_referrals INTEGER NOT NULL DEFAULT 0,
  reward_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  reward_redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access on referral_codes"
  ON public.referral_codes
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Members can read their own referral code
CREATE POLICY "Members can read own referral code"
  ON public.referral_codes
  FOR SELECT TO authenticated
  USING (
    member_email = (
      SELECT email FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ============================================================
-- 2. REFERRAL REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referral_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  referrer_name TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_requests ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access on referral_requests"
  ON public.referral_requests
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Public can insert (unauthenticated referral submissions)
CREATE POLICY "Public can insert referral requests"
  ON public.referral_requests
  FOR INSERT TO anon
  WITH CHECK (true);

-- Members can read their own referrals (as referrer)
CREATE POLICY "Members can read own referrals"
  ON public.referral_requests
  FOR SELECT TO authenticated
  USING (
    referrer_email = (
      SELECT email FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Create partial unique indexes for duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_requests_pending_email
  ON public.referral_requests (LOWER(applicant_email))
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_requests_pending_phone
  ON public.referral_requests (applicant_phone)
  WHERE status = 'pending';

-- ============================================================
-- 3. REFERRAL CODE GENERATION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i INTEGER;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := '';
    FOR i IN 1..8 LOOP
      new_code := new_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = new_code) INTO code_exists;

    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 4. AUTO-CREATE REFERRAL CODE ON MEMBER INSERT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION auto_create_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code TEXT;
BEGIN
  -- Only create if this member doesn't already have a referral code
  IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE member_email = LOWER(NEW.email)) THEN
    new_code := generate_referral_code();
    INSERT INTO public.referral_codes (member_email, code)
    VALUES (LOWER(NEW.email), new_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_referral_code ON public.approved_members;
CREATE TRIGGER trigger_auto_create_referral_code
  AFTER INSERT ON public.approved_members
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_referral_code();

-- ============================================================
-- 5. BACKFILL: Generate codes for existing approved members
-- ============================================================
INSERT INTO public.referral_codes (member_email, code)
SELECT LOWER(am.email), generate_referral_code()
FROM public.approved_members am
WHERE NOT EXISTS (
  SELECT 1 FROM public.referral_codes rc WHERE rc.member_email = LOWER(am.email)
);

-- ============================================================
-- 6. ENABLE REALTIME on referral_requests for admin notifications
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.referral_requests;
