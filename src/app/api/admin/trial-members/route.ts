import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") {
    return { error: "Forbidden", status: 403 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { client: serviceClient, serviceClient, user, profile };
}

export async function GET() {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const { data, error } = await client
      .from("trial_members")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const body = await req.json();
    const {
      full_name,
      phone_number,
      email,
      trial_date,
      trial_time,
      class_id,
      class_name,
      instructor_id,
      instructor_name,
      notes,
      source,
      source_detail,
      interest,
      convertibility,
      assigned_staff_id,
      pipeline_stage,
      primary_location,
      preferred_time,
      message,
    } = body;

    // Server-side validation - Email is REQUIRED per spec
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return NextResponse.json({ error: "Full Name is required" }, { status: 400 });
    }
    if (!phone_number || typeof phone_number !== "string" || !phone_number.trim()) {
      return NextResponse.json({ error: "Phone Number is required" }, { status: 400 });
    }
    // Indian phone validation - exactly 10 digits
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
    // For trial members, trial_date/time are required, but for general leads (from /trial) we allow defaults
    const finalTrialDate = trial_date || new Date().toISOString().split("T")[0];
    const finalTrialTime = trial_time || preferred_time || "09:00";
    if (!class_name || !class_name.trim()) {
      // For general leads, class_name can be the interest
      if (!interest || !interest.trim()) {
        return NextResponse.json({ error: "Assigned Class or Interest is required" }, { status: 400 });
      }
    }
    if (!instructor_name || !instructor_name.trim()) {
      // For general leads without instructor, use a default
      if (!interest) {
        return NextResponse.json({ error: "Assigned Instructor is required" }, { status: 400 });
      }
    }

    const isValidUUID = (val: any) =>
      typeof val === "string" &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);

    // Source validation - only allow valid sources
    const allowedSources = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Other"];
    const finalSource = allowedSources.includes(source) ? source : "Website";
    const finalSourceDetail = source_detail ? source_detail.trim() : null;

    const allowedConvertibility = ["Hot", "Warm", "Cold", "Others"];
    const finalConvertibility = allowedConvertibility.includes(convertibility) ? convertibility : "Warm";

    const allowedPipeline = ["New", "Qualified", "Follow-up", "Trial Booked", "Trial Attended", "Negotiating", "Converted", "Lost"];
    const finalPipelineStage = allowedPipeline.includes(pipeline_stage) ? pipeline_stage : "New";

    const newRecord: Record<string, unknown> = {
      full_name: full_name.trim(),
      phone_number: cleanPhone,
      email: emailTrimmed,
      trial_date: finalTrialDate,
      trial_time: finalTrialTime,
      class_id: isValidUUID(class_id) ? class_id : null,
      class_name: (class_name || interest || "General Enquiry").trim(),
      instructor_id: isValidUUID(instructor_id) ? instructor_id : null,
      instructor_name: (instructor_name || "Staff").trim(),
      notes: notes ? notes.trim() : (message ? message.trim() : null),
      status: "Scheduled",
      source: finalSource,
      source_detail: finalSourceDetail,
      interest: interest ? interest.trim() : null,
      convertibility: finalConvertibility,
      assigned_staff_id: isValidUUID(assigned_staff_id) ? assigned_staff_id : null,
      pipeline_stage: finalPipelineStage,
      primary_location: primary_location || "CorhausPilates - Main Branch",
      preferred_time: preferred_time || null,
      message: message ? message.trim() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };


    const { data, error } = await client
      .from("trial_members")
      .insert(newRecord)
      .select("*")
      .single();

    if (error) {
      // Fallback for DBs that haven't run 043 migration yet - retry with minimal old columns
      if (error.code === "PGRST204" && error.message?.includes("column")) {
        const minimalRecord: Record<string, unknown> = {
          full_name: newRecord.full_name,
          phone_number: newRecord.phone_number,
          email: newRecord.email,
          trial_date: newRecord.trial_date,
          trial_time: newRecord.trial_time,
          class_id: newRecord.class_id,
          class_name: newRecord.class_name,
          instructor_id: newRecord.instructor_id,
          instructor_name: newRecord.instructor_name,
          notes: newRecord.notes,
          status: newRecord.status,
          created_at: newRecord.created_at,
          updated_at: newRecord.updated_at,
        };
        const retry = await client.from("trial_members").insert(minimalRecord).select("*").single();
        if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
        return NextResponse.json({ data: retry.data, success: true, fallback: true });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
