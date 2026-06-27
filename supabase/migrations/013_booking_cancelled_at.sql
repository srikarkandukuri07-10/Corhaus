-- CORHAUS PILATES PLATFORM - Booking Cancellation Timestamp
-- ============================================================

-- Step 1: Add cancelled_at column to bookings table
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Step 2: Backfill existing cancelled bookings with creation date as default
UPDATE public.bookings
SET cancelled_at = created_at
WHERE booking_status = 'cancelled' AND cancelled_at IS NULL;

-- Step 3: Create trigger function to automatically manage cancelled_at timestamp
CREATE OR REPLACE FUNCTION public.handle_booking_cancelled_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.booking_status = 'cancelled' AND (OLD.booking_status IS NULL OR OLD.booking_status = 'booked') THEN
    NEW.cancelled_at := NOW();
  ELSIF NEW.booking_status = 'booked' AND OLD.booking_status = 'cancelled' THEN
    NEW.cancelled_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 4: Create BEFORE INSERT OR UPDATE trigger
DROP TRIGGER IF EXISTS on_booking_status_change ON public.bookings;
CREATE TRIGGER on_booking_status_change
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_cancelled_at();
