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

    // Resolve names for non-member contacts (leads and trial members)
    const nameOverrides: Record<string, string> = {};
    try {
      const { data: trials } = await supabase
        .from("trial_members")
        .select("full_name, phone_number");

      (trials || []).forEach((t: any) => {
        const rawDigits = (t.phone_number || "").replace(/\D/g, "");
        if (rawDigits) {
          nameOverrides[rawDigits] = `${t.full_name} (Trial)`;
          if (rawDigits.length === 10) nameOverrides[`91${rawDigits}`] = `${t.full_name} (Trial)`;
        }
      });

      const { data: leads } = await supabase
        .from("leads")
        .select("full_name, phone_number");

      (leads || []).forEach((l: any) => {
        const rawDigits = (l.phone_number || "").replace(/\D/g, "");
        if (rawDigits) {
          if (!nameOverrides[rawDigits]) nameOverrides[rawDigits] = `${l.full_name} (Lead)`;
          if (rawDigits.length === 10 && !nameOverrides[`91${rawDigits}`]) {
            nameOverrides[`91${rawDigits}`] = `${l.full_name} (Lead)`;
          }
        }
      });
    } catch (e) {
      console.warn("[whatsapp:conversations] Could not resolve lead/trial names:", e);
    }

    const conversations = (convs || []).map((c: any) => {
      const member = Array.isArray(c.approved_members) ? c.approved_members[0] : c.approved_members;
      return {
        phone: c.phone,
        formattedPhone: formatIndianPhone(c.phone),
        memberId: c.member_id,
        memberName: member?.full_name || nameOverrides[c.phone] || null,
        lastInboundAt: c.last_inbound_at,
        lastMessageAt: c.last_message_at,
        lastMessagePreview: c.last_message_preview || "",
        unreadCount: c.unread_count || 0,
      };
    });

    // Check recent messages for any phones not yet in whatsapp_conversations table
    const existingPhones = new Set(conversations.map((c: any) => c.phone));
    try {
      const { data: recentMsgs } = await supabase
        .from("whatsapp_messages")
        .select("phone, created_at, body, direction")
        .order("created_at", { ascending: false })
        .limit(200);

      if (recentMsgs) {
        const seenExtra = new Set<string>();
        for (const m of recentMsgs) {
          if (m.phone && !existingPhones.has(m.phone) && !seenExtra.has(m.phone)) {
            seenExtra.add(m.phone);
            conversations.push({
              phone: m.phone,
              formattedPhone: formatIndianPhone(m.phone),
              memberId: null,
              memberName: nameOverrides[m.phone] || null,
              lastInboundAt: m.direction === "in" ? m.created_at : null,
              lastMessageAt: m.created_at,
              lastMessagePreview: m.body || "",
              unreadCount: 0,
            });
          }
        }
      }
    } catch (e) {
      console.warn("[whatsapp:conversations] Could not check orphan messages:", e);
    }

    // Sort all conversations by lastMessageAt descending
    conversations.sort((a: any, b: any) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
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
