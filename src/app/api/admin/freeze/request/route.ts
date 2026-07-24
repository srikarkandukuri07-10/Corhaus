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

export async function POST(request: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient, user } = auth;

    const body = await request.json();
    const { requestId, action, freezeStart, freezeDays, rejectionReason } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: "Missing required fields: requestId, action" }, { status: 400 });
    }

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "Action must be 'approve' or 'reject'" }, { status: 400 });
    }

    // Fetch freeze request
    const { data: freezeReq, error: reqErr } = await serviceClient
      .from("freeze_requests")
      .select("*, approved_members(*)")
      .eq("id", requestId)
      .single();

    if (reqErr || !freezeReq) {
      return NextResponse.json({ error: "Freeze request not found" }, { status: 404 });
    }

    const memberId = freezeReq.member_id;
    const memberEmail = freezeReq.approved_members?.email;

    if (action === "reject") {
      // Mark request rejected
      await serviceClient
        .from("freeze_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason || "Not approved by administration",
        })
        .eq("id", requestId);

      // Reset member freeze status if it was set to freeze_requested
      await serviceClient
        .from("approved_members")
        .update({
          freeze_status: "active",
        })
        .eq("id", memberId);

      if (memberEmail) {
        await serviceClient
          .from("admin_notifications")
          .update({ is_read: true })
          .eq("type", "freeze_request")
          .eq("email", memberEmail);
      }

      return NextResponse.json({ success: true, message: "Freeze request rejected." });
    }

    // Approve Action
    const finalStartDate = freezeStart || freezeReq.requested_start_date;
    const finalDays = freezeDays ? parseInt(freezeDays, 10) : freezeReq.requested_days;

    if (isNaN(finalDays) || finalDays < 2 || finalDays > 15) {
      return NextResponse.json({ error: "Freeze duration must be between 2 and 15 days" }, { status: 400 });
    }

    // Check plan & freezes used
    const { data: plans } = await serviceClient
      .from("member_purchased_plans")
      .select("*")
      .eq("approved_member_id", memberId)
      .order("created_at", { ascending: false });

    const activePlan = plans?.find((p) => p.id === freezeReq.plan_id) || plans?.[0] || null;
    const currentUsed = activePlan?.freezes_used ?? freezeReq.approved_members?.freezes_used ?? 0;

    if (currentUsed >= 2) {
      return NextResponse.json({ error: "Member has already used all available freezes (2/2) for this membership period." }, { status: 400 });
    }

    const startDateObj = new Date(finalStartDate);
    const endDateObj = new Date(startDateObj.getTime() + (finalDays * 24 * 60 * 60 * 1000));
    const endDateStr = endDateObj.toISOString().split("T")[0];

    const packageType = freezeReq.package_type || activePlan?.category || "Membership Plans";

    // Create freeze record safely
    let freezeRecord = null;
    try {
      const { data: fRec } = await serviceClient
        .from("membership_freezes")
        .insert({
          member_id: memberId,
          plan_id: activePlan?.id || null,
          package_type: packageType,
          freeze_start: finalStartDate,
          freeze_end: endDateStr,
          freeze_days: finalDays,
          reason: freezeReq.reason || "Member Requested Freeze",
          status: "active",
          created_by: user.id,
        })
        .select()
        .maybeSingle();
      freezeRecord = fRec;
    } catch (e) {}

    // Mark request approved
    await serviceClient
      .from("freeze_requests")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    // Update approved_members safely
    const updateMemberObj: Record<string, any> = {
      freeze_status: "frozen",
      freezes_used: currentUsed + 1,
    };

    const { error: updateErr } = await serviceClient
      .from("approved_members")
      .update({
        ...updateMemberObj,
        membership_status: "frozen",
      })
      .eq("id", memberId);

    if (updateErr) {
      await serviceClient
        .from("approved_members")
        .update(updateMemberObj)
        .eq("id", memberId);
    }

    // Update plan
    if (activePlan) {
      await serviceClient
        .from("member_purchased_plans")
        .update({
          status: "frozen",
          freeze_status: "frozen",
          freezes_used: (activePlan.freezes_used || 0) + 1,
        })
        .eq("id", activePlan.id);
    }

    // Mark notification read
    if (memberEmail) {
      await serviceClient
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("type", "freeze_request")
        .eq("email", memberEmail);
    }

    return NextResponse.json({ success: true, freeze: freezeRecord });
  } catch (err: any) {
    console.error("POST /api/admin/freeze/request error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
