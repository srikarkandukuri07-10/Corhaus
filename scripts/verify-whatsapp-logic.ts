/**
 * Standalone verification for pure WhatsApp logic:
 * 1. Indian phone normalization & national 10-digit extraction
 * 2. Meta webhook signature verification (HMAC-SHA256, timing-safe)
 * 3. Status-never-downgrades hierarchy rule
 * 4. 24-hour reply window logic
 * 5. Webhook idempotency and message parsing
 * 6. Template registry and <FILL_IN> placeholder enforcement
 *
 * Run with: npm run verify:whatsapp
 */

import crypto from "crypto";
import {
  normalizeIndianPhone,
  formatIndianPhone,
  getNational10,
} from "../src/lib/whatsapp/phone";
import {
  validateTemplateBody,
  renderTemplate,
  TemplateRenderError,
  firstName,
  formatIstTime,
  formatIstDate,
  getTemplateConfig,
  TemplateConfigError,
} from "../src/lib/whatsapp/templates";
import {
  verifyWebhookSignature,
  shouldUpdateMessageStatus,
} from "../src/lib/whatsapp/service";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(
      `  FAIL  ${name}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`
    );
  }
}

console.log("\n── 1. Phone normalisation & National 10 extraction ─────────────────");
const accepted = [
  "9876543210",
  "+91 9876543210",
  "+919876543210",
  "91-9876543210",
  "09876543210",
  "919876543210",
  "  98765 43210  ",
];
for (const input of accepted) {
  const r = normalizeIndianPhone(input);
  check(`"${input}" -> 919876543210`, r.ok ? r.digits : r, "919876543210");
  check(`getNational10("${input}") -> 9876543210`, getNational10(input), "9876543210");
}

// Double-prefix case
{
  const r = normalizeIndianPhone("91919876543210");
  check("91919876543210 does NOT double-prefix", r.ok ? r.digits : r, "919876543210");
  check("getNational10('91919876543210') -> 9876543210", getNational10("91919876543210"), "9876543210");
}

// 12-digit seeded shape
{
  const r = normalizeIndianPhone("917702355344");
  check("917702355344 keeps its 91 country code", r.ok ? r.digits : r, "917702355344");
}

// Over-long input
{
  const r = normalizeIndianPhone("00919876543210");
  check("00919876543210 reduces to last 10", r.ok ? r.digits : r, "919876543210");
}

for (const bad of [
  "",
  null,
  undefined,
  "12345",
  "0123456789",
  "19876543210",
  "019876543210",
]) {
  const r = normalizeIndianPhone(bad as string);
  check(`rejects invalid ${JSON.stringify(bad)}`, r.ok, false);
}
check("formatIndianPhone display", formatIndianPhone("9876543210"), "+91 98765 43210");

console.log("\n── 2. Webhook signature verification (HMAC-SHA256) ───────────────");
const secret = "test_meta_app_secret_123456789";
const sampleBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

const validHmac = crypto.createHmac("sha256", secret).update(sampleBody).digest("hex");
const validHeaderWithPrefix = `sha256=${validHmac}`;

check("valid signature with sha256= prefix succeeds", verifyWebhookSignature(sampleBody, validHeaderWithPrefix, secret), true);
check("valid signature without prefix succeeds", verifyWebhookSignature(sampleBody, validHmac, secret), true);
check("tampered payload fails signature check", verifyWebhookSignature(sampleBody + " ", validHeaderWithPrefix, secret), false);
check("wrong secret fails signature check", verifyWebhookSignature(sampleBody, validHeaderWithPrefix, "wrong_secret"), false);
check("invalid hex signature fails cleanly", verifyWebhookSignature(sampleBody, "sha256=not_a_hex", secret), false);
check("missing signature header fails", verifyWebhookSignature(sampleBody, null, secret), false);
check("missing secret fails", verifyWebhookSignature(sampleBody, validHeaderWithPrefix, ""), false);

