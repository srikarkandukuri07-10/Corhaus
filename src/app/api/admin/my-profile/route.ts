import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/constants";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAuthenticatedStaff() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: "Unauthorized", status: 401 as const };

  const normalizedEmail = user.email.trim().toLowerCase();
  const serviceClient = getServiceClient();

  // Primary: resolve via staff_roles.user_id (stable even if staff email was changed via My Profile)
  let staff: any = null;
  try {
    const { data: sr } = await serviceClient.from("staff_roles").select("staff_id").eq("user_id", user.id).maybeSingle();
    if (sr?.staff_id) {
      const { data: bySr } = await serviceClient.from("staff_members").select("*").eq("id", sr.staff_id).maybeSingle();
      if (bySr) staff = bySr;
    }
  } catch {}
  if (!staff) {
    const { data: byEmail } = await serviceClient.from("staff_members").select("*").ilike("email", normalizedEmail).maybeSingle();
    if (byEmail) staff = byEmail;
  }

  // Owner fallback: admin email without staff_members row
  if (!staff && isAdminEmail(user.email)) {
    return {
      user,
      staff: null as any,
      isOwnerFallback: true,
      normalizedEmail,
      serviceClient,
    };
  }

  if (!staff) {
    return { error: "Staff profile not found for this account", status: 404 as const };
  }

  if (staff.employment_status === "Inactive") {
    return { error: "Staff account is inactive", status: 403 as const };
  }

  return { user, staff, normalizedEmail, serviceClient, isOwnerFallback: false };
}

