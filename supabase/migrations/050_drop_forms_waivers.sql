-- Migration 050: Revert Forms & Waivers (per user request)
-- Drops the tables created in 049

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Members can manage own submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admins manage form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Anyone can view form fields" ON public.form_fields;
DROP POLICY IF EXISTS "Admins manage forms" ON public.forms;
DROP POLICY IF EXISTS "Anyone can view active forms" ON public.forms;

DROP TRIGGER IF EXISTS trg_forms_updated_at ON public.forms;

DROP TABLE IF EXISTS public.form_submissions CASCADE;
DROP TABLE IF EXISTS public.form_fields CASCADE;
DROP TABLE IF EXISTS public.forms CASCADE;

DROP FUNCTION IF EXISTS public.touch_forms_updated_at();
