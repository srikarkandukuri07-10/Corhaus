import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── GET /api/admin/discounts ──────────────────────────────────────────────────
// Returns all registered members with their active/past discounts and purchased plans
export async function GET(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.view");
    if (!check.authorized) return check.response!;

    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get("member_id");

    const supabase = getServiceRoleClient();

    if (memberId) {
      const { data: activeDiscount, error } = await supabase
        .from("member_discounts")
        .select("*")
        .eq("approved_member_id", memberId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ activeDiscount });
    }

    // Fetch approved members, purchased plans, and member discounts in parallel
    const [membersRes, plansRes, discountsRes] = await Promise.all([
      supabase.from("approved_members").select("*").order("full_name", { ascending: true }),
      supabase.from("member_purchased_plans").select("*").eq("status", "active"),
      supabase.from("member_discounts").select("*").order("created_at", { ascending: false }),
    ]);

    if (membersRes.error) {
      return NextResponse.json({ error: membersRes.error.message }, { status: 500 });
    }

    const members = membersRes.data || [];
    const activePlans = plansRes.data || [];
    const allDiscounts = discountsRes.data || [];

    // Map plan and discount information to each member
    const enrichedMembers = members.map((m: any) => {
      const plan = activePlans.find((p: any) => p.approved_member_id === m.id);
      const memberDiscounts = allDiscounts.filter((d: any) => d.approved_member_id === m.id);
      const activeDiscount = memberDiscounts.find((d: any) => d.status === "active") || null;

      return {
        ...m,
        current_package: plan?.plan_name || "No Active Package",
        active_discount: activeDiscount,
        discount_history: memberDiscounts,
      };
    });

    return NextResponse.json({
      members: enrichedMembers,
      allDiscounts,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/admin/discounts ─────────────────────────────────────────────────
// Creates a new discount for a member
export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.apply_discounts");
    if (!check.authorized) return check.response!;

    const body = await req.json();
    const {
      approved_member_id,
      discount_type,
      discount_value,
      source = "Manual",
      reason = "Goodwill",
    } = body;

    if (!approved_member_id || !discount_type || !discount_value) {
      return NextResponse.json({ error: "Missing required fields: approved_member_id, discount_type, discount_value" }, { status: 400 });
    }

    if (!["percentage", "fixed"].includes(discount_type)) {
      return NextResponse.json({ error: "Invalid discount_type. Must be 'percentage' or 'fixed'" }, { status: 400 });
    }

    const val = parseFloat(discount_value);
    if (isNaN(val) || val <= 0) {
      return NextResponse.json({ error: "Discount value must be greater than 0" }, { status: 400 });
    }

    if (discount_type === "percentage" && val > 100) {
      return NextResponse.json({ error: "Percentage discount cannot exceed 100%" }, { status: 400 });
    }

    const supabase = getServiceRoleClient();

    // Verify member exists
    const { data: member } = await supabase
      .from("approved_members")
      .select("id, full_name, email")
      .eq("id", approved_member_id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Approved member not found" }, { status: 404 });
    }

    // Deactivate any existing active discount for this member if creating a new active one
    await supabase
      .from("member_discounts")
      .update({ status: "deactivated" })
      .eq("approved_member_id", approved_member_id)
      .eq("status", "active");

    // Insert new discount
    const { data: newDiscount, error: insertErr } = await supabase
      .from("member_discounts")
      .insert({
        approved_member_id,
        discount_type,
        discount_value: val,
        source,
        reason,
        status: "active",
        created_by: user.email || "Admin",
      })
      .select("*")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, discount: newDiscount }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
