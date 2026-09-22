-- 052: Trial payment invoices - allow Razorpay method + link trials to invoices
-- Root cause of missing trial invoices: invoices.payment_method CHECK only
-- allowed Cash/UPI/Card/Bank Transfer, while verify-payment inserts 'Razorpay'.

-- 1. Extend payment_method values (drop any existing check mentioning payment_method)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_method_check CHECK (
  payment_method IS NULL OR payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Razorpay', 'Online')
);

-- 2. Link each paid trial to its exact invoice for the "View Invoice" button
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trial_members_invoice ON public.trial_members (invoice_id);

NOTIFY pgrst, 'reload schema';
