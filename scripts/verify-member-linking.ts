/**
 * Verification for the phone-linking rules in src/lib/member-linking.ts.
 * Pure logic, no database: reproduces the matching decisions and asserts the
 * guards that must never regress.
 */
import { normalizePhoneNumber } from "../src/lib/auth-canonical";

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`);
  }
}

interface Row {
  id: string;
  email: string | null;
  phone_number: string;
  membership_status: string;
}

// ── 1. Phone normalisation across every stored format ───────────────────────
console.log("\n── Phone normalisation (stored formats) ─────────────────────────");
for (const stored of [
  "9876543210",
  "+91 98765 43210",
  "+919876543210",
  "91-9876543210",
  "09876543210",
  "919876543210",
  "  98765 43210  ",
]) {
  check(`"${stored}" -> 9876543210`, normalizePhoneNumber(stored), "9876543210");
}
check("null -> empty", normalizePhoneNumber(null), "");
check("undefined -> empty", normalizePhoneNumber(undefined), "");
check("garbage 123 -> rejected later (too short)", normalizePhoneNumber("123").length === 3, true);

// ── 2. Resolution decision matrix ───────────────────────────────────────────
console.log("\n── Resolution: email wins, phone is fallback ─────────────────────");

type Decision = "email" | "phone" | "not_found" | "ambiguous" | "inactive" | "email_conflict";

function resolve(
  rows: Row[],
  authEmail: string,
  authPhone: string | null
): Decision {
  const email = (authEmail || "").trim().toLowerCase();

  // 1. email match
  const byEmail = rows.find(
    (r) => (r.email || "").trim().toLowerCase() === email && email.length > 0
  );
  if (byEmail) return "email";

  // 2. phone match
  const digits = normalizePhoneNumber(authPhone);
  if (!digits || digits.length !== 10) return "not_found";

  const byPhone = rows.filter((r) => normalizePhoneNumber(r.phone_number) === digits);
  const active = byPhone.filter(
    (r) => (r.membership_status || "").trim().toLowerCase() === "active"
  );
  if (active.length > 1) return "ambiguous";
  if (active.length === 0) {
    if (byPhone.length === 1) return "inactive";
    return "not_found";
  }

  // 3. never repoint a record already holding a different email
  const existing = (active[0].email || "").trim().toLowerCase();
  if (existing && email && existing !== email) return "email_conflict";

  return "phone";
}

const base: Row[] = [
  { id: "m1", email: "srikar@example.com", phone_number: "9876543210", membership_status: "active" },
  { id: "m2", email: null, phone_number: "917702355344", membership_status: "active" },   // migrated, no email
  { id: "m3", email: null, phone_number: "9000000003", membership_status: "inactive" },   // inactive
  { id: "m4", email: null, phone_number: "9000000004", membership_status: "active" },
  { id: "m5", email: null, phone_number: "9000000005", membership_status: "active" },   // shares with m6
  { id: "m6", email: "existing@example.com", phone_number: "9000000005", membership_status: "active" },
];

check("email match wins over phone", resolve(base, "srikar@example.com", "9000000003"), "email");
check("email match is case-insensitive", resolve(base, "SRIKAR@Example.com", null), "email");
check("no-email member found by phone", resolve(base, "new@example.com", "917702355344"), "phone");
check("no-email member via formatted phone", resolve(base, "new@example.com", "+91 77023 55344"), "phone");
check("phone matches inactive -> inactive", resolve(base, "new@example.com", "9000000003"), "inactive");
check("two active share a number -> ambiguous", resolve(base, "new@example.com", "9000000005"), "ambiguous");
check("email conflict is refused", resolve(base, "attacker@evil.com", "9876543210"), "email_conflict");
check("unknown email + no phone", resolve(base, "nobody@example.com", null), "not_found");
check("unknown email + unknown phone", resolve(base, "nobody@example.com", "8888888888"), "not_found");
check("short/garbage phone rejected", resolve(base, "nobody@example.com", "123"), "not_found");
check("blank email + valid phone still links", resolve(base, "", "917702355344"), "phone");

// ── 3. After backfill the member resolves by email forever ──────────────────
console.log("\n── After backfill, email resolves them (no phone needed) ──────");
const afterBackfill: Row[] = base.map((r) =>
  r.id === "m2" ? { ...r, email: "new@example.com" } : r
);
check("backfilled member now matches by email", resolve(afterBackfill, "new@example.com", null), "email");
check("and no longer needs the phone", resolve(afterBackfill, "new@example.com", ""), "email");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);