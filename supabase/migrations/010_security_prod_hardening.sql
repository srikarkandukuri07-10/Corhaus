-- CORHAUS PILATES PLATFORM - Production Security Hardening
-- =============================================

-- Add SECURITY DEFINER function for capacity counting
-- Members' SELECT RLS on bookings only shows own rows,
-- so COUNT(*) would always return 0 or 1 from a member client.
-- This function bypasses RLS (like is_admin()) to return the real count.
CREATE OR REPLACE FUNCTION public.get_booking_count(p_class_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.bookings
    WHERE class_id = p_class_id AND booking_status = 'booked'
  );
END;
$$;
