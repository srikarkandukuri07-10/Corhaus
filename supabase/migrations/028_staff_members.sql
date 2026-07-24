-- Migration 028: Staff & Trainers Table
-- Simple version: no RLS policies, security enforced at API layer

CREATE TABLE IF NOT EXISTS public.staff_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    email TEXT,
    role TEXT NOT NULL,
    designation TEXT NOT NULL,
    location TEXT DEFAULT 'Main Studio',
    employment_status TEXT NOT NULL DEFAULT 'Active',
    joining_date DATE DEFAULT CURRENT_DATE,
    specialization TEXT,
    experience_years NUMERIC DEFAULT 0,
    certifications TEXT,
    classes_assigned TEXT,
    pt_available BOOLEAN DEFAULT true,
    group_class_available BOOLEAN DEFAULT true,
    monthly_salary NUMERIC DEFAULT 0,
    pt_commission NUMERIC DEFAULT 0,
    group_class_commission NUMERIC DEFAULT 0,
    payment_type TEXT DEFAULT 'Salary',
    gender TEXT,
    date_of_birth DATE,
    emergency_contact_name TEXT,
    emergency_contact_number TEXT,
    address TEXT,
    bank_name TEXT,
    account_holder_name TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    upi_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_full_name         ON public.staff_members (full_name);
CREATE INDEX IF NOT EXISTS idx_staff_phone_number      ON public.staff_members (phone_number);
CREATE INDEX IF NOT EXISTS idx_staff_role              ON public.staff_members (role);
CREATE INDEX IF NOT EXISTS idx_staff_employment_status ON public.staff_members (employment_status);
