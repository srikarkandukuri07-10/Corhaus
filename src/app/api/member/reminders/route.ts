import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push/service";

export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { verifyCanonicalMemberAuthorization } = await import("@/lib/auth-canonical");
    const userPhone = user.user_metadata?.phone_number || (user as any).phone || null;
    const authResult = await verifyCanonicalMemberAuthorization(user.email, userPhone);

    if (!authResult.authorized || !authResult.member) {
      return NextResponse.json({ error: "No active member found" }, { status: 403 });
    }

    const amData = authResult.member;

    // Get active purchased plan
    const { data: plan } = await supabase
      .from("member_purchased_plans")
      .select("id, plan_name, sessions_total, sessions_remaining, valid_until, status")
      .eq("approved_member_id", amData.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!plan) {
      return NextResponse.json({ message: "No active plan found" });
    }

    let validityDays: number | null = null;
    if (plan.valid_until) {
      validityDays = Math.max(0, Math.ceil((new Date(plan.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    }

    const rem = plan.sessions_remaining ?? 0;
    const total = plan.sessions_total ?? rem;

    let body = `You have ${rem} of ${total} sessions remaining`;
    if (validityDays !== null) {
      body += ` • ${validityDays} days left`;
    }
    body += `. Keep up the great work! 💪`;

    // Dispatch push notification to user
    await Promise.allSettled([
      sendPushToUser(user.id, {
        title: "Session Balance Update 🏋️",
        body,
        url: "/member",
        tag: "session-reminder-" + new Date().toISOString().split("T")[0],
      }),
      sendPushToUser(amData.id, {
        title: "Session Balance Update 🏋️",
        body,
        url: "/member",
        tag: "session-reminder-" + new Date().toISOString().split("T")[0],
      }),
    ]);

    return NextResponse.json({
      success: true,
      sessionsRemaining: rem,
      sessionsTotal: total,
      validityDays,
    });
  } catch (error: any) {
    console.error("Reminder push error:", error);
    return NextResponse.json({ error: error.message || "Failed to trigger reminder" }, { status: 500 });
  }
}
