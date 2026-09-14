-- Migration 049: Forms & Waivers System
-- Complete digital forms, waivers, versioning, and consent records

-- Helper: is_admin check (already exists as public.is_admin(), fallback if missing)
DO $migration$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin') THEN
    CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $fn$
    BEGIN
      -- Fallback admin check via staff_members / ADMIN_EMAILS pattern; actual logic is in app layer
      RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner','manager'));
    END; $fn$;
  END IF;
END $migration$;

-- ── FORMS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_system_template BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forms_is_active ON public.forms(is_active);
CREATE INDEX IF NOT EXISTS idx_forms_is_required ON public.forms(is_required);

DROP TRIGGER IF EXISTS trg_forms_updated_at ON public.forms;
CREATE OR REPLACE FUNCTION public.touch_forms_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;
CREATE TRIGGER trg_forms_updated_at BEFORE UPDATE ON public.forms FOR EACH ROW EXECUTE FUNCTION public.touch_forms_updated_at();

-- ── FORM FIELDS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','textarea','yes_no','checkbox','info_text','signature')),
  label TEXT NOT NULL,
  placeholder TEXT,
  description TEXT,
  help_text TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  options JSONB, -- e.g. ["Yes","No"] for yes_no, or checkbox label in label
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_fields_form_id ON public.form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_form_fields_sort ON public.form_fields(form_id, sort_order);

