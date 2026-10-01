// Message template engine: validation and rendering.
//
// Two rules from the spec drive the design:
//   1. An unknown placeholder must be rejected before saving, naming the
//      offending variable ("Unknown variable: {{unknown_variable}}").
//   2. If a placeholder cannot be resolved at send time, the message must NOT
//      be sent — the caller gets an error naming the variable.

import {
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLES_BY_KEY,
  type TemplateKey,
  type TemplateVariable,
} from "./types";

const VARIABLE_SET = new Set<string>(TEMPLATE_VARIABLES);

export const MAX_TEMPLATE_LENGTH = 4096;
export const MIN_TEMPLATE_LENGTH = 1;

export interface TemplateIssue {
  variable: string | null;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: TemplateIssue[];
  /** Variables actually referenced by the body, in first-seen order. */
  usedVariables: TemplateVariable[];
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]*)\s*\}\}/g;
const UNCLOSED_RE = /\{\{(?![^{}]*\}\})/;

/**
 * Validate a template body without needing a database record.
 * `allowed` defaults to the full variable set; pass the per-template list to
 * additionally reject placeholders that this event cannot supply.
 */
export function validateTemplateBody(
  body: string,
  templateKey?: TemplateKey
): ValidationResult {
  const issues: TemplateIssue[] = [];
  const usedVariables: TemplateVariable[] = [];
  const seen = new Set<string>();

  if (typeof body !== "string" || body.trim().length < MIN_TEMPLATE_LENGTH) {
    return {
      valid: false,
      issues: [{ variable: null, message: "Message cannot be empty." }],
      usedVariables,
    };
  }

  if (body.length > MAX_TEMPLATE_LENGTH) {
    issues.push({
      variable: null,
      message: `Message is too long (${body.length} characters). Maximum is ${MAX_TEMPLATE_LENGTH}.`,
    });
  }

  // Unclosed placeholder, e.g. "Hi {{member_name" — the regex above misses it.
  if (UNCLOSED_RE.test(body)) {
    issues.push({
      variable: null,
      message:
        "Malformed placeholder found. Every {{variable}} must have a matching closing }}.",
    });
  }

  const allowed = templateKey
    ? new Set<string>(TEMPLATE_VARIABLES_BY_KEY[templateKey])
    : VARIABLE_SET;

  for (const match of body.matchAll(PLACEHOLDER_RE)) {
    const raw = match[1] ?? "";
    if (raw.length === 0) {
      issues.push({ variable: null, message: "Empty placeholder {{}} is not allowed." });
      continue;
    }
    if (!VARIABLE_SET.has(raw)) {
      issues.push({
        variable: raw,
        message: `Unknown variable: {{${raw}}}`,
      });
      continue;
    }
    if (!allowed.has(raw)) {
      issues.push({
        variable: raw,
        message: `Variable {{${raw}}} is not available for this message type.`,
      });
      continue;
    }
    if (!seen.has(raw)) {
      seen.add(raw);
      usedVariables.push(raw as TemplateVariable);
    }
  }

  return { valid: issues.length === 0, issues, usedVariables };
}

export type TemplateContext = Partial<Record<TemplateVariable, string | null | undefined>>;

export class TemplateRenderError extends Error {
  readonly variable: string;
  constructor(variable: string, message: string) {
    super(message);
    this.name = "TemplateRenderError";
    this.variable = variable;
  }
}

/**
 * Render a body against a context.
 *
 * Any placeholder present in the body MUST resolve to a non-empty value, or we
 * throw a TemplateRenderError naming it. This is deliberate: a half-rendered
 * message ("Your class  is at ") is worse than no message at all, and the spec
 * requires refusing to send.
 */
export function renderTemplate(body: string, context: TemplateContext): string {
  return body.replace(PLACEHOLDER_RE, (_full, raw: string) => {
    const name = (raw ?? "").trim();
    const value = context[name as TemplateVariable];
    if (value === null || value === undefined || String(value).trim() === "") {
      throw new TemplateRenderError(
        name,
        `Could not resolve {{${name}}} for this message.`
      );
    }
    return String(value);
  });
}

/** List of variables referenced by a body, for the UI's "used" chips. */
export function extractUsedVariables(body: string): TemplateVariable[] {
  return validateTemplateBody(body).usedVariables;
}

export function validateTemplateKey(key: string): key is TemplateKey {
  return (
    key === "booking_confirmation" ||
    key === "booking_cancellation" ||
    key === "class_reminder" ||
    key === "waitlist_promotion"
  );
}

// ─── Date/time formatting, always Asia/Kolkata (section 28) ──────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istParts(dateStr: string, timeStr: string): Date {
  // class_date is a DATE and class_time a TIME; combine them as if IST.
  const [h = "0", m = "0"] = (timeStr || "").split(":");
  return new Date(`${dateStr}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00+05:30`);
}

export function formatIstDate(dateStr: string): string {
  const d = istParts(dateStr, "12:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatIstTime(timeStr: string): string {
  const [hRaw = "0", m = "00"] = (timeStr || "").split(":");
  const h24 = parseInt(hRaw, 10) || 0;
  // The meridiem must be decided from the 24-hour value BEFORE reducing,
  // otherwise 19:00 renders as "7:00 AM" and members turn up twelve hours early.
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.padStart(2, "0")} ${suffix}`;
}

/** Full IST instant for a class, used to compute reminder windows. */
export function classStartUtc(dateStr: string, timeStr: string): number {
  return istParts(dateStr, timeStr).getTime();
}

export function formatIstDateTime(dateStr: string, timeStr: string): string {
  const d = istParts(dateStr, timeStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return "";
  const first = trimmed.split(/\s+/)[0];
  return first || trimmed;
}

export { IST_OFFSET_MS };