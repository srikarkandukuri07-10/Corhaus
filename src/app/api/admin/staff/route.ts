import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getAdminClient() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin" || user.email === process.env.ADMIN_EMAIL;
  if (!isAdmin) return { error: "Forbidden", status: 403 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { serviceClient, user };
}

export async function GET(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.view");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const roleFilter = searchParams.get("role") || "All";
    const statusFilter = searchParams.get("status") || "All";
    const locationFilter = searchParams.get("location") || "All";
    const sortBy = searchParams.get("sortBy") || "name";

    let query = serviceClient.from("staff_members").select("*");

    if (roleFilter !== "All") {
      query = query.eq("role", roleFilter);
    }
    if (statusFilter !== "All") {
      query = query.eq("employment_status", statusFilter);
    }
    if (locationFilter !== "All") {
      query = query.eq("location", locationFilter);
    }

    const { data: allStaff, error } = await query;

    if (error) {
      return NextResponse.json({
        error: "Could not load staff data. Make sure the staff_members table exists in Supabase. Error: " + error.message,
      }, { status: 500 });
    }

    let staffList = allStaff || [];

    // Client-side search filtering
    if (search) {
      staffList = staffList.filter((s: any) =>
        (s.full_name && s.full_name.toLowerCase().includes(search)) ||
        (s.phone_number && s.phone_number.includes(search)) ||
        (s.designation && s.designation.toLowerCase().includes(search))
      );
    }

    // Sort
    staffList.sort((a: any, b: any) => {
      if (sortBy === "joinDate") {
        return new Date(b.joining_date || b.created_at || 0).getTime() - new Date(a.joining_date || a.created_at || 0).getTime();
      }
      if (sortBy === "role") {
        return (a.role || "").localeCompare(b.role || "");
      }
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

    // Calculate Summary Metrics dynamically from all records
    const totalStaff = (allStaff || []).length;
    const totalTrainers = (allStaff || []).filter((s: any) => s.role === "Trainer").length;
    const activeStaff = (allStaff || []).filter((s: any) => s.employment_status === "Active").length;
    const monthlyPayroll = (allStaff || [])
      .filter((s: any) => s.employment_status === "Active")
      .reduce((sum: number, s: any) => sum + (Number(s.monthly_salary) || 0), 0);

    return NextResponse.json({
      staff: staffList,
      summary: {
        totalStaff,
        totalTrainers,
        activeStaff,
        monthlyPayroll,
      },
    });
  } catch (err: any) {
    console.error("GET /api/admin/staff error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.add");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();

    // ─── VALIDATION ─────────────────────────────────────────────────────────
    const fullName = (body.full_name || "").trim();
    const phoneNumber = (body.phone_number || "").trim();
    const role = (body.role || "").trim();
    const designation = (body.designation || "").trim();
    const email = (body.email || "").trim().toLowerCase();

    if (!fullName) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone Number is required." }, { status: 400 });
    }
    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json({ error: "Phone Number must be exactly 10 digits." }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ error: "Role is required." }, { status: 400 });
    }
    if (!designation) {
      return NextResponse.json({ error: "Designation is required." }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid Email address format." }, { status: 400 });
    }

    // Check duplicate phone number
    const { data: dupPhone } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (dupPhone) {
      return NextResponse.json({ error: "Phone Number is already registered for another staff member." }, { status: 400 });
    }

    // Validate numeric fields
    const monthlySalary = isNaN(Number(body.monthly_salary)) ? 0 : Math.max(0, Number(body.monthly_salary));
    const ptCommission = isNaN(Number(body.pt_commission)) ? 0 : Math.max(0, Number(body.pt_commission));
    const groupClassCommission = isNaN(Number(body.group_class_commission)) ? 0 : Math.max(0, Number(body.group_class_commission));
    const experienceYears = isNaN(Number(body.experience_years)) ? 0 : Math.max(0, Number(body.experience_years));

    const payload = {
      full_name: fullName,
      phone_number: phoneNumber,
      email: email || null,
      role: role,
      designation: designation,
      location: (body.location || "Main Studio").trim(),
      employment_status: body.employment_status || "Active",
      joining_date: body.joining_date || new Date().toISOString().split("T")[0],
      specialization: (body.specialization || "").trim() || null,
      experience_years: experienceYears,
      certifications: (body.certifications || "").trim() || null,
      classes_assigned: (body.classes_assigned || "").trim() || null,
      pt_available: body.pt_available !== false,
      group_class_available: body.group_class_available !== false,
      monthly_salary: monthlySalary,
      pt_commission: ptCommission,
      group_class_commission: groupClassCommission,
      payment_type: body.payment_type || "Salary",
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
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await serviceClient
      .from("staff_members")
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to add staff: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, staff: data });
  } catch (err: any) {
    console.error("POST /api/admin/staff error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.edit");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: "Staff ID is required for editing." }, { status: 400 });
    }

    const fullName = (body.full_name || "").trim();
    const phoneNumber = (body.phone_number || "").trim();
    const role = (body.role || "").trim();
    const designation = (body.designation || "").trim();
    const email = (body.email || "").trim().toLowerCase();

    if (!fullName) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone Number is required." }, { status: 400 });
    }
    if (!/^\d{10}$/.test(phoneNumber)) {
      return NextResponse.json({ error: "Phone Number must be exactly 10 digits." }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ error: "Role is required." }, { status: 400 });
    }
    if (!designation) {
      return NextResponse.json({ error: "Designation is required." }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid Email address format." }, { status: 400 });
    }

    // Check duplicate phone excluding current ID
    const { data: dupPhone } = await serviceClient
      .from("staff_members")
      .select("id")
      .eq("phone_number", phoneNumber)
      .neq("id", body.id)
      .maybeSingle();

    if (dupPhone) {
      return NextResponse.json({ error: "Phone Number is already registered for another staff member." }, { status: 400 });
    }

    const monthlySalary = isNaN(Number(body.monthly_salary)) ? 0 : Math.max(0, Number(body.monthly_salary));
    const ptCommission = isNaN(Number(body.pt_commission)) ? 0 : Math.max(0, Number(body.pt_commission));
    const groupClassCommission = isNaN(Number(body.group_class_commission)) ? 0 : Math.max(0, Number(body.group_class_commission));
    const experienceYears = isNaN(Number(body.experience_years)) ? 0 : Math.max(0, Number(body.experience_years));

    const updatePayload = {
      full_name: fullName,
      phone_number: phoneNumber,
      email: email || null,
      role: role,
      designation: designation,
      location: (body.location || "Main Studio").trim(),
      employment_status: body.employment_status || "Active",
      joining_date: body.joining_date || new Date().toISOString().split("T")[0],
      specialization: (body.specialization || "").trim() || null,
      experience_years: experienceYears,
      certifications: (body.certifications || "").trim() || null,
      classes_assigned: (body.classes_assigned || "").trim() || null,
      pt_available: body.pt_available !== false,
      group_class_available: body.group_class_available !== false,
      monthly_salary: monthlySalary,
      pt_commission: ptCommission,
      group_class_commission: groupClassCommission,
      payment_type: body.payment_type || "Salary",
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
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await serviceClient
      .from("staff_members")
      .update(updatePayload)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to update staff: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, staff: data });
  } catch (err: any) {
    console.error("PUT /api/admin/staff error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("staff.edit");
    if (!check.authorized) return check.response!;

    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Staff ID is required." }, { status: 400 });
    }

    // Deactivate staff member: mark employment status as Inactive, preserve all records
    const { data, error } = await serviceClient
      .from("staff_members")
      .update({
        employment_status: "Inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "Failed to deactivate staff: " + error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, staff: data, message: "Staff member deactivated successfully." });
  } catch (err: any) {
    console.error("PATCH /api/admin/staff error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
