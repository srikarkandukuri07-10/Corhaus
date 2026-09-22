-- 051: Leads follow-up completion - outcome + completed timestamp
-- Reuses the existing follow_up_at column (original scheduled date is never
-- overwritten by completion). Two new nullable columns only.

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_outcome TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMPTZ;

-- Restrict outcome to the four staff-facing options (NULL = not completed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_follow_up_outcome_check' AND conrelid = 'public.leads'::regclass) THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_follow_up_outcome_check CHECK (
      follow_up_outcome IS NULL OR follow_up_outcome IN ('Interested', 'Not Interested', 'No Response', 'Asked to Call Later')
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_follow_up_at ON public.leads (follow_up_at);

NOTIFY pgrst, 'reload schema';
