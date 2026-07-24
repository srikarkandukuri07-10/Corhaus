import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

async function getMemberData() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const serviceClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find member record by email
  const { data: member } = await serviceClient
    .from("approved_members")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (!member) {
    return { error: "Approved member profile not found", status: 404 };
  }

  // Find purchased plan
  const { data: plans } = await serviceClient
    .from("member_purchased_plans")
    .select("*")
    .eq("approved_member_id", member.id)
    .order("created_at", { ascending: false });

  const activePlan = plans?.find((p) => p.status === "active" || p.status === "frozen") || plans?.[0] || null;

  return { serviceClient, user, member, activePlan };
}

export async function GET() {
  try {
    const ctx = await getMemberData();
    if ("error" in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    const { serviceClient, member, activePlan } = ctx;

    // Fetch freezes for member
    const { data: freezes } = await serviceClient
      .from("membership_freezes")
      .select("*")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false });

    // Fetch requests for member
    const { data: requests } = await serviceClient
      .from("freeze_requests")
      .select("*")
      .eq("member_id", member.id)
      .order("requested_at", { ascending: false });

    const activeFreeze = freezes?.find((f) => f.status === "active") || null;
    const pendingRequest = requests?.find((r) => r.status === "pending") || null;
    const latestRejectedRequest = requests?.find((r) => r.status === "rejected") || null;

    const freezesUsed = activePlan?.freezes_used ?? member.freezes_used ?? 0;
    const freezeRemaining = Math.max(0, 2 - freezesUsed);

    let freezeStatus: "active" | "frozen" | "freeze_requested" = "active";
    if (activeFreeze || member.membership_status === "frozen" || activePlan?.status === "frozen") {
      freezeStatus = "frozen";
    } else if (pendingRequest) {
      freezeStatus = "freeze_requested";
    }

    return NextResponse.json({
      member_name: member.full_name,
      membership_plan: activePlan?.plan_name || "Standard Membership",
      package_type: activePlan?.category || "Membership Plans",
      freeze_remaining: freezeRemaining,
      freezes_used: freezesUsed,
      freeze_status: freezeStatus,
      active_freeze: activeFreeze,
      pending_request: pendingRequest,
      latest_rejected: latestRejectedRequest,
      history: freezes || [],
    });
  } catch (err: any) {
    console.error("GET /api/member/freeze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getMemberData();
    if ("error" in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    const { serviceClient, member, activePlan } = ctx;

    const body = await request.json();
    const { startDate, days, reason } = body;

    if (!startDate || !days) {
      return NextResponse.json({ error: "Missing required fields: startDate, days" }, { status: 400 });
    }

    const freezeDays = parseInt(days, 10);
    if (isNaN(freezeDays) || freezeDays < 2 || freezeDays > 15) {
      return NextResponse.json({ error: "Freeze duration must be between 2 and 15 days" }, { status: 400 });
    }

    const freezesUsed = activePlan?.freezes_used ?? member.freezes_used ?? 0;
    if (freezesUsed >= 2) {
      return NextResponse.json({ error: "You have used all available freezes for your current membership." }, { status: 400 });
    }

    // Check for existing pending request
    const { data: existingPending } = await serviceClient
      .from("freeze_requests")
      .select("id")
      .eq("member_id", member.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingPending) {
      return NextResponse.json({ error: "Your freeze request is awaiting approval." }, { status: 400 });
    }

    const packageType = activePlan?.category || "Membership Plans";

    // Insert request
    const { data: reqRecord, error: reqErr } = await serviceClient
      .from("freeze_requests")
      .insert({
        member_id: member.id,
        plan_id: activePlan?.id || null,
        package_type: packageType,
        requested_start_date: startDate,
        requested_days: freezeDays,
        reason: reason || "Member Requested",
        status: "pending",
      })
      .select()
      .single();

    if (reqErr) {
      console.error("Error creating freeze request:", reqErr);
      return NextResponse.json({ error: "Failed to submit freeze request" }, { status: 500 });
    }

    // Update approved_members freeze_status
    await serviceClient
      .from("approved_members")
      .update({ freeze_status: "freeze_requested" })
      .eq("id", member.id);

    // Create notification in admin_notifications
    await serviceClient
      .from("admin_notifications")
      .insert({
        type: "freeze_request",
        email: member.email,
        message: `Freeze request from ${member.full_name} for ${activePlan?.plan_name || packageType} (${freezeDays} days from ${startDate})`,
        is_read: false,
      });

    return NextResponse.json({
      success: true,
      message: "Your freeze request has been sent to Corhaus staff for approval.",
      request: reqRecord,
    });
  } catch (err: any) {
    console.error("POST /api/member/freeze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const ctx = await getMemberData();
    if ("error" in ctx) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }
    const { serviceClient, member, activePlan } = ctx;

    const nowIso = new Date().toISOString();

    // End active freeze early
    await serviceClient
      .from("membership_freezes")
      .update({
        resumed_at: nowIso,
        status: "resumed",
      })
      .eq("member_id", member.id)
      .eq("status", "active");

    // Reactivate member
    await serviceClient
      .from("approved_members")
      .update({
        membership_status: "active",
        freeze_status: "active",
      })
      .eq("id", member.id);

    // Reactivate plan
    if (activePlan) {
      await serviceClient
        .from("member_purchased_plans")
        .update({
          status: "active",
          freeze_status: "active",
        })
        .eq("id", activePlan.id);
    }

    return NextResponse.json({
      success: true,
      message: "Your membership has been resumed successfully.",
    });
  } catch (err: any) {
    console.error("PATCH /api/member/freeze error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
