-- 042: Fix class_types schema stuck on 018 minimal definition
-- 018 created class_types with only (name PK, description)
-- 025 used CREATE TABLE IF NOT EXISTS so it never added the new columns
-- This migration backfills the full schema expected by the app

-- 1. Add id column if missing and backfill
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE public.class_types SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.class_types ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.class_types ALTER COLUMN id SET NOT NULL;

-- 2. Migrate primary key from name -> id (idempotent)
DO $$
BEGIN
  -- Drop old PK if it still exists on name
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_types_pkey'
      AND conrelid = 'public.class_types'::regclass
      AND array_length(conkey, 1) = 1
      AND (SELECT attname FROM pg_attribute WHERE attrelid = 'public.class_types'::regclass AND attnum = conkey[1]) = 'name'
  ) THEN
    ALTER TABLE public.class_types DROP CONSTRAINT class_types_pkey;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_types_pkey'
      AND conrelid = 'public.class_types'::regclass
  ) THEN
    ALTER TABLE public.class_types ADD CONSTRAINT class_types_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Ensure unique on name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_types_name_key'
      AND conrelid = 'public.class_types'::regclass
  ) THEN
    ALTER TABLE public.class_types ADD CONSTRAINT class_types_name_key UNIQUE (name);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4. Add all missing columns from 025
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Reformer Pilates';
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'All Levels';
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 10;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS trainer TEXT DEFAULT 'Staff';
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS location_room TEXT DEFAULT 'Studio Room A';
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS allow_member_booking BOOLEAN DEFAULT true;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS booking_opens_before_hours INTEGER DEFAULT 168;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS booking_closes_before_hours INTEGER DEFAULT 2;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS cancellation_window_hours INTEGER DEFAULT 4;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.class_types ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill NOT NULL-ish defaults for existing rows created by 018
UPDATE public.class_types SET category = 'Reformer Pilates' WHERE category IS NULL;
UPDATE public.class_types SET difficulty = 'All Levels' WHERE difficulty IS NULL;
UPDATE public.class_types SET duration_minutes = 60 WHERE duration_minutes IS NULL;
UPDATE public.class_types SET max_capacity = 10 WHERE max_capacity IS NULL;
UPDATE public.class_types SET trainer = 'Staff' WHERE trainer IS NULL;
UPDATE public.class_types SET location_room = 'Studio Room A' WHERE location_room IS NULL;
UPDATE public.class_types SET allow_member_booking = true WHERE allow_member_booking IS NULL;
UPDATE public.class_types SET booking_opens_before_hours = 168 WHERE booking_opens_before_hours IS NULL;
UPDATE public.class_types SET booking_closes_before_hours = 2 WHERE booking_closes_before_hours IS NULL;
UPDATE public.class_types SET waitlist_enabled = true WHERE waitlist_enabled IS NULL;
UPDATE public.class_types SET cancellation_window_hours = 4 WHERE cancellation_window_hours IS NULL;
UPDATE public.class_types SET is_active = true WHERE is_active IS NULL;
UPDATE public.class_types SET created_at = NOW() WHERE created_at IS NULL;

-- 5. Ensure classes table has all columns from 023 (in case 023 was skipped)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS end_time TIME;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 15;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Reformer Pilates';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'All Levels';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS location_room TEXT DEFAULT 'Studio Room A';
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS equipment_required TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS recurring_rule TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS parent_recurring_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS class_type_id UUID REFERENCES public.class_types(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';

DO $$
BEGIN
  ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_status_check;
  ALTER TABLE public.classes ADD CONSTRAINT classes_status_check CHECK (status IN ('scheduled', 'completed', 'cancelled'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 6. Refresh PostgREST schema cache hint (no-op but ensures reload)
NOTIFY pgrst, 'reload schema';
