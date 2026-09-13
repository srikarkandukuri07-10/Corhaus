-- Migration 048: Business Profile Table
-- Single-row settings table for business profile data (id = 'default').

CREATE TABLE IF NOT EXISTS public.business_profile (
  id TEXT PRIMARY KEY DEFAULT 'default',

  -- Business Information
  logo_url TEXT,
  business_name TEXT NOT NULL DEFAULT 'Corhaus Pilates',
  member_portal_url TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,

  -- Address Information
  address_line_1 TEXT,
  address_line_2 TEXT,
  country TEXT DEFAULT 'India',
  city TEXT,
  state TEXT,
  pin_code TEXT,

  -- Billing Profile
  legal_trade_name TEXT,
  attention_to TEXT,
  billing_address TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_pin_code TEXT,
  billing_email TEXT,
  billing_phone TEXT,
  gstin TEXT,
  pan TEXT,

  -- Business Details
  gst_number TEXT,
  business_registration_number TEXT,

  -- Social Media Links
  instagram_url TEXT,
  facebook_url TEXT,
  youtube_url TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.touch_business_profile_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_profile_updated_at ON public.business_profile;
CREATE TRIGGER trg_business_profile_updated_at
  BEFORE UPDATE ON public.business_profile
  FOR EACH ROW EXECUTE FUNCTION public.touch_business_profile_updated_at();

-- Enable RLS
ALTER TABLE public.business_profile ENABLE ROW LEVEL SECURITY;

-- Only authenticated admins (is_admin()) can read/write
DROP POLICY IF EXISTS "Admins can manage business profile" ON public.business_profile;
CREATE POLICY "Admins can manage business profile" ON public.business_profile
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default row so GET always finds a record
INSERT INTO public.business_profile (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Create business-assets bucket for logo uploads (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-assets', 'business-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admins can upload/update/delete business assets
DROP POLICY IF EXISTS "Admins can upload business assets" ON storage.objects;
CREATE POLICY "Admins can upload business assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can update business assets" ON storage.objects;
CREATE POLICY "Admins can update business assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'business-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete business assets" ON storage.objects;
CREATE POLICY "Admins can delete business assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'business-assets' AND public.is_admin());

DROP POLICY IF EXISTS "Public can view business assets" ON storage.objects;
CREATE POLICY "Public can view business assets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'business-assets');
