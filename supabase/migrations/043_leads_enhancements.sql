-- 043: Leads & Enquiries enhancements - make email required, add source tracking and lead details
-- This migration enhances trial_members (Leads) to meet the Leads Module spec

-- 1. Handle existing null emails - set placeholder for existing records that have no email
-- These placeholders are clearly marked as pending and should be updated by admin
UPDATE public.trial_members
SET email = 'pending_' || substring(id::text, 1, 8) || '@pending.local'
WHERE email IS NULL OR trim(email) = '';

-- 2. Make email required and add format check
ALTER TABLE public.trial_members ALTER COLUMN email SET NOT NULL;
-- Add email format check (allows the pending.local placeholders for existing data)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_members_email_format' AND conrelid = 'public.trial_members'::regclass) THEN
    ALTER TABLE public.trial_members ADD CONSTRAINT trial_members_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Add source column (for Instagram, Website, Walk-in, etc.)
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Website';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_members_source_check' AND conrelid = 'public.trial_members'::regclass) THEN
    ALTER TABLE public.trial_members ADD CONSTRAINT trial_members_source_check CHECK (source IN ('Walk-in', 'Phone', 'Instagram', 'Website', 'WhatsApp', 'Referral', 'Other'));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Add lead detail columns
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS primary_location TEXT DEFAULT 'CorhausPilates - Main Branch';
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS interest TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS convertibility TEXT DEFAULT 'Warm';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_members_convertibility_check' AND conrelid = 'public.trial_members'::regclass) THEN
    ALTER TABLE public.trial_members ADD CONSTRAINT trial_members_convertibility_check CHECK (convertibility IN ('Hot', 'Warm', 'Cold', 'Others'));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'New';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trial_members_pipeline_stage_check' AND conrelid = 'public.trial_members'::regclass) THEN
    ALTER TABLE public.trial_members ADD CONSTRAINT trial_members_pipeline_stage_check CHECK (pipeline_stage IN ('New', 'Qualified', 'Follow-up', 'Trial Booked', 'Trial Attended', 'Negotiating', 'Converted', 'Lost'));
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS preferred_time TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS source_detail TEXT;

-- 5. Update status constraint to include pipeline stages (keep existing trial statuses for backward compat)
-- Existing status is for trial attendance (Scheduled, Attended, etc.), pipeline_stage is for sales pipeline
-- No change to status column, keep it as is

-- 6. Add indexes for commonly searched fields
CREATE INDEX IF NOT EXISTS idx_trial_members_email ON public.trial_members (email);
CREATE INDEX IF NOT EXISTS idx_trial_members_source ON public.trial_members (source);
CREATE INDEX IF NOT EXISTS idx_trial_members_pipeline_stage ON public.trial_members (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_trial_members_convertibility ON public.trial_members (convertibility);
CREATE INDEX IF NOT EXISTS idx_trial_members_assigned_staff ON public.trial_members (assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_trial_members_created_at ON public.trial_members (created_at);
CREATE INDEX IF NOT EXISTS idx_trial_members_phone_email ON public.trial_members (phone_number, email);

-- 7. Ensure primary_location defaults for existing rows
UPDATE public.trial_members SET primary_location = 'CorhausPilates - Main Branch' WHERE primary_location IS NULL;

-- 8. Refresh PostgREST schema
NOTIFY pgrst, 'reload schema';
