/**
 * Standalone verification for the pure logic that cannot be covered by the
 * TypeScript compiler: Indian phone normalization and template validation.
 *
 * Run with:  npx tsx scripts/verify-whatsapp-logic.ts
 * or:         npx tsc scripts/verify-whatsapp-logic.ts --outDir .tmp-verify
 *              && node .tmp-verify/scripts/verify-whatsapp-logic.js
 */

import { normalizeIndianPhone, formatIndianPhone } from "../src/lib/whatsapp/phone";
import {
  validateTemplateBody,
  renderTemplate,
  TemplateRenderError,
  firstName,
  formatIstTime,
  formatIstDate,
} from "../src/lib/whatsapp/templates";

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("\n── Phone normalisation (spec §25) ───────────────────────────────");
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
}

// The exact double-prefix case called out in the spec as WRONG.
{
  const r = normalizeIndianPhone("91919876543210");
  check("91919876543210 does NOT become 91919876543210", r.ok ? r.digits : r, "919876543210");
}
// Seeded approved_members shape (12 digits incl. country code).
{
  const r = normalizeIndianPhone("917702355344");
  check("917702355344 keeps its 91 country code", r.ok ? r.digits : r, "917702355344");
}
// Anything longer than 12 digits is plainly malformed; reconcile to the last 10,
// matching the existing public.normalize_phone() rule from migration 055.
{
  // "0091" prefix + "9876543210" = 14 digits, last 10 are the real number.
  const r = normalizeIndianPhone("00919876543210");
  check("over-long input reduces to last 10 (mirrors normalize_phone)", r.ok ? r.digits : r, "919876543210");
}
for (const bad of [
  "",
  null,
  undefined,
  "12345",
  "0123456789",     // 10 digits, trunk-zero start
  "19876543210",    // 11 digits without a trunk zero
  "019876543210",   // 12 digits that are not a 91 country code
]) {
  const r = normalizeIndianPhone(bad as string);
  check(`rejects ${JSON.stringify(bad)}`, r.ok, false);
}
check("formatIndianPhone display", formatIndianPhone("9876543210"), "+91 98765 43210");
check("jid form", normalizeIndianPhone("9876543210").ok && (normalizeIndianPhone("9876543210") as any).jid, "919876543210@s.whatsapp.net");

console.log("\n── Template validation (spec §15) ────────────────────────────────");
check(
  "unknown variable is rejected with its name",
  validateTemplateBody("Hello {{unknown_variable}}").issues[0]?.message,
  "Unknown variable: {{unknown_variable}}"
);
check("empty body rejected", validateTemplateBody("   ").valid, false);
check("malformed placeholder rejected", validateTemplateBody("Hi {{member_name").issues[0]?.message.includes("Malformed"), true);
check("valid template accepted", validateTemplateBody("Hi {{member_first_name}}, {{class_name}} at {{class_time}}").valid, true);
check("oversized body rejected", validateTemplateBody("x".repeat(5000)).valid, false);
check("used variables extracted in order", validateTemplateBody("{{class_name}} {{class_time}} {{class_name}}").usedVariables, ["class_name", "class_time"]);

console.log("\n── Template rendering (§12: refuse unresolvable) ──────────────────");
const ctx = {
  member_first_name: "Srikar",
  class_name: "Pilates Reformer",
  class_time: "7:00 PM",
};
check("renders known variables", renderTemplate("Hi {{member_first_name}}, {{class_name}} at {{class_time}}", ctx), "Hi Srikar, Pilates Reformer at 7:00 PM");
check("missing variable throws naming it", (() => {
  try {
    renderTemplate("Hi {{trainer_name}}", ctx);
    return "no throw";
  } catch (e) {
    return e instanceof TemplateRenderError ? e.variable : `wrong error: ${e}`;
  }
})(), "trainer_name");
check("empty-string value is treated as unresolvable", (() => {
  try {
    renderTemplate("Hi {{trainer_name}}", { ...ctx, trainer_name: "   " });
    return "no throw";
  } catch (e) {
    return e instanceof TemplateRenderError ? "threw" : "wrong error";
  }
})(), "threw");

console.log("\n── IST formatting (§28) ───────────────────────────────────────────");
check("19:00 -> 7:00 PM (not 7:00 AM)", formatIstTime("19:00"), "7:00 PM");
check("20:30 -> 8:30 PM", formatIstTime("20:30"), "8:30 PM");
check("00:00 -> 12:00 AM", formatIstTime("00:00"), "12:00 AM");
check("12:00 -> 12:00 PM", formatIstTime("12:00"), "12:00 PM");
check("09:30 -> 9:30 AM", formatIstTime("09:30"), "9:30 AM");
check("23:59 -> 11:59 PM", formatIstTime("23:59"), "11:59 PM");
check("date formats as IST day", formatIstDate("2026-03-15"), "15 Mar 2026");
check("firstName handles multiword", firstName("Srikar Kan"), "Srikar");
check("firstName handles empty", firstName(""), "");

console.log(`\n${"=".repeat(58)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(58)}\n`);
process.exit(failed === 0 ? 0 : 1);