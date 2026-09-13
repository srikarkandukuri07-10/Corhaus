import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export interface BusinessProfileData {
  // Business Information
  logo_url: string;
  business_name: string;
  member_portal_url: string;
  email: string;
  phone: string;
  website: string;
  // Address
  address_line_1: string;
  address_line_2: string;
  country: string;
  city: string;
  state: string;
  pin_code: string;
  // Billing Profile
  legal_trade_name: string;
  attention_to: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_pin_code: string;
  billing_email: string;
  billing_phone: string;
  gstin: string;
  pan: string;
  // Business Details
  gst_number: string;
  business_registration_number: string;
  // Social Media
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
}

export const DEFAULT_BUSINESS_PROFILE: BusinessProfileData = {
  logo_url: "",
  business_name: "Corhaus Pilates",
  member_portal_url: "",
  email: "",
  phone: "",
  website: "",
  address_line_1: "",
  address_line_2: "",
  country: "India",
  city: "",
  state: "",
  pin_code: "",
  legal_trade_name: "",
  attention_to: "",
  billing_address: "",
  billing_city: "",
  billing_state: "",
  billing_pin_code: "",
  billing_email: "",
  billing_phone: "",
  gstin: "",
  pan: "",
  gst_number: "",
  business_registration_number: "",
  instagram_url: "",
  facebook_url: "",
  youtube_url: "",
};

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ─── GET /api/admin/settings/business-profile ──────────────────────────────
export async function GET() {
  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("business_profile")
      .select("*")
      .eq("id", "default")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching business profile:", error);
      return NextResponse.json({ profile: DEFAULT_BUSINESS_PROFILE });
    }

    if (!data) {
      return NextResponse.json({ profile: DEFAULT_BUSINESS_PROFILE });
    }

    // Merge with defaults so any newly-added columns fall back gracefully
    const profile: BusinessProfileData = {
      ...DEFAULT_BUSINESS_PROFILE,
      logo_url: data.logo_url ?? "",
      business_name: data.business_name ?? "Corhaus Pilates",
      member_portal_url: data.member_portal_url ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      website: data.website ?? "",
      address_line_1: data.address_line_1 ?? "",
      address_line_2: data.address_line_2 ?? "",
      country: data.country ?? "India",
      city: data.city ?? "",
      state: data.state ?? "",
      pin_code: data.pin_code ?? "",
      legal_trade_name: data.legal_trade_name ?? "",
      attention_to: data.attention_to ?? "",
      billing_address: data.billing_address ?? "",
      billing_city: data.billing_city ?? "",
      billing_state: data.billing_state ?? "",
      billing_pin_code: data.billing_pin_code ?? "",
      billing_email: data.billing_email ?? "",
      billing_phone: data.billing_phone ?? "",
      gstin: data.gstin ?? "",
      pan: data.pan ?? "",
      gst_number: data.gst_number ?? "",
      business_registration_number: data.business_registration_number ?? "",
      instagram_url: data.instagram_url ?? "",
      facebook_url: data.facebook_url ?? "",
      youtube_url: data.youtube_url ?? "",
    };

    return NextResponse.json({ profile });
  } catch (err: any) {
    console.error("GET /api/admin/settings/business-profile error:", err);
    return NextResponse.json({ profile: DEFAULT_BUSINESS_PROFILE });
  }
}

