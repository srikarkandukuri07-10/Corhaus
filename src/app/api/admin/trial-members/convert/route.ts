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
    const check = await verifyApiPermission("members.trial");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { client } = auth;

    const body = await req.json();
    const { trial_id, member_id } = body;

    if (!trial_id || !member_id) {
      return NextResponse.json({ error: "Missing trial_id or member_id" }, { status: 400 });
    }

    // Branch isolation + cross-branch validation: trial and member must both
    // belong to the verified active branch (converting across branches rejected).
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);
    if (!locationId) return locationDenied("No accessible location found for this account.");
    const [{ data: trialRow }, { data: memberRow }] = await Promise.all([
      client.from("trial_members").select("id, location_id").eq("id", trial_id).maybeSingle(),
      client.from("approved_members").select("id, location_id").eq("id", member_id).maybeSingle(),
    ]);
    if (!trialRow) {
      return NextResponse.json({ error: "Trial record not found." }, { status: 404 });
    }
    if (!memberRow) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    if (trialRow.location_id !== locationId || memberRow.location_id !== locationId) {
      return locationDenied("Trial and member must belong to the active location.");
    }

    const { data, error } = await client
      .from("trial_members")
      .update({
        status: "Converted",
        converted_member_id: member_id,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", trial_id)
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
