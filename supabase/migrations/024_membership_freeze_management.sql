-- Migration 024: Membership Freeze Management System
-- Creates tables and columns for freeze requests and active membership freezes

-- 1. Create freeze_requests table
CREATE TABLE IF NOT EXISTS public.freeze_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.member_purchased_plans(id) ON DELETE CASCADE,
  package_type TEXT NOT NULL,
  requested_start_date DATE NOT NULL,
  requested_days INTEGER NOT NULL CHECK (requested_days >= 2 AND requested_days <= 15),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ
);

-- 2. Create membership_freezes table
CREATE TABLE IF NOT EXISTS public.membership_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.member_purchased_plans(id) ON DELETE CASCADE,
  package_type TEXT NOT NULL,
  freeze_start DATE NOT NULL,
  freeze_end DATE NOT NULL,
  resumed_at TIMESTAMPTZ,
  freeze_days INTEGER NOT NULL CHECK (freeze_days >= 2 AND freeze_days <= 15),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resumed', 'expired')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Update check constraint on approved_members.membership_status to allow 'frozen'
ALTER TABLE public.approved_members 
  DROP CONSTRAINT IF EXISTS approved_members_membership_status_check;

ALTER TABLE public.approved_members 
  ADD CONSTRAINT approved_members_membership_status_check 
  CHECK (membership_status IN ('active', 'inactive', 'frozen', 'cancelled', 'expired'));

-- 4. Add freeze fields to approved_members & member_purchased_plans
ALTER TABLE public.approved_members 
  ADD COLUMN IF NOT EXISTS freeze_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS freezes_used INTEGER DEFAULT 0;

ALTER TABLE public.member_purchased_plans 
  ADD COLUMN IF NOT EXISTS freeze_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS freezes_used INTEGER DEFAULT 0;

-- 5. Create Indexes
CREATE INDEX IF NOT EXISTS idx_freeze_requests_member ON public.freeze_requests(member_id);
CREATE INDEX IF NOT EXISTS idx_freeze_requests_status ON public.freeze_requests(status);
CREATE INDEX IF NOT EXISTS idx_membership_freezes_member ON public.membership_freezes(member_id);
CREATE INDEX IF NOT EXISTS idx_membership_freezes_status ON public.membership_freezes(status);

-- 6. Enable RLS
ALTER TABLE public.freeze_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_freezes ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.freeze_requests;
CREATE POLICY "Allow all for authenticated" ON public.freeze_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.membership_freezes;
CREATE POLICY "Allow all for authenticated" ON public.membership_freezes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow service role full access
DROP POLICY IF EXISTS "Service role full access freeze_requests" ON public.freeze_requests;
CREATE POLICY "Service role full access freeze_requests" ON public.freeze_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access membership_freezes" ON public.membership_freezes;
CREATE POLICY "Service role full access membership_freezes" ON public.membership_freezes FOR ALL TO service_role USING (true) WITH CHECK (true);
