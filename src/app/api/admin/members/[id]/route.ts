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

  return { client: serviceClient, serviceClient, user, profile, permissions: userPerms.permissions };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;
    const { id: memberId } = await params;

    if (!memberId) {
      return NextResponse.json({ error: "Missing member ID" }, { status: 400 });
    }

    // Branch isolation
    const { getLocationAccess, resolveActiveLocation, locationDenied } = await import("@/lib/location");
    const locAccess = await getLocationAccess(auth.user);
    const locationId = resolveActiveLocation(locAccess, req);

    // Verify member exists
    let existingQuery = serviceClient.from("approved_members").select("*").eq("id", memberId);
    if (locationId) {
      existingQuery = existingQuery.eq("location_id", locationId);
    }
    const { data: existingMember, error: fetchErr } = await existingQuery.maybeSingle();

    if (fetchErr || !existingMember) {
      return NextResponse.json({ error: "Member not found or not in this branch." }, { status: 404 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (body.full_name !== undefined) {
      const trimmed = String(body.full_name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Full name cannot be empty." }, { status: 400 });
      }
      updateData.full_name = trimmed;
    }

    if (body.phone_number !== undefined) {
      const cleanPhone = String(body.phone_number).replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        return NextResponse.json({ error: "Please enter a valid phone number (at least 10 digits)." }, { status: 400 });
      }
      updateData.phone_number = cleanPhone;
    }

    if (body.email !== undefined) {
      const cleanEmail = body.email ? String(body.email).trim().toLowerCase() : null;
      updateData.email = cleanEmail;
    }

    if (body.membership_status !== undefined) {
      const validStatuses = ["active", "inactive", "frozen", "cancelled"];
      const s = String(body.membership_status).toLowerCase();
      if (validStatuses.includes(s)) {
        updateData.membership_status = s;
        updateData.freeze_status = s === "frozen" ? "frozen" : "active";
      }
    }

    if (body.membership_level !== undefined) {
      updateData.membership_level = String(body.membership_level).trim() || "Beginner";
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    // Apply update to approved_members
    const { data: updatedMember, error: updateErr } = await serviceClient
      .from("approved_members")
      .update(updateData)
      .eq("id", memberId)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[ADMIN MEMBERS API] Update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Synchronize purchased plans freeze status if membership_status was updated
    if (updateData.membership_status) {
      try {
        await serviceClient
          .from("member_purchased_plans")
          .update({
            status: updateData.membership_status === "frozen" ? "frozen" : "active",
            freeze_status: updateData.freeze_status,
          })
          .eq("approved_member_id", memberId);
      } catch (planErr) {
        console.warn("[ADMIN MEMBERS API] Plan freeze sync warning:", planErr);
      }
    }

    // Synchronize customer record if linked
    try {
      const customerUpdate: Record<string, any> = {};
      if (updateData.full_name) customerUpdate.name = updateData.full_name;
      if (updateData.email !== undefined) customerUpdate.email = updateData.email;
      if (updateData.phone_number) customerUpdate.phone = updateData.phone_number;

      if (Object.keys(customerUpdate).length > 0) {
        await serviceClient
          .from("customers")
          .update(customerUpdate)
          .eq("approved_member_id", memberId);
      }
    } catch (custErr) {
      console.warn("[ADMIN MEMBERS API] Customer sync warning:", custErr);
    }

    // Synchronize profile if email matches
    if (existingMember.email) {
      try {
        const profUpdate: Record<string, any> = {};
        if (updateData.full_name) profUpdate.full_name = updateData.full_name;
        if (updateData.phone_number) profUpdate.phone_number = updateData.phone_number;
        if (updateData.email && updateData.email !== existingMember.email) {
          profUpdate.email = updateData.email;
        }

        if (Object.keys(profUpdate).length > 0) {
          await serviceClient
            .from("profiles")
            .update(profUpdate)
            .ilike("email", existingMember.email);
        }
      } catch (profErr) {
        console.warn("[ADMIN MEMBERS API] Profile sync warning:", profErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Member updated successfully.",
      member: updatedMember,
    });
  } catch (err: any) {
    console.error("[ADMIN MEMBERS API] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(req, context);
}
