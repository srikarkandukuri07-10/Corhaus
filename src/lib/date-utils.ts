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
