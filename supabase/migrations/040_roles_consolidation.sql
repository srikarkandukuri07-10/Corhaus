-- Consolidation of roles: Owner, Manager, Trainer, Receptionist, Other
-- Rename Front Desk to Receptionist, merge Admin/Operations to Manager.

-- 1. Insert or update default roles
INSERT INTO public.roles (name, description, is_default)
VALUES 
  ('Owner', 'Full system control with all permissions enabled.', true),
  ('Manager', 'Manages daily studio operations, members, staff, classes, and billing.', true),
  ('Receptionist', 'Front-desk operations, member check-ins, trials, and billing creation.', true),
  ('Trainer', 'Class scheduling, attendance tracking, and personal training sessions.', true),
  ('Other', 'Custom staff role with customizable permissions.', true)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 2. Consolidate staff members roles
UPDATE public.staff_members 
SET role = 'Receptionist', designation = CASE WHEN designation = 'Front Desk Executive' THEN 'Receptionist' ELSE designation END
WHERE role = 'Front Desk';

UPDATE public.staff_members 
SET role = 'Manager' 
WHERE role IN ('Admin', 'Operations');

-- 3. Delete any other roles that are not the five consolidated ones
DELETE FROM public.roles 
WHERE name NOT IN ('Owner', 'Manager', 'Trainer', 'Receptionist', 'Other');

-- 4. Set up default role-permission mappings
-- Clear existing mappings first to ensure clean state
DELETE FROM public.role_permissions;

-- Owner: All permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Owner';

-- Manager: All except staff.delete and staff.manage_rbac
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Manager' AND p.action_key NOT IN ('staff.delete', 'staff.manage_rbac');

-- Receptionist: Default front-desk permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Receptionist' AND p.action_key IN (
  'dashboard.view', 'members.view', 'members.details', 'members.add', 'members.edit', 'members.history', 'members.trial',
  'billing.view', 'billing.create', 'billing.apply_discounts', 'billing.payments',
  'classes.view', 'classes.bookings', 'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'support.view', 'support.reply'
);

-- Trainer: Default trainer permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Trainer' AND p.action_key IN (
  'dashboard.view', 'classes.view', 'classes.create', 'classes.edit', 'classes.bookings',
  'attendance.view', 'attendance.scan', 'attendance.manual',
  'pt.view', 'pt.log', 'pt.edit', 'pt.cancel'
);

-- Other: Default minimal permissions (dashboard.view only)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.action_key = 'dashboard.view'
WHERE r.name = 'Other';

-- 5. Re-align public.staff_roles mappings
DELETE FROM public.staff_roles;

INSERT INTO public.staff_roles (staff_id, role_id)
SELECT s.id, r.id
FROM public.staff_members s
JOIN public.roles r ON r.name = s.role
ON CONFLICT DO NOTHING;
