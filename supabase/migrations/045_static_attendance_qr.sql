-- 045: Static attendance QR for reception
-- One permanent QR displayed on admin dashboard, scanned by members

CREATE TABLE IF NOT EXISTS public.attendance_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  static_token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure single row exists with a permanent token
INSERT INTO public.attendance_config (id, static_token)
VALUES ('default', gen_random_uuid()::text)
ON CONFLICT (id) DO NOTHING;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_attendance_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_attendance_config_updated_at ON public.attendance_config;
CREATE TRIGGER set_attendance_config_updated_at BEFORE UPDATE ON public.attendance_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_attendance_config_updated_at();

-- RLS: anyone authenticated can read the static token (needed for member scanner to validate QR)
ALTER TABLE public.attendance_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone authenticated can read attendance config" ON public.attendance_config;
CREATE POLICY "Anyone authenticated can read attendance config" ON public.attendance_config FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin can manage attendance config" ON public.attendance_config;
CREATE POLICY "Admin can manage attendance config" ON public.attendance_config FOR ALL TO authenticated USING (public.has_database_permission('attendance.scan')) WITH CHECK (public.has_database_permission('attendance.scan'));
GRANT SELECT ON public.attendance_config TO authenticated;
GRANT ALL ON public.attendance_config TO service_role;

NOTIFY pgrst, 'reload schema';
