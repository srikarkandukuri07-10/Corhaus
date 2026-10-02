/**
 * Shared report/dashboard metrics engine.
 *
 * This is the SINGLE source of truth for every period-based summary card
 * shown on the admin dashboard (/admin) and the reports page
 * (/admin/reports). Both pages must import from here instead of
 * recomputing revenue/member/etc. totals themselves — that duplication is
 * exactly what caused the two pages to show different numbers for the same
 * period ("This Month Revenue") before this file existed.
 *
 * Every period is computed fresh from `now` on each call — nothing is
 * stored or hardcoded, so a card like "This Month" automatically starts a
 * new, empty-until-earned window the moment the calendar rolls over.
 *
 * All calendar math is done in Asia/Kolkata (IST), since that's the
 * studio's operating timezone and the one date-utils.ts already uses.
 */

const IST_TIME_ZONE = "Asia/Kolkata";

export type PeriodKey =
  | "last7days"
  | "last30days"
  | "last90days"
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "lastQuarter"
  | "thisYear"
  | "thisFinancialYear"
  | "lastFinancialYear"
  | "allTime"
  | "custom";

export interface PeriodRange {
  key: PeriodKey;
  label: string;
  /** Inclusive start instant, or null for allTime */
  start: Date | null;
  /** Exclusive end instant (start of the day AFTER the last included day) */
  end: Date;
}

export const PERIOD_OPTIONS: { group: string; items: { key: PeriodKey; label: string }[] }[] = [
  {
    group: "Recent",
    items: [
      { key: "last7days", label: "Last 7 Days" },
      { key: "last30days", label: "Last 30 Days" },
      { key: "last90days", label: "Last 90 Days" },
    ],
  },
  {
    group: "Calendar Periods",
    items: [
      { key: "thisMonth", label: "This Month" },
      { key: "lastMonth", label: "Last Month" },
      { key: "thisQuarter", label: "This Quarter" },
      { key: "lastQuarter", label: "Last Quarter" },
      { key: "thisYear", label: "This Year" },
      { key: "thisFinancialYear", label: "This Financial Year" },
      { key: "lastFinancialYear", label: "Last Financial Year" },
    ],
  },
  {
    group: "Other",
    items: [{ key: "allTime", label: "All Time" }],
  },
];

/** Returns the Y/M/D of `d` as observed in IST, regardless of server TZ. */
function istParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

