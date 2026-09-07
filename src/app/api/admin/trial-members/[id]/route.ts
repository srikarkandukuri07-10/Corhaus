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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Missing trial member ID" }, { status: 400 });
    }

    const body = await req.json();
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const isValidUUID = (val: any) =>
      typeof val === "string" &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);

    if (body.full_name !== undefined) updatePayload.full_name = body.full_name;
    if (body.phone_number !== undefined) {
      const cleanPhone = body.phone_number.replace(/\D/g, "");
      if (cleanPhone.length !== 10) return NextResponse.json({ error: "Phone must be 10 digits" }, { status: 400 });
      updatePayload.phone_number = cleanPhone;
    }
    if (body.email !== undefined) {
      if (!body.email || !body.email.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(body.email.trim())) return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      updatePayload.email = body.email.trim().toLowerCase();
    }
    if (body.trial_date !== undefined) updatePayload.trial_date = body.trial_date;
    if (body.trial_time !== undefined) updatePayload.trial_time = body.trial_time;
    if (body.class_id !== undefined) updatePayload.class_id = isValidUUID(body.class_id) ? body.class_id : null;
    if (body.class_name !== undefined) updatePayload.class_name = body.class_name;
    if (body.instructor_id !== undefined) updatePayload.instructor_id = isValidUUID(body.instructor_id) ? body.instructor_id : null;
    if (body.instructor_name !== undefined) updatePayload.instructor_name = body.instructor_name;

    if (body.status !== undefined) {
      const allowedStatuses = ["Scheduled", "Attended", "No Show", "Converted"];
      if (!allowedStatuses.includes(body.status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      updatePayload.status = body.status;
    }
    if (body.notes !== undefined) updatePayload.notes = body.notes;
    if (body.source !== undefined) {
      const allowed = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Other"];
      if (allowed.includes(body.source)) updatePayload.source = body.source;
    }
    if (body.source_detail !== undefined) updatePayload.source_detail = body.source_detail;
    if (body.interest !== undefined) updatePayload.interest = body.interest;
    if (body.convertibility !== undefined) {
      const allowed = ["Hot", "Warm", "Cold", "Others"];
      if (allowed.includes(body.convertibility)) updatePayload.convertibility = body.convertibility;
    }
    if (body.assigned_staff_id !== undefined) updatePayload.assigned_staff_id = isValidUUID(body.assigned_staff_id) ? body.assigned_staff_id : null;
    if (body.pipeline_stage !== undefined) {
      const allowed = ["New", "Qualified", "Follow-up", "Trial Booked", "Trial Attended", "Negotiating", "Converted", "Lost"];
      if (allowed.includes(body.pipeline_stage)) updatePayload.pipeline_stage = body.pipeline_stage;
    }
    if (body.primary_location !== undefined) updatePayload.primary_location = body.primary_location;
    if (body.preferred_time !== undefined) updatePayload.preferred_time = body.preferred_time;
    if (body.message !== undefined) updatePayload.message = body.message;

    let result = await client.from("trial_members").update(updatePayload).eq("id", id).select("*").single();
    let error = result.error;
    if (error && error.code === "PGRST204" && error.message?.includes("column")) {
      // Fallback for old DB - strip new columns and retry
      const fallbackPayload: Record<string, any> = {};
      const oldKeys = ["full_name", "phone_number", "email", "trial_date", "trial_time", "class_id", "class_name", "instructor_id", "instructor_name", "status", "notes", "updated_at"];
      for (const k of oldKeys) if (updatePayload[k] !== undefined) fallbackPayload[k] = updatePayload[k];
      const retry = await client.from("trial_members").update(fallbackPayload).eq("id", id).select("*").single();
      if (retry.error) return NextResponse.json({ error: retry.error.message }, { status: 400 });
      return NextResponse.json({ data: retry.data, success: true, fallback: true });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: result.data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;
    const { id } = await params;

    const { error } = await client.from("trial_members").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
