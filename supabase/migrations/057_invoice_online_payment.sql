-- ============================================================================
-- Migration 057: Online payment collection for invoices (Razorpay Payment Link)
-- ============================================================================
-- Lets staff collect an outstanding invoice balance online from the Billing
-- screen instead of only recording a manual payment method.
--
-- Flow:
--   Complete Bill -> invoice created (payment_status 'due')
--                 -> staff clicks "Collect payment online"
--                 -> we create a Razorpay Payment Link for the OUTSTANDING
--                    amount and show it as a QR for the member to scan
--                 -> member pays on Razorpay's hosted page
--                 -> webhook matches notes.reference_id and marks the invoice paid
--
-- Payment Links are used deliberately: they are created server-side with the
-- API key, so the member never has to enter anything, and they work for
-- UPI/cards/netbanking without us hosting a payment page.
--
-- reference_id carries the invoice id, which is how the webhook correlates a
-- payment back to the exact invoice. Amounts are never inferred from timing or
-- value matching.
--
-- Additive only: adds columns and an index. No existing column is altered and
-- no existing row is modified.
-- ============================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.invoices.razorpay_payment_link_id IS
  'Razorpay payment_link id. reference_id sent to Razorpay is the invoice id, which the webhook uses to correlate the payment.';
COMMENT ON COLUMN public.invoices.razorpay_payment_link_url IS
  'Hosted Razorpay payment page for this invoice. Encoded as a QR for the member to scan.';

CREATE INDEX IF NOT EXISTS idx_invoices_payment_link
  ON public.invoices (razorpay_payment_link_id)
  WHERE razorpay_payment_link_id IS NOT NULL;

-- Audit trail: staff actions around online collection.
CREATE TABLE IF NOT EXISTS public.invoice_payment_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  actor_email TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payment_audit_invoice
  ON public.invoice_payment_audit (invoice_id, created_at DESC);

ALTER TABLE public.invoice_payment_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.invoice_payment_audit FROM anon;
GRANT SELECT ON TABLE public.invoice_payment_audit TO authenticated;
GRANT ALL   ON TABLE public.invoice_payment_audit TO service_role;

-- Staff may read the audit trail. No INSERT policy on purpose: rows are written
-- by the service role from the server-side route and the webhook only, so a
-- client cannot forge them.
DROP POLICY IF EXISTS "Staff can read invoice payment audit" ON public.invoice_payment_audit;
CREATE POLICY "Staff can read invoice payment audit" ON public.invoice_payment_audit
  FOR SELECT TO authenticated
  USING (public.has_database_permission('billing.view'));

NOTIFY pgrst, 'reload schema';