-- CORHAUS PILATES PLATFORM - Classes & Schedule Module Complete Redesign Migration
-- Migration 025: Adds class_types, waitlists, booking_history, auto-waitlist promotion & RPCs
-- =========================================================================================

-- 1. Create Class Types table for reusable master class templates
CREATE TABLE IF NOT EXISTS public.class_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Reformer Pilates',
  description TEXT,
  difficulty TEXT DEFAULT 'All Levels',
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  max_capacity INTEGER NOT NULL DEFAULT 10 CHECK (max_capacity > 0),
  trainer TEXT NOT NULL,
  location_room TEXT DEFAULT 'Studio Room A',
  allow_member_booking BOOLEAN DEFAULT true,
  booking_opens_before_hours INTEGER DEFAULT 168, -- 7 days before
  booking_closes_before_hours INTEGER DEFAULT 2,   -- 2 hours before
  waitlist_enabled BOOLEAN DEFAULT true,
  cancellation_window_hours INTEGER DEFAULT 4,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view class types" ON public.class_types;
CREATE POLICY "Anyone authenticated can view class types" ON public.class_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage class types" ON public.class_types;
CREATE POLICY "Admin can manage class types" ON public.class_types FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Add class_type_id to public.classes if not present
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS class_type_id UUID REFERENCES public.class_types(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled'));

-- 2. Create Waitlists table for full session queueing
CREATE TABLE IF NOT EXISTS public.waitlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  queue_position INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'promoted', 'cancelled')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at TIMESTAMPTZ,
  UNIQUE(class_id, member_id)
);

ALTER TABLE public.waitlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view waitlists" ON public.waitlists;
CREATE POLICY "Anyone authenticated can view waitlists" ON public.waitlists FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage waitlists" ON public.waitlists;
CREATE POLICY "Admin can manage waitlists" ON public.waitlists FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Create Booking History table for tracking all status changes
CREATE TABLE IF NOT EXISTS public.booking_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.booking_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin can view booking history" ON public.booking_history;
CREATE POLICY "Admin can view booking history" ON public.booking_history FOR ALL TO authenticated USING (public.is_admin());

-- Add attendance_status column to public.bookings if not present
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'present', 'no_show', 'late')),
ADD COLUMN IF NOT EXISTS rescheduled_from_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

-- 4. SERVER-SIDE RPC FOR CANCEL & AUTOMATIC WAITLIST PROMOTION
CREATE OR REPLACE FUNCTION public.cancel_member_class_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARATION
  v_booking RECORD;
  v_plan RECORD;
  v_waitlist RECORD;
  v_promoted_booking_id UUID;
  v_class_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF v_booking.booking_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Booking already cancelled.');
  END IF;

  v_class_id := v_booking.class_id;

  -- Cancel booking
  UPDATE public.bookings SET booking_status = 'cancelled' WHERE id = p_booking_id;

  -- Restore credit if plan was session-based
  IF v_booking.purchased_plan_id IS NOT NULL AND v_booking.booking_status <> 'waitlisted' THEN
    SELECT * INTO v_plan FROM public.member_purchased_plans WHERE id = v_booking.purchased_plan_id;
    IF FOUND AND v_plan.sessions_total IS NOT NULL THEN
      UPDATE public.member_purchased_plans
      SET sessions_remaining = LEAST(sessions_total, sessions_remaining + 1)
      WHERE id = v_plan.id;
    END IF;
  END IF;

  -- Auto-promote first member on waitlist if queue exists
  SELECT * INTO v_waitlist 
  FROM public.waitlists 
  WHERE class_id = v_class_id AND status = 'waiting' 
  ORDER BY queue_position ASC, joined_at ASC 
  LIMIT 1;

  IF FOUND THEN
    -- Update waitlist entry
    UPDATE public.waitlists 
    SET status = 'promoted', promoted_at = NOW() 
    WHERE id = v_waitlist.id;

    -- Book promoted member
    PERFORM public.book_member_class_session(v_waitlist.member_id, v_class_id);

    -- Log notification / history
    INSERT INTO public.booking_history (member_id, action, note)
    VALUES (v_waitlist.member_id, 'waitlist_promoted', 'Automatically promoted from waitlist for session ' || v_class_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Booking cancelled successfully.');
END;
$$;

-- 5. SERVER-SIDE RPC FOR RESCHEDULING A BOOKING
CREATE OR REPLACE FUNCTION public.reschedule_member_class_booking(
  p_booking_id UUID,
  p_new_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_new_class RECORD;
  v_old_class_id UUID;
  v_res: JSONB;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original booking not found.';
  END IF;

  v_old_class_id := v_booking.class_id;

  -- Check new class
  SELECT * INTO v_new_class FROM public.classes WHERE id = p_new_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target class session not found.';
  END IF;

  -- Book new class
  v_res := public.book_member_class_session(v_booking.member_id, p_new_class_id);

  -- Cancel old class
  PERFORM public.cancel_member_class_booking(p_booking_id);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Booking rescheduled successfully.',
    'new_booking', v_res
  );
END;
$$;

-- Seed default class types if empty
INSERT INTO public.class_types (name, category, description, duration_minutes, max_capacity, trainer, location_room)
VALUES 
  ('Reformer Basic', 'Reformer Pilates', 'Foundational reformer movement and core control.', 60, 10, 'Rahul Sharma', 'Studio Room A'),
  ('Mat Pilates Flow', 'Mat Pilates', 'Full body mat pilates targeting core stability and posture.', 50, 12, 'Priya Singh', 'Studio Room B'),
  ('Advanced Tower & Reformer', 'Advanced Reformer', 'Intense reformer exercise for strength and balance.', 60, 8, 'Ananya Sen', 'Studio Room A'),
  ('Private Reformer 1-on-1', 'PT Session', 'Personalized 1-on-1 Pilates session.', 60, 1, 'Rahul Sharma', 'Private PT Suite')
ON CONFLICT (name) DO NOTHING;
