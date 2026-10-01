// Shared types for the WhatsApp integration.
//
// The Vercel app and the worker both speak this vocabulary. Connection status
// values are the single source of truth for what the admin UI renders; the
// worker is the only thing allowed to write them, and only in response to a
// real Baileys event.

export const WHATSAPP_STATUSES = [
  "DISCONNECTED",
  "QR_REQUIRED",
  "QR_READY",
  "CONNECTING",
  "CONNECTED",
  "AUTHENTICATED",
  "LOGGED_OUT",
  "ERROR",
] as const;

export type WhatsappStatus = (typeof WHATSAPP_STATUSES)[number];

export const JOB_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "FAILED",
  "CANCELLED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const TEMPLATE_KEYS = [
  "booking_confirmation",
  "booking_cancellation",
  "class_reminder",
  "waitlist_promotion",
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Every placeholder the template engine can resolve. */
export const TEMPLATE_VARIABLES = [
  "member_name",
  "member_first_name",
  "class_name",
  "class_date",
  "class_time",
  "class_datetime",
  "trainer_name",
  "location_name",
  "booking_id",
  "membership_status",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/**
 * Which variables each event can actually supply. The UI uses this so an admin
 * is never offered a placeholder that would fail at send time (section 12:
 * "Only expose variables that actually exist in the relevant database records").
 */
export const TEMPLATE_VARIABLES_BY_KEY: Record<TemplateKey, TemplateVariable[]> = {
  booking_confirmation: [
    "member_name",
    "member_first_name",
    "class_name",
    "class_date",
    "class_time",
    "class_datetime",
    "trainer_name",
    "location_name",
    "booking_id",
    "membership_status",
  ],
  booking_cancellation: [
    "member_name",
    "member_first_name",
    "class_name",
    "class_date",
    "class_time",
    "class_datetime",
    "trainer_name",
    "location_name",
    "booking_id",
    "membership_status",
  ],
  class_reminder: [
    "member_name",
    "member_first_name",
    "class_name",
    "class_date",
    "class_time",
    "class_datetime",
    "trainer_name",
    "location_name",
    "booking_id",
    "membership_status",
  ],
  waitlist_promotion: [
    "member_name",
    "member_first_name",
    "class_name",
    "class_date",
    "class_time",
    "class_datetime",
    "trainer_name",
    "location_name",
    "booking_id",
    "membership_status",
  ],
};

export interface WhatsappSettings {
  id: string;
  enabled: boolean;
  connection_status: WhatsappStatus;
  connected_phone: string | null;
  connected_at: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  current_qr: string | null;
  qr_expires_at: string | null;
  worker_heartbeat_at: string | null;
  worker_id: string | null;
  reminder_enabled: boolean;
  reminder_minutes: number;
  max_send_attempts: number;
  updated_at: string;
  updated_by: string | null;
}

export interface WhatsappTemplate {
  id: string;
  template_key: TemplateKey;
  template_name: string;
  message_body: string;
  description: string | null;
  is_enabled: boolean;
  offset_minutes: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface WhatsappJob {
  id: string;
  template_key: string;
  member_id: string;
  booking_id: string | null;
  class_id: string | null;
  location_id: string | null;
  recipient_phone: string;
  message_body: string;
  status: JobStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  scheduled_for: string;
  idempotency_key: string;
  trigger_type: "event" | "reminder" | "test";
  created_at: string;
}

/** Safe shape sent to the browser. Never includes auth material. */
export interface WhatsappPublicState {
  connection_status: WhatsappStatus;
  enabled: boolean;
  connected_phone: string | null;
  connected_at: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  qr: string | null;
  qr_expires_at: string | null;
  worker_online: boolean;
  worker_heartbeat_at: string | null;
  reminder_enabled: boolean;
  reminder_minutes: number;
  max_send_attempts: number;
}