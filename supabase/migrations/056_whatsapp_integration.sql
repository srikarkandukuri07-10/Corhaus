-- ============================================================================
-- Migration 056: WhatsApp Integration (outbox + templates + connection state)
-- ============================================================================
-- Architecture note
-- -----------------
-- A WhatsApp Web session cannot live inside the Vercel-hosted Next.js app:
-- serverless functions are ephemeral and cannot hold a persistent WebSocket or
-- filesystem-backed auth credentials. The WhatsApp process therefore runs as a
-- SEPARATE long-lived worker (see worker/ in the repo root).
--
-- Supabase is the ONLY channel between the two:
--   Vercel app  --writes--> whatsapp_message_jobs / whatsapp_commands
--   Worker      --claims--> jobs, sends via Baileys, writes status back
--   Vercel app  <--polls--- whatsapp_settings (status + pairing QR)
--
-- No WhatsApp authentication credentials are stored in this schema. Baileys
-- keeps those on the worker's own persistent volume, never in Postgres.
--
-- This migration is additive only: it creates new tables and new permission
-- rows. It does not touch members, bookings, classes, attendance or any other
-- existing table.
-- ============================================================================


-- ─── 1. Permissions ─────────────────────────────────────────────────────────
-- New action keys for the RBAC system (036_rbac_system.sql).
-- Granted to Owner + Manager only. That is deliberate: public.has_database_permission()
-- bypasses for Owner/Manager (039:80-119), so the API layer (verifyApiPermission)
-- and the RLS layer agree exactly. Widening this to Receptionist also requires
-- repairing staff_roles.user_id, which is never populated today.

INSERT INTO public.permissions (module, action_key, name, description) VALUES
  ('Integration', 'whatsapp.view',    'View WhatsApp Integration',   'View WhatsApp connection status, message templates, history and health'),
  ('Integration', 'whatsapp.manage',  'Manage WhatsApp Integration', 'Edit message templates, reminder timer, and connect/disconnect WhatsApp'),
  ('Integration', 'whatsapp.send',    'Send WhatsApp Test Messages', 'Send a test WhatsApp message to an explicitly selected member')
ON CONFLICT (action_key) DO NOTHING;

DO $$
DECLARE
  v_owner  UUID;
  v_manager UUID;
  v_perm   UUID;
BEGIN
  SELECT id INTO v_owner   FROM public.roles WHERE name = 'Owner'   LIMIT 1;
  SELECT id INTO v_manager FROM public.roles WHERE name = 'Manager' LIMIT 1;

  FOR v_perm IN
    SELECT id FROM public.permissions WHERE action_key IN ('whatsapp.view','whatsapp.manage','whatsapp.send')
  LOOP
    IF v_owner IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_owner, v_perm) ON CONFLICT DO NOTHING;
    END IF;
    IF v_manager IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_manager, v_perm) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;


-- ─── 2. Connection state (single row) ────────────────────────────────────────
-- Studio-wide, not branch-scoped: one WhatsApp number serves the whole business.
-- current_qr holds the short-lived Baileys pairing string so the admin UI can
-- render it. It is cleared the instant the session authenticates.

CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id                    TEXT PRIMARY KEY DEFAULT 'default',
  enabled               BOOLEAN NOT NULL DEFAULT false,
  connection_status     TEXT NOT NULL DEFAULT 'DISCONNECTED'
                          CHECK (connection_status IN (
                            'DISCONNECTED','QR_REQUIRED','QR_READY','CONNECTING',
                            'CONNECTED','AUTHENTICATED','LOGGED_OUT','ERROR'
                          )),
  connected_phone       TEXT,
  connected_at          TIMESTAMPTZ,
  last_connected_at     TIMESTAMPTZ,
  last_disconnected_at  TIMESTAMPTZ,
  last_error            TEXT,
  last_error_at         TIMESTAMPTZ,
  current_qr            TEXT,
  qr_expires_at         TIMESTAMPTZ,
  worker_heartbeat_at   TIMESTAMPTZ,
  worker_id             TEXT,
  -- Reminder timer (section 17). Stored here, not hardcoded.
  reminder_enabled      BOOLEAN NOT NULL DEFAULT true,
  reminder_minutes      INTEGER NOT NULL DEFAULT 45
                          CHECK (reminder_minutes BETWEEN 5 AND 1440),
  max_send_attempts     INTEGER NOT NULL DEFAULT 3
                          CHECK (max_send_attempts BETWEEN 1 AND 10),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            TEXT
);