/** Builds the UTC instant corresponding to 00:00:00 IST on the given Y/M/D. */
function istMidnightUtc(year: number, month: number, day: number): Date {
  // IST is UTC+5:30 with no DST. 00:00 IST == previous-day 18:30 UTC.
  return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/**
 * Resolves a named period into a concrete [start, end) instant range,
 * freshly computed from `now`. `end` is always exclusive so callers can
 * compare with `createdAt >= start && createdAt < end`.
 */
export function getPeriodRange(
  key: PeriodKey,
  now: Date = new Date(),
  custom?: { startDate: string; endDate: string }
): PeriodRange {
  const { year, month, day } = istParts(now);
  const todayStart = istMidnightUtc(year, month, day);
  const tomorrowStart = addDaysUtc(todayStart, 1);

  switch (key) {
    case "last7days":
      return { key, label: "Last 7 Days", start: addDaysUtc(todayStart, -6), end: tomorrowStart };
    case "last30days":
      return { key, label: "Last 30 Days", start: addDaysUtc(todayStart, -29), end: tomorrowStart };
    case "last90days":
      return { key, label: "Last 90 Days", start: addDaysUtc(todayStart, -89), end: tomorrowStart };
    case "thisMonth": {
      const start = istMidnightUtc(year, month, 1);
      const nextMonth = month === 12 ? istMidnightUtc(year + 1, 1, 1) : istMidnightUtc(year, month + 1, 1);
      return { key, label: "This Month", start, end: nextMonth };
    }
    case "lastMonth": {
      const prevMonthYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      const start = istMidnightUtc(prevMonthYear, prevMonth, 1);
      const end = istMidnightUtc(year, month, 1);
      return { key, label: "Last Month", start, end };
    }
    case "thisQuarter": {
      const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const start = istMidnightUtc(year, qStartMonth, 1);
      const nextQStartMonth = qStartMonth + 3;
      const end =
        nextQStartMonth > 12 ? istMidnightUtc(year + 1, nextQStartMonth - 12, 1) : istMidnightUtc(year, nextQStartMonth, 1);
      return { key, label: "This Quarter", start, end };
    }
    case "lastQuarter": {
      const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      const prevQStartMonth = qStartMonth - 3;
      const start =
        prevQStartMonth < 1 ? istMidnightUtc(year - 1, prevQStartMonth + 12, 1) : istMidnightUtc(year, prevQStartMonth, 1);
      const end = istMidnightUtc(year, qStartMonth, 1);
      return { key, label: "Last Quarter", start, end };
    }
    case "thisYear": {
      const start = istMidnightUtc(year, 1, 1);
      const end = istMidnightUtc(year + 1, 1, 1);
      return { key, label: "This Year", start, end };
    }
    case "thisFinancialYear": {
      // Indian financial year: Apr 1 - Mar 31
      const fyStartYear = month >= 4 ? year : year - 1;
      const start = istMidnightUtc(fyStartYear, 4, 1);
      const end = istMidnightUtc(fyStartYear + 1, 4, 1);
      return { key, label: "This Financial Year", start, end };
    }
    case "lastFinancialYear": {
      const fyStartYear = (month >= 4 ? year : year - 1) - 1;
      const start = istMidnightUtc(fyStartYear, 4, 1);
      const end = istMidnightUtc(fyStartYear + 1, 4, 1);
      return { key, label: "Last Financial Year", start, end };
    }
    case "custom": {
      if (!custom?.startDate || !custom?.endDate) {
        // Fall back to all time if a custom range was requested but not supplied.
        return { key: "allTime", label: "All Time", start: null, end: tomorrowStart };
      }
      const [sy, sm, sd] = custom.startDate.split("-").map(Number);
      const [ey, em, ed] = custom.endDate.split("-").map(Number);
      const start = istMidnightUtc(sy, sm, sd);
      const end = addDaysUtc(istMidnightUtc(ey, em, ed), 1);
      return { key: "custom", label: "Custom Range", start, end };
    }
    case "allTime":
    default:
      return { key: "allTime", label: "All Time", start: null, end: tomorrowStart };
  }
}

function inRange(createdAt: string | null | undefined, range: PeriodRange): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  if (range.start && t < range.start.getTime()) return false;
  if (t >= range.end.getTime()) return false;
  return true;
}

/** Exported for callers that need to filter arbitrary rows (classes, expenses, PT sessions, …) by the same period boundaries used everywhere else. Accepts either a timestamp or a bare "YYYY-MM-DD" date string. */
export function isDateInRange(dateStr: string | null | undefined, range: PeriodRange): boolean {
  return inRange(dateStr, range);
}

function isPaid(status: string | null | undefined): boolean {
  return (status || "").toLowerCase() === "paid" || (status || "").toLowerCase() === "completed";
}

function isDueOrPartial(status: string | null | undefined): boolean {
  const s = (status || "").toLowerCase();
  return s === "due" || s === "partial" || s === "payment due";
}

/**
 * Canonical "revenue" figure for a paid invoice: the amount actually
 * collected (amount_paid) when it's recorded, otherwise the invoice's
 * grand_total. This is the definition used everywhere revenue is shown —
 * previously the dashboard and the reports page disagreed here (dashboard
 * preferred amount_paid, reports preferred grand_total), which is why
 * "This Month Revenue" could differ between the two pages for the exact
 * same month.
 */
export function invoiceRevenueAmount(inv: { grand_total?: number | null; amount_paid?: number | null }): number {
  const paid = Number(inv.amount_paid || 0);
  if (paid > 0) return paid;
  return Number(inv.grand_total || 0);
}

export interface RevenueInvoice {
  grand_total?: number | null;
  amount_paid?: number | null;
  payment_status?: string | null;
  created_at?: string | null;
}

export function computeRevenue(invoices: RevenueInvoice[], range: PeriodRange): number {
  let total = 0;
  for (const inv of invoices) {
    if (!isPaid(inv.payment_status)) continue;
    if (!inRange(inv.created_at, range)) continue;
    total += invoiceRevenueAmount(inv);
  }
  return total;
}

