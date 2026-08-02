-- Migration 034: Trial Members Management & Check-in History Optimizations
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.trial_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email TEXT,
  trial_date DATE NOT NULL,
  trial_time TIME NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  class_name TEXT NOT NULL,
  instructor_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  instructor_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Attended', 'No Show', 'Converted')),
  notes TEXT,
  converted_member_id UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trial_members_status ON public.trial_members (status);
CREATE INDEX IF NOT EXISTS idx_trial_members_phone ON public.trial_members (phone_number);
CREATE INDEX IF NOT EXISTS idx_trial_members_converted ON public.trial_members (converted_member_id);
CREATE INDEX IF NOT EXISTS idx_trial_members_date ON public.trial_members (trial_date);

-- Enable Row-Level Security
ALTER TABLE public.trial_members ENABLE ROW LEVEL SECURITY;

-- Security Policies for Admins
DROP POLICY IF EXISTS "Admin can manage trial members" ON public.trial_members;
CREATE POLICY "Admin can manage trial members" ON public.trial_members
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Add table to Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trial_members;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Force reload PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';

