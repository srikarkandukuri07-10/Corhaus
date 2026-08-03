-- Migration 036: Complete Role-Based Access Control (RBAC) System

-- 1. Roles table
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  action_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Role Permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- 4. Staff Roles mapping table
CREATE TABLE IF NOT EXISTS public.staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff_members(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Roles
INSERT INTO public.roles (name, description, is_default)
VALUES 
  ('Owner', 'Full system control with all permissions enabled.', true),
  ('Manager', 'Manages daily studio operations, members, staff, classes, and billing.', true),
  ('Receptionist', 'Front-desk operations, member check-ins, trials, and billing creation.', true),
  ('Trainer', 'Class scheduling, attendance tracking, and personal training sessions.', true)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Seed Permissions for Corhaus Dashboard Modules
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

-- Automatically grant ALL permissions to the 'Owner' role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Owner'
ON CONFLICT DO NOTHING;

-- Grant default permissions for Manager role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.action_key NOT IN ('staff.delete', 'staff.manage_rbac')
WHERE r.name = 'Manager'
ON CONFLICT DO NOTHING;

-- Grant default permissions for Receptionist role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.action_key IN (
  'dashboard.view', 'members.view', 'members.details', 'members.add', 'members.edit', 'members.history', 'members.trial',
  'billing.view', 'billing.create', 'billing.apply_discounts', 'billing.payments',
  'classes.view', 'classes.bookings', 'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'support.view', 'support.reply'
)
WHERE r.name = 'Receptionist'
ON CONFLICT DO NOTHING;

-- Grant default permissions for Trainer role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.action_key IN (
  'dashboard.view', 'classes.view', 'classes.create', 'classes.edit', 'classes.bookings',
  'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'pt.log', 'pt.edit', 'pt.cancel'
)
WHERE r.name = 'Trainer'
ON CONFLICT DO NOTHING;

-- Clean up staff named "Rahul" and insert 4 dummy staff members corresponding to each role
DELETE FROM public.staff_members WHERE LOWER(full_name) LIKE '%rahul%';

INSERT INTO public.staff_members (
  full_name, phone_number, email, role, designation, location, employment_status, specialization, monthly_salary
)
VALUES
  ('Vikram Oberoi', '9876500001', 'owner@corhaus.com', 'Owner', 'Studio Owner', 'Main Studio', 'Active', 'Management', 150000),
  ('Ananya Verma', '9876500002', 'manager@corhaus.com', 'Manager', 'Studio Manager', 'Main Studio', 'Active', 'Operations', 85000),
  ('Priya Sharma', '9876500003', 'reception@corhaus.com', 'Receptionist', 'Front Desk Executive', 'Main Studio', 'Active', 'Member Relations', 45000),
  ('Karan Kapoor', '9876500004', 'trainer@corhaus.com', 'Trainer', 'Senior Pilates Instructor', 'Main Studio', 'Active', 'Reformer Pilates', 65000)
ON CONFLICT (phone_number) DO UPDATE SET 
  role = EXCLUDED.role,
  designation = EXCLUDED.designation,
  email = EXCLUDED.email;

-- Map staff members to their staff_roles
INSERT INTO public.staff_roles (staff_id, role_id)
SELECT s.id, r.id
FROM public.staff_members s
JOIN public.roles r ON r.name = s.role
ON CONFLICT DO NOTHING;
