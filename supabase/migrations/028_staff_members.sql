-- ============================================================
-- Migration 028: Staff & Trainers Management Module
-- Creates staff_members table with all fields, indexes, and RLS
-- ============================================================

-- Create staff_members table
CREATE TABLE IF NOT EXISTS public.staff_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT NOT NULL,                          -- Trainer | Front Desk | Admin | Operations | Manager | Other
    designation TEXT NOT NULL,
    location TEXT DEFAULT 'Main Studio',
    employment_status TEXT NOT NULL DEFAULT 'Active',   -- Active | Inactive
    joining_date DATE DEFAULT CURRENT_DATE,

    -- Trainer-specific fields (only relevant when role = 'Trainer')
    specialization TEXT,
    experience_years NUMERIC DEFAULT 0,
    certifications TEXT,
    classes_assigned TEXT,
    pt_available BOOLEAN DEFAULT true,
    group_class_available BOOLEAN DEFAULT true,

    -- Compensation
    monthly_salary NUMERIC DEFAULT 0,
    pt_commission NUMERIC DEFAULT 0,
    group_class_commission NUMERIC DEFAULT 0,
    payment_type TEXT DEFAULT 'Salary',          -- Salary | Commission | Salary + Commission

    -- Personal Details
    gender TEXT,
    date_of_birth DATE,
    emergency_contact_name TEXT,
    emergency_contact_number TEXT,
    address TEXT,

    -- Bank Details
    bank_name TEXT,
    account_holder_name TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    upi_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast filtering & search
CREATE INDEX IF NOT EXISTS idx_staff_full_name        ON public.staff_members (full_name);
CREATE INDEX IF NOT EXISTS idx_staff_phone_number     ON public.staff_members (phone_number);
CREATE INDEX IF NOT EXISTS idx_staff_role             ON public.staff_members (role);
CREATE INDEX IF NOT EXISTS idx_staff_employment_status ON public.staff_members (employment_status);

-- Enable Row Level Security
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can read staff records
CREATE POLICY "admin_read_staff" ON public.staff_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Only admins can insert staff records
CREATE POLICY "admin_insert_staff" ON public.staff_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: Only admins can update staff records
CREATE POLICY "admin_update_staff" ON public.staff_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Policy: No one can delete staff records (soft-delete via employment_status = 'Inactive')
-- Omitted intentionally to preserve historical records

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_staff_members_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_members_updated_at ON public.staff_members;
CREATE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON public.staff_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_members_updated_at();
