/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  getServiceClient,
  sendText,
  checkReplyWindow,
} from "@/lib/whatsapp/service";
import { normalizeIndianPhone, formatIndianPhone, matchMemberByPhone } from "@/lib/whatsapp/phone";

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

async function verifyAuth(req: Request) {
  const user = await getAuthenticatedUser(req);
  if (!user) return { authorized: false, status: 401 };

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

  if (!isAuthorized) return { authorized: false, status: 403 };
  return { authorized: true, user };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
    }

    const { phone: rawPhone } = await params;
    const norm = normalizeIndianPhone(rawPhone);
    const digits = norm.ok ? norm.digits : rawPhone.replace(/\D/g, "");

    const supabase = getServiceClient();

    // 1. Fetch messages for this phone in chronological order
    const { data: messages, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("id, wa_message_id, direction, phone, type, body, template_name, status, error_code, error_message, created_at, wa_timestamp")
      .eq("phone", digits)
      .order("created_at", { ascending: true });

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    // 2. Mark conversation as read (reset unread_count to 0)
    await (supabase as any)
      .from("whatsapp_conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("phone", digits);

    // 3. Resolve conversation metadata and 24-hour reply window
    const member = await matchMemberByPhone(supabase, digits);
    let contactInfo: { id: string | null; name: string | null; email: string | null; type?: string } | null = member
      ? { id: member.id, name: member.full_name, email: member.email, type: "member" }
      : null;

    if (!contactInfo) {
      const last10 = digits.slice(-10);
      try {
        const { data: trial } = await supabase
          .from("trial_members")
          .select("id, full_name, email, phone_number")
          .or(`phone_number.ilike.%${last10}%`)
          .limit(1)
          .maybeSingle();

        if (trial) {
          contactInfo = { id: trial.id, name: `${trial.full_name} (Trial)`, email: trial.email, type: "trial" };
        } else {
          const { data: lead } = await supabase
            .from("leads")
            .select("id, full_name, email, phone_number")
            .or(`phone_number.ilike.%${last10}%`)
            .limit(1)
            .maybeSingle();

          if (lead) {
            contactInfo = { id: lead.id, name: `${lead.full_name} (Lead)`, email: lead.email, type: "lead" };
          }
        }
      } catch (lookupErr) {
        console.warn("[whatsapp:messages] Non-member contact lookup error:", lookupErr);
      }
    }

    const replyWindow = await checkReplyWindow(digits, supabase);

    return NextResponse.json({
      phone: digits,
      formattedPhone: formatIndianPhone(digits),
      member: contactInfo,
      replyWindow,
      messages: messages || [],
    });
  } catch (err: any) {
    console.error("[whatsapp:messages] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const auth = await verifyAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
    }

    const { phone: rawPhone } = await params;
    const norm = normalizeIndianPhone(rawPhone);
    const digits = norm.ok ? norm.digits : rawPhone.replace(/\D/g, "");

    const body = await req.json();
    const text = (body.text || "").trim();
    const template = body.template;
    const templateParams = body.params || {};

    if (template) {
      const { sendTemplate } = await import("@/lib/whatsapp/service");
      const result = await sendTemplate(template, digits, templateParams);
      if (!result.success) {
        return NextResponse.json(
          { error: result.errorMessage || "Failed to send template message.", errorCode: result.errorCode },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        result,
      });
    }

    if (!text) {
      return NextResponse.json({ error: "Message text is required" }, { status: 400 });
    }

    // Call service to send text reply
    const result = await sendText(digits, text);

    if (!result.success) {
      // Non-technical error feedback
      const friendlyError =
        result.errorCode === "WINDOW_CLOSED"
          ? "24-hour reply window closed. You can reply after the member messages again."
          : result.errorMessage || "Failed to send message. Please try again.";

      return NextResponse.json(
        { error: friendlyError, errorCode: result.errorCode },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: any) {
    console.error("[whatsapp:messages] POST error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
