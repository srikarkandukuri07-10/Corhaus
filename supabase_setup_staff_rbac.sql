-- =============================================================================
-- CORHAUS STUDIO SETUP: STAFF & ROLE-BASED ACCESS CONTROL (RBAC) SEEDING SCRIPT
-- =============================================================================

-- 1. Create staff_members Table if not exists
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

CREATE INDEX IF NOT EXISTS idx_staff_full_name ON public.staff_members (full_name);
CREATE INDEX IF NOT EXISTS idx_staff_phone_number ON public.staff_members (phone_number);
CREATE INDEX IF NOT EXISTS idx_staff_role ON public.staff_members (role);
CREATE INDEX IF NOT EXISTS idx_staff_employment_status ON public.staff_members (employment_status);

-- 2. Create RBAC Tables if not exist
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module TEXT NOT NULL,
    action_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(staff_id, role_id)
);

-- 3. Seed Roles
INSERT INTO public.roles (name, description, is_default)
VALUES 
  ('Owner', 'Full system control with all permissions enabled.', true),
  ('Manager', 'Manages daily studio operations, members, staff, classes, and billing.', true),
  ('Receptionist', 'Front-desk operations, member check-ins, trials, and billing creation.', true),
  ('Trainer', 'Class scheduling, attendance tracking, and personal training sessions.', true)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 4. Seed Permissions
INSERT INTO public.permissions (module, action_key, name, description)
VALUES
  -- Dashboard
  ('Dashboard', 'dashboard.view', 'View Dashboard', 'View overview dashboard metrics and performance cards'),
  ('Dashboard', 'dashboard.analytics', 'View Revenue Metrics', 'Access detailed financial and revenue analytics widgets'),

  -- Members
  ('Members', 'members.view', 'View Member List', 'View member directory and active subscriber lists'),
  ('Members', 'members.details', 'View Member Details', 'View detailed member profiles and membership history'),
  ('Members', 'members.add', 'Add New Members', 'Register new members into the studio system'),
  ('Members', 'members.edit', 'Edit Member Information', 'Modify existing member personal and plan information'),
  ('Members', 'members.delete', 'Delete Members', 'Remove member profiles from system'),
  ('Members', 'members.history', 'View Attendance History', 'Inspect detailed member check-in and class booking logs'),
  ('Members', 'members.trial', 'Create & Manage Trial Members', 'Add and manage potential member trial sessions'),

  -- Staff & Trainers
  ('Staff', 'staff.view', 'View Staff List', 'View staff and trainer directory'),
  ('Staff', 'staff.add', 'Add Staff Members', 'Create new staff and trainer records'),
  ('Staff', 'staff.edit', 'Edit Staff Details', 'Modify staff profile, salary, and contact information'),
  ('Staff', 'staff.delete', 'Delete Staff', 'Remove staff records from system'),
  ('Staff', 'staff.manage_rbac', 'Manage Roles & Permissions', 'Configure system roles and permission access settings'),

  -- Billing & Invoices
  ('Billing', 'billing.view', 'View Billing', 'View billing dashboard and invoice history'),
  ('Billing', 'billing.create', 'Create Bills', 'Generate new invoices and record payments'),
  ('Billing', 'billing.apply_discounts', 'Apply Discounts', 'Apply manual or percentage discounts on invoices'),
  ('Billing', 'billing.payments', 'Record Payments', 'Log partial and full payment transactions'),
  ('Billing', 'billing.delete', 'Void & Delete Bills', 'Cancel or delete existing invoices'),
  ('Billing', 'billing.export', 'Export Bills', 'Export billing statement data to Excel / CSV'),

  -- Packages & Plans
  ('Packages', 'packages.view', 'View Packages', 'View membership and session package catalogue'),
  ('Packages', 'packages.manage', 'Manage Packages', 'Create, edit, or delete package offerings and pricing'),

  -- Classes & Schedule
  ('Classes', 'classes.view', 'View Classes', 'View class schedules and calendar sessions'),
  ('Classes', 'classes.create', 'Create Class Sessions', 'Schedule new group class sessions'),
  ('Classes', 'classes.edit', 'Edit Class Sessions', 'Modify class times, instructors, and room details'),
  ('Classes', 'classes.delete', 'Delete Class Sessions', 'Remove class sessions from schedule'),
  ('Classes', 'classes.bookings', 'Manage Class Bookings', 'Assign members and manage class booking capacity'),

  -- Attendance & Scanner
  ('Attendance', 'attendance.view', 'View Attendance Records', 'View daily check-in and check-out logs'),
  ('Attendance', 'attendance.scan', 'Scan Attendance QR', 'Scan member QR codes using attendance scanner'),
  ('Attendance', 'attendance.manual', 'Mark Attendance Manually', 'Manually record member attendance entries'),

  -- PT Scheduler
  ('PT Scheduler', 'pt.view', 'View PT Schedule', 'View personal training calendar and bookings'),
  ('PT Scheduler', 'pt.log', 'Log & Create PT Sessions', 'Record new personal training sessions'),
  ('PT Scheduler', 'pt.edit', 'Edit PT Sessions', 'Modify PT session times and details'),
  ('PT Scheduler', 'pt.cancel', 'Cancel PT Sessions', 'Cancel scheduled PT sessions with credit return'),
  ('PT Scheduler', 'pt.assign', 'Assign Trainers', 'Assign personal trainers to members'),

  -- Reports & Analytics
  ('Reports', 'reports.view', 'View Reports', 'View executive analytics and business performance reports'),
  ('Reports', 'reports.export', 'Export Reports', 'Export analytics reports to Excel and CSV'),

  -- Expenses
  ('Expenses', 'expenses.view', 'View Expenses', 'View expense dashboard and expense records'),
  ('Expenses', 'expenses.create', 'Create Expenses', 'Log new business expense entries'),
  ('Expenses', 'expenses.edit', 'Edit Expenses', 'Modify existing expense records'),
  ('Expenses', 'expenses.delete', 'Delete Expenses', 'Remove expense records from system'),
  ('Expenses', 'expenses.export', 'Export Expenses', 'Export expense records to Excel'),

  -- Support Center
  ('Support', 'support.view', 'View Tickets', 'View member support tickets'),
  ('Support', 'support.reply', 'Reply to Tickets', 'Send responses on support tickets'),
  ('Support', 'support.close', 'Close Tickets', 'Mark support tickets as resolved')
