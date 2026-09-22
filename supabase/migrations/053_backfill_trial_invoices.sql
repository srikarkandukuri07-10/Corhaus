-- 053: Backfill invoices for trials paid before invoicing existed
-- Self-contained: widens payment_method and adds trial_members.invoice_id
-- (both idempotent) so running ONLY this file is enough.

-- 1. Allow Razorpay/Online payment methods (same as 052, idempotent)
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
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_payment_method_check' AND conrelid = 'public.invoices'::regclass) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_method_check CHECK (
      payment_method IS NULL OR payment_method IN ('Cash', 'UPI', 'Card', 'Bank Transfer', 'Razorpay', 'Online')
    );
  END IF;
END $$;

-- 2. Link column (same as 052, idempotent)
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trial_members_invoice ON public.trial_members (invoice_id);

-- 3. Backfill: only trials with a Razorpay payment id (i.e. actually paid
-- online) and no linked invoice. Manual/scheduled rows are untouched.
DO $$
DECLARE
  t RECORD;
  v_customer_id UUID;
  v_invoice_id UUID;
  v_amount NUMERIC(10,2);
  v_invoice_number TEXT;
  v_class_title TEXT;
  v_class_date TEXT;
BEGIN
  FOR t IN
    SELECT id, full_name, phone_number, email, class_name, trial_date,
           razorpay_payment_id, razorpay_order_id, payment_amount
    FROM public.trial_members
    WHERE razorpay_payment_id IS NOT NULL
      AND invoice_id IS NULL
  LOOP
    -- Skip if an invoice already references this payment
    SELECT id INTO v_invoice_id FROM public.invoices WHERE transaction_reference = t.razorpay_payment_id LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      UPDATE public.trial_members SET invoice_id = v_invoice_id WHERE id = t.id;
      CONTINUE;
    END IF;

    -- Find or create customer
    SELECT id INTO v_customer_id FROM public.customers WHERE lower(email) = lower(t.email) LIMIT 1;
    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (full_name, email, phone_number)
      VALUES (t.full_name, lower(t.email), t.phone_number)
      RETURNING id INTO v_customer_id;
    END IF;

    v_amount := COALESCE((t.payment_amount / 100.0)::NUMERIC(10,2), 500);
    v_class_title := COALESCE(t.class_name, 'Trial Class');
    v_class_date := COALESCE(t.trial_date::TEXT, '');
    v_invoice_number := 'TRIAL-BACKFILL-' || substring(t.id::TEXT, 1, 8);

    INSERT INTO public.invoices (
      invoice_number, customer_id, customer_name, customer_email, customer_phone,
      subtotal, grand_total, amount_paid, payment_status, payment_method,
      transaction_reference, notes
    )
    VALUES (
      v_invoice_number, v_customer_id, t.full_name, lower(t.email), t.phone_number,
      v_amount, v_amount, v_amount, 'paid', 'Razorpay',
      t.razorpay_payment_id,
      'Trial booking for ' || v_class_title || ' on ' || v_class_date || ' (Order ' || COALESCE(t.razorpay_order_id, '') || ') — backfilled'
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.invoice_items (invoice_id, name, category, quantity, unit_price, total_price)
    VALUES (v_invoice_id, v_class_title || ' (Trial)', 'Services', 1, v_amount, v_amount);

    UPDATE public.trial_members SET invoice_id = v_invoice_id WHERE id = t.id;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
