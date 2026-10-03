/**
 * Single source of truth for public-facing business identity.
 *
 * ── READ THIS BEFORE PUBLISHING ──────────────────────────────────────────────
 * This file is served to the public browser bundle. It MUST NOT contain any
 * secret: no Razorpay Key Secret, no webhook secret, no Supabase service-role
 * key, no database credentials. Only values that are safe and appropriate for
 * the public to see belong here.
 *
 * The legal entity details below are the real values already present in the
 * codebase (src/lib/invoiceSettings.ts) so this page cannot drift from what is
 * printed on customer invoices.
 *
 * ⚠️ CONTACT DETAIL PLACEHOLDERS
 * The fields marked TODO below have NO real value anywhere in this project —
 * `business_profile` seeds only a business name and country. They are empty
 * strings here on purpose rather than invented values, so that no fabricated
 * phone number, email address or street address can reach a public page.
 * Fill them in from Admin → Settings → Business Profile, or edit here.
 * See MISSING_BUSINESS_INFO below for the full outstanding list.
 */

export const SITE = {
  /** Consumer-facing brand. Distinct from the registered legal entity below. */
  brandName: "Corhaus Pilates",
  /** Used in <title> suffixes and headings. */
  shortName: "Corhaus",
  tagline: "Pilates for everyone",

  /**
   * Registered legal entity. Sourced from src/lib/invoiceSettings.ts so the
   * public policy pages and printed invoices always agree.
   */
  legalEntity: {
    name: "Yuksha Health Private Limited",
    gstin: "36AACCY1441J1ZB",
    pan: "AACCY1441J",
    /** GST state code 36 is Telangana. Confirm before relying on it. */
    state: "Telangana",
    jurisdiction: "India",
  },

  /**
   * TODO(BUSINESS_INFO): no real support contact exists in this project.
   * Fill these in, or populate Admin → Settings → Business Profile and read
   * them from there. Do not ship placeholder text.
   */
  contact: {
    supportEmail: "", // TODO(BUSINESS_INFO)
    supportPhone: "", // TODO(BUSINESS_INFO)
    addressLine1: "", // TODO(BUSINESS_INFO)
    addressLine2: "", // TODO(BUSINESS_INFO)
    city: "", // TODO(BUSINESS_INFO)
    state: "", // TODO(BUSINESS_INFO)
    pinCode: "", // TODO(BUSINESS_INFO)
    country: "India",
  },

  /**
   * Trial Session. The amount is resolved server-side at payment time from the
   * active "Trial Session" row in billing_plan_items, falling back to ₹500
   * (src/app/api/trial/create-order/route.ts). Displayed here for the policy
   * pages; keep in step if the seeded price changes.
   */
  trial: {
    name: "Trial Session",
    /** Rupees, as a number so callers can format it. */
    priceRupees: 500,
    priceNote:
      "One trial class at the price shown when you book. The amount is confirmed by our payment provider at checkout.",
  },

  /**
   * Cancellation window, in hours before the scheduled start.
   * Source of truth: src/lib/cancellationPolicy.ts (DEFAULT_CANCELLATION_POLICY).
   * This is configurable at runtime by the studio, so the page states the
   * default and directs readers to the current value at booking time.
   */
  cancellationWindowHours: 6,

  /**
   * Deliberately curated date, not `new Date()`. A "Last Updated" line must
   * only change when the content is actually reviewed, never on every deploy.
   */
  lastUpdated: "2026-10-03",
} as const;

export const LAST_UPDATED_LABEL = new Date(
  `${SITE.lastUpdated}T00:00:00Z`
).toLocaleDateString("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Business information that does not exist anywhere in the project and must be
 * supplied before these pages are relied upon for a payment-gateway review.
 * Surfaced in the implementation report; each entry renders a visible
 * "not yet provided" note rather than a fabricated value.
 */
export const MISSING_BUSINESS_INFO: string[] = [
  "Support email address (public, monitored inbox)",
  "Support phone number",
  "Registered / business address, city and PIN code",
  "Confirmation that GSTIN 36AACCY1441J1ZB may be published",
  "Data retention period",
  "Whether a refund turnaround time may be committed to",
  "Confirmation that governing law is Telangana, India",
];

/** True when every contact field has been filled in. */
export function hasCompleteContact(): boolean {
  const c = SITE.contact;
  return Boolean(
    c.supportEmail &&
      c.supportPhone &&
      c.addressLine1 &&
      c.city &&
      c.state &&
      c.pinCode
  );
}

export function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}