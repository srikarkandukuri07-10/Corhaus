import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { isDeveloperEmail } from "@/lib/constants";
import { rateLimit } from "@/lib/rateLimit";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";
    // Rate limit attachment requests: 100 per 15 minutes per IP
    const { success } = await rateLimit(ip, "support_attachment_view", 100, 15 * 60 * 1000);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
    }

    // Authenticate user
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serviceClient = getServiceSupabase();

    // Check staff permissions
    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const hasSupportView = userPerms.permissions.includes("support.view") || 
                           userPerms.permissions.includes("*") || 
                           userPerms.role === "Owner" || 
                           userPerms.role === "Manager" ||
                           isDeveloperEmail(user.email);

    let isAuthorized = false;

    if (hasSupportView) {
      isAuthorized = true;
    } else {
      // Find support ticket associated with this attachment path
      const { data: message } = await serviceClient
        .from("support_messages")
        .select("ticket_id")
        .eq("attachment_url", filePath)
        .maybeSingle();

      if (message) {
        // Verify user owns the ticket
        const { data: ticket } = await serviceClient
          .from("support_tickets")
          .select("created_by")
          .eq("id", message.ticket_id)
          .maybeSingle();

        if (ticket && ticket.created_by === user.id) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate signed URL
    const { data, error } = await serviceClient.storage
      .from("support_attachments")
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message || "Failed to generate signed URL" }, { status: 500 });
    }

    // Redirect to signed URL directly so it works inside img/a elements
    return NextResponse.redirect(data.signedUrl, 302);
  } catch (err: any) {
    console.error("GET /api/support/attachment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
