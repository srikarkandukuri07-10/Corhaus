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

    // Combine data per member
    const result = (members || []).map((m) => {
      const memberPlans = (plans || []).filter((p) => p.approved_member_id === m.id);
      const activePlan = memberPlans.find((p) => p.status === "active" || p.status === "frozen") || memberPlans[0] || null;

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
        package_type: activePlan?.category || "Membership Plans",
        membership_plan: activePlan?.plan_name || "Standard Membership",
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

    const packageType = targetPlan?.category || "Membership Plans";

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

    // Update approved_members cleanly with constraint fallback
    const updateMemberObj: Record<string, any> = {
      freeze_status: "frozen",
      freezes_used: currentUsed + 1,
    };

    // Try updating membership_status to frozen as well
    const { error: updateErr } = await serviceClient
      .from("approved_members")
      .update({
        ...updateMemberObj,
        membership_status: "frozen",
      })
      .eq("id", memberId);

    if (updateErr) {
      // Fallback without updating membership_status if legacy check constraint blocks it
      console.warn("Falling back to updating freeze_status only on approved_members due to constraint:", updateErr.message);
      await serviceClient
        .from("approved_members")
        .update(updateMemberObj)
        .eq("id", memberId);
    }

    // Update member_purchased_plans if plan exists
    if (targetPlan) {
      await serviceClient
        .from("member_purchased_plans")
        .update({
          status: "frozen",
          freeze_status: "frozen",
          freezes_used: (targetPlan.freezes_used || 0) + 1,
        })
        .eq("id", targetPlan.id);
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
