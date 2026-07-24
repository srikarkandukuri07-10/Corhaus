-- Migration 027: Personal Training (PT) Scheduler Tables

CREATE TABLE IF NOT EXISTS public.pt_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL UNIQUE REFERENCES public.approved_members(id) ON DELETE CASCADE,
  trainer_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  start_time TIME NOT NULL,
  recurring_days INTEGER[] NOT NULL, -- Array of days (0=Sun, 1=Mon, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pt_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  trainer_name TEXT NOT NULL,
  session_date DATE NOT NULL,
  session_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no-show', 'cancelled')),
  purchased_plan_id UUID REFERENCES public.member_purchased_plans(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.pt_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pt_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admin can manage pt_assignments" ON public.pt_assignments;
CREATE POLICY "Admin can manage pt_assignments" ON public.pt_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can manage pt_sessions" ON public.pt_sessions;
CREATE POLICY "Admin can manage pt_sessions" ON public.pt_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pt_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pt_sessions;