ON CONFLICT (action_key) DO UPDATE SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module = EXCLUDED.module;

-- 5. Map permissions to roles

-- OWNER: gets all permissions (wildcard)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Owner'
ON CONFLICT DO NOTHING;

-- MANAGER: gets all permissions except staff deletion/RBAC configuration
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Manager' AND p.action_key NOT IN ('staff.delete', 'staff.manage_rbac')
ON CONFLICT DO NOTHING;

-- RECEPTIONIST: gets front-desk operations, member management, billing, and support
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Receptionist' AND p.action_key IN (
  'dashboard.view', 'members.view', 'members.details', 'members.add', 'members.edit', 'members.history', 'members.trial',
  'billing.view', 'billing.create', 'billing.apply_discounts', 'billing.payments',
  'classes.view', 'classes.bookings', 'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'support.view', 'support.reply'
)
ON CONFLICT DO NOTHING;

-- TRAINER: gets scheduler, class creation, attendance tracking
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Trainer' AND p.action_key IN (
  'dashboard.view', 'classes.view', 'classes.create', 'classes.edit', 'classes.bookings',
  'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'pt.log', 'pt.edit', 'pt.cancel'
)
ON CONFLICT DO NOTHING;

-- 6. Insert actual staff members matching the real registered auth users
INSERT INTO public.staff_members (
  full_name, phone_number, email, role, designation, location, employment_status, specialization, monthly_salary
)
VALUES
  ('vivek alladi', '9876543210', 'vkalladi@gmail.com', 'Owner', 'Studio Owner', 'Main Studio', 'Active', 'Management', 150000),
  ('Sri Saranya', '9876543211', 'srimylavarapu99@gmail.com', 'Manager', 'Studio Manager', 'Main Studio', 'Active', 'Operations', 85000),
  ('Ananya Verma', '7032470766', 'manager@corhaus.com', 'Manager', 'Studio Manager', 'Main Studio', 'Active', 'Operations', 85000),
  ('Reena', '9876500003', 'kandukuriashok345@gmail.com', 'Receptionist', 'Front Desk Executive', 'Main Studio', 'Active', 'Member Relations', 45000),
  ('Karan Kapoor', '9876500004', 'trainer@corhaus.com', 'Trainer', 'Senior Pilates Instructor', 'Main Studio', 'Active', 'Reformer Pilates', 65000)
ON CONFLICT (phone_number) DO UPDATE SET 
  role = EXCLUDED.role,
  designation = EXCLUDED.designation,
  email = EXCLUDED.email,
  employment_status = EXCLUDED.employment_status;

-- 7. Map staff members to their staff_roles
INSERT INTO public.staff_roles (staff_id, role_id)
SELECT s.id, r.id
FROM public.staff_members s
JOIN public.roles r ON r.name = s.role
ON CONFLICT (staff_id, role_id) DO NOTHING;
