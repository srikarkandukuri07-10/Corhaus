import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { full_name, phone_number, email, message, source } = body;

    // Validation
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return NextResponse.json({ error: "Full Name is required" }, { status: 400 });
    }
    if (!phone_number || typeof phone_number !== "string" || !phone_number.trim()) {
      return NextResponse.json({ error: "Phone Number is required" }, { status: 400 });
    }
    const cleanPhone = phone_number.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      return NextResponse.json({ error: "Phone Number must be exactly 10 digits" }, { status: 400 });
    }
    if (!email || typeof email !== "string" || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const emailTrimmed = email.trim().toLowerCase();
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(emailTrimmed)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }
    // Message is optional
    const messageText = typeof message === "string" ? message.trim() : "";

    // Source is determined server-side from the entry URL and cannot be set
    // arbitrarily by the client. Only the supported public enquiry sources
    // are accepted; anything missing or unknown becomes a generic Website lead.
    const sourceMap: Record<string, string> = {
      instagram: "Instagram",
      facebook: "Facebook",
      whatsapp: "WhatsApp",
    };
    const rawSource = typeof source === "string" ? source.trim().toLowerCase() : "";
    const finalSource = sourceMap[rawSource] || "Website";

    const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const newRecord: Record<string, unknown> = {
      full_name: full_name.trim(),
      phone_number: cleanPhone,
      email: emailTrimmed,
      source: finalSource,
      primary_location: "CorhausPilates - Main Branch",
      interest: null,
      convertibility: "Warm",
      pipeline_stage: "New",
      preferred_time: null,
      message: messageText || null,
      notes: messageText || null,
    };

    const result = await serviceClient.from("leads").insert(newRecord).select("*").single();

    if (result.error) {
      // Never create a trial member from this enquiry form. If the leads
      // table is missing, surface a clear error so the migration gets run.
      if (result.error.message?.includes("leads") || result.error.code === "PGRST204" || result.error.code === "42P01") {
        return NextResponse.json({ error: "Enquiry system not ready. Please run 044_create_leads_table.sql in Supabase SQL Editor.", needsMigration: true }, { status: 503 });
      }
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    // Notify admins about enquiries from social sources (Instagram/Facebook/WhatsApp)
    if (finalSource !== "Website") {
      try {
        await serviceClient.from("admin_notifications").insert({
          type: "new_lead",
          email: emailTrimmed,
          message: `New ${finalSource} enquiry from ${full_name.trim()} (${cleanPhone})`,
          is_read: false,
        });
      } catch {
        // Notification failure must not block the enquiry
      }
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
