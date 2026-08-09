-- CORHAUS PLATFORM - Fix Bookings Check Constraint & Attendance Columns
-- Migration 038

-- 1. Add missing columns to bookings table if they do not exist
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS attendance_status TEXT DEFAULT 'pending';

-- 2. Drop legacy restrictive check constraint on booking_status if present
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_booking_status_check;

-- 3. Add updated flexible check constraint for booking_status
ALTER TABLE public.bookings ADD CONSTRAINT bookings_booking_status_check 
  CHECK (booking_status IN ('booked', 'confirmed', 'checked_in', 'completed', 'attended', 'cancelled', 'no_show', 'waitlisted'));
