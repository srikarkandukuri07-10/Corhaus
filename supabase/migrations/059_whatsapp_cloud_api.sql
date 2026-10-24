-- ============================================================================
-- Migration 059: WhatsApp Meta Cloud API Integration & Inbox
-- ============================================================================
-- 1. whatsapp_messages: storage for both outbound and inbound WhatsApp messages.
-- 2. whatsapp_conversations: conversation state per phone with unread counts.
-- 3. bookings.reminder_sent_at: prevents duplicate class reminders.
-- ============================================================================

-- ─── 1. WhatsApp Messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id         TEXT UNIQUE,               -- Meta's wamid, nullable for dry-run or failed outgoing
  direction             TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  phone                 TEXT NOT NULL,              -- Digits only with country code 91, no '+'
  member_id             UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL CHECK (type IN ('text', 'template', 'image', 'audio', 'document', 'other')),
  body                  TEXT,
  template_name         TEXT,                       -- Meta template name for outbound template messages
  status                TEXT NOT NULL CHECK (status IN ('dry_run', 'queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  error_code            TEXT,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  wa_timestamp          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone ON public.whatsapp_messages (phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON public.whatsapp_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_msg_id ON public.whatsapp_messages (wa_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_member_id ON public.whatsapp_messages (member_id);

-- ─── 2. WhatsApp Conversations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  phone                 TEXT PRIMARY KEY,           -- Digits only with country code 91, no '+'
  member_id             UUID REFERENCES public.approved_members(id) ON DELETE SET NULL,
  last_inbound_at       TIMESTAMPTZ,
  last_message_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview  TEXT,
  unread_count          INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_member_id ON public.whatsapp_conversations (member_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_last_message_at ON public.whatsapp_conversations (last_message_at DESC);

-- ─── 3. Bookings reminder_sent_at Column ─────────────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder_sent_at
  ON public.bookings (reminder_sent_at)
  WHERE reminder_sent_at IS NOT NULL;

-- ─── 4. Row-Level Security ───────────────────────────────────────────────────

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_messages FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_conversations FROM anon, authenticated;

-- Service role has full access; client access is mediated by authenticated Next.js API routes
GRANT ALL ON TABLE public.whatsapp_messages TO service_role;
GRANT ALL ON TABLE public.whatsapp_conversations TO service_role;
