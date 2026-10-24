/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/whatsapp/service";
import { formatIndianPhone } from "@/lib/whatsapp/phone";

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token) {
      try {
        const supabaseAnon = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user } } = await supabaseAnon.auth.getUser(token);
        if (user) return user;
      } catch (e) {
        console.warn("[WHATSAPP API] Token auth error:", e);
      }
    }
  }

  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (user) return user;
  } catch (e) {
    console.warn("[WHATSAPP API] Cookie auth error:", e);
  }

  return null;
}

export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    const isAuthorized =
      isAdminByEmail ||
      userPerms.role === "Owner" ||
      userPerms.role === "Manager" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("members.view") ||
      userPerms.permissions.includes("whatsapp.view");

    if (!isAuthorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceClient();

    // Fetch conversations ordered newest first
    const { data: convs, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select(`
        phone,
        member_id,
        last_inbound_at,
        last_message_at,
        last_message_preview,
        unread_count,
        created_at,
        updated_at,
        approved_members (
          id,
          full_name,
          phone_number,
          email
        )
      `)
      .order("last_message_at", { ascending: false });

    if (convErr) {
      console.error("[whatsapp:conversations] Query error:", convErr);
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }

    const conversations = (convs || []).map((c: any) => {
      const member = Array.isArray(c.approved_members) ? c.approved_members[0] : c.approved_members;
      return {
        phone: c.phone,
        formattedPhone: formatIndianPhone(c.phone),
        memberId: c.member_id,
        memberName: member?.full_name || null,
        lastInboundAt: c.last_inbound_at,
        lastMessageAt: c.last_message_at,
        lastMessagePreview: c.last_message_preview || "",
        unreadCount: c.unread_count || 0,
      };
    });

    const totalUnreadCount = conversations.reduce((sum: number, c: any) => sum + (c.unreadCount || 0), 0);

    return NextResponse.json({
      conversations,
      totalUnreadCount,
    });
  } catch (err: any) {
    console.error("[whatsapp:conversations] API error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
