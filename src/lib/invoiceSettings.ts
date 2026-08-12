import { createClient } from "@supabase/supabase-js";

export interface InvoiceSettingsData {
  issue_tax_invoices: boolean;
  tax_pricing_mode: "inclusive" | "exclusive";
  gstin: string;
  legal_business_name: string;
  pan: string;
  state: string;
  invoice_prefix: string;
  next_invoice_number: number;
  default_payment_due_days: number;
  footer_note: string;
  terms_and_conditions: string;
  allow_flat_discount: boolean;
  max_staff_discount_pct: number;
}

export const DEFAULT_SETTINGS: InvoiceSettingsData = {
  issue_tax_invoices: true,
  tax_pricing_mode: "inclusive",
  gstin: "36AACCY1441J1ZB",
  legal_business_name: "Yuksha Health Private Limited",
  pan: "AACCY1441J",
  state: "36 - Telangana",
  invoice_prefix: "INV",
  next_invoice_number: 226,
  default_payment_due_days: 15,
  footer_note: "Thank you for being a valued member!",
  terms_and_conditions:
    "1. Membership fees are non-refundable.\n2. This invoice is valid for the period mentioned.\n3. For queries, please contact the business.",
  allow_flat_discount: true,
  max_staff_discount_pct: 20,
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function validateInvoiceSettings(parsed: any): Partial<InvoiceSettingsData> {
  const result: Partial<InvoiceSettingsData> = {};
  if (!parsed || typeof parsed !== "object") return result;

  if (typeof parsed.issue_tax_invoices === "boolean") result.issue_tax_invoices = parsed.issue_tax_invoices;
  if (parsed.tax_pricing_mode === "inclusive" || parsed.tax_pricing_mode === "exclusive") {
    result.tax_pricing_mode = parsed.tax_pricing_mode;
  }
  if (typeof parsed.gstin === "string") result.gstin = parsed.gstin;
  if (typeof parsed.legal_business_name === "string") result.legal_business_name = parsed.legal_business_name;
  if (typeof parsed.pan === "string") result.pan = parsed.pan;
  if (typeof parsed.state === "string") result.state = parsed.state;
  if (typeof parsed.invoice_prefix === "string") result.invoice_prefix = parsed.invoice_prefix;
  if (typeof parsed.next_invoice_number === "number") result.next_invoice_number = parsed.next_invoice_number;
  if (typeof parsed.default_payment_due_days === "number") result.default_payment_due_days = parsed.default_payment_due_days;
  if (typeof parsed.footer_note === "string") result.footer_note = parsed.footer_note;
  if (typeof parsed.terms_and_conditions === "string") result.terms_and_conditions = parsed.terms_and_conditions;
  if (typeof parsed.allow_flat_discount === "boolean") result.allow_flat_discount = parsed.allow_flat_discount;
  if (typeof parsed.max_staff_discount_pct === "number") result.max_staff_discount_pct = parsed.max_staff_discount_pct;

  return result;
}

export async function fetchInvoiceSettings(): Promise<InvoiceSettingsData> {
  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from("admin_notifications")
      .select("message")
      .eq("type", "invoice_settings")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].message) {
      const parsed = JSON.parse(data[0].message);
      const validated = validateInvoiceSettings(parsed);
      return { ...DEFAULT_SETTINGS, ...validated };
    }
  } catch (err) {
    console.error("fetchInvoiceSettings error:", err);
  }
  return DEFAULT_SETTINGS;
}

export async function getAndIncrementInvoiceNumber(): Promise<{
  formattedNumber: string;
  settings: InvoiceSettingsData;
}> {
  const supabase = getServiceClient();
  let settings = await fetchInvoiceSettings();

  const yearStr = new Date().getFullYear().toString();
  const rawNum = settings.next_invoice_number || 1;
  const paddedNum = String(rawNum).padStart(5, "0");
  const prefix = (settings.invoice_prefix || "INV").toUpperCase();
  const formattedNumber = `${prefix}-${yearStr}-${paddedNum}`;

  // Increment next_invoice_number in DB
  const nextNum = rawNum + 1;
  const updatedSettings: InvoiceSettingsData = {
    ...settings,
    next_invoice_number: nextNum,
  };

  try {
    const { data: existing } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "invoice_settings")
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from("admin_notifications")
        .update({ message: JSON.stringify(updatedSettings) })
        .eq("id", existing[0].id);
    } else {
      await supabase.from("admin_notifications").insert({
        type: "invoice_settings",
        email: "invoice_settings@system",
        message: JSON.stringify(updatedSettings),
        is_read: true,
      });
    }
  } catch (err) {
    console.error("Failed to increment next_invoice_number:", err);
  }

  return { formattedNumber, settings };
}
