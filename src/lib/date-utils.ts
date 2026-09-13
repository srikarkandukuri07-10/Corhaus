/**
 * Utility functions for date and time formatting across Corhaus platform.
 * Standard Date Format: DD/MM/YYYY
 * Standard Time Format: HH:MM am/pm (12-hour in IST / Asia/Kolkata)
 */

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "N/A";
  try {
    if (typeof d === "string") {
      const trimmed = d.trim();
      if (!trimmed) return "N/A";
      // Match YYYY-MM-DD without time/timezone to prevent UTC shift
      const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymdMatch && !trimmed.includes("T") && !trimmed.includes(" ")) {
        const [_, yyyy, mm, dd] = ymdMatch;
        return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
      }
    }
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt.getTime())) return String(d);

    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    }).formatToParts(dt);

    const day = parts.find((p) => p.type === "day")?.value.padStart(2, "0");
    const month = parts.find((p) => p.type === "month")?.value.padStart(2, "0");
    const year = parts.find((p) => p.type === "year")?.value;

    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }
    return String(d);
  } catch (_) {
    return String(d);
  }
}

export function formatTime(t: string | Date | null | undefined): string {
  if (!t) return "N/A";
  try {
    if (typeof t === "string") {
      const trimmed = t.trim();
      if (!trimmed) return "N/A";
      // Match HH:MM or HH:MM:SS (e.g. "14:00:00" or "09:30")
      const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeMatch) {
        const [_, hStr, mStr] = timeMatch;
        const h = parseInt(hStr, 10);
        const ampm = h >= 12 ? "pm" : "am";
        const h12 = h % 12 || 12;
        const h2 = String(h12).padStart(2, "0");
        return `${h2}:${mStr} ${ampm}`;
      }
      // If already formatted like "2:30 PM" or "02:30 pm"
      if (/^\d{1,2}:\d{2}\s*(am|pm|AM|PM)$/i.test(trimmed)) {
        const [tp, ap] = trimmed.split(/\s+/);
        const [hStr, mStr] = tp.split(":");
        const h2 = String(parseInt(hStr, 10)).padStart(2, "0");
        return `${h2}:${mStr} ${ap.toLowerCase()}`;
      }
    }
    const dt = typeof t === "string" ? new Date(t) : t;
    if (isNaN(dt.getTime())) return String(t);

    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).formatToParts(dt);

    const hour = parts.find((p) => p.type === "hour")?.value.padStart(2, "0");
    const minute = parts.find((p) => p.type === "minute")?.value.padStart(2, "0");
    const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value.toLowerCase();

    if (hour && minute && dayPeriod) {
      return `${hour}:${minute} ${dayPeriod}`;
    }
    return String(t);
  } catch (_) {
    return String(t);
  }
}

export function formatDateTime(dt: string | Date | null | undefined): string {
  if (!dt) return "N/A";
  return `${formatDate(dt)} ${formatTime(dt)}`;
}

/**
 * Parses class_date (YYYY-MM-DD) and class_time (HH:MM or HH:MM am/pm or HH:MM:SS)
 * strictly in IST (Asia/Kolkata, UTC+05:30) and returns epoch timestamp in milliseconds.
 */
export function parseClassTimeAsIst(dateStr: string | null | undefined, timeStr: string | null | undefined): number {
  if (!dateStr || !timeStr) return 0;
  const cleanDate = dateStr.trim().split("T")[0];
  let hours = 0;
  let minutes = 0;
  const timeUpper = timeStr.trim().toUpperCase();
  const isPm = timeUpper.includes("PM");
  const isAm = timeUpper.includes("AM");
  const cleanTime = timeUpper.replace(/(AM|PM)/g, "").trim();
  const parts = cleanTime.split(":");
  if (parts.length >= 1) hours = parseInt(parts[0], 10) || 0;
  if (parts.length >= 2) minutes = parseInt(parts[1], 10) || 0;
  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const isoStr = `${cleanDate}T${hh}:${mm}:00+05:30`;
  const parsed = new Date(isoStr).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Checks if a class has reached or passed its start time in IST.
 */
export function isClassStarted(dateStr: string | null | undefined, timeStr: string | null | undefined): boolean {
  const startTime = parseClassTimeAsIst(dateStr, timeStr);
  if (!startTime) return false;
  return Date.now() >= startTime;
}

