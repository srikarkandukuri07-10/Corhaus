import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };
  const { getUserRolePermissions } = await import("@/lib/rbac");
  const perms = await getUserRolePermissions(user);
  if (perms.role === "Member" || perms.role === "Guest") return { error: "Forbidden", status: 403 };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return { client, user };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;
    const auth = await getAdminClient();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await req.json();

    // Branch isolation: the row must belong to the verified active branch;
    // rows can never be moved across branches via edit.
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");
    const { data: existing } = await auth.client.from("leads").select("location_id").eq("id", id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (existing.location_id !== locationId) return locationDenied("This record belongs to another location.");
    delete body.location_id;

    const payload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.full_name !== undefined) payload.full_name = body.full_name;
    if (body.phone_number !== undefined) {
      const clean = body.phone_number.replace(/\D/g, "");
      if (clean.length !== 10) return NextResponse.json({ error: "Phone must be 10 digits" }, { status: 400 });
      payload.phone_number = clean;
    }
    if (body.email !== undefined) {
      if (!body.email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(body.email.trim())) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      payload.email = body.email.trim().toLowerCase();
    }
    if (body.source !== undefined) {
      const allowed = ["Walk-in", "Phone", "Instagram", "Website", "WhatsApp", "Referral", "Facebook", "Google", "Other"];
      if (!allowed.includes(body.source)) return NextResponse.json({ error: "Invalid Source" }, { status: 400 });
      payload.source = body.source;
    }
    if (body.primary_location !== undefined) payload.primary_location = body.primary_location;
    if (body.interest !== undefined) {
      const allowed = ["General Membership", "Personal Training", "Group Classes", "Yoga", "Zumba", "CrossFit", "Kickboxing/MMA", "Trial Class", "Just Enquiring", "Other", "Reformer Pilates", "Mat Pilates", "Private Session"];
      if (body.interest !== null && !allowed.includes(body.interest)) return NextResponse.json({ error: "Invalid Interest" }, { status: 400 });
      payload.interest = body.interest;
    }
    if (body.convertibility !== undefined) {
      const allowed = ["Hot", "Warm", "Cold"];
      if (!allowed.includes(body.convertibility)) return NextResponse.json({ error: "Convertibility must be Hot, Warm or Cold" }, { status: 400 });
      payload.convertibility = body.convertibility;
    }
    if (body.pipeline_stage !== undefined) {
      const allowed = ["New", "Converted", "Trial booked", "Trial attended"];
      if (!allowed.includes(body.pipeline_stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      payload.pipeline_stage = body.pipeline_stage;
    }
    if (body.assigned_to !== undefined) payload.assigned_to = body.assigned_to;
    if (body.follow_up_at !== undefined) {
      payload.follow_up_at = body.follow_up_at;
      // Scheduling (or clearing) a follow-up reopens the loop, unless completion
      // is explicitly set in the same patch.
      if (body.follow_up_outcome === undefined && body.follow_up_completed_at === undefined) {
        payload.follow_up_outcome = null;
        payload.follow_up_completed_at = null;
      }
    }
    if (body.follow_up_outcome !== undefined) {
      const allowed = ["Interested", "Not Interested", "No Response", "Asked to Call Later"];
      if (body.follow_up_outcome !== null && !allowed.includes(body.follow_up_outcome)) {
        return NextResponse.json({ error: "Invalid follow-up outcome" }, { status: 400 });
      }
      payload.follow_up_outcome = body.follow_up_outcome;
      // Completing without an explicit timestamp stamps now server-side.
      if (body.follow_up_outcome !== null && body.follow_up_completed_at === undefined) {
        payload.follow_up_completed_at = new Date().toISOString();
      }
      if (body.follow_up_outcome === null && body.follow_up_completed_at === undefined) {
        payload.follow_up_completed_at = null;
      }
    }
    if (body.follow_up_completed_at !== undefined) payload.follow_up_completed_at = body.follow_up_completed_at;
    if (body.notes !== undefined) payload.notes = body.notes;
    if (body.preferred_time !== undefined) payload.preferred_time = body.preferred_time;
    if (body.message !== undefined) payload.message = body.message;

    const { data, error } = await auth.client.from("leads").update(payload).eq("id", id).select("*").single();
    if (error) {
      if (error.message?.includes("follow_up_outcome") || error.message?.includes("follow_up_completed_at") || error.code === "PGRST204") {
        return NextResponse.json({ error: "Follow-up completion is not ready. Please run 051_leads_followup_completion.sql in Supabase SQL Editor." }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data, success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;
    const auth = await getAdminClient();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { id } = await params;

    // Branch isolation: only delete rows in the verified active branch.
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const delLocationId = resolveActiveLocation(locAccess, req);
    if (!delLocationId) return locationDenied("No accessible location found for this account.");
    const { data: delTarget } = await auth.client.from("leads").select("location_id").eq("id", id).maybeSingle();
    if (!delTarget) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    if (delTarget.location_id !== delLocationId) return locationDenied("This record belongs to another location.");

    const { error } = await auth.client.from("leads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