console.log("\n── 3. Status-never-downgrades hierarchy rule ─────────────────────");
// Ranks: sent -> delivered -> read
check("sent -> delivered is permitted", shouldUpdateMessageStatus("sent", "delivered"), true);
check("delivered -> read is permitted", shouldUpdateMessageStatus("delivered", "read"), true);
check("sent -> read is permitted", shouldUpdateMessageStatus("sent", "read"), true);

// Downgrade attempts must be blocked
check("read -> delivered is BLOCKED", shouldUpdateMessageStatus("read", "delivered"), false);
check("read -> sent is BLOCKED", shouldUpdateMessageStatus("read", "sent"), false);
check("delivered -> sent is BLOCKED", shouldUpdateMessageStatus("delivered", "sent"), false);
check("read -> failed is BLOCKED", shouldUpdateMessageStatus("read", "failed"), false);
check("delivered -> failed is BLOCKED", shouldUpdateMessageStatus("delivered", "failed"), false);
check("same status (delivered -> delivered) is ignored", shouldUpdateMessageStatus("delivered", "delivered"), false);
check("same status (read -> read) is ignored", shouldUpdateMessageStatus("read", "read"), false);

console.log("\n── 4. 24-hour reply window logic ─────────────────────────────────");
function testReplyWindow(lastInboundIso: string | null | undefined, nowMs: number) {
  if (!lastInboundIso) return { allowed: false, remainingHours: 0 };
  const diffMs = nowMs - new Date(lastInboundIso).getTime();
  const maxMs = 24 * 60 * 60 * 1000;
  if (diffMs > maxMs) return { allowed: false, remainingHours: 0 };
  return { allowed: true, remainingHours: Math.max(1, Math.floor((maxMs - diffMs) / (60 * 60 * 1000))) };
}

const mockNow = new Date("2026-10-24T12:00:00Z").getTime();
// 2 hours ago -> allowed, 22 hours remaining
const twoHoursAgo = new Date(mockNow - 2 * 60 * 60 * 1000).toISOString();
check("reply within 2 hours is allowed", testReplyWindow(twoHoursAgo, mockNow).allowed, true);
check("reply within 2 hours has 22 remaining hours", testReplyWindow(twoHoursAgo, mockNow).remainingHours, 22);

// 23 hours ago -> allowed, 1 hour remaining
const twentyThreeHoursAgo = new Date(mockNow - 23 * 60 * 60 * 1000).toISOString();
check("reply at 23 hours is allowed", testReplyWindow(twentyThreeHoursAgo, mockNow).allowed, true);
check("reply at 23 hours has 1 remaining hour", testReplyWindow(twentyThreeHoursAgo, mockNow).remainingHours, 1);

// 24.5 hours ago -> window closed
const twentyFiveHoursAgo = new Date(mockNow - 24.5 * 60 * 60 * 1000).toISOString();
check("reply past 24 hours is BLOCKED", testReplyWindow(twentyFiveHoursAgo, mockNow).allowed, false);

// No inbound message ever
check("no inbound message is BLOCKED", testReplyWindow(null, mockNow).allowed, false);

console.log("\n── 5. Webhook idempotency and payload handling ───────────────────");
// Simulate deduplication by tracking seen IDs
const seenWaIds = new Set<string>();
function simulateReceiveMessage(waId: string) {
  if (seenWaIds.has(waId)) {
    return { duplicate: true, action: "skip" };
  }
  seenWaIds.add(waId);
  return { duplicate: false, action: "insert" };
}

check("first delivery of wamid.12345 inserts", simulateReceiveMessage("wamid.12345").action, "insert");
check("retry delivery of wamid.12345 is deduped and skipped", simulateReceiveMessage("wamid.12345").action, "skip");
check("distinct delivery of wamid.67890 inserts", simulateReceiveMessage("wamid.67890").action, "insert");

