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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: ticketId } = await params;
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    await ensureProfile(supabase, user);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

    // 1. Fetch ticket
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

    // 2. Fetch profiles lookup map
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    // 3. Fetch messages
    const { data: rawMessages, error: msgError } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Fetch messages error:", msgError);
    }

    const messages = (rawMessages || []).map((m: any) => ({
      ...m,
      profiles: profileMap[m.sender_id] || { id: m.sender_id, full_name: "User", email: "" },
    }));

    // 4. Mark unread messages sent by opposite party as read
    const oppositeSenderType = isDeveloper ? "client" : "developer";
    await supabase
      .from("support_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("ticket_id", ticketId)
      .eq("sender_type", oppositeSenderType)
      .is("read_at", null);

    return NextResponse.json({
      ticket: {
        ...ticket,
        profiles: profileMap[ticket.created_by] || { id: ticket.created_by, full_name: "User", email: "" },
      },
      messages,
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
    await ensureProfile(supabase, user);

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
        await supabase.from("support_messages").insert({
          ticket_id: ticketId,
          sender_type: "client",
          sender_id: user.id,
          message: "⚠️ Client indicated: Still having issue. Reopened ticket.",
          created_at: new Date().toISOString(),
        });
      } else if (action === "accept_resolution") {
        newStatus = "Resolved";
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
      .select("*")
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
