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

export async function GET() {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    // Fetch all members
    const { data: members, error: mErr } = await serviceClient
      .from("approved_members")
      .select("*")
      .order("full_name", { ascending: true });

    if (mErr) {
      console.error("Error fetching members for freeze management:", mErr);
      return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }

    // Fetch all active/purchased plans
    const { data: plans } = await serviceClient
      .from("member_purchased_plans")
      .select("*")
      .order("created_at", { ascending: false });

    // Fetch customers mapping
    const { data: customers } = await serviceClient
      .from("customers")
      .select("id, approved_member_id, email");

    const custToMemberMap = new Map<string, string>();
    (customers || []).forEach((c) => {
      if (c.approved_member_id) custToMemberMap.set(c.id, c.approved_member_id);
    });

    // Fetch invoices
    const { data: invoicesData } = await serviceClient
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    const invoiceByMemberMap = new Map<string, any>();
    (invoicesData || []).forEach((inv) => {
      let memberId: string | null = null;
      if (inv.customer_id) memberId = custToMemberMap.get(inv.customer_id) || null;
      if (!memberId && inv.customer_email) {
        const match = (members || []).find((m) => m.email.toLowerCase() === inv.customer_email.toLowerCase());
        if (match) memberId = match.id;
      }
      if (memberId && !invoiceByMemberMap.has(memberId)) {
        invoiceByMemberMap.set(memberId, inv);
      }
    });

    // Fetch all freeze requests with graceful fallback if table missing
    let requests: any[] = [];
    const { data: reqData, error: reqErr } = await serviceClient
      .from("freeze_requests")
      .select("*")
      .order("requested_at", { ascending: false });
    if (!reqErr && reqData) {
      requests = reqData;
    }

    // Fetch all membership freezes with graceful fallback if table missing
    let freezes: any[] = [];
    const { data: freezeData, error: fErr } = await serviceClient
      .from("membership_freezes")
      .select("*")
      .order("created_at", { ascending: false });
    if (!fErr && freezeData) {
      freezes = freezeData;
    }

    // Combine data per member using exact purchased plans or paid invoices
    const result = (members || []).map((m) => {
      const memberPlans = (plans || []).filter((p) => p.approved_member_id === m.id);
      let activePlan = memberPlans.find((p) => p.status === "active" || p.status === "frozen") || memberPlans[0] || null;

      if (!activePlan) {
        const inv = invoiceByMemberMap.get(m.id);
        const isPaid = inv && (inv.payment_status === "paid" || inv.payment_status === "Paid" || inv.payment_status === "Completed");
        if (isPaid) {
          const invItems = inv.items || [];
          const item = invItems[0] || null;
          const planName = item?.name || inv.plan_name || null;
          if (planName) {
            const invDate = inv.created_at ? new Date(inv.created_at) : new Date();
            const validFrom = invDate.toISOString().split("T")[0];

            let validityDays = 30;
            const lower = planName.toLowerCase();
            if (lower.includes("quarterly")) validityDays = 90;
            else if (lower.includes("half")) validityDays = 180;
            else if (lower.includes("annual")) validityDays = 365;
            else if (lower.includes("couple")) validityDays = 60;

            const validUntil = new Date(invDate.getTime() + validityDays * 86400000).toISOString().split("T")[0];

            activePlan = {
              id: `inv-${inv.id}`,
              plan_name: planName,
              category: "Membership Plans",
              valid_from: validFrom,
              valid_until: validUntil,
              status: "active",
              freezes_used: 0,
            };
          }
        }
      }

      const packageName = activePlan ? activePlan.plan_name : "No package selected";
      const packageCategory = activePlan ? activePlan.category : "N/A";
      const validFrom = activePlan ? activePlan.valid_from : null;
      const validUntil = activePlan ? activePlan.valid_until : null;

      const memberFreezes = freezes.filter((f) => f.member_id === m.id);
      const activeFreeze = memberFreezes.find((f) => f.status === "active") || null;

      const memberRequests = requests.filter((r) => r.member_id === m.id);
      const pendingRequest = memberRequests.find((r) => r.status === "pending") || null;

      const freezesUsed = activePlan?.freezes_used ?? m.freezes_used ?? 0;
      const freezeRemaining = Math.max(0, 2 - freezesUsed);

      let currentStatus: "Active" | "Frozen" | "Freeze Requested" = "Active";
      if (activeFreeze || m.membership_status === "frozen" || activePlan?.status === "frozen" || m.freeze_status === "frozen") {
        currentStatus = "Frozen";
      } else if (pendingRequest || m.freeze_status === "freeze_requested") {
        currentStatus = "Freeze Requested";
      }

      return {
        id: m.id,
        member_name: m.full_name,
        email: m.email,
        phone_number: m.phone_number,
        package_type: packageName,
        package_category: packageCategory,
        valid_from: validFrom,
        valid_until: validUntil,
        plan_id: activePlan?.id || null,
        current_status: currentStatus,
        freezes_used: freezesUsed,
        freeze_remaining: freezeRemaining,
        active_freeze: activeFreeze,
        pending_request: pendingRequest,
        freeze_history: memberFreezes,
      };
    });

    return NextResponse.json({ members: result, all_freezes: freezes, pending_requests: requests.filter(r => r.status === 'pending') });
  } catch (err: any) {
    console.error("GET /api/admin/freeze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient, user } = auth;

    const body = await request.json();
    const { memberId, planId, freezeStart, freezeDays, reason } = body;

    if (!memberId || !freezeStart || !freezeDays) {
      return NextResponse.json({ error: "Missing required fields: memberId, freezeStart, freezeDays" }, { status: 400 });
    }

    const days = parseInt(freezeDays, 10);
    if (isNaN(days) || days < 2 || days > 15) {
      return NextResponse.json({ error: "Freeze duration must be between 2 and 15 days" }, { status: 400 });
    }

    // Check member & plan
    const { data: member } = await serviceClient
      .from("approved_members")
      .select("*")
      .eq("id", memberId)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    let targetPlan = null;
    if (planId) {
      const { data: p } = await serviceClient
        .from("member_purchased_plans")
        .select("*")
        .eq("id", planId)
        .single();
      targetPlan = p;
    }

    if (!targetPlan) {
      const { data: plans } = await serviceClient
        .from("member_purchased_plans")
        .select("*")
        .eq("approved_member_id", memberId)
        .order("created_at", { ascending: false });

      targetPlan = plans?.[0] || null;
    }

    const currentUsed = targetPlan?.freezes_used ?? member.freezes_used ?? 0;
    if (currentUsed >= 2) {
      return NextResponse.json({ error: "Member has already used all available freezes (2/2) for this membership period." }, { status: 400 });
    }

    const startDate = new Date(freezeStart);
    const endDate = new Date(startDate.getTime() + (days * 24 * 60 * 60 * 1000));
    const endDateStr = endDate.toISOString().split("T")[0];

    const packageType = targetPlan?.plan_name || targetPlan?.category || "Membership Package";

    // Safely insert into membership_freezes if table exists
    let freezeRecord = null;
    try {
      const { data: fRec } = await serviceClient
        .from("membership_freezes")
        .insert({
          member_id: memberId,
          plan_id: targetPlan?.id || null,
          package_type: packageType,
          freeze_start: freezeStart,
          freeze_end: endDateStr,
          freeze_days: days,
          reason: reason || "Admin Direct Freeze",
          status: "active",
          created_by: user.id,
        })
        .select()
        .maybeSingle();
      freezeRecord = fRec;
    } catch (e) {
      console.warn("Could not insert into membership_freezes table:", e);
    }

    // Extend plan valid_until by freezeDays so paid membership days are preserved
    if (targetPlan && targetPlan.valid_until) {
      const origValidUntil = new Date(targetPlan.valid_until);
      const newValidUntil = new Date(origValidUntil.getTime() + days * 86400000).toISOString().split("T")[0];
      await serviceClient
        .from("member_purchased_plans")
        .update({
          valid_until: newValidUntil,
          status: "frozen",
          freeze_status: "frozen",
          freezes_used: (targetPlan.freezes_used || 0) + 1,
        })
        .eq("id", targetPlan.id);
    }

    // Update approved_members freeze_status & freezes_used ONLY
    const { error: memUpdateErr } = await serviceClient
      .from("approved_members")
      .update({
        freeze_status: "frozen",
        freezes_used: currentUsed + 1,
      })
      .eq("id", memberId);

    if (memUpdateErr) {
      console.error("Error updating approved_members freeze_status:", memUpdateErr);
      return NextResponse.json({ error: "Failed to update member freeze status: " + memUpdateErr.message }, { status: 500 });
    }

    // Resolve pending freeze requests if table exists
    try {
      await serviceClient
        .from("freeze_requests")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("member_id", memberId)
        .eq("status", "pending");
    } catch (e) {}

    // Clear notifications for member email
    try {
      await serviceClient
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("type", "freeze_request")
        .eq("email", member.email);
    } catch (e) {}

    return NextResponse.json({ success: true, freeze: freezeRecord });
  } catch (err: any) {
    console.error("POST /api/admin/freeze error:", err);
    return NextResponse.json({ error: "Internal server error: " + err.message }, { status: 500 });
  }
}