INSERT INTO public.whatsapp_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_status ON public.whatsapp_settings (connection_status);


-- ─── 3. Command channel (Vercel -> Worker) ───────────────────────────────────
-- The app never calls the worker. It appends a command; the worker polls and
-- claims it. This keeps the app deployable on Vercel with no outbound call to
-- a process that may or may not be running.

CREATE TABLE IF NOT EXISTS public.whatsapp_commands (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command      TEXT NOT NULL CHECK (command IN ('CONNECT','DISCONNECT','RECONNECT')),
  status       TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  requested_by TEXT,
  error_message TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at   TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_commands_pending
  ON public.whatsapp_commands (status, created_at)
  WHERE status = 'PENDING';


-- ─── 4. Message templates ────────────────────────────────────────────────────
-- Studio-wide config, branch-scoped writes are not applicable. Guarded by the
-- whatsapp.* permission keys rather than branch scope.

CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key  TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  message_body  TEXT NOT NULL,
  description   TEXT,
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    TEXT
);

-- Reminder window (minutes) is per-template so the reminder interval is not
-- hardcoded and can differ per event type.
ALTER TABLE public.whatsapp_message_templates
  ADD COLUMN IF NOT EXISTS offset_minutes INTEGER;

COMMENT ON COLUMN public.whatsapp_message_templates.offset_minutes IS
  'For scheduled events: minutes before the session start to send. NULL = send immediately on the business event.';

INSERT INTO public.whatsapp_message_templates
  (template_key, template_name, description, message_body, is_enabled, offset_minutes)
VALUES
  ('booking_confirmation',
   'Booking Confirmation',
   'Sent after a class booking is successfully committed.',
   E'Hi {{member_first_name}},\n\nYour booking for {{class_name}} is confirmed.\n\nDate: {{class_date}}\nTime: {{class_time}}\nLocation: {{location_name}}\n\nSee you at Corhaus.',
   true, NULL),

  ('booking_cancellation',
   'Booking Cancellation',
   'Sent after a member cancels a class booking.',
   E'Hi {{member_first_name}},\n\nYour booking for {{class_name}} on {{class_date}} at {{class_time}} has been cancelled.\n\nYour session credit has been restored.\n\nSee you soon at Corhaus.',
   true, NULL),

  ('class_reminder',
   'Upcoming Class Reminder',
   'Sent a configurable number of minutes before the class starts.',
   E'Hi {{member_first_name}},\n\nThis is a reminder for {{class_name}}.\n\nDate: {{class_date}}\nTime: {{class_time}}\nTrainer: {{trainer_name}}\nLocation: {{location_name}}\n\nPlease arrive a few minutes early.',
   true, 45),

  ('waitlist_promotion',
   'Waitlist Promotion',
   'Sent when a waitlisted member is promoted into a class.',
   E'Hi {{member_first_name}},\n\nGood news - a spot opened up and you have been moved into {{class_name}}.\n\nDate: {{class_date}}\nTime: {{class_time}}\nLocation: {{location_name}}\n\nSee you at Corhaus.',
   true, NULL)

ON CONFLICT (template_key) DO UPDATE
  SET template_name = EXCLUDED.template_name,
      description   = EXCLUDED.description;


-- ─── 5. Message jobs / outbox ───────────────────────────────────────────────
-- One row per logical message. This table is BOTH the outbox and the message
-- log, which keeps the schema to the minimum the task allows.

