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

// ─── PATCH /api/admin/discounts/[id] ───────────────────────────────────────────
// Updates a discount (edit type, value, reason, status)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.apply_discounts");
    if (!check.authorized) return check.response!;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing discount id" }, { status: 400 });
    }

    const body = await req.json();
    const { discount_type, discount_value, reason, status } = body;

    const supabase = getServiceRoleClient();

    const updates: Record<string, any> = {};

    if (discount_type) {
      if (!["percentage", "fixed"].includes(discount_type)) {
        return NextResponse.json({ error: "Invalid discount_type" }, { status: 400 });
      }
      updates.discount_type = discount_type;
    }

    if (discount_value !== undefined) {
      const val = parseFloat(discount_value);
      if (isNaN(val) || val <= 0) {
        return NextResponse.json({ error: "Discount value must be greater than 0" }, { status: 400 });
      }
      if ((discount_type === "percentage" || updates.discount_type === "percentage") && val > 100) {
        return NextResponse.json({ error: "Percentage discount cannot exceed 100%" }, { status: 400 });
      }
      updates.discount_value = val;
    }

    if (reason !== undefined) {
      updates.reason = reason;
    }

    if (status !== undefined) {
      if (!["active", "used", "expired", "deactivated"].includes(status)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      updates.status = status;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("member_discounts")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, discount: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/discounts/[id] ──────────────────────────────────────────
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.delete");
    if (!check.authorized) return check.response!;

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing discount id" }, { status: 400 });
    }

    const supabase = getServiceRoleClient();

    const { error: delErr } = await supabase
      .from("member_discounts")
      .delete()
      .eq("id", id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
