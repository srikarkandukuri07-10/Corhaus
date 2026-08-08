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
      return { ...DEFAULT_SETTINGS, ...parsed };
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
