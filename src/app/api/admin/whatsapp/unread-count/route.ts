/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/whatsapp/service";

export async function GET(req: Request) {
  try {
    let user = null;
    try {
      const supabaseServer = await createServerClient();
      const { data: { user: u } } = await supabaseServer.auth.getUser();
      user = u;
    } catch {}

    if (!user) {
      const authHeader = req.headers.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const anon = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { user: u } } = await anon.auth.getUser(token);
        user = u;
      }
    }

    if (!user) {
      return NextResponse.json({ unreadCount: 0 });
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
      return NextResponse.json({ unreadCount: 0 });
    }

    const supabase = getServiceClient();
    const { data: convs } = await supabase
      .from("whatsapp_conversations")
      .select("unread_count")
      .gt("unread_count", 0);

    const totalUnread = (convs || []).reduce((acc: number, c: any) => acc + (c.unread_count || 0), 0);

    return NextResponse.json({ unreadCount: totalUnread });
  } catch {
    return NextResponse.json({ unreadCount: 0 });
  }
}