// ─── POST /api/admin/settings/business-profile ─────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getServiceClient();

    // Determine which section is being saved (partial update support)
    const isBillingOnly = body._section === "billing";

    let updates: Partial<BusinessProfileData> = {};

    if (isBillingOnly) {
      // Only billing profile fields
      updates = {
        legal_trade_name: (body.legal_trade_name ?? "").trim(),
        attention_to: (body.attention_to ?? "").trim(),
        billing_address: (body.billing_address ?? "").trim(),
        billing_city: (body.billing_city ?? "").trim(),
        billing_state: (body.billing_state ?? "").trim(),
        billing_pin_code: (body.billing_pin_code ?? "").trim(),
        billing_email: (body.billing_email ?? "").trim().toLowerCase(),
        billing_phone: (body.billing_phone ?? "").trim(),
        gstin: (body.gstin ?? "").trim().toUpperCase(),
        pan: (body.pan ?? "").trim().toUpperCase(),
      };

      // Validate GSTIN if provided
      if (updates.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(updates.gstin)) {
        return NextResponse.json(
          { error: "Invalid GSTIN format. Expected: 36AACCY1441J1ZB" },
          { status: 400 }
        );
      }

      // Validate PAN if provided
      if (updates.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(updates.pan)) {
        return NextResponse.json(
          { error: "Invalid PAN format. Expected: AACCY1441J" },
          { status: 400 }
        );
      }
    } else {
      // General profile fields (not billing)
      if (!body.business_name?.trim()) {
        return NextResponse.json(
          { error: "Business Name is required." },
          { status: 400 }
        );
      }

      // Validate email if provided
      const emailVal = (body.email ?? "").trim().toLowerCase();
      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        return NextResponse.json(
          { error: "Invalid email address." },
          { status: 400 }
        );
      }

      // Validate PIN code if provided (Indian 6-digit)
      const pinVal = (body.pin_code ?? "").trim();
      if (pinVal && !/^[1-9][0-9]{5}$/.test(pinVal)) {
        return NextResponse.json(
          { error: "Invalid PIN code. Must be a 6-digit Indian PIN code." },
          { status: 400 }
        );
      }

      updates = {
        business_name: body.business_name.trim(),
        member_portal_url: (body.member_portal_url ?? "").trim(),
        email: emailVal,
        phone: (body.phone ?? "").trim(),
        website: (body.website ?? "").trim(),
        address_line_1: (body.address_line_1 ?? "").trim(),
        address_line_2: (body.address_line_2 ?? "").trim(),
        country: (body.country ?? "India").trim(),
        city: (body.city ?? "").trim(),
        state: (body.state ?? "").trim(),
        pin_code: pinVal,
        gst_number: (body.gst_number ?? "").trim().toUpperCase(),
        business_registration_number: (body.business_registration_number ?? "").trim(),
        instagram_url: (body.instagram_url ?? "").trim(),
        facebook_url: (body.facebook_url ?? "").trim(),
        youtube_url: (body.youtube_url ?? "").trim(),
      };
    }

    // Upsert single row
    const { data, error } = await supabase
      .from("business_profile")
      .upsert({ id: "default", ...updates }, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert business profile:", error);
      return NextResponse.json(
        { error: "Failed to save business profile." },
        { status: 500 }
      );
    }

    const profile: BusinessProfileData = {
      ...DEFAULT_BUSINESS_PROFILE,
      logo_url: data.logo_url ?? "",
      business_name: data.business_name ?? "Corhaus Pilates",
      member_portal_url: data.member_portal_url ?? "",
      email: data.email ?? "",
      phone: data.phone ?? "",
      website: data.website ?? "",
      address_line_1: data.address_line_1 ?? "",
      address_line_2: data.address_line_2 ?? "",
      country: data.country ?? "India",
      city: data.city ?? "",
      state: data.state ?? "",
      pin_code: data.pin_code ?? "",
      legal_trade_name: data.legal_trade_name ?? "",
      attention_to: data.attention_to ?? "",
      billing_address: data.billing_address ?? "",
      billing_city: data.billing_city ?? "",
      billing_state: data.billing_state ?? "",
      billing_pin_code: data.billing_pin_code ?? "",
      billing_email: data.billing_email ?? "",
      billing_phone: data.billing_phone ?? "",
      gstin: data.gstin ?? "",
      pan: data.pan ?? "",
      gst_number: data.gst_number ?? "",
      business_registration_number: data.business_registration_number ?? "",
      instagram_url: data.instagram_url ?? "",
      facebook_url: data.facebook_url ?? "",
      youtube_url: data.youtube_url ?? "",
    };

    return NextResponse.json({
      success: true,
      message: isBillingOnly
        ? "Billing profile saved successfully."
        : "Business profile saved successfully.",
      profile,
    });
  } catch (err: any) {
    console.error("POST /api/admin/settings/business-profile error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save business profile." },
      { status: 500 }
    );
  }
}
