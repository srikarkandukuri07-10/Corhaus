-- 047: Leads business rules - restrict convertibility and pipeline stages, extend sources
-- Convertibility: ONLY Hot / Warm / Cold (remove Others)
-- Pipeline stage: ONLY New / Converted / Trial booked / Trial attended
-- Source: add Facebook and Google
-- Trial Members table is intentionally NOT modified

-- 1. Migrate existing convertibility values to the allowed set
UPDATE public.leads SET convertibility = 'Warm' WHERE convertibility NOT IN ('Hot', 'Warm', 'Cold');

-- 2. Replace convertibility check constraint (drop any existing check mentioning convertibility)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%convertibility%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.leads ADD CONSTRAINT leads_convertibility_check CHECK (convertibility IN ('Hot', 'Warm', 'Cold'));

-- 3. Migrate existing pipeline stages to the approved 4 values
UPDATE public.leads SET pipeline_stage = 'New' WHERE pipeline_stage IN ('Qualified', 'Follow-up', 'Negotiating', 'Lost');
UPDATE public.leads SET pipeline_stage = 'Trial booked' WHERE pipeline_stage = 'Trial Booked';
UPDATE public.leads SET pipeline_stage = 'Trial attended' WHERE pipeline_stage = 'Trial Attended';
-- 'New' and 'Converted' stay as-is

-- 4. Replace pipeline stage check constraint
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%pipeline_stage%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.leads ADD CONSTRAINT leads_pipeline_stage_check CHECK (pipeline_stage IN ('New', 'Converted', 'Trial booked', 'Trial attended'));

-- 5. Extend source with Facebook and Google (existing values remain valid)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%' AND pg_get_constraintdef(oid) NOT ILIKE '%source_detail%'
  LOOP
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.leads ADD CONSTRAINT leads_source_check CHECK (source IN ('Walk-in', 'Phone', 'Instagram', 'Website', 'WhatsApp', 'Referral', 'Facebook', 'Google', 'Other'));

NOTIFY pgrst, 'reload schema';
