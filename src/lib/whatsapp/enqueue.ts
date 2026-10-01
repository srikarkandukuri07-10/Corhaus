// Outbox writer.
//
// This module is the ONLY place that creates whatsapp_message_jobs rows from
// business events. Two hard rules:
//
//   1. It never throws into the caller's critical path. A booking must succeed
//      even if WhatsApp is offline (section 26 / 38). Failures are logged and
//      reflected in the returned result.
//   2. Idempotency is enforced by the UNIQUE constraint on idempotency_key, so
//      a retried request, a double click or two overlapping code paths cannot
//      produce two messages.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeIndianPhone } from "./phone";
import {
  firstName,
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  renderTemplate,
  TemplateRenderError,
  validateTemplateBody,
  type TemplateContext,
} from "./templates";
import type { TemplateKey } from "./types";

let cachedService: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cachedService) return cachedService;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured.");
  }
  cachedService = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedService;
}

export interface EnqueueSuccess {
  ok: true;
  jobId: string;
  /** False when the idempotency key already existed, i.e. we did not duplicate. */
  created: boolean;
  recipientPhone: string;
}

export interface EnqueueFailure {
  ok: false;
  /** Human-readable, safe to surface in the admin UI. */
  reason: string;
  /** Distinguishes "already handled" from "genuinely broken" for logging. */
  kind: "duplicate" | "not_eligible" | "template" | "phone" | "database";
}

export type EnqueueResult = EnqueueSuccess | EnqueueFailure;

export interface EnqueueInput {
  templateKey: TemplateKey;
  /**
   * approved_members.id. Preferred.
   */
  approvedMemberId?: string | null;
  /**
   * auth.users.id, used only when the caller has no approved_members row.
   * Resolved to an approved member by email.
   */
  authUserId?: string | null;
  authUserEmail?: string | null;
  bookingId?: string | null;
  classId?: string | null;
  /**
   * Unique per logical message. Convention:
   *   event    -> `${bookingId}:${templateKey}`
   *   reminder -> `reminder:${bookingId}:${classDate}`
   *   test     -> `test:${memberId}:${nonce}`
   */
  idempotencyKey: string;
  scheduledFor?: string;
  triggerType?: "event" | "reminder" | "test";
  /** Overrides the rendered body. Used by test sends. */
  messageBodyOverride?: string;
}

/**
 * Loads everything the template engine may need for one member + optional
 * booking/class, straight from the production tables. No values are invented:
 * anything genuinely absent is reported as a resolution failure.
 */
export interface LoadedTemplateContext {
  ok: true;
  context: TemplateContext;
  memberId: string;
  phone: string;
  locationId: string | null;
  booking: { id: string; class_id: string | null; booking_status: string } | null;
}

