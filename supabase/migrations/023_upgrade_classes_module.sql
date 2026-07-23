-- CORHAUS PILATES PLATFORM - Classes Module Upgrade & Server-Side Booking Enforcement
-- Migration 023: Schema extensions and server-side PostgreSQL booking RPC logic
-- =================================================================================

-- 1. Extend classes table
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS end_time TIME,
ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Reformer Pilates',
ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'All Levels',
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS location_room TEXT DEFAULT 'Studio Room A',
ADD COLUMN IF NOT EXISTS equipment_required TEXT,
ADD COLUMN IF NOT EXISTS recurring_rule TEXT,
ADD COLUMN IF NOT EXISTS parent_recurring_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Extend bookings table
DO $$
BEGIN
  -- Drop existing booking_status constraint if present
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_status_check;
  
  -- Add updated booking_status check constraint
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_booking_status_check
  CHECK (booking_status IN ('booked', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show', 'waitlisted'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS purchased_plan_id UUID REFERENCES public.member_purchased_plans(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_bookings_class_id ON public.bookings(class_id);
CREATE INDEX IF NOT EXISTS idx_bookings_member_id ON public.bookings(member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(booking_status);
CREATE INDEX IF NOT EXISTS idx_classes_date ON public.classes(class_date);

-- 3. SERVER-SIDE RPC FUNCTION FOR CLASS BOOKING WITH STRICT ELIGIBILITY ENFORCEMENT
CREATE OR REPLACE FUNCTION public.book_member_class_session(
  p_member_id UUID,
  p_class_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member RECORD;
  v_class RECORD;
  v_plan RECORD;
  v_existing_booking RECORD;
  v_current_bookings_count INT;
  v_new_booking_id UUID;
  v_status TEXT := 'booked';
BEGIN
  -- A. Fetch Member Info
  SELECT * INTO v_member FROM public.approved_members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found.';
  END IF;

  -- B. Fetch Class Info
  SELECT * INTO v_class FROM public.classes WHERE id = p_class_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class session not found.';
  END IF;

  IF v_class.is_active = false THEN
    RAISE EXCEPTION 'This class session is currently inactive.';
  END IF;

  -- C. Check if Member is already booked for this class
  SELECT * INTO v_existing_booking
  FROM public.bookings
  WHERE class_id = p_class_id AND member_id = p_member_id AND booking_status NOT IN ('cancelled');

  IF FOUND THEN
    RAISE EXCEPTION 'Member is already booked for this class session.';
  END IF;

  -- D. Strictly Find Active Purchased Plan matching Eligibility Conditions
  -- Rule 1: Active record in member_purchased_plans
  -- Rule 2: Plan has not expired (valid_until >= CURRENT_DATE or NULL)
  -- Rule 3: Payment status is paid (via invoices or plan status)
  -- Rule 4: If session-based (sessions_total IS NOT NULL), sessions_remaining > 0
  
  -- Check 1: Does member have any plan record at all?
  IF NOT EXISTS (
    SELECT 1 FROM public.member_purchased_plans WHERE approved_member_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'This member does not have an active plan that allows this class.';
  END IF;

  -- Check 2: Check for un-expired plan
  SELECT * INTO v_plan
  FROM public.member_purchased_plans
  WHERE approved_member_id = p_member_id
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Check if plan exists but is expired
    IF EXISTS (
      SELECT 1 FROM public.member_purchased_plans
      WHERE approved_member_id = p_member_id AND valid_until < CURRENT_DATE
    ) THEN
      RAISE EXCEPTION 'This member''s plan has expired.';
    ELSE
      RAISE EXCEPTION 'This member does not have an active plan that allows this class.';
    END IF;
  END IF;

  -- Check 3: Check Payment Status
  IF EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = v_plan.invoice_id AND inv.payment_status = 'due'
  ) THEN
    RAISE EXCEPTION 'Payment must be completed before booking classes.';
  END IF;

  -- Check 4 & 5: Sessions Remaining check if plan is session-based
  IF v_plan.sessions_total IS NOT NULL THEN
    IF v_plan.sessions_remaining IS NULL OR v_plan.sessions_remaining <= 0 THEN
      RAISE EXCEPTION 'No remaining sessions are available on the purchased package.';
    END IF;
  END IF;

  -- E. Check Capacity and Waitlist
  SELECT COUNT(*) INTO v_current_bookings_count
  FROM public.bookings
  WHERE class_id = p_class_id AND booking_status IN ('booked', 'confirmed', 'checked_in', 'completed');

  IF v_current_bookings_count >= v_class.max_capacity THEN
    v_status := 'waitlisted';
  END IF;

  -- F. Create Booking Record
  INSERT INTO public.bookings (
    class_id,
    member_id,
    booking_status,
    purchased_plan_id,
    created_at
  ) VALUES (
    p_class_id,
    p_member_id,
    v_status,
    v_plan.id,
    NOW()
  )
  RETURNING id INTO v_new_booking_id;

  -- G. If booking is active (not waitlisted) and plan is session-based, deduct 1 session
  IF v_status <> 'waitlisted' AND v_plan.sessions_total IS NOT NULL THEN
    UPDATE public.member_purchased_plans
    SET sessions_remaining = GREATEST(0, sessions_remaining - 1)
    WHERE id = v_plan.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_new_booking_id,
    'status', v_status,
    'plan_name', v_plan.plan_name,
    'sessions_remaining', CASE WHEN v_plan.sessions_total IS NOT NULL THEN GREATEST(0, v_plan.sessions_remaining - 1) ELSE NULL END
  );
END;
$$;

-- 4. SERVER-SIDE RPC FUNCTION TO CANCEL BOOKING & RESTORE SESSION
CREATE OR REPLACE FUNCTION public.cancel_member_class_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking RECORD;
  v_plan RECORD;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF v_booking.booking_status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Booking already cancelled.');
  END IF;

  -- Update booking status to cancelled
  UPDATE public.bookings
  SET booking_status = 'cancelled'
  WHERE id = p_booking_id;

  -- Restore 1 session if plan is session-based and booking was active (not waitlisted)
  IF v_booking.purchased_plan_id IS NOT NULL AND v_booking.booking_status <> 'waitlisted' THEN
    SELECT * INTO v_plan FROM public.member_purchased_plans WHERE id = v_booking.purchased_plan_id;
    IF FOUND AND v_plan.sessions_total IS NOT NULL THEN
      UPDATE public.member_purchased_plans
      SET sessions_remaining = LEAST(sessions_total, sessions_remaining + 1)
      WHERE id = v_plan.id;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Booking cancelled successfully.');
END;
$$;
