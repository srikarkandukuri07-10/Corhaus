-- Migration 032: Member-Based Discount Management System
-- =======================================================

-- 1. Create member_discounts table
CREATE TABLE IF NOT EXISTS public.member_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_member_id UUID REFERENCES public.approved_members(id) ON DELETE CASCADE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  source TEXT NOT NULL DEFAULT 'Manual',
  reason TEXT NOT NULL DEFAULT 'Goodwill',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'deactivated')),
  created_by TEXT DEFAULT 'Admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL
);

-- 2. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_member_discounts_approved_member_id ON public.member_discounts(approved_member_id);
CREATE INDEX IF NOT EXISTS idx_member_discounts_status ON public.member_discounts(status);

-- 3. Enable RLS
ALTER TABLE public.member_discounts ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DROP POLICY IF EXISTS "Allow service role full access on member_discounts" ON public.member_discounts;
CREATE POLICY "Allow service role full access on member_discounts"
  ON public.member_discounts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users access on member_discounts" ON public.member_discounts;
CREATE POLICY "Allow authenticated users access on member_discounts"
  ON public.member_discounts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Enable Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'member_discounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.member_discounts;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
