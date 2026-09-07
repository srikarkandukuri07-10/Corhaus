-- 044: Create Leads & Enquiries table (separate from trial_members)
-- Trial Members remains for scheduled trials; Leads is for pre-member enquiries

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) > 0),
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^[0-9]{10}$'),
  email TEXT NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  source TEXT NOT NULL DEFAULT 'Website' CHECK (source IN ('Walk-in', 'Phone', 'Instagram', 'Website', 'WhatsApp', 'Referral', 'Other')),
  source_detail TEXT,
  primary_location TEXT NOT NULL DEFAULT 'CorhausPilates - Main Branch',
  interest TEXT CHECK (interest IN ('General Membership', 'Personal Training', 'Group Classes', 'Yoga', 'Zumba', 'CrossFit', 'Kickboxing/MMA', 'Trial Class', 'Just Enquiring', 'Other', 'Reformer Pilates', 'Mat Pilates', 'Private Session') OR interest IS NULL),
  convertibility TEXT NOT NULL DEFAULT 'Others' CHECK (convertibility IN ('Hot', 'Warm', 'Cold', 'Others')),
  pipeline_stage TEXT NOT NULL DEFAULT 'New' CHECK (pipeline_stage IN ('New', 'Qualified', 'Follow-up', 'Trial Booked', 'Trial Attended', 'Negotiating', 'Converted', 'Lost')),
  assigned_to UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  follow_up_at TIMESTAMPTZ,
  notes TEXT,
  preferred_time TEXT,
  message TEXT,
  converted_member_id UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for search/filter performance
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON public.leads (phone_number);
CREATE INDEX IF NOT EXISTS idx_leads_source ON public.leads (source);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON public.leads (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_leads_convertibility ON public.leads (convertibility);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads (assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at);
CREATE INDEX IF NOT EXISTS idx_leads_phone_email ON public.leads (phone_number, email);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Revoke default permissions
REVOKE ALL ON public.leads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- Policy: only staff with members.trial or leads permission can manage
DROP POLICY IF EXISTS "Leads: staff can manage" ON public.leads;
CREATE POLICY "Leads: staff can manage" ON public.leads
  FOR ALL TO authenticated
  USING (public.has_database_permission('members.trial'))
  WITH CHECK (public.has_database_permission('members.trial'));

-- No anon policy - public must go through service_role API (/api/trial)

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_leads_updated_at ON public.leads;
CREATE TRIGGER set_leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_leads_updated_at();

NOTIFY pgrst, 'reload schema';
