-- 026: Reset class_types to just Morning and Evening Reformer Group Class
-- Safe: cascades are set, this only removes the template rows not sessions

DELETE FROM public.class_types;

INSERT INTO public.class_types (name, category, description, difficulty, duration_minutes, max_capacity, trainer, location_room, allow_member_booking, booking_opens_before_hours, booking_closes_before_hours, waitlist_enabled, cancellation_window_hours, is_active)
VALUES
  (
    'Morning Reformer Group Class',
    'Reformer Pilates',
    'Morning group reformer session. Energise your day with guided pilates.',
    'All Levels',
    60,
    10,
    'Rahul Sharma',
    'Studio Room A',
    true,
    168,
    2,
    true,
    4,
    true
  ),
  (
    'Evening Reformer Group Class',
    'Reformer Pilates',
    'Evening group reformer session. Wind down and strengthen after a long day.',
    'All Levels',
    60,
    10,
    'Rahul Sharma',
    'Studio Room A',
    true,
    168,
    2,
    true,
    4,
    true
  );