async function loadContext(
  supabase: SupabaseClient,
  input: EnqueueInput
): Promise<LoadedTemplateContext | EnqueueFailure> {
  let memberQuery = supabase
    .from("approved_members")
    .select("id, full_name, email, phone_number, membership_status, location_id");

  if (input.approvedMemberId) {
    memberQuery = memberQuery.eq("id", input.approvedMemberId);
  } else if (input.authUserEmail) {
    memberQuery = memberQuery.ilike("email", input.authUserEmail);
  } else if (input.authUserId) {
    memberQuery = memberQuery.eq("id", input.authUserId);
  } else {
    return { ok: false, kind: "not_eligible", reason: "No member reference supplied." };
  }

  const { data: member, error: memberErr } = await memberQuery.maybeSingle();
  if (memberErr) {
    return { ok: false, kind: "database", reason: `Member lookup failed: ${memberErr.message}` };
  }
  if (!member) {
    return { ok: false, kind: "not_eligible", reason: "Member not found." };
  }
  // Eligibility (section 24). Frozen/cancelled members are not messaged.
  if ((member.membership_status || "").toLowerCase() !== "active") {
    return {
      ok: false,
      kind: "not_eligible",
      reason: `Membership is ${member.membership_status || "unknown"}; message not sent.`,
    };
  }

  const phone = normalizeIndianPhone(member.phone_number);
  if (!phone.ok) {
    return { ok: false, kind: "phone", reason: phone.reason };
  }

  const context: TemplateContext = {
    member_name: member.full_name,
    member_first_name: firstName(member.full_name),
    membership_status: member.membership_status,
  };

  let locationId: string | null = member.location_id ?? null;
  let booking: { id: string; class_id: string | null; booking_status: string } | null = null;

  if (input.bookingId) {
    const { data: b, error: bErr } = await supabase
      .from("bookings")
      .select("id, class_id, booking_status, member_id")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (bErr) {
      return { ok: false, kind: "database", reason: `Booking lookup failed: ${bErr.message}` };
    }
    if (!b) {
      return { ok: false, kind: "not_eligible", reason: "Booking not found." };
    }
    booking = b as { id: string; class_id: string | null; booking_status: string };

    // Ownership: never message about someone else's booking.
    //
    // bookings.member_id references profiles(id) (migration 001), but
    // /api/member/book also writes approved_members.id and falls back to it on
    // an FK error — so both id domains occur in that column. Resolve the
    // member's auth uid by email and accept either, exactly as the rest of the
    // app does with `.or(member_id.eq.<uid>, member_id.eq.<amId>)`.
    const { data: memberProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", member.email as string)
      .maybeSingle();

    const validMemberIds = [member.id as string, (memberProfile?.id as string) ?? null]
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    if (validMemberIds.length === 0 || !validMemberIds.includes(b.member_id)) {
      return {
        ok: false,
        kind: "not_eligible",
        reason: "Booking does not belong to this member.",
      };
    }

    context.booking_id = b.id;
    if (locationId === null) {
      const { data: bLoc } = await supabase
        .from("bookings")
        .select("location_id")
        .eq("id", b.id)
        .maybeSingle();
      locationId = (bLoc?.location_id as string | null) ?? null;
    }
  }

  const classId = input.classId || booking?.class_id || null;
  if (classId) {
    const { data: cls, error: cErr } = await supabase
      .from("classes")
      .select("id, title, instructor, class_date, class_time, location_id")
      .eq("id", classId)
      .maybeSingle();
    if (cErr) {
      return { ok: false, kind: "database", reason: `Class lookup failed: ${cErr.message}` };
    }
    if (!cls) {
      return { ok: false, kind: "not_eligible", reason: "Class not found." };
    }

    context.class_name = cls.title;
    context.trainer_name = cls.instructor;
    context.class_date = formatIstDate(cls.class_date as unknown as string);
    context.class_time = formatIstTime(cls.class_time as unknown as string);
    context.class_datetime = formatIstDateTime(
      cls.class_date as unknown as string,
      cls.class_time as unknown as string
    );

    const locId = locationId || (cls.location_id as string | null);
    if (locId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("name")
        .eq("id", locId)
        .maybeSingle();
      context.location_name = loc?.name ?? "";
      if (locationId === null) locationId = locId;
    }
  }

  return {
    ok: true,
    context,
    memberId: member.id as string,
    phone: phone.digits,
    locationId,
    booking,
  };
}

/**
 * Create one message job. Returns a result instead of throwing so callers can
 * ignore it without risking the business transaction.
 */
export async function enqueueWhatsappMessage(input: EnqueueInput): Promise<EnqueueResult> {
  const supabase = getServiceClient();

  // Resolve the template first: if it is disabled or broken, nothing is queued.
  const { data: tpl, error: tplErr } = await supabase
    .from("whatsapp_message_templates")
    .select("id, message_body, is_enabled, template_name")
    .eq("template_key", input.templateKey)
    .maybeSingle();

  if (tplErr) {
    return { ok: false, kind: "database", reason: `Template lookup failed: ${tplErr.message}` };
  }
  if (!tpl) {
    return { ok: false, kind: "template", reason: `Template "${input.templateKey}" does not exist.` };
  }
  if (!tpl.is_enabled) {
    return { ok: false, kind: "template", reason: `Template "${tpl.template_name}" is disabled.` };
  }

  const loaded = await loadContext(supabase, input);
  if (!loaded.ok) return loaded;

  const body = input.messageBodyOverride ?? (tpl.message_body as string);

  // Validate before queuing so a broken template never lands in the outbox.
  const validation = validateTemplateBody(body, input.templateKey);
  if (!validation.valid) {
    return {
      ok: false,
      kind: "template",
      reason: validation.issues.map((i) => i.message).join(" "),
    };
  }

  let messageBody: string;
  try {
    messageBody = renderTemplate(body, loaded.context);
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      return { ok: false, kind: "template", reason: err.message };
    }
    return { ok: false, kind: "template", reason: "Message could not be rendered." };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("whatsapp_message_jobs")
    .insert({
      template_key: input.templateKey,
      template_id: tpl.id,
      member_id: loaded.memberId,
      booking_id: input.bookingId ?? null,
      class_id: input.classId ?? loaded.booking?.class_id ?? null,
      location_id: loaded.locationId,
      recipient_phone: loaded.phone,
      message_body: messageBody,
      status: "PENDING",
      scheduled_for: input.scheduledFor ?? new Date().toISOString(),
      idempotency_key: input.idempotencyKey,
      trigger_type: input.triggerType ?? "event",
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    // 23505 = unique_violation -> our idempotency guard did its job.
    if (insertErr.code === "23505") {
      return {
        ok: false,
        kind: "duplicate",
        reason: "This message has already been queued.",
      };
    }
    return { ok: false, kind: "database", reason: insertErr.message };
  }

  if (!inserted) {
    // ON CONFLICT DO NOTHING path: row already exists.
    return {
      ok: false,
      kind: "duplicate",
      reason: "This message has already been queued.",
    };
  }

  return {
    ok: true,
    jobId: inserted.id as string,
    created: true,
    recipientPhone: loaded.phone,
  };
}

/**
 * Best-effort wrapper for business-event call sites. Never throws, always logs.
 * This is what gets called from the booking and cancellation routes.
 */
export async function tryEnqueueWhatsappMessage(input: EnqueueInput): Promise<void> {
  try {
    const result = await enqueueWhatsappMessage(input);
    if (result.ok) {
      console.log(
        `[whatsapp] queued ${input.templateKey} job=${result.jobId} to=${result.recipientPhone}`
      );
    } else {
      // A duplicate is normal and expected on retries — not an error condition.
      const level = result.kind === "duplicate" ? "info" : "warn";
      console[level](
        `[whatsapp] not queued ${input.templateKey}: ${result.reason} (${result.kind})`
      );
    }
  } catch (err) {
    // Section 39: never silently swallow. The booking has already committed;
    // this must not propagate.
    console.error("[whatsapp] enqueue threw (booking unaffected):", err);
  }
}

/** Cancel every still-PENDING job for a booking or class (sections 29, 30). */
export async function cancelPendingJobs(params: {
  bookingId?: string | null;
  classId?: string | null;
}): Promise<number> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("cancel_whatsapp_jobs", {
      p_booking_id: params.bookingId ?? null,
      p_class_id: params.classId ?? null,
    });
    if (error) {
      console.error("[whatsapp] cancel_pending_jobs failed:", error.message);
      return 0;
    }
    const cancelled = (data as number | null) ?? 0;
    if (cancelled > 0) {
      console.log(
        `[whatsapp] cancelled ${cancelled} pending job(s) booking=${params.bookingId ?? "-"} class=${params.classId ?? "-"}`
      );
    }
    return cancelled;
  } catch (err) {
    console.error("[whatsapp] cancel_pending_jobs threw:", err);
    return 0;
  }
}