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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ticketId } = await params;
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

    // 1. Fetch ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("*, profiles:created_by(id, full_name, email)")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    // Permission check
    if (!isDeveloper && ticket.created_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Fetch messages
    const { data: messages, error: msgError } = await supabase
      .from("support_messages")
      .select("*, profiles:sender_id(id, full_name, email)")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Fetch messages error:", msgError);
    }

    // 3. Mark unread messages sent by opposite party as read
    const oppositeSenderType = isDeveloper ? "client" : "developer";
    await supabase
      .from("support_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("ticket_id", ticketId)
      .eq("sender_type", oppositeSenderType)
      .is("read_at", null);

    return NextResponse.json({
      ticket,
      messages: messages || [],
      isDeveloper,
    });
  } catch (err: any) {
    console.error("GET /api/support/tickets/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ticketId } = await params;
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = await req.json();
    const { status, action } = body;

    let newStatus = ticket.status;
    let resolvedAt = ticket.resolved_at;
    let closedAt = ticket.closed_at;

    // Handle Client Actions
    if (!isDeveloper) {
      if (ticket.created_by !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (action === "reopen" || action === "still_having_issue") {
        newStatus = "In Progress";
        resolvedAt = null;
        // Post automatic system message
        await supabase.from("support_messages").insert({
          ticket_id: ticketId,
          sender_type: "client",
          sender_id: user.id,
          message: "⚠️ Client indicated: Still having issue. Reopened ticket.",
          created_at: new Date().toISOString(),
        });
      } else if (action === "accept_resolution") {
        newStatus = "Resolved";
        // Post automatic system message
        await supabase.from("support_messages").insert({
          ticket_id: ticketId,
          sender_type: "client",
          sender_id: user.id,
          message: "✅ Client accepted the resolution.",
          created_at: new Date().toISOString(),
        });
      } else {
        return NextResponse.json({ error: "Clients cannot directly change ticket status." }, { status: 403 });
      }
    } else {
      // Developer Actions
      if (status) {
        newStatus = status;
        if (status === "Resolved" && !resolvedAt) {
          resolvedAt = new Date().toISOString();
        }
        if (status === "Closed") {
          closedAt = new Date().toISOString();
        }
      }
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from("support_tickets")
      .update({
        status: newStatus,
        resolved_at: resolvedAt,
        closed_at: closedAt,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId)
      .select("*, profiles:created_by(id, full_name, email)")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, ticket: updatedTicket });
  } catch (err: any) {
    console.error("PATCH /api/support/tickets/[id] error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
