-- CORHAUS PILATES PLATFORM - Fix Today's Revenue & Complete Member Deletion Clean Up
-- Migration 024: Deletes orphaned invoices/customers on member deletion
-- ========================================================================

CREATE OR REPLACE FUNCTION public.delete_member_completely(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_member_id UUID;
  v_customer_ids UUID[];
  v_invoice_ids UUID[];
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can delete members.';
  END IF;

  -- Get approved member ID
  SELECT id INTO v_member_id FROM public.approved_members WHERE LOWER(email) = LOWER(p_email);

  -- Get user ID from profiles
  SELECT id INTO v_user_id FROM public.profiles WHERE LOWER(email) = LOWER(p_email);

  -- Get associated customer IDs
  SELECT ARRAY_AGG(id) INTO v_customer_ids FROM public.customers 
  WHERE (v_member_id IS NOT NULL AND approved_member_id = v_member_id) 
     OR LOWER(email) = LOWER(p_email);

  IF v_customer_ids IS NOT NULL THEN
    -- Get associated invoice IDs
    SELECT ARRAY_AGG(id) INTO v_invoice_ids FROM public.invoices WHERE customer_id = ANY(v_customer_ids);

    IF v_invoice_ids IS NOT NULL THEN
      -- Delete invoice items & invoices
      DELETE FROM public.invoice_items WHERE invoice_id = ANY(v_invoice_ids);
      DELETE FROM public.invoices WHERE id = ANY(v_invoice_ids);
    END IF;

    -- Delete customers
    DELETE FROM public.customers WHERE id = ANY(v_customer_ids);
  END IF;

  IF v_member_id IS NOT NULL THEN
    -- Delete purchased plans, bookings & attendance
    DELETE FROM public.member_purchased_plans WHERE approved_member_id = v_member_id;
    DELETE FROM public.bookings WHERE member_id = v_member_id;
    DELETE FROM public.attendance WHERE member_id = v_member_id;

    -- Delete from approved_members
    DELETE FROM public.approved_members WHERE id = v_member_id;
  END IF;

  -- Delete from auth.users (cascades to profiles)
  IF v_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  ELSE
    DELETE FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  END IF;

  RETURN TRUE;
END;
$$;