-- ── FORM SUBMISSIONS (signed records) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  form_version INTEGER NOT NULL,
  -- Snapshot of form definition at time of signing (preserves historical version)
  form_snapshot JSONB NOT NULL,
  member_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email TEXT,
  member_name TEXT,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb, -- { field_id: value }
  signature_data TEXT, -- base64 data URL or storage URL
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(form_id, form_version, member_id)
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON public.form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_member_id ON public.form_submissions(member_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_member ON public.form_submissions(form_id, member_id);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- Forms: anyone authenticated can read active forms; admins manage all
DROP POLICY IF EXISTS "Anyone can view active forms" ON public.forms;
CREATE POLICY "Anyone can view active forms" ON public.forms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage forms" ON public.forms;
CREATE POLICY "Admins manage forms" ON public.forms FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Form fields: same as forms
DROP POLICY IF EXISTS "Anyone can view form fields" ON public.form_fields;
CREATE POLICY "Anyone can view form fields" ON public.form_fields FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage form fields" ON public.form_fields;
CREATE POLICY "Admins manage form fields" ON public.form_fields FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Submissions: members can read/insert own, admins read all
DROP POLICY IF EXISTS "Members can manage own submissions" ON public.form_submissions;
CREATE POLICY "Members can manage own submissions" ON public.form_submissions FOR ALL TO authenticated USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.form_submissions;
CREATE POLICY "Admins can view all submissions" ON public.form_submissions FOR SELECT TO authenticated USING (public.is_admin());

-- ── SEED: 3 System Templates (exactly as per screenshots) ───────────────

-- Helper to avoid duplicate seeding on re-run
DO $$
DECLARE
  v_health_id UUID;
  v_liability_id UUID;
  v_rules_id UUID;
BEGIN
  -- Health Declaration (PAR-Q)
  SELECT id INTO v_health_id FROM public.forms WHERE name = 'Health Declaration (PAR-Q)' LIMIT 1;
  IF v_health_id IS NULL THEN
    INSERT INTO public.forms (name, description, is_active, is_required, is_system_template, version)
    VALUES (
      'Health Declaration (PAR-Q)',
      'Physical Activity Readiness Questionnaire — required before starting any exercise program',
      true, false, true, 1
    ) RETURNING id INTO v_health_id;

    INSERT INTO public.form_fields (form_id, field_type, label, description, is_required, sort_order) VALUES
      (v_health_id, 'info_text', 'Please answer the following questions honestly. If you answer YES to any question, consult your doctor before engaging in physical activity.', '', false, 1),
      (v_health_id, 'yes_no', 'Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?', '', true, 2),
      (v_health_id, 'yes_no', 'Do you feel pain in your chest when you do physical activity?', '', true, 3),
      (v_health_id, 'yes_no', 'In the past month, have you had chest pain when you were not doing physical activity?', '', true, 4),
      (v_health_id, 'yes_no', 'Do you lose your balance because of dizziness or do you ever lose consciousness?', '', true, 5),
      (v_health_id, 'yes_no', 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?', '', true, 6),
      (v_health_id, 'yes_no', 'Is your doctor currently prescribing drugs for your blood pressure or heart condition?', '', true, 7),
      (v_health_id, 'yes_no', 'Do you know of any other reason why you should not do physical activity?', '', true, 8),
      (v_health_id, 'text', 'Doctor''s Name', '', false, 9),
      (v_health_id, 'text', 'Doctor''s Phone Number', '', false, 10),
      (v_health_id, 'checkbox', 'I declare that the above information is true and complete to the best of my knowledge.', '', true, 11),
      (v_health_id, 'signature', 'Member Signature', '', true, 12);

    -- Set placeholders for doctor fields
    UPDATE public.form_fields SET placeholder = 'Your physician''s name' WHERE form_id = v_health_id AND label = 'Doctor''s Name';
    UPDATE public.form_fields SET placeholder = 'Your physician''s contact number' WHERE form_id = v_health_id AND label = 'Doctor''s Phone Number';
  END IF;

  -- Liability Waiver (5 fields: 1 info + 3 checkboxes + 1 signature)
  SELECT id INTO v_liability_id FROM public.forms WHERE name = 'Liability Waiver' LIMIT 1;
  IF v_liability_id IS NULL THEN
    INSERT INTO public.forms (name, description, is_active, is_required, is_system_template, version)
    VALUES (
      'Liability Waiver',
      'Acknowledgment of risks and release of liability for gym activities',
      true, false, true, 1
    ) RETURNING id INTO v_liability_id;

    INSERT INTO public.form_fields (form_id, field_type, label, description, is_required, sort_order) VALUES
      (v_liability_id, 'info_text', 'ASSUMPTION OF RISK: I acknowledge that physical exercise involves inherent risks including but not limited to muscle strains, sprains, fractures, cardiac events, and other injuries. I understand that these risks exist regardless of the care and precautions taken by the gym and its staff. RELEASE OF LIABILITY: I hereby release, waive, and discharge Corhaus, its owners, employees, trainers, and agents from any and all liability, claims, demands, or causes of action arising from my use of the gym facilities, equipment, or participation in any fitness programs. INDEMNIFICATION: I agree to indemnify and hold harmless Corhaus from any loss, liability, damage, or cost incurred due to my use of any facility.', '', false, 1),
      (v_liability_id, 'checkbox', 'I acknowledge that physical exercise carries inherent risks of injury and I voluntarily assume all such risks.', '', true, 2),
      (v_liability_id, 'checkbox', 'I release this Studio, its owners, staff, and trainers from any liability for injuries sustained during my use of the facility.', '', true, 3),
      (v_liability_id, 'checkbox', 'I confirm that I am at least 18 years of age (or have parental/guardian consent) and am signing this waiver voluntarily.', '', true, 4),
      (v_liability_id, 'signature', 'Member Signature', '', true, 5);
  END IF;

  -- Studio Rules & Code of Conduct (4 fields: 1 info + 2 checkboxes + 1 signature)
  SELECT id INTO v_rules_id FROM public.forms WHERE name = 'Studio Rules & Code of Conduct' LIMIT 1;
  IF v_rules_id IS NULL THEN
    INSERT INTO public.forms (name, description, is_active, is_required, is_system_template, version)
    VALUES (
      'Studio Rules & Code of Conduct',
      'Facility rules and member code of conduct agreement',
      true, false, true, 1
    ) RETURNING id INTO v_rules_id;

    INSERT INTO public.form_fields (form_id, field_type, label, description, is_required, sort_order) VALUES
      (v_rules_id, 'info_text', 'STUDIO RULES & CODE OF CONDUCT: 1. Proper Studio attire and clean shoes are mandatory at all times. 2. Wipe down equipment after use with provided sanitizer. 3. Re-rack all equipment and return to designated areas. 4. No use of mobile phones in the workout area. 5. No personal training by non-staff trainers on the premises. 6. Report any equipment malfunction to staff immediately. 7. Management reserves the right to revoke membership for rule violations. 8. Personal belongings must be stored in lockers — the studio is not responsible for lost items. 9. Members must carry their membership card/ID at all times. 10. Abusive behavior toward staff or other members will not be tolerated.', '', false, 1),
      (v_rules_id, 'checkbox', 'I have read and understood all the gym rules listed above and agree to follow them at all times.', '', true, 2),
      (v_rules_id, 'checkbox', 'I understand that repeated violation of these rules may result in suspension or termination of my membership without refund.', '', true, 3),
      (v_rules_id, 'signature', 'Member Signature', '', true, 4);
  END IF;
END $$;
