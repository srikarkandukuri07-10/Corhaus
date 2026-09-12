-- 046: Razorpay trial payment support - add payment tracking to trial_members
-- Minimal changes to support idempotency and payment verification

-- Add payment columns to trial_members if not exists
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS razorpay_signature TEXT;
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed'));
ALTER TABLE public.trial_members ADD COLUMN IF NOT EXISTS payment_amount INTEGER;

-- Create unique index for idempotency on razorpay_payment_id where not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_members_razorpay_payment ON public.trial_members (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trial_members_razorpay_order ON public.trial_members (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;

-- Also add to leads for consistency
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS razorpay_payment_id TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_razorpay_payment ON public.leads (razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
