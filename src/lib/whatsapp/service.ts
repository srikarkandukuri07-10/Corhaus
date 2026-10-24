/* eslint-disable @typescript-eslint/no-explicit-any */
// WhatsApp Meta Cloud API service module (server-only)
//
// Sends templates and free text via Meta Cloud API, manages dry-run mode,
// enforces the 24-hour reply window, and records all outbound messages in Postgres.

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { normalizeIndianPhone, matchMemberByPhone } from "./phone";
import {
  type DashboardEvent,
  getTemplateConfig,
} from "./templates";

export interface SendResult {
  success: boolean;
  status: "dry_run" | "sent" | "failed";
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SendTemplateOptions {
  buttonUrlParam?: string;
}

let serviceClient: any = null;

export function getServiceClient(): any {
  if (serviceClient) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service credentials are not configured.");
  }
  serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return serviceClient;
}

export function isWhatsAppSendingEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

export function getGraphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
}

/**
 * Timing-safe HMAC-SHA256 signature verification for Meta webhook payloads.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret = process.env.WHATSAPP_APP_SECRET
): boolean {
  if (!signatureHeader || !secret) return false;

  const cleanSignature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expectedSignature, "hex");
    const actualBuf = Buffer.from(cleanSignature, "hex");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch (err) {
    console.error("[whatsapp] Signature verification error:", err);
    return false;
  }
}

/**
 * Status hierarchy rules to ensure we never downgrade a message status
 * (e.g. read must not return to delivered, delivered must not return to sent).
 */
export function shouldUpdateMessageStatus(
  currentStatus: string,
  newStatus: string
): boolean {
  // If already read, never downgrade
  if (currentStatus === "read") return false;

  // If already delivered, do not go back to sent or queued
  if (currentStatus === "delivered" && (newStatus === "sent" || newStatus === "queued")) {
    return false;
  }

  // Same status requires no update
  if (currentStatus === newStatus) return false;

  // Never overwrite delivered or read with failed if delivery already succeeded
  if (newStatus === "failed" && (currentStatus === "delivered" || currentStatus === "read")) {
    return false;
  }

  return true;
}

/**
 * Checks whether the 24-hour reply window is currently open for a phone number.
 */
export async function checkReplyWindow(
  toPhone: string,
  supabase = getServiceClient()
): Promise<{ allowed: boolean; remainingHours: number; lastInboundAt: string | null }> {
  const norm = normalizeIndianPhone(toPhone);
  if (!norm.ok) {
    return { allowed: false, remainingHours: 0, lastInboundAt: null };
  }

  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("last_inbound_at")
    .eq("phone", norm.digits)
    .maybeSingle();

  if (!conv || !conv.last_inbound_at) {
    return { allowed: false, remainingHours: 0, lastInboundAt: null };
  }

  const lastInboundTime = new Date(conv.last_inbound_at).getTime();
  const now = Date.now();
  const diffMs = now - lastInboundTime;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  if (diffMs > twentyFourHoursMs) {
    return { allowed: false, remainingHours: 0, lastInboundAt: conv.last_inbound_at };
  }

  const remainingHours = Math.max(1, Math.floor((twentyFourHoursMs - diffMs) / (60 * 60 * 1000)));
  return { allowed: true, remainingHours, lastInboundAt: conv.last_inbound_at };
}

/**
 * Sends a WhatsApp template message using Meta Cloud API.
 * Never throws into calling business flows.
 */
