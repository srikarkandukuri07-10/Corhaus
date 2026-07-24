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

export async function POST(req: Request) {
  try {
    const auth = await getAdminClient();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { serviceClient } = auth;

    const body = await req.json();
    const { sessionId, action } = body;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required." }, { status: 400 });
    }

    if (action === "delete") {
      // Delete session record directly
      const { error } = await serviceClient.from("classes").delete().eq("id", sessionId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: "Session deleted." });
    }

    // Default action: Cancel session
    // Try updating status and is_active with fallbacks
    let updatePayload: any = { status: "cancelled", is_active: false };
    let { error } = await serviceClient.from("classes").update(updatePayload).eq("id", sessionId);

    if (error && error.message.includes("is_active")) {
      delete updatePayload.is_active;
      const retry1 = await serviceClient.from("classes").update(updatePayload).eq("id", sessionId);
      error = retry1.error;
    }

    if (error && error.message.includes("status")) {
      // If status column is also un-cached, perform hard delete so cancellation succeeds
      const retry2 = await serviceClient.from("classes").delete().eq("id", sessionId);
      error = retry2.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Session cancelled successfully." });
  } catch (err: any) {
    console.error("POST /api/admin/classes/cancel error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
