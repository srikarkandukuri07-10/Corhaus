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

export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.create");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    // Branch isolation: verified active location (client values never trusted).
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const body = await req.json();
    const sessions = body.sessions;

    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({ error: "No sessions provided for scheduling." }, { status: 400 });
    }

    // Force every new session into the active branch (ignore client location_id).
    let currentInserts: any[] = JSON.parse(JSON.stringify(sessions)).map((s: any) => ({
      ...s,
      location_id: locationId,
    }));
    let lastError: any = null;

    // Retry loop stripping un-cached schema columns if PostgREST cache has not reloaded
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data, error } = await serviceClient.from("classes").insert(currentInserts).select();

      if (!error) {
        return NextResponse.json({ success: true, count: currentInserts.length, data });
      }

      lastError = error;
      const errMsg = error.message || "";

      // Extract un-cached column name from PostgREST error
      const match = errMsg.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[Schedule API] Stripping un-cached column '${missingCol}' and retrying...`);
        currentInserts = currentInserts.map((item) => {
          const clone = { ...item };
          delete clone[missingCol];
          return clone;
        });
      } else {
        // Fallback: strip optional non-core columns if schema is strictly basic
        console.warn(`[Schedule API] General insert error: ${errMsg}. Stripping extra fields.`);
        currentInserts = currentInserts.map(({ title, instructor, class_date, class_time, max_capacity, is_active }) => ({
          title,
          instructor,
          class_date,
          class_time,
          max_capacity: max_capacity || 10,
          is_active: is_active !== false,
          location_id: locationId,
        }));
      }
    }

    return NextResponse.json({ error: lastError?.message || "Failed to schedule sessions after retries." }, { status: 500 });
  } catch (err: any) {
    console.error("POST /api/admin/classes/schedule error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.edit");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const body = await req.json();
    const { id, ...updateFields } = body;

    if (!id) {
      return NextResponse.json({ error: "Session ID is required." }, { status: 400 });
    }

    // Verify the session belongs to the active branch; never allow moves.
    const { data: target } = await serviceClient.from("classes").select("location_id").eq("id", id).maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (target.location_id !== locationId) {
      return locationDenied("This session belongs to another location.");
    }
    delete (updateFields as any).location_id;

    let currentUpdate: any = JSON.parse(JSON.stringify(updateFields));
    let lastError: any = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      const { data, error } = await serviceClient
        .from("classes")
        .update(currentUpdate)
        .eq("id", id)
        .select();

      if (!error) {
        return NextResponse.json({ success: true, data });
      }

      lastError = error;
      const errMsg = error.message || "";

      const match = errMsg.match(/Could not find the '([^']+)' column/i);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[Schedule API PUT] Stripping un-cached column '${missingCol}' and retrying...`);
        delete currentUpdate[missingCol];
      } else {
        console.warn(`[Schedule API PUT] General update error: ${errMsg}. Stripping extra fields.`);
        const { title, instructor, class_date, class_time, max_capacity, is_active } = currentUpdate;
        currentUpdate = { title, instructor, class_date, class_time, max_capacity: max_capacity || 10, is_active: is_active !== false };
      }
    }

    return NextResponse.json({ error: lastError?.message || "Failed to update session after retries." }, { status: 500 });
  } catch (err: any) {
    console.error("PUT /api/admin/classes/schedule error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("classes.delete");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Session ID parameter is required." }, { status: 400 });
    }

    // Verify the session belongs to the active branch before deleting.
    const { data: target } = await serviceClient.from("classes").select("location_id").eq("id", id).maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    if (target.location_id !== locationId) {
      return locationDenied("This session belongs to another location.");
    }

    const { error } = await serviceClient.from("classes").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/admin/classes/schedule error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
