import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { full_name, phone_number, email, interest, preferred_time, message, source } = body;

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
    if (!interest || typeof interest !== "string" || !interest.trim()) {
      return NextResponse.json({ error: "Interest is required" }, { status: 400 });
    }

    const allowedSources = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Other"];
    const finalSource = allowedSources.includes(source) ? source : "Website";

    const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

    const newRecord: Record<string, unknown> = {
      full_name: full_name.trim(),
      phone_number: cleanPhone,
      email: emailTrimmed,
      source: finalSource,
      primary_location: "CorhausPilates - Main Branch",
      interest: interest.trim(),
      convertibility: "Warm",
      pipeline_stage: "New",
      preferred_time: preferred_time || null,
      message: message ? message.trim() : null,
      notes: message ? message.trim() : null,
    };

    let result = await serviceClient.from("leads").insert(newRecord).select("*").single();

    if (result.error) {
      // Fallback for old DB without leads table - try trial_members
      if (result.error.message?.includes("leads") || result.error.code === "PGRST204" || result.error.code === "42P01") {
        const trialFallback: Record<string, unknown> = {
          full_name: full_name.trim(),
          phone_number: cleanPhone,
          email: emailTrimmed,
          trial_date: new Date().toISOString().split("T")[0],
          trial_time: "09:00",
          class_name: interest.trim(),
          instructor_name: "Staff",
          notes: message ? message.trim() : null,
          status: "Scheduled",
          source: finalSource,
          interest: interest.trim(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const retry = await serviceClient.from("trial_members").insert(trialFallback).select("*").single();
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
        return NextResponse.json({ success: true, data: retry.data, fallback: true });
      }
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
