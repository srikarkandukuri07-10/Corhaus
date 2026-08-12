import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function ensureProfile(supabase: any, user: any) {
  try {
    const role = user.email === "kandukurisrikar10@gmail.com" ? "developer" : (user.email === "admin@corhaus.com" ? "admin" : "member");
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        role,
      },
      { onConflict: "id" }
    );
    if (error && error.message?.includes("profiles_role_check")) {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email || "",
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          role: "admin",
        },
        { onConflict: "id" }
      );
    }
  } catch (err) {
    console.error("Profile upsert error:", err);
  }
}

export async function POST(req: Request) {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { ticketId, message, attachmentUrl, attachmentName } = body;

    if (!ticketId || (!message && !attachmentUrl)) {
      return NextResponse.json({ error: "Ticket ID and message or attachment are required." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    await ensureProfile(supabase, user);

    // Check user profile role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

    // Fetch ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    // Permission check
    if (!isDeveloper && ticket.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Closed tickets are read-only
    if (ticket.status === "Closed") {
      return NextResponse.json({ error: "This ticket is closed and read-only." }, { status: 400 });
    }

    const senderType = isDeveloper ? "developer" : "client";

    // 1. Insert message
    const { data: newMsg, error: msgError } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        sender_type: senderType,
        sender_id: user.id,
        message: message || (attachmentName ? `Sent attachment: ${attachmentName}` : "Attachment"),
        attachment_url: attachmentUrl || null,
        attachment_name: attachmentName || null,
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (msgError || !newMsg) {
      console.error("POST /api/support/messages error:", msgError);
      return NextResponse.json({ error: msgError?.message || "Failed to send message" }, { status: 500 });
    }

    // 2. Update ticket status & last_updated_at
    const ticketUpdates: any = {
      last_updated_at: new Date().toISOString(),
    };

    if (!isDeveloper && ticket.status === "Resolved") {
      ticketUpdates.status = "In Progress";
    }

    await supabase
      .from("support_tickets")
      .update(ticketUpdates)
      .eq("id", ticketId);

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    let authorizedUrl = newMsg.attachment_url;
    if (authorizedUrl) {
      const match = authorizedUrl.match(/ticket_attachments\/.+/);
      if (match) {
        authorizedUrl = `/api/support/attachment?path=${match[0]}`;
      } else if (authorizedUrl.startsWith("ticket_attachments/")) {
        authorizedUrl = `/api/support/attachment?path=${authorizedUrl}`;
      }
    }

    return NextResponse.json({
      success: true,
      message: {
        ...newMsg,
        attachment_url: authorizedUrl,
        profiles: senderProfile || { id: user.id, full_name: user.email?.split("@")[0] || "User", email: user.email },
      },
    });
  } catch (err: any) {
    console.error("POST /api/support/messages caught error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
