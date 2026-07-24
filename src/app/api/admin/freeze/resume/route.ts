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
    const { serviceClient } = auth;

    const body = await request.json();
    const { memberId, planId, freezeId } = body;

    if (!memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 1. Mark active freeze(s) as resumed
    let freezeQuery = serviceClient
      .from("membership_freezes")
      .update({
        resumed_at: nowIso,
        status: "resumed",
      })
      .eq("member_id", memberId)
      .eq("status", "active");

    if (freezeId) {
      freezeQuery = freezeQuery.eq("id", freezeId);
    }
    await freezeQuery;

    // 2. Reactivate member
    await serviceClient
      .from("approved_members")
      .update({
        membership_status: "active",
        freeze_status: "active",
      })
      .eq("id", memberId);

    // 3. Reactivate purchased plan if exists
    if (planId) {
      await serviceClient
        .from("member_purchased_plans")
        .update({
          status: "active",
          freeze_status: "active",
        })
        .eq("id", planId);
    } else {
      await serviceClient
        .from("member_purchased_plans")
        .update({
          status: "active",
          freeze_status: "active",
        })
        .eq("approved_member_id", memberId)
        .eq("status", "frozen");
    }

    return NextResponse.json({ success: true, message: "Membership resumed successfully." });
  } catch (err: any) {
    console.error("POST /api/admin/freeze/resume error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
