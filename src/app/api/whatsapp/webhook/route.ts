/* eslint-disable @typescript-eslint/no-explicit-any */
// Meta WhatsApp Cloud API Webhook Handler
//
// GET: Webhook verification handshake with Meta (hub.challenge, hub.verify_token).
// POST: Processes incoming member messages, status updates (sent, delivered, read, failed).
// Verified with HMAC-SHA256 signature (x-hub-signature-256).

import { NextResponse } from "next/server";
import {
  getServiceClient,
  verifyWebhookSignature,
  shouldUpdateMessageStatus,
  sendText,
} from "@/lib/whatsapp/service";
import { normalizeIndianPhone, matchMemberByPhone } from "@/lib/whatsapp/phone";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && token === verifyToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  // HMAC verification (timing-safe)
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[whatsapp:webhook] Rejected request with invalid signature.");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.warn("[whatsapp:webhook] Received malformed JSON payload:", err);
    // Respond 200 so Meta does not retry invalid JSON continuously
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const supabase = getServiceClient();

  // Meta sends events wrapped in entry[].changes[].value
  try {
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change?.value;
        if (!val) continue;

        // 1. Process inbound messages
        if (Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            await handleInboundMessage(supabase, msg);
          }
        }

        // 2. Process outbound message status receipts (sent, delivered, read, failed)
        if (Array.isArray(val.statuses)) {
          for (const status of val.statuses) {
            await handleStatusUpdate(supabase, status);
          }
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp:webhook] Error processing payload:", err);
  }

  // Always respond 200 quickly to Meta
  return NextResponse.json({ ok: true }, { status: 200 });
}

/**
 * Handles an incoming WhatsApp message from a member.
 * Dedupes by wa_message_id, matches member, upserts conversation state.
 */
async function handleInboundMessage(supabase: any, msg: any) {
  const waMsgId = msg.id;
  if (!waMsgId) return;

  // Deduplicate: Meta retries delivery on delays
  const { data: existing } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("wa_message_id", waMsgId)
    .maybeSingle();

  if (existing) {
    return;
  }

  // Phone from Meta message.from (e.g. "919876543210")
  const norm = normalizeIndianPhone(msg.from);
  const digits = norm.ok ? norm.digits : String(msg.from).replace(/\D/g, "");

  // Match member by last 10 digits
  const member = await matchMemberByPhone(supabase, digits);

  // Map message type and create readable content placeholder
  const rawType = msg.type || "text";
  let dbType: "text" | "template" | "image" | "audio" | "document" | "other" = "other";
  let body = "";

  switch (rawType) {
    case "text":
      dbType = "text";
      body = msg.text?.body || "";
      break;
    case "image":
      dbType = "image";
      body = msg.image?.caption ? `[Image: ${msg.image.caption}]` : "[Image]";
      break;
    case "audio":
      dbType = "audio";
      body = msg.audio?.voice ? "[Voice note]" : "[Audio]";
      break;
    case "document":
      dbType = "document";
      body = msg.document?.filename ? `[Document: ${msg.document.filename}]` : "[Document]";
      break;
    case "video":
      dbType = "other";
      body = msg.video?.caption ? `[Video: ${msg.video.caption}]` : "[Video]";
      break;
    case "sticker":
      dbType = "other";
      body = "[Sticker]";
      break;
    case "location":
      dbType = "other";
      body = msg.location?.name ? `[Location: ${msg.location.name}]` : "[Location]";
      break;
    case "button":
      dbType = "text";
      body = msg.button?.text || "[Button reply]";
      break;
    case "interactive":
      dbType = "text";
      body =
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        "[Interactive reply]";
      break;
    default:
      dbType = "other";
      body = `[${rawType}]`;
  }

  const timestampIso = msg.timestamp
    ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString()
    : new Date().toISOString();

  // Save to whatsapp_messages
  const { error: insertErr } = await supabase.from("whatsapp_messages").insert({
    wa_message_id: waMsgId,
    direction: "in",
    phone: digits,
    member_id: member?.id || null,
    type: dbType,
    body: body.slice(0, 4000),
    template_name: null,
    status: "received",
    wa_timestamp: timestampIso,
  });

  if (insertErr) {
    console.error("[whatsapp:webhook] Failed to insert inbound message:", insertErr);
    return;
  }

  // Upsert whatsapp_conversations
  const { data: conv } = await supabase
    .from("whatsapp_conversations")
    .select("phone, member_id, unread_count")
    .eq("phone", digits)
    .maybeSingle();

  if (conv) {
    await supabase
      .from("whatsapp_conversations")
      .update({
        member_id: conv.member_id || member?.id || null,
        last_inbound_at: timestampIso,
        last_message_at: timestampIso,
        last_message_preview: body.slice(0, 500),
        unread_count: (conv.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("phone", digits);
  } else {
    await supabase
      .from("whatsapp_conversations")
      .insert({
        phone: digits,
        member_id: member?.id || null,
        last_inbound_at: timestampIso,
        last_message_at: timestampIso,
        last_message_preview: body.slice(0, 500),
        unread_count: 1,
        created_at: timestampIso,
        updated_at: timestampIso,
      });
  }

  // Optional auto-reply (Section 9):
  // If WHATSAPP_AUTO_REPLY_TEXT is set, send when member messages and no staff reply in 12h
  const autoReplyText = process.env.WHATSAPP_AUTO_REPLY_TEXT?.trim();
  if (autoReplyText) {
    try {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: recentReply } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("phone", digits)
        .eq("direction", "out")
        .gte("created_at", twelveHoursAgo)
        .limit(1)
        .maybeSingle();

      if (!recentReply) {
        console.log(`[whatsapp:auto-reply] Sending auto-reply to ${digits}`);
        await sendText(digits, autoReplyText, supabase);
      }
    } catch (autoErr) {
      console.error("[whatsapp:auto-reply] Error sending auto-reply:", autoErr);
    }
  }
}

/**
 * Handles status receipts from Meta (sent, delivered, read, failed).
 * Enforces status never downgrades rule.
 */
async function handleStatusUpdate(supabase: any, status: any) {
  const waMsgId = status.id;
  const newStatus = status.status;
  if (!waMsgId || !newStatus) return;

  const { data: existing } = await supabase
    .from("whatsapp_messages")
    .select("id, status")
    .eq("wa_message_id", waMsgId)
    .maybeSingle();

  if (!existing) {
    // Outbound message might not have been recorded with wa_message_id yet, or not found
    return;
  }

  if (!shouldUpdateMessageStatus(existing.status, newStatus)) {
    return;
  }

  const updateData: Record<string, any> = {
    status: newStatus,
  };

  if (newStatus === "failed" && Array.isArray(status.errors) && status.errors.length > 0) {
    const err = status.errors[0];
    updateData.error_code = String(err.code || "");
    updateData.error_message = err.title || err.message || "Message delivery failed";
  }

  await supabase
    .from("whatsapp_messages")
    .update(updateData)
    .eq("id", existing.id);
}
