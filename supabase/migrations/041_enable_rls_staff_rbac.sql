-- Migration 041: Enable RLS on staff_members, roles, role_permissions, permissions
-- Least-privilege: no USING(true), no anon access, service_role bypasses RLS server-side
-- Preserves functionality: server API routes use service_role (bypass RLS)
-- Browser direct access is now gated by RLS; client pages fixed to use API

-- 1. Ensure helper is_admin() is present (SECURITY DEFINER, bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- Helper: is_staff() - true if current auth user has an active staff_members record
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE lower(trim(email)) = v_email
      AND employment_status <> 'Inactive'
  ) OR public.is_admin();
END;
$$;

-- Helper: user_has_permission(action_key) - checks if current user has that permission via role
-- Owner / is_admin() always true, otherwise checks staff_members -> roles -> role_permissions
CREATE OR REPLACE FUNCTION public.user_has_permission(p_action_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_staff_role TEXT;
  v_role_id UUID;
BEGIN
  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN FALSE; END IF;

  -- Hardcoded owners (ADMIN_EMAILS) and is_admin bypass
  IF v_email IN ('srikarkandukuri07@gmail.com','vkalladi@gmail.com','kandukurisrikar10@gmail.com') THEN RETURN TRUE; END IF;
  IF public.is_admin() THEN RETURN TRUE; END IF;

  SELECT role INTO v_staff_role FROM public.staff_members
  WHERE lower(trim(email)) = v_email AND employment_status <> 'Inactive' LIMIT 1;
  IF v_staff_role IS NULL THEN RETURN FALSE; END IF;
  IF v_staff_role = 'Owner' THEN RETURN TRUE; END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = v_staff_role LIMIT 1;
  IF v_role_id IS NULL THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = v_role_id AND p.action_key = p_action_key
  );
END;
$$;

-- 2. Enable RLS on all four tables
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing permissive policies if they somehow exist (defense)
DROP POLICY IF EXISTS "Allow all" ON public.staff_members;
DROP POLICY IF EXISTS "Allow all for anon" ON public.staff_members;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.staff_members;
DROP POLICY IF EXISTS "Allow all" ON public.roles;
DROP POLICY IF EXISTS "Allow all" ON public.role_permissions;
DROP POLICY IF EXISTS "Allow all" ON public.permissions;
DROP POLICY IF EXISTS "Public read" ON public.staff_members;
DROP POLICY IF EXISTS "Public read" ON public.roles;
DROP POLICY IF EXISTS "Public read" ON public.permissions;
DROP POLICY IF EXISTS "Public read" ON public.role_permissions;

-- Ensure no leftover policies from earlier attempts
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('staff_members','roles','permissions','role_permissions') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 4. staff_members: SELECT only for active staff (least-privilege)
--    No INSERT/UPDATE/DELETE policies => denied for anon/authenticated (only service_role can write via API)
CREATE POLICY "Staff can view staff directory"
  ON public.staff_members FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- 5. roles: SELECT only for users with staff.manage_rbac (Owner)
CREATE POLICY "RBAC managers can view roles"
  ON public.roles FOR SELECT
  TO authenticated
  USING (public.user_has_permission('staff.manage_rbac'));

-- 6. permissions: SELECT only for RBAC managers
CREATE POLICY "RBAC managers can view permissions"
  ON public.permissions FOR SELECT
  TO authenticated
  USING (public.user_has_permission('staff.manage_rbac'));

-- 7. role_permissions: SELECT only for RBAC managers
CREATE POLICY "RBAC managers can view role_permissions"
  ON public.role_permissions FOR SELECT
  TO authenticated
  USING (public.user_has_permission('staff.manage_rbac'));

-- 8. Explicitly revoke any direct grants to anon/authenticated that would bypass RLS
-- (RLS already denies, but revoke for defense-in-depth)
REVOKE ALL ON TABLE public.staff_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.roles FROM anon, authenticated;
REVOKE ALL ON TABLE public.permissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.role_permissions FROM anon, authenticated;

-- Re-grant minimal SELECT to authenticated so RLS policies can be evaluated (no data without policy)
GRANT SELECT ON TABLE public.staff_members TO authenticated;
GRANT SELECT ON TABLE public.roles TO authenticated;
GRANT SELECT ON TABLE public.permissions TO authenticated;
GRANT SELECT ON TABLE public.role_permissions TO authenticated;

-- Service role retains full access via bypass (no grant needed, but ensure)
GRANT ALL ON TABLE public.staff_members TO service_role;
GRANT ALL ON TABLE public.roles TO service_role;
GRANT ALL ON TABLE public.permissions TO service_role;
GRANT ALL ON TABLE public.role_permissions TO service_role;

-- Ensure helper functions are executable
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
