// Indian phone number normalisation for WhatsApp addressing.
//
// Corhaus stores phone numbers in whatever format the member typed, and the
// seeded rows are already inconsistent: approved_members rows look like
// '917702355344' (country code + number) while leads are hard-checked to exactly
// ten digits (044:7). So every send normalises here rather than trusting the
// stored string.
//
// WhatsApp (Baileys) JIDs are country code + national number with no '+', spaces
// or separators: '919876543210'.

export const DEFAULT_COUNTRY_CODE = "91";

export type NormalizeResult =
  | { ok: true; digits: string; jid: string; national: string }
  | { ok: false; reason: string };

/**
 * Normalise any accepted Indian input into a Baileys-ready JID.
 *
 * Accepted (per the integration spec):
 *   9876543210
 *   +91 9876543210
 *   +919876543210
 *   91-9876543210
 *   09876543210      (leading trunk zero, common in Indian dialling)
 *   917702355344     (12-digit form already present in approved_members)
 *
 * The dangerous case called out in the spec is double-prefixing
 * ('91919876543210'). Because we always reduce to exactly ten national digits
 * before re-attaching the country code, that cannot happen.
 */
export function normalizeIndianPhone(raw: string | null | undefined): NormalizeResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "No phone number on file for this member." };
  }

  const stripped = String(raw).replace(/\D/g, "");

  if (stripped.length === 0) {
    return { ok: false, reason: "No phone number on file for this member." };
  }

  // Leading trunk zero: 09876543210 -> 9876543210.
  // An 11-digit value without a leading zero is malformed, not a trunk prefix.
  let national = stripped;
  if (national.length === 11) {
    if (!national.startsWith("0")) {
      return {
        ok: false,
        reason: `"${raw}" is not a valid 10-digit Indian mobile number.`,
      };
    }
    national = national.slice(1);
  }

  // Already country-coded (91XXXXXXXXXX) -> drop the code and keep 10 digits.
  if (national.length === 12 && national.startsWith(DEFAULT_COUNTRY_CODE)) {
    national = national.slice(2);
  }

  // Longer than 12 digits is plainly malformed input; reconcile to the last 10,
  // which matches public.normalize_phone() in migration 055.
  if (national.length > 12) {
    national = national.slice(-10);
  }

  if (national.length !== 10) {
    return {
      ok: false,
      reason: `"${raw}" is not a valid 10-digit Indian mobile number.`,
    };
  }

  // Indian mobile numbers never begin with 0 or 1.
  if (national.startsWith("0") || national.startsWith("1")) {
    return {
      ok: false,
      reason: `"${raw}" does not look like a valid Indian mobile number.`,
    };
  }

  const digits = `${DEFAULT_COUNTRY_CODE}${national}`;
  return { ok: true, digits, jid: `${digits}@s.whatsapp.net`, national };
}

/** Display form for the admin UI: +91 98765 43210 */
export function formatIndianPhone(raw: string | null | undefined): string {
  const res = normalizeIndianPhone(raw);
  if (!res.ok) return raw || "—";
  return `+${DEFAULT_COUNTRY_CODE} ${res.national.slice(0, 5)} ${res.national.slice(5)}`;
}