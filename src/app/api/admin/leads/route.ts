import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const { getUserRolePermissions } = await import("@/lib/rbac");
  const userPerms = await getUserRolePermissions(user);
  if (userPerms.role === "Member" || userPerms.role === "Guest") return { error: "Forbidden", status: 403 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return { client: serviceClient, serviceClient, user };
}

export async function GET() {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;
    const auth = await getAdminClient();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.client.from("leads").select("*").order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json();
    const { full_name, phone_number, email, source, primary_location, interest, convertibility, pipeline_stage, assigned_to, follow_up_at, notes, preferred_time, message } = body;

    if (!full_name?.trim()) return NextResponse.json({ error: "Full Name is required" }, { status: 400 });
    const cleanPhone = (phone_number || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) return NextResponse.json({ error: "Phone must be 10 digits" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    const emailTrimmed = email.trim().toLowerCase();
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailTrimmed)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const allowedSources = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Other"];
    const allowedConvert = ["Hot", "Warm", "Cold", "Others"];
    const allowedStage = ["New", "Qualified", "Follow-up", "Trial Booked", "Trial Attended", "Negotiating", "Converted", "Lost"];

    const record: Record<string, unknown> = {
      full_name: full_name.trim(),
      phone_number: cleanPhone,
      email: emailTrimmed,
      source: allowedSources.includes(source) ? source : "Website",
      primary_location: primary_location || "CorhausPilates - Main Branch",
      interest: interest || null,
      convertibility: allowedConvert.includes(convertibility) ? convertibility : "Others",
      pipeline_stage: allowedStage.includes(pipeline_stage) ? pipeline_stage : "New",
      assigned_to: assigned_to || null,
      follow_up_at: follow_up_at || null,
      notes: notes || null,
      preferred_time: preferred_time || null,
      message: message || null,
    };

    const { data, error } = await auth.client.from("leads").insert(record).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