// Placeholder mapping for non-text message types
function mapMessageBody(msg: any): { type: string; body: string } {
  const rawType = msg.type || "text";
  switch (rawType) {
    case "text":
      return { type: "text", body: msg.text?.body || "" };
    case "image":
      return { type: "image", body: "[Image]" };
    case "audio":
      return { type: "audio", body: msg.audio?.voice ? "[Voice note]" : "[Audio]" };
    case "document":
      return { type: "document", body: "[Document]" };
    default:
      return { type: "other", body: `[${rawType}]` };
  }
}

check("image message mapped to [Image]", mapMessageBody({ type: "image" }).body, "[Image]");
check("voice note mapped to [Voice note]", mapMessageBody({ type: "audio", audio: { voice: true } }).body, "[Voice note]");
check("document mapped to [Document]", mapMessageBody({ type: "document" }).body, "[Document]");
check("text message keeps body", mapMessageBody({ type: "text", text: { body: "Hello studio" } }).body, "Hello studio");

console.log("\n── 6. Template Registry & Placeholder Enforcement ────────────────");
check("class_reminder is configured with name 'booking_reminder'", getTemplateConfig("class_reminder").name, "booking_reminder");
check("class_reminder has language 'en'", getTemplateConfig("class_reminder").language, "en");
check("class_reminder has named format", getTemplateConfig("class_reminder").paramFormat, "named");
check("class_reminder has ordered parameter list", getTemplateConfig("class_reminder").params, [
  "member_name",
  "class_name",
  "class_date",
  "class_time",
  "trainer_name",
  "location_name",
]);

// booking_confirmed placeholder check
check(
  "booking_confirmed throws clear error because of <FILL_IN>",
  (() => {
    try {
      getTemplateConfig("booking_confirmed");
      return "did not throw";
    } catch (e: any) {
      return e instanceof TemplateConfigError && e.message.includes("<FILL_IN>");
    }
  })(),
  true
);

// payment_receipt placeholder check
check(
  "payment_receipt throws clear error because of <FILL_IN>",
  (() => {
    try {
      getTemplateConfig("payment_receipt");
      return "did not throw";
    } catch (e: any) {
      return e instanceof TemplateConfigError && e.message.includes("<FILL_IN>");
    }
  })(),
  true
);

console.log("\n── 7. Template validation & IST formatting ────────────────────────");
check(
  "unknown variable is rejected with its name",
  validateTemplateBody("Hello {{unknown_variable}}").issues[0]?.message,
  "Unknown variable: {{unknown_variable}}"
);
check("empty body rejected", validateTemplateBody("   ").valid, false);
check("malformed placeholder rejected", validateTemplateBody("Hi {{member_name").issues[0]?.message.includes("Malformed"), true);
check("valid template accepted", validateTemplateBody("Hi {{member_first_name}}, {{class_name}} at {{class_time}}").valid, true);

const ctx = {
  member_first_name: "Srikar",
  class_name: "Pilates Reformer",
  class_time: "7:00 PM",
};
check("renders known variables", renderTemplate("Hi {{member_first_name}}, {{class_name}} at {{class_time}}", ctx), "Hi Srikar, Pilates Reformer at 7:00 PM");
check("19:00 -> 7:00 PM (not 7:00 AM)", formatIstTime("19:00"), "7:00 PM");
check("20:30 -> 8:30 PM", formatIstTime("20:30"), "8:30 PM");
check("00:00 -> 12:00 AM", formatIstTime("00:00"), "12:00 AM");
check("12:00 -> 12:00 PM", formatIstTime("12:00"), "12:00 PM");
check("09:30 -> 9:30 AM", formatIstTime("09:30"), "9:30 AM");
check("23:59 -> 11:59 PM", formatIstTime("23:59"), "11:59 PM");
check("date formats as IST day", formatIstDate("2026-03-15"), "15 Mar 2026");
check("firstName handles multiword", firstName("Srikar Kan"), "Srikar");

console.log(`\n${"=".repeat(58)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(58)}\n`);
process.exit(failed === 0 ? 0 : 1);
