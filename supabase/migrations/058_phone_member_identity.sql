-- ============================================================================
-- Migration 058: Phone-based member identity linking
-- ============================================================================
-- Many members were migrated from MyGymDesk without an email address, so
-- `approved_members.email` is NULL for them and email-only login cannot ever
-- resolve their row. This migration adds the plumbing to identify those members
-- by PHONE instead.
--
-- Design notes
-- ------------
-- * phone_normalized is a stored, indexed 10-digit form. Doing the comparison in
--   SQL means we never have to scan the table in application code, and the
--   lookup is a single index hit regardless of how numbers were typed
--   (10-digit, +91, 91-, 0-prefixed or 12-digit seeded values all collapse).
--
-- * The index is deliberately NOT unique. Real studios have households sharing
--   a number, and a failed migration on production is far worse than a
--   duplicate. Ambiguity is handled in the application: if more than one active
--   member matches, the link is refused and staff are asked to sort it out.
--
-- * member_identity_links is the audit trail: which auth account was paired with
--   which member, when, and by what route. Every attempt is recorded, including
--   refusals.
--
-- Additive only: adds one column, one index and one table. No existing row is
-- modified except the phone_normalized backfill, which is derived data.
-- ============================================================================

-- ─── 1. Stored normalized phone ─────────────────────────────────────────────
ALTER TABLE public.approved_members
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

COMMENT ON COLUMN public.approved_members.phone_normalized IS
  'Last 10 digits of phone_number, used for identity lookups. Derived via public.normalize_phone().';

UPDATE public.approved_members
SET phone_normalized = public.normalize_phone(phone_number)
WHERE phone_normalized IS NULL
  AND phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approved_members_phone_normalized
  ON public.approved_members (phone_normalized)
  WHERE phone_normalized IS NOT NULL;

-- Supports the "active members matching this number" query the linker runs.
CREATE INDEX IF NOT EXISTS idx_approved_members_phone_active
  ON public.approved_members (phone_normalized, membership_status);


-- ─── 2. Identity link audit ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_identity_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_member_id UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  auth_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auth_email    TEXT,
  matched_on    TEXT NOT NULL CHECK (matched_on IN ('email','phone')),
  linked_phone  TEXT,
  outcome       TEXT NOT NULL CHECK (outcome IN ('linked','already_linked','refused')),
  reason        TEXT,
  source        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_identity_links_member
  ON public.member_identity_links (approved_member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_member_identity_links_auth_user
  ON public.member_identity_links (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.member_identity_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.member_identity_links FROM anon;
-- Members may read their own link history; nothing may be written by a client.
GRANT SELECT ON TABLE public.member_identity_links TO authenticated;
GRANT ALL   ON TABLE public.member_identity_links TO service_role;

DROP POLICY IF EXISTS "Members can read own identity links" ON public.member_identity_links;
CREATE POLICY "Members can read own identity links" ON public.member_identity_links
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Intentionally NO INSERT/UPDATE/DELETE policy. Rows are written by the
-- service role from the server-side linking route only, so a client (including a
-- malicious one holding a valid session) cannot forge or rewrite history.


-- ─── 3. Unique guard on non-null email ─────────────────────────────────────
-- The application resolves members with `.ilike('email', ...)` + limit(1), so a
-- duplicate email silently resolves to an arbitrary row — one member could see
-- another's data. Enforced only if the existing data is already clean, so this
-- can never abort the migration on production.
DO $$
DECLARE
  v_dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dupes
  FROM (
    SELECT lower(trim(email)) AS e
    FROM public.approved_members
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_approved_members_email_unique
      ON public.approved_members (lower(trim(email)))
      WHERE email IS NOT NULL AND trim(email) <> '';
    RAISE NOTICE 'Unique email index created (no duplicates found).';
  ELSE
    RAISE WARNING
      'Skipped the unique email index: % duplicate email value(s) exist. '
      'De-duplicate approved_members.email, then re-run this migration.', v_dupes;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';