export async function GET() {
  try {
    const auth = await getAuthenticatedStaff();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (auth.isOwnerFallback) {
      // Synthetic Owner profile from auth user
      const synthetic = {
        id: `owner-fallback-${auth.user.id}`,
        full_name: auth.user.user_metadata?.full_name || auth.user.email?.split("@")[0] || "Owner",
        email: auth.normalizedEmail,
        phone_number: "",
        role: "Owner",
        designation: "Business Owner",
        location: "Main Studio",
        employment_status: "Active",
        joining_date: new Date().toISOString().split("T")[0],
        specialization: null,
        experience_years: 0,
        certifications: null,
        classes_assigned: null,
        pt_available: false,
        group_class_available: false,
        monthly_salary: 0,
        pt_commission: 0,
        group_class_commission: 0,
        payment_type: "Salary",
        gender: null,
        date_of_birth: null,
        emergency_contact_name: null,
        emergency_contact_number: null,
        address: null,
        bank_name: null,
        account_holder_name: null,
        account_number: null,
        ifsc_code: null,
        upi_id: null,
        isOwnerFallback: true,
      };
      return NextResponse.json({ staff: synthetic }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
    }

    return NextResponse.json({ staff: auth.staff }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (err: any) {
    console.error("GET /api/admin/my-profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthenticatedStaff();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();

    // Role is read-only: ignore any role supplied by client
    // Use existing staff role
    const existingRole = auth.isOwnerFallback ? "Owner" : auth.staff.role;
    const isOwnerFallback = auth.isOwnerFallback;

    // Validation — mirrors POST /api/admin/staff
    const fullName = (body.full_name || "").trim();
    const phoneNumber = (body.phone_number || "").trim();
    const designation = (body.designation || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const location = (body.location || "Main Studio").trim();

    if (!fullName) return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    if (!phoneNumber) return NextResponse.json({ error: "Phone Number is required." }, { status: 400 });
    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json({ error: "Phone Number must be exactly 10 digits." }, { status: 400 });
    }
    if (!designation) return NextResponse.json({ error: "Designation is required." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid Email address format." }, { status: 400 });
    }
    if (body.emergency_contact_number && (body.emergency_contact_number || "").trim() && !/^\d{10}$/.test((body.emergency_contact_number || "").trim())) {
      return NextResponse.json({ error: "Emergency Contact Number must be 10 digits." }, { status: 400 });
    }

    const serviceClient = auth.serviceClient;

    // Duplicate phone check (exclude own record if not fallback)
    if (!isOwnerFallback) {
      const { data: dupPhone } = await serviceClient
        .from("staff_members")
        .select("id")
        .eq("phone_number", phoneNumber)
        .neq("id", auth.staff.id)
        .maybeSingle();
      if (dupPhone) {
        return NextResponse.json({ error: "Phone Number is already registered for another staff member." }, { status: 400 });
      }
    } else {
      const { data: dupPhone } = await serviceClient.from("staff_members").select("id").eq("phone_number", phoneNumber).maybeSingle();
      if (dupPhone) {
        return NextResponse.json({ error: "Phone Number is already registered for another staff member." }, { status: 400 });
      }
    }

    // Duplicate email check if email changed
    if (email && !isOwnerFallback && email !== (auth.staff.email || "").toLowerCase()) {
      const { data: dupEmail } = await serviceClient.from("staff_members").select("id").ilike("email", email).neq("id", auth.staff.id).maybeSingle();
      if (dupEmail) {
        return NextResponse.json({ error: "Email is already registered for another staff member." }, { status: 400 });
      }
    }

    const updatePayload: Record<string, any> = {
      full_name: fullName,
      phone_number: phoneNumber,
      email: email || null,
      // role is NOT updated — keep existing
      designation: designation,
      location: location,
      gender: body.gender || null,
      date_of_birth: body.date_of_birth || null,
      emergency_contact_name: (body.emergency_contact_name || "").trim() || null,
      emergency_contact_number: (body.emergency_contact_number || "").trim() || null,
      address: (body.address || "").trim() || null,
      bank_name: (body.bank_name || "").trim() || null,
      account_holder_name: (body.account_holder_name || "").trim() || null,
      account_number: (body.account_number || "").trim() || null,
      ifsc_code: (body.ifsc_code || "").trim() || null,
      upi_id: (body.upi_id || "").trim() || null,
      specialization: (body.specialization || "").trim() || null,
      experience_years: body.experience_years != null && !isNaN(Number(body.experience_years)) ? Math.max(0, Number(body.experience_years)) : 0,
      certifications: (body.certifications || "").trim() || null,
      classes_assigned: (body.classes_assigned || "").trim() || null,
      pt_available: body.pt_available !== undefined ? Boolean(body.pt_available) : isOwnerFallback ? false : auth.staff.pt_available,
      group_class_available: body.group_class_available !== undefined ? Boolean(body.group_class_available) : isOwnerFallback ? false : auth.staff.group_class_available,
      payment_type: body.payment_type || (isOwnerFallback ? "Salary" : auth.staff.payment_type) || "Salary",
      // keep employment_status, joining_date, role, salary/commissions unchanged via self-edit
      // salary fields are not editable via My Profile
      updated_at: new Date().toISOString(),
    };

    // Owner fallback: create staff_members row on first save
    if (isOwnerFallback) {
      // Branch-tag the new Owner row (post-054 location_id is NOT NULL).
      let ownerBranch: string | null = null;
      try {
        const { getLocationAccess, resolveActiveLocation } = await import("@/lib/location");
        const ownerAccess = await getLocationAccess(auth.user);
        ownerBranch = resolveActiveLocation(ownerAccess, req);
        if (!ownerBranch) {
          const { data: main } = await serviceClient.from("locations").select("id").eq("slug", "main-studio").maybeSingle();
          ownerBranch = (main as any)?.id || null;
        }
      } catch {}
      const insertPayload: Record<string, unknown> = {
        ...updatePayload,
        role: "Owner",
        employment_status: "Active",
        joining_date: new Date().toISOString().split("T")[0],
        ...(ownerBranch ? { location_id: ownerBranch } : {}),
      };
      const { data, error } = await serviceClient.from("staff_members").insert(insertPayload).select().single();
      if (error) {
        return NextResponse.json({ error: "Failed to create staff profile: " + error.message }, { status: 500 });
      }
      // Upsert staff_roles link for the newly created Owner row
      try {
        const { data: roleObj } = await serviceClient.from("roles").select("id").ilike("name", "Owner").maybeSingle();
        if (roleObj) {
          await serviceClient.from("staff_roles").upsert({ staff_id: data.id, user_id: auth.user.id, role_id: roleObj.id }, { onConflict: "staff_id" });
        }
      } catch {}
      return NextResponse.json({ success: true, staff: data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    // Regular staff: update own row only
    const { data, error } = await serviceClient.from("staff_members").update(updatePayload).eq("id", auth.staff.id).select().single();
    if (error) {
      return NextResponse.json({ error: "Failed to update profile: " + error.message }, { status: 500 });
    }

    // Ensure email change does not break future lookups: keep staff_roles link intact (already by user_id)
    // Also ensure staff_roles role matches kept role
    return NextResponse.json({ success: true, staff: data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (err: any) {
    console.error("PATCH /api/admin/my-profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