export async function sendTemplate(
  event: DashboardEvent,
  toPhone: string,
  params: Record<string, string>,
  options?: SendTemplateOptions,
  supabase = getServiceClient()
): Promise<SendResult> {
  const norm = normalizeIndianPhone(toPhone);
  if (!norm.ok) {
    console.warn(`[whatsapp] sendTemplate refused: invalid phone "${toPhone}" (${norm.reason})`);
    return {
      success: false,
      status: "failed",
      errorCode: "INVALID_PHONE",
      errorMessage: norm.reason,
    };
  }

  const digits = norm.digits;
  const member = await matchMemberByPhone(supabase, digits);

  // Validate template configuration from registry
  let templateConfig;
  try {
    templateConfig = getTemplateConfig(event);
  } catch (err: any) {
    console.error(`[whatsapp] Template configuration error for event "${event}":`, err.message);

    // Record the failure in whatsapp_messages
    try {
      await supabase.from("whatsapp_messages").insert({
        direction: "out",
        phone: digits,
        member_id: member?.id || null,
        type: "template",
        body: `[Template: ${event}] Not configured in Meta`,
        template_name: null,
        status: "failed",
        error_code: "TEMPLATE_NOT_CONFIGURED",
        error_message: err.message,
        wa_timestamp: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.error("[whatsapp] Failed to record unconfigured template error:", dbErr);
    }

    return {
      success: false,
      status: "failed",
      errorCode: "TEMPLATE_NOT_CONFIGURED",
      errorMessage: err.message,
    };
  }

  // Build parameters according to paramFormat ("named" | "positional")
  const components: any[] = [];
  const bodyParameters = templateConfig.params.map((paramName) => {
    const val = String(params[paramName] ?? "");
    if (templateConfig.paramFormat === "named") {
      return {
        type: "text",
        parameter_name: paramName,
        text: val,
      };
    }
    return {
      type: "text",
      text: val,
    };
  });

  components.push({
    type: "body",
    parameters: bodyParameters,
  });

  const buttonParam = options?.buttonUrlParam || templateConfig.buttonUrlParam;
  if (buttonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [{ type: "text", text: buttonParam }],
    });
  }

  // Construct readable preview for inbox/audit
  const preview = `[Template: ${templateConfig.name}] ` +
    templateConfig.params.map((p) => `${p}=${params[p] ?? ""}`).join(", ");

  // Dry-run mode: do NOT call Meta, log and save with status "dry_run"
  if (!isWhatsAppSendingEnabled()) {
    console.log(`[whatsapp:dry-run] sendTemplate "${templateConfig.name}" to ${digits}:`, preview);

    try {
      await supabase.from("whatsapp_messages").insert({
        direction: "out",
        phone: digits,
        member_id: member?.id || null,
        type: "template",
        body: preview,
        template_name: templateConfig.name,
        status: "dry_run",
        wa_timestamp: new Date().toISOString(),
      });

      await upsertConversation(supabase, digits, member?.id || null, preview);
    } catch (dbErr) {
      console.error("[whatsapp:dry-run] DB save error:", dbErr);
    }

    return {
      success: true,
      status: "dry_run",
      messageId: `dry_run_${Date.now()}`,
    };
  }

  // Live Meta Cloud API call
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = getGraphVersion();

  if (!accessToken || !phoneNumberId) {
    const msg = "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured.";
    console.error("[whatsapp]", msg);

    await supabase.from("whatsapp_messages").insert({
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "template",
      body: preview,
      template_name: templateConfig.name,
      status: "failed",
      error_code: "MISSING_CREDENTIALS",
      error_message: msg,
      wa_timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      status: "failed",
      errorCode: "MISSING_CREDENTIALS",
      errorMessage: msg,
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits,
    type: "template",
    template: {
      name: templateConfig.name,
      language: { code: templateConfig.language || "en" },
      components,
    },
  };

  try {
    let res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data = await res.json();

    // Fallback 1: Language code mismatch (Meta 132001)
    if (data.error && data.error.code === 132001) {
      const altLang = (templateConfig.language || "en") === "en" ? "en_US" : "en";
      const altPayload = {
        ...payload,
        template: {
          ...payload.template,
          language: { code: altLang },
        },
      };
      const retryRes = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(altPayload),
      });
      const retryData = await retryRes.json();
      if (retryRes.ok && !retryData.error) {
        res = retryRes;
        data = retryData;
      }
    }

    // Fallback 2: Parameter format mismatch (named vs positional)
    if (data.error && (data.error.code === 132000 || data.error.code === 100)) {
      const positionalComponents = [
        {
          type: "body",
          parameters: templateConfig.params.map((p) => ({
            type: "text",
            text: String(params[p] ?? ""),
          })),
        },
      ];
      for (const langCode of [templateConfig.language || "en", "en_US"]) {
        const altPayload = {
          ...payload,
          template: {
            name: templateConfig.name,
            language: { code: langCode },
            components: positionalComponents,
          },
        };
        const retryRes = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(altPayload),
        });
        const retryData = await retryRes.json();
        if (retryRes.ok && !retryData.error) {
          res = retryRes;
          data = retryData;
          break;
        }
      }
    }

    if (!res.ok || data.error) {
      const errCode = String(data.error?.code || res.status);
      const errMsg = data.error?.message || res.statusText || "Meta API error";
      console.error(`[whatsapp] Meta API template send failed:`, data.error);

      await supabase.from("whatsapp_messages").insert({
        direction: "out",
        phone: digits,
        member_id: member?.id || null,
        type: "template",
        body: preview,
        template_name: templateConfig.name,
        status: "failed",
        error_code: errCode,
        error_message: errMsg,
        wa_timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        status: "failed",
        errorCode: errCode,
        errorMessage: errMsg,
      };
    }

    const waMsgId = data.messages?.[0]?.id;

    await supabase.from("whatsapp_messages").insert({
      wa_message_id: waMsgId,
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "template",
      body: preview,
      template_name: templateConfig.name,
      status: "sent",
      wa_timestamp: new Date().toISOString(),
    });

    await upsertConversation(supabase, digits, member?.id || null, preview);

    return {
      success: true,
      status: "sent",
      messageId: waMsgId,
    };
  } catch (err: any) {
    console.error("[whatsapp] Network/call error in sendTemplate:", err);

    await supabase.from("whatsapp_messages").insert({
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "template",
      body: preview,
      template_name: templateConfig.name,
      status: "failed",
      error_code: "NETWORK_ERROR",
      error_message: err.message || "Network request failed",
      wa_timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      status: "failed",
      errorCode: "NETWORK_ERROR",
      errorMessage: err.message || "Network request failed",
    };
  }
}

