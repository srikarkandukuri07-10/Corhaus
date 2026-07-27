-- CORHAUS PILATES PLATFORM - Secure Class Booking RPCs & Fix RLS Policies
-- Migration 029: Updates book_member_class_session and cancel_member_class_booking RPCs with security checks, and corrects public.bookings RLS policies.

-- A. Update book_member_class_session RPC with caller authorization check
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
  -- 1. Security Authorization check (caller must be admin or the member themselves)
  IF NOT (
    public.is_admin() 
    OR p_member_id IN (
      SELECT id FROM public.approved_members 
      WHERE LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only book sessions for your own account.';
  END IF;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.member_purchased_plans WHERE approved_member_id = p_member_id
  ) THEN
    RAISE EXCEPTION 'This member does not have an active plan that allows this class.';
  END IF;

  SELECT * INTO v_plan
  FROM public.member_purchased_plans
  WHERE approved_member_id = p_member_id
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.member_purchased_plans
      WHERE approved_member_id = p_member_id AND valid_until < CURRENT_DATE
    ) THEN
      RAISE EXCEPTION 'This member''s plan has expired.';
    ELSE
      RAISE EXCEPTION 'This member does not have an active plan that allows this class.';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices inv
    WHERE inv.id = v_plan.invoice_id AND inv.payment_status = 'due'
  ) THEN
    RAISE EXCEPTION 'Payment must be completed before booking classes.';
  END IF;

  IF v_plan.sessions_total IS NOT NULL THEN
    IF v_plan.sessions_remaining IS NULL OR v_plan.sessions_remaining <= 0 THEN
      RAISE EXCEPTION 'No remaining sessions are available on the purchased package.';
    END IF;
  END IF;

  -- E. Check Capacity & Waitlist
  SELECT COUNT(*) INTO v_current_bookings_count
  FROM public.bookings
  WHERE class_id = p_class_id AND booking_status IN ('booked', 'confirmed', 'checked_in', 'completed');

  IF v_current_bookings_count >= v_class.max_capacity THEN
    v_status := 'waitlisted';
  END IF;

  -- F. Create Booking Record
  INSERT INTO public.bookings (
    class_id, member_id, booking_status, purchased_plan_id, created_at
  ) VALUES (
    p_class_id, p_member_id, v_status, v_plan.id, NOW()
  )
  RETURNING id INTO v_new_booking_id;

  -- G. Deduct 1 session for session-based plans
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


-- B. Update cancel_member_class_booking RPC with caller authorization check
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
  v_waitlist RECORD;
  v_promoted_booking_id UUID;
  v_class_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  -- 1. Security Authorization check (caller must be admin or the booking's owner)
  IF NOT (
    public.is_admin() 
    OR v_booking.member_id IN (
      SELECT id FROM public.approved_members 
      WHERE LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: You can only cancel your own bookings.';
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
  -- (If waitlists table exists)
  BEGIN
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

      -- Log notification / history (if booking_history table exists)
      BEGIN
        INSERT INTO public.booking_history (member_id, action, note)
        VALUES (v_waitlist.member_id, 'waitlist_promoted', 'Automatically promoted from waitlist for session ' || v_class_id);
      EXCEPTION WHEN OTHERS THEN
        -- ignore history log errors if table is not ready
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore waitlist promotion errors if table is not ready
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Booking cancelled successfully.');
END;
$$;


-- C. Update RLS policies on public.bookings to map to approved_members.id based on user profiles email
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 1. SELECT policy
DROP POLICY IF EXISTS "Members can view own bookings" ON public.bookings;
CREATE POLICY "Members can view own bookings" ON public.bookings 
  FOR SELECT TO authenticated 
  USING (
    member_id = auth.uid() 
    OR member_id IN (
      SELECT id FROM public.approved_members 
      WHERE LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    )
  );

-- 2. INSERT policy
DROP POLICY IF EXISTS "Members can insert own bookings" ON public.bookings;
CREATE POLICY "Members can insert own bookings" ON public.bookings 
  FOR INSERT TO authenticated 
  WITH CHECK (
    member_id = auth.uid() 
    OR member_id IN (
      SELECT id FROM public.approved_members 
      WHERE LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    )
  );

-- 3. UPDATE policy
DROP POLICY IF EXISTS "Members can update own bookings" ON public.bookings;
CREATE POLICY "Members can update own bookings" ON public.bookings 
  FOR UPDATE TO authenticated 
  USING (
    member_id = auth.uid() 
    OR member_id IN (
      SELECT id FROM public.approved_members 
      WHERE LOWER(TRIM(email)) = (SELECT LOWER(TRIM(email)) FROM public.profiles WHERE id = auth.uid())
    )
  );
