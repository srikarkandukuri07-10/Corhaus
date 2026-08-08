import { NextResponse } from "next/server";
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

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettingsData = {
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

const STATE_CODES: Record<string, string> = {
  "01": "01 - Jammu and Kashmir",
  "02": "02 - Himachal Pradesh",
  "03": "03 - Punjab",
  "04": "04 - Chandigarh",
  "05": "05 - Uttarakhand",
  "06": "06 - Haryana",
  "07": "07 - Delhi",
  "08": "08 - Rajasthan",
  "09": "09 - Uttar Pradesh",
  "10": "10 - Bihar",
  "11": "11 - Sikkim",
  "12": "12 - Arunachal Pradesh",
  "13": "13 - Nagaland",
  "14": "14 - Manipur",
  "15": "15 - Mizoram",
  "16": "16 - Tripura",
  "17": "17 - Meghalaya",
  "18": "18 - Assam",
  "19": "19 - West Bengal",
  "20": "20 - Jharkhand",
  "21": "21 - Odisha",
  "22": "22 - Chhattisgarh",
  "23": "23 - Madhya Pradesh",
  "24": "24 - Gujarat",
  "27": "27 - Maharashtra",
  "29": "29 - Karnataka",
  "30": "30 - Goa",
  "32": "32 - Kerala",
  "33": "33 - Tamil Nadu",
  "36": "36 - Telangana",
  "37": "37 - Andhra Pradesh",
};

function derivePanAndState(gstin: string, currentState: string, currentPan: string) {
  const cleanGstin = (gstin || "").trim().toUpperCase();
  let pan = currentPan || "";
  let state = currentState || "36 - Telangana";

  if (cleanGstin.length >= 2) {
    const code = cleanGstin.substring(0, 2);
    if (STATE_CODES[code]) {
      state = STATE_CODES[code];
    }
  }

  if (cleanGstin.length >= 12) {
    pan = cleanGstin.substring(2, 12);
  }

  return { cleanGstin, pan, state };
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// GET: Fetch saved invoice settings
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("admin_notifications")
      .select("*")
      .eq("type", "invoice_settings")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error reading invoice settings:", error);
      return NextResponse.json({ settings: DEFAULT_INVOICE_SETTINGS });
    }

    if (data && data.length > 0 && data[0].message) {
      try {
        const parsed = JSON.parse(data[0].message);
        const merged: InvoiceSettingsData = {
          ...DEFAULT_INVOICE_SETTINGS,
          ...parsed,
        };
        return NextResponse.json({ settings: merged });
      } catch (e) {
        console.error("Failed to parse invoice settings JSON:", e);
      }
    }

    return NextResponse.json({ settings: DEFAULT_INVOICE_SETTINGS });
  } catch (err: any) {
    console.error("GET /api/admin/settings/invoice error:", err);
    return NextResponse.json({ settings: DEFAULT_INVOICE_SETTINGS });
  }
}

// POST: Save/update invoice settings permanently
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getServiceClient();

    const { cleanGstin, pan, state } = derivePanAndState(
      body.gstin || "",
      body.state || "",
      body.pan || ""
    );

    const updatedSettings: InvoiceSettingsData = {
      issue_tax_invoices: Boolean(body.issue_tax_invoices ?? true),
      tax_pricing_mode: body.tax_pricing_mode === "exclusive" ? "exclusive" : "inclusive",
      gstin: cleanGstin || DEFAULT_INVOICE_SETTINGS.gstin,
      legal_business_name: (body.legal_business_name || "").trim() || DEFAULT_INVOICE_SETTINGS.legal_business_name,
      pan: pan || DEFAULT_INVOICE_SETTINGS.pan,
      state: state || DEFAULT_INVOICE_SETTINGS.state,
      invoice_prefix: (body.invoice_prefix || "").trim().toUpperCase() || "INV",
      next_invoice_number: Math.max(1, parseInt(body.next_invoice_number, 10) || 1),
      default_payment_due_days: Math.max(0, parseInt(body.default_payment_due_days, 10) ?? 15),
      footer_note: (body.footer_note || "").trim() || DEFAULT_INVOICE_SETTINGS.footer_note,
      terms_and_conditions: (body.terms_and_conditions || "").trim() || DEFAULT_INVOICE_SETTINGS.terms_and_conditions,
      allow_flat_discount: Boolean(body.allow_flat_discount ?? true),
      max_staff_discount_pct: Math.min(100, Math.max(0, parseFloat(body.max_staff_discount_pct) || 0)),
    };

    const jsonString = JSON.stringify(updatedSettings);

    const { data: existing } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("type", "invoice_settings")
      .limit(1);

    if (existing && existing.length > 0) {
      const { error: updErr } = await supabase
        .from("admin_notifications")
        .update({
          message: jsonString,
          is_read: true,
        })
        .eq("id", existing[0].id);

      if (updErr) {
        console.error("Failed to update invoice settings:", updErr);
        return NextResponse.json(
          { error: "Failed to save invoice settings." },
          { status: 500 }
        );
      }
    } else {
      const { error: insErr } = await supabase
        .from("admin_notifications")
        .insert({
          type: "invoice_settings",
          email: "invoice_settings@system",
          message: jsonString,
          is_read: true,
        });

      if (insErr) {
        console.error("Failed to insert invoice settings:", insErr);
        return NextResponse.json(
          { error: "Failed to create invoice settings." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Invoice settings saved successfully.",
      settings: updatedSettings,
    });
  } catch (err: any) {
    console.error("POST /api/admin/settings/invoice error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save settings." },
      { status: 500 }
    );
  }
}