/**
 * Sends a WhatsApp free text reply. Allowed ONLY if member inbound message was received
 * within the last 24 hours. Returns typed error without calling Meta if window is closed.
 */
export async function sendText(
  toPhone: string,
  text: string,
  supabase = getServiceClient()
): Promise<SendResult> {
  const norm = normalizeIndianPhone(toPhone);
  if (!norm.ok) {
    return {
      success: false,
      status: "failed",
      errorCode: "INVALID_PHONE",
      errorMessage: norm.reason,
    };
  }

  const digits = norm.digits;
  const member = await matchMemberByPhone(supabase, digits);

  // Check 24-hour reply window
  const windowCheck = await checkReplyWindow(digits, supabase);
  if (!windowCheck.allowed) {
    return {
      success: false,
      status: "failed",
      errorCode: "WINDOW_CLOSED",
      errorMessage:
        "24-hour reply window closed. You can reply after the member messages again.",
    };
  }

  const cleanText = text.trim();
  if (!cleanText) {
    return {
      success: false,
      status: "failed",
      errorCode: "EMPTY_TEXT",
      errorMessage: "Message text cannot be empty.",
    };
  }

  // Dry-run mode
  if (!isWhatsAppSendingEnabled()) {
    console.log(`[whatsapp:dry-run] sendText to ${digits}: ${cleanText}`);

    await supabase.from("whatsapp_messages").insert({
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "text",
      body: cleanText,
      template_name: null,
      status: "dry_run",
      wa_timestamp: new Date().toISOString(),
    });

    await upsertConversation(supabase, digits, member?.id || null, cleanText);

    return {
      success: true,
      status: "dry_run",
      messageId: `dry_run_${Date.now()}`,
    };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = getGraphVersion();

  if (!accessToken || !phoneNumberId) {
    const msg = "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured.";

    await supabase.from("whatsapp_messages").insert({
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "text",
      body: cleanText,
      template_name: null,
      status: "failed",
      error_code: "MISSING_CREDENTIALS",
      error_message: msg,
      wa_timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      status: "failed",
      errorCode: "MISSING_CREDENTIALS",
      errorMessage: msg,
    };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits,
    type: "text",
    text: { body: cleanText },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errCode = String(data.error?.code || res.status);
      const errMsg = data.error?.message || res.statusText || "Meta API error";
      console.error(`[whatsapp] Meta API text send failed:`, data.error);

      await supabase.from("whatsapp_messages").insert({
        direction: "out",
        phone: digits,
        member_id: member?.id || null,
        type: "text",
        body: cleanText,
        template_name: null,
        status: "failed",
        error_code: errCode,
        error_message: errMsg,
        wa_timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        status: "failed",
        errorCode: errCode,
        errorMessage: errMsg,
      };
    }

    const waMsgId = data.messages?.[0]?.id;

    await supabase.from("whatsapp_messages").insert({
      wa_message_id: waMsgId,
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "text",
      body: cleanText,
      template_name: null,
      status: "sent",
      wa_timestamp: new Date().toISOString(),
    });

    await upsertConversation(supabase, digits, member?.id || null, cleanText);

    return {
      success: true,
      status: "sent",
      messageId: waMsgId,
    };
  } catch (err: any) {
    console.error("[whatsapp] Network/call error in sendText:", err);

    await supabase.from("whatsapp_messages").insert({
      direction: "out",
      phone: digits,
      member_id: member?.id || null,
      type: "text",
      body: cleanText,
      template_name: null,
      status: "failed",
      error_code: "NETWORK_ERROR",
      error_message: err.message || "Network request failed",
      wa_timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      status: "failed",
      errorCode: "NETWORK_ERROR",
      errorMessage: err.message || "Network request failed",
    };
  }
}

/**
 * Helper to upsert conversation state when an outbound message is logged.
 */
async function upsertConversation(
  supabase: any,
  phone: string,
  memberId: string | null,
  preview: string
) {
  try {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("whatsapp_conversations")
      .select("phone, member_id")
      .eq("phone", phone)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("whatsapp_conversations")
        .update({
          member_id: existing.member_id || memberId,
          last_message_at: now,
          last_message_preview: preview.slice(0, 500),
          updated_at: now,
        })
        .eq("phone", phone);
    } else {
      await supabase
        .from("whatsapp_conversations")
        .insert({
          phone,
          member_id: memberId,
          last_message_at: now,
          last_message_preview: preview.slice(0, 500),
          unread_count: 0,
          created_at: now,
          updated_at: now,
        });
    }
  } catch (err) {
    console.error("[whatsapp] Failed to upsert conversation:", err);
  }
}