CREATE TABLE IF NOT EXISTS public.whatsapp_message_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key      TEXT NOT NULL,
  template_id       UUID REFERENCES public.whatsapp_message_templates(id) ON DELETE SET NULL,
  member_id         UUID NOT NULL REFERENCES public.approved_members(id) ON DELETE CASCADE,
  booking_id        UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  class_id          UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  location_id       UUID REFERENCES public.locations(id) ON DELETE RESTRICT,

  recipient_phone   TEXT NOT NULL,
  message_body      TEXT NOT NULL,

  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','PROCESSING','SENT','FAILED','CANCELLED')),
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  last_attempt_at   TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  error_message     TEXT,
  provider_message_id TEXT,

  scheduled_for     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at        TIMESTAMPTZ,
  claimed_by        TEXT,

  -- The duplicate-prevention guarantee. UNIQUE, so a second insert for the same
  -- logical message is rejected by Postgres, not by application code. This is
  -- what makes cron retries, worker restarts and double-taps safe.
  idempotency_key   TEXT NOT NULL UNIQUE,

  -- 'event' = triggered by a business event (book/cancel).
  -- 'reminder' = created by the scheduler.
  -- 'test' = admin-initiated, never auto-retried.
  trigger_type      TEXT NOT NULL DEFAULT 'event'
                      CHECK (trigger_type IN ('event','reminder','test')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_status       ON public.whatsapp_message_jobs (status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_scheduled    ON public.whatsapp_message_jobs (scheduled_for);
CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_booking      ON public.whatsapp_message_jobs (booking_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_member       ON public.whatsapp_message_jobs (member_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_created_desc ON public.whatsapp_message_jobs (created_at DESC);
-- Supports the worker's claim query (PENDING due rows, oldest first).
CREATE INDEX IF NOT EXISTS idx_whatsapp_jobs_due
  ON public.whatsapp_message_jobs (scheduled_for)
  WHERE status = 'PENDING';


-- ─── 6. Audit log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT NOT NULL,
  actor_email TEXT,
  actor_role  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_audit_created ON public.whatsapp_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_audit_action   ON public.whatsapp_audit_log (action);


-- ─── 7. updated_at triggers ─────────────────────────────────────────────────
-- Reuses the app's existing convention (044:62-72) but pinned to an empty
-- search_path so it cannot be hijacked via a shadowed table name.

CREATE OR REPLACE FUNCTION public.set_whatsapp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_settings_updated_at ON public.whatsapp_settings;
CREATE TRIGGER trg_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated_at ON public.whatsapp_message_templates;
CREATE TRIGGER trg_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_jobs_updated_at ON public.whatsapp_message_jobs;
CREATE TRIGGER trg_whatsapp_jobs_updated_at
  BEFORE UPDATE ON public.whatsapp_message_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_whatsapp_updated_at();


-- ─── 8. Job claiming: atomic, concurrency-safe ──────────────────────────────
-- FOR UPDATE SKIP LOCKED means two workers can never claim the same row.
-- The status transition happens in the same statement as the claim, so there
-- is no window where a row is claimed but still PENDING.

CREATE OR REPLACE FUNCTION public.claim_whatsapp_jobs(
  p_limit  INTEGER DEFAULT 10,
  p_worker TEXT    DEFAULT 'worker'
)
RETURNS SETOF public.whatsapp_message_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT id
    FROM public.whatsapp_message_jobs
    WHERE status = 'PENDING'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.whatsapp_message_jobs j
  SET status        = 'PROCESSING',
      claimed_at    = NOW(),
      claimed_by    = p_worker,
      attempt_count = j.attempt_count + 1,
      last_attempt_at = NOW(),
      updated_at    = NOW()
  FROM due
  WHERE j.id = due.id
    AND j.status = 'PENDING'
  RETURNING j.*;
END;
$$;


-- ─── 9. Cancelling pending jobs (sections 29 + 30) ───────────────────────────
-- Called when a booking is cancelled or a class is cancelled. Only PENDING
-- rows are affected; a job already SENT is left alone (never try to unsend).

CREATE OR REPLACE FUNCTION public.cancel_whatsapp_jobs(
  p_booking_id UUID DEFAULT NULL,
  p_class_id   UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.whatsapp_message_jobs
  SET status = 'CANCELLED',
      error_message = 'Cancelled: the booking or class was cancelled before this message was sent.',
      updated_at = NOW()
  WHERE status = 'PENDING'
    AND ( (p_booking_id IS NOT NULL AND booking_id = p_booking_id)
       OR (p_class_id   IS NOT NULL AND class_id   = p_class_id) )
    -- A booking confirmation that has not gone out yet should still be
    -- cancelled too, so do not special-case the template here.
  ;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ─── 10. Reminder enqueue (idempotent, Asia/Kolkata aware) ──────────────────
-- Runs inside the worker on a timer, but the idempotency guarantee lives here
-- so that even two overlapping scheduler ticks cannot double-send.
--
-- The window is derived from class_date + class_time interpreted in IST
-- (UTC+05:30) and converted to a timestamptz, so it is correct regardless of
-- the database or worker server timezone.

CREATE OR REPLACE FUNCTION public.enqueue_class_reminders(
  p_offset_minutes INTEGER DEFAULT NULL
)
RETURNS TABLE (enqueued INTEGER, skipped_no_booking INTEGER, skipped_unresolvable INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tpl       public.whatsapp_message_templates%ROWTYPE;
  v_offset    INTEGER;
  v_now       TIMESTAMPTZ := NOW();
  v_window    TIMESTAMPTZ;
  v_enq       INTEGER := 0;
  v_no_booking INTEGER := 0;
  v_unres     INTEGER := 0;
  v_r         RECORD;
BEGIN
  SELECT * INTO v_tpl FROM public.whatsapp_message_templates WHERE template_key = 'class_reminder';
  IF NOT FOUND OR NOT v_tpl.is_enabled THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  v_offset := COALESCE(p_offset_minutes, v_tpl.offset_minutes, 45);
  v_offset := GREATEST(5, LEAST(COALESCE(v_offset, 45), 1440));

  -- The reminder window: [ now, now + 60s ] mapped onto the offset boundary.
  -- We select sessions whose send-time falls in the next minute, which is what
  -- makes a 60s scheduler tick safe.
  v_window := v_now + INTERVAL '1 minute';

  FOR v_r IN
    SELECT
      b.id                AS booking_id,
      am.id               AS member_id,
      COALESCE(b.location_id, c.location_id) AS location_id,
      c.id                AS class_id,
      c.title             AS class_name,
      c.instructor        AS trainer_name,
      c.class_date        AS class_date,
      c.class_time        AS class_time,
      am.phone_number     AS phone_number,
      am.full_name        AS full_name,
      am.email            AS member_email,
      am.membership_status AS membership_status,
      l.name              AS location_name
    FROM public.bookings b
    JOIN public.classes c
      ON c.id = b.class_id
     AND COALESCE(c.status, 'scheduled') = 'scheduled'
     AND COALESCE(c.is_active, true) = true
    -- bookings.member_id references profiles(id) (migration 001), but the member
    -- booking route also writes approved_members.id and falls back to it on an FK
    -- error, so BOTH id domains are present in that column in practice. The app
    -- handles this everywhere with `.or(member_id.eq.<uid>,member_id.eq.<amId>)`;
    -- the reminder query must do the same or it would silently miss every
    -- self-service booking.
    JOIN public.approved_members am
      ON b.member_id = am.id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = b.member_id
          AND lower(trim(p.email)) = lower(trim(am.email))
      )
    LEFT JOIN public.locations l
      ON l.id = COALESCE(b.location_id, c.location_id)
    WHERE b.booking_status IN ('booked','confirmed')
      AND am.membership_status = 'active'
      AND (c.class_date + c.class_time) AT TIME ZONE 'Asia/Kolkata'
          BETWEEN (v_window - (v_offset || ' minutes')::interval)
              AND (v_window - (v_offset || ' minutes')::interval) + INTERVAL '1 minute'
  LOOP
    IF v_r.phone_number IS NULL OR btrim(v_r.phone_number) = '' THEN
      v_unres := v_unres + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.whatsapp_message_jobs (
      template_key, template_id, member_id, booking_id, class_id, location_id,
      recipient_phone, message_body, status, scheduled_for, idempotency_key, trigger_type
    )
    VALUES (
      'class_reminder',
      v_tpl.id,
      v_r.member_id,
      v_r.booking_id,
      v_r.class_id,
      v_r.location_id,
      v_r.phone_number,
      '',   -- body is rendered by the worker from the live template
      'PENDING',
      v_now,
      'reminder:' || v_r.booking_id::TEXT || ':' || v_r.class_date::TEXT,
      'reminder'
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF FOUND THEN
      v_enq := v_enq + 1;
    ELSE
      -- already sent / already queued for this exact class date
      NULL;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_enq, v_no_booking, v_unres;
END;
$$;


-- ─── 11. RLS ────────────────────────────────────────────────────────────────

-- Connection state, templates, commands and audit are studio-wide: gated on the
-- whatsapp.* permission keys, no branch scope (there is only one WhatsApp number).
-- Jobs carry member data, so they are additionally branch-scoped.

ALTER TABLE public.whatsapp_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_commands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_audit_log         ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_settings          FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_commands          FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_message_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_message_jobs      FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_audit_log         FROM anon, authenticated;

GRANT SELECT                ON TABLE public.whatsapp_settings          TO authenticated;
GRANT SELECT, UPDATE        ON TABLE public.whatsapp_settings          TO authenticated;
GRANT SELECT                ON TABLE public.whatsapp_commands          TO authenticated;
GRANT INSERT                ON TABLE public.whatsapp_commands          TO authenticated;
GRANT SELECT                ON TABLE public.whatsapp_message_templates TO authenticated;
GRANT INSERT, UPDATE        ON TABLE public.whatsapp_message_templates TO authenticated;
GRANT SELECT                ON TABLE public.whatsapp_message_jobs      TO authenticated;
GRANT SELECT                ON TABLE public.whatsapp_audit_log         TO authenticated;

-- Only the worker (service_role) writes jobs. The admin app enqueues via
-- SECURITY DEFINER helper functions below or via the service role.
GRANT ALL ON TABLE public.whatsapp_settings          TO service_role;
GRANT ALL ON TABLE public.whatsapp_commands          TO service_role;
GRANT ALL ON TABLE public.whatsapp_message_templates TO service_role;
GRANT ALL ON TABLE public.whatsapp_message_jobs      TO service_role;
GRANT ALL ON TABLE public.whatsapp_audit_log         TO service_role;

-- settings
SELECT public._drop_all_policies('whatsapp_settings');
CREATE POLICY "Admins can view WhatsApp settings" ON public.whatsapp_settings
  FOR SELECT TO authenticated USING (public.has_database_permission('whatsapp.view'));
CREATE POLICY "Admins can update WhatsApp settings" ON public.whatsapp_settings
  FOR UPDATE TO authenticated
  USING (public.has_database_permission('whatsapp.manage'))
  WITH CHECK (public.has_database_permission('whatsapp.manage'));
-- No INSERT/DELETE policy: the row is seeded, and only service_role may create one.

-- commands (app writes, worker reads via service_role)
SELECT public._drop_all_policies('whatsapp_commands');
CREATE POLICY "Admins can view WhatsApp commands" ON public.whatsapp_commands
  FOR SELECT TO authenticated USING (public.has_database_permission('whatsapp.view'));
CREATE POLICY "Admins can request WhatsApp commands" ON public.whatsapp_commands
  FOR INSERT TO authenticated
  WITH CHECK (public.has_database_permission('whatsapp.manage') AND status = 'PENDING');

-- templates
SELECT public._drop_all_policies('whatsapp_message_templates');
CREATE POLICY "Admins can view WhatsApp templates" ON public.whatsapp_message_templates
  FOR SELECT TO authenticated USING (public.has_database_permission('whatsapp.view'));
CREATE POLICY "Admins can create WhatsApp templates" ON public.whatsapp_message_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.has_database_permission('whatsapp.manage'));
CREATE POLICY "Admins can update WhatsApp templates" ON public.whatsapp_message_templates
  FOR UPDATE TO authenticated
  USING (public.has_database_permission('whatsapp.manage'))
  WITH CHECK (public.has_database_permission('whatsapp.manage'));
-- Intentionally no DELETE policy: templates are keyed and referenced by jobs.

-- jobs: branch-scoped because rows contain member phone numbers
SELECT public._drop_all_policies('whatsapp_message_jobs');
CREATE POLICY "Admins can view WhatsApp jobs" ON public.whatsapp_message_jobs
  FOR SELECT TO authenticated
  USING (
    public.has_database_permission('whatsapp.view')
    AND (location_id IS NULL OR location_id IN (SELECT public.user_location_ids()))
  );
-- Members can never read these. There is deliberately no member-facing policy.

-- audit log: read-only to admins, written by service_role
SELECT public._drop_all_policies('whatsapp_audit_log');
CREATE POLICY "Admins can view WhatsApp audit log" ON public.whatsapp_audit_log
  FOR SELECT TO authenticated USING (public.has_database_permission('whatsapp.view'));


-- ─── 12. Function privileges ────────────────────────────────────────────────
-- claim/cancel/reminder run from the worker (service_role).
-- enqueue_whatsapp_job runs from the Vercel app, which connects with the
-- SERVICE ROLE key for writes. Granting EXECUTE to authenticated is unnecessary
-- and would let a member queue arbitrary messages, so it is not granted.

GRANT EXECUTE ON FUNCTION public.claim_whatsapp_jobs(INTEGER, TEXT)        TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_whatsapp_jobs(UUID, UUID)          TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_class_reminders(INTEGER)          TO service_role;

REVOKE ALL ON FUNCTION public.claim_whatsapp_jobs(INTEGER, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_whatsapp_jobs(UUID, UUID)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_class_reminders(INTEGER)     FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';