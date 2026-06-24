CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attendance_token TEXT NOT NULL UNIQUE,
  scanned_at TIMESTAMPTZ,
  attendance_status TEXT NOT NULL DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'attended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_booking_id ON public.attendance(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON public.attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON public.attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_attendance_token ON public.attendance(attendance_token);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can insert own pending attendance"
  ON public.attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = member_id
    AND attendance_status = 'pending'
  );

CREATE POLICY "Members can read own attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

CREATE POLICY "Admins can read all attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update attendance"
  ON public.attendance
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
