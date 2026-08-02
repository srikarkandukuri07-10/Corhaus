import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (serviceKey) {
    const serviceClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: serviceClient, user };
  }

  return { client: supabase, user };
}

export async function GET() {
  try {
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
    } = body;

    // Server-side validation
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return NextResponse.json({ error: "Full Name is required" }, { status: 400 });
    }
    if (!phone_number || typeof phone_number !== "string" || !phone_number.trim()) {
      return NextResponse.json({ error: "Phone Number is required" }, { status: 400 });
    }
    if (!trial_date || !trial_time) {
      return NextResponse.json({ error: "Trial Date and Time are required" }, { status: 400 });
    }
    if (!class_name || !class_name.trim()) {
      return NextResponse.json({ error: "Assigned Class is required" }, { status: 400 });
    }
    if (!instructor_name || !instructor_name.trim()) {
      return NextResponse.json({ error: "Assigned Instructor is required" }, { status: 400 });
    }

    const newRecord = {
      full_name: full_name.trim(),
      phone_number: phone_number.trim(),
      email: email ? email.trim() : null,
      trial_date,
      trial_time,
      class_id: class_id || null,
      class_name: class_name.trim(),
      instructor_id: instructor_id || null,
      instructor_name: instructor_name.trim(),
      notes: notes ? notes.trim() : null,
      status: "Scheduled",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("trial_members")
      .insert(newRecord)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