/** Pending payments is always an all-time outstanding snapshot, not period-scoped (matches MyGymDesk's "all-time" label). */
export function computePendingPaymentsTotal(invoices: RevenueInvoice[]): number {
  let total = 0;
  for (const inv of invoices) {
    if (!isDueOrPartial(inv.payment_status)) continue;
    const due = Number(inv.grand_total || 0) - Number(inv.amount_paid || 0);
    if (due > 0) total += due;
  }
  return total;
}

export interface RevenueInvoiceItem {
  invoice_id?: string | null;
  category?: string | null;
  name?: string | null;
  total_price?: number | null;
}

export function computeProductSalesTotal(
  items: RevenueInvoiceItem[],
  invoiceDateById: Map<string, string | null | undefined>,
  range: PeriodRange
): number {
  let total = 0;
  for (const item of items) {
    const isProduct = item.category === "Products" || (item.name || "").toLowerCase().includes("product");
    if (!isProduct) continue;
    const invDate = item.invoice_id ? invoiceDateById.get(item.invoice_id) : null;
    if (!inRange(invDate, range)) continue;
    total += Number(item.total_price || 0);
  }
  return total;
}

export interface MemberRow {
  membership_status?: string | null;
  freeze_status?: string | null;
  created_at?: string | null;
}

export function computeActiveMembersCount(members: MemberRow[]): number {
  return members.filter((m) => m.membership_status === "active").length;
}

export function computeNewMembersCount(members: MemberRow[], range: PeriodRange): number {
  return members.filter((m) => inRange(m.created_at, range)).length;
}

export interface PurchasedPlanRow {
  valid_until?: string | null;
  valid_from?: string | null;
  status?: string | null;
}

/** Memberships expiring within `windowDays` days from today (inclusive), IST-based. Not period-scoped — matches MyGymDesk's fixed lookahead card. */
export function computeExpiringMembershipsCount(
  plans: PurchasedPlanRow[],
  windowDays: number,
  now: Date = new Date()
): number {
  const { year, month, day } = istParts(now);
  const todayStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const windowEnd = addDaysUtc(istMidnightUtc(year, month, day), windowDays);
  const we = istParts(windowEnd);
  const windowEndStr = `${we.year}-${String(we.month).padStart(2, "0")}-${String(we.day).padStart(2, "0")}`;

  return plans.filter((p) => {
    if (!p.valid_until) return false;
    return p.valid_until >= todayStr && p.valid_until <= windowEndStr;
  }).length;
}

/**
 * Renewal rate for the period: of the memberships that EXPIRED during the
 * period, what fraction belong to a member who has at least one other
 * purchased plan starting on or after that expiry (i.e. they bought again).
 * This is a best-effort, clearly-documented approximation of MyGymDesk's
 * "Renewal Rate" card — Corhaus has no explicit "renewal" record, so this
 * infers it from repeat purchases. Returns null when no plans expired in
 * the period (rate is undefined, not zero).
 */
export function computeRenewalRate(
  plans: (PurchasedPlanRow & { id: string; approved_member_id?: string | null })[],
  range: PeriodRange
): number | null {
  const expired = plans.filter((p) => {
    if (!p.valid_until) return false;
    if (!range.start) return true;
    const t = new Date(p.valid_until).getTime();
    return t >= range.start.getTime() && t < range.end.getTime();
  });
  if (expired.length === 0) return null;

  let renewed = 0;
  for (const p of expired) {
    if (!p.approved_member_id || !p.valid_until) continue;
    const expiredAt = new Date(p.valid_until).getTime();
    const hasLaterPlan = plans.some(
      (other) =>
        other.id !== p.id &&
        other.approved_member_id === p.approved_member_id &&
        other.valid_from &&
        new Date(other.valid_from).getTime() >= expiredAt
    );
    if (hasLaterPlan) renewed += 1;
  }
  return Math.round((renewed / expired.length) * 100);
}

export function computeAvgRevenuePerMember(revenue: number, activeMembersCount: number): number {
  if (activeMembersCount <= 0) return 0;
  return Math.round(revenue / activeMembersCount);
}
