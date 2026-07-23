-- CORHAUS PILATES PLATFORM - Complete Catalogue & Auto-Assign Packages to Members
-- Migration 021: Seed all PT, Class, and Membership packages and assign to members
-- =================================================================================

-- 1. Ensure all PT Packages from screenshots exist
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('PT Packages', 'Private Duo Class (4)', '144 sessions at ₹868/session. Valid for 365 days.', 125000, NULL, 144, 365, true, 'Couple', 10),
  ('PT Packages', 'Private Duo Class (3)', '36 sessions at ₹2,056/session. Valid for 180 days.', 74000, NULL, 36, 180, true, 'Couple', 20),
  ('PT Packages', 'Private Duo Class (2)', '24 sessions at ₹2,292/session. Valid for 60 days.', 55000, NULL, 24, 60, true, 'Couple', 30),
  ('PT Packages', 'Private Duo Class', '12 sessions at ₹2,500/session. Valid for 30 days.', 30000, NULL, 12, 30, true, 'Couple', 40),
  ('PT Packages', 'Private Reformer Class (5)', '144 sessions at ₹625/session. Valid for 365 days.', 90000, NULL, 144, 365, true, NULL, 50),
  ('PT Packages', 'Private Reformer Class (4)', '72 sessions at ₹972/session. Valid for 180 days.', 70000, NULL, 72, 180, true, NULL, 60),
  ('PT Packages', 'Private Reformer Class (3)', '36 sessions at ₹1,167/session. Valid for 30 days.', 42000, NULL, 36, 30, true, NULL, 70),
  ('PT Packages', 'Private Reformer Class (2)', '24 sessions at ₹1,458/session. Valid for 30 days.', 35000, NULL, 24, 30, true, NULL, 80),
  ('PT Packages', 'Private Reformer Class', '12 sessions at ₹1,667/session. Valid for 30 days.', 20000, NULL, 12, 30, true, NULL, 90)
ON CONFLICT DO NOTHING;

-- 2. Ensure all Class Packages from screenshots exist
INSERT INTO public.billing_plan_items
  (category, name, description, price, original_price, sessions, validity_days, grants_member_dashboard_access, subcategory, sort_order)
VALUES
  ('Class Packages', 'Single Session', '1 session at ₹1,000/session. Valid for 30 days.', 1000, NULL, 1, 30, true, NULL, 10),
  ('Class Packages', 'Beginner Pack', '4 sessions at ₹1,000/session. Valid for 30 days.', 4000, NULL, 4, 30, true, NULL, 20),
  ('Class Packages', 'Trial Session', 'Try a class for just ₹500. Valid for 1 day.', 500, NULL, 1, 1, true, NULL, 5),
  ('Class Packages', 'Reformer Group Class (5)', '144 sessions at ₹333.33/session. Valid for 365 days.', 48000, NULL, 144, 365, true, 'Evening Reformer Group Class', 50),
  ('Class Packages', 'Reformer Group Class (4)', '72 sessions at ₹500/session. Valid for 180 days.', 36000, NULL, 72, 180, true, 'Evening Reformer Group Class', 60),
  ('Class Packages', 'Reformer Group Class (3)', '36 sessions at ₹625/session. Valid for 90 days.', 22500, NULL, 36, 90, true, 'Morning Reformer Group Class', 70),
  ('Class Packages', 'Reformer Group Class (2)', '24 sessions at ₹666.67/session. Valid for 60 days.', 16000, NULL, 24, 60, true, 'Morning Reformer Group Class', 80),
  ('Class Packages', 'Reformer Group Class', '12 sessions at ₹750/session. Valid for 30 days.', 9000, NULL, 12, 30, true, 'Morning Reformer Group Class', 90)
ON CONFLICT DO NOTHING;

-- 3. Auto-assign realistic packages to members without active plans
DO $$
DECLARE
  m RECORD;
  plan_rec RECORD;
  cust_id UUID;
  inv_id UUID;
  inv_item_id UUID;
  inv_num TEXT;
  used_sessions INT;
  rem_sessions INT;
  valid_days INT;
  valid_until_date DATE;
BEGIN
  FOR m IN SELECT * FROM public.approved_members LOOP
    -- Check if member already has a purchased plan
    IF NOT EXISTS (
      SELECT 1 FROM public.member_purchased_plans WHERE approved_member_id = m.id
    ) THEN

      -- Pick a random plan item based on member level or general catalogue
      SELECT * INTO plan_rec
      FROM public.billing_plan_items
      WHERE is_active = true AND grants_member_dashboard_access = true
      ORDER BY random()
      LIMIT 1;

      IF FOUND THEN
        -- 1. Create or get customer record
        SELECT id INTO cust_id FROM public.customers WHERE approved_member_id = m.id LIMIT 1;
        IF cust_id IS NULL THEN
          INSERT INTO public.customers (full_name, email, phone_number, is_walkin, approved_member_id)
          VALUES (m.full_name, m.email, m.phone_number, false, m.id)
          RETURNING id INTO cust_id;
        END IF;

        -- 2. Generate invoice
        inv_num := 'COR-' || to_char(NOW(), 'YYYY') || '-' || lpad((floor(random()*9000)+1000)::text, 4, '0');
        INSERT INTO public.invoices (
          invoice_number, customer_id, customer_name, customer_email, customer_phone,
          subtotal, discount_amount, grand_total, payment_status, payment_method, amount_paid
        ) VALUES (
          inv_num, cust_id, m.full_name, m.email, m.phone_number,
          plan_rec.price, 0, plan_rec.price, 'paid', 'UPI', plan_rec.price
        ) RETURNING id INTO inv_id;

        -- 3. Insert invoice item
        INSERT INTO public.invoice_items (
          invoice_id, billing_plan_item_id, name, category, quantity, unit_price, total_price,
          grants_member_dashboard_access, validity_days, sessions
        ) VALUES (
          inv_id, plan_rec.id, plan_rec.name, plan_rec.category, 1, plan_rec.price, plan_rec.price,
          true, plan_rec.validity_days, plan_rec.sessions
        ) RETURNING id INTO inv_item_id;

        -- 4. Compute realistic session count and validity date
        valid_days := COALESCE(plan_rec.validity_days, 60);
        valid_until_date := CURRENT_DATE + (valid_days || ' days')::INTERVAL;

        IF plan_rec.sessions IS NOT NULL THEN
          used_sessions := floor(random() * (plan_rec.sessions / 2));
          rem_sessions := plan_rec.sessions - used_sessions;
        ELSE
          rem_sessions := NULL;
        END IF;

        -- 5. Insert member_purchased_plan
        INSERT INTO public.member_purchased_plans (
          approved_member_id, invoice_id, invoice_item_id, plan_name, category,
          sessions_total, sessions_remaining, valid_from, valid_until, status
        ) VALUES (
          m.id, inv_id, inv_item_id, plan_rec.name, plan_rec.category,
          plan_rec.sessions, rem_sessions, CURRENT_DATE - INTERVAL '10 days', valid_until_date, 'active'
        );

        -- Ensure member status is active
        UPDATE public.approved_members
        SET membership_status = 'active'
        WHERE id = m.id;
      END IF;

    END IF;
  END LOOP;
END $$;
