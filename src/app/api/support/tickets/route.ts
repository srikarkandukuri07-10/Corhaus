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
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        role: user.email === "kandukurisrikar10@gmail.com" ? "developer" : (user.email === "admin@corhaus.com" ? "admin" : "member"),
      },
      { onConflict: "id" }
    );
  } catch (err) {
    console.error("Profile upsert error:", err);
  }
}

export async function GET() {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    await ensureProfile(supabase, user);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, email")
      .eq("id", user.id)
      .maybeSingle();

    const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

    let query = supabase.from("support_tickets").select("*");
    if (!isDeveloper) {
      query = query.eq("created_by", user.id);
    }

    const { data: tickets, error } = await query.order("last_updated_at", { ascending: false });

    if (error) {
      console.error("GET /api/support/tickets error:", error);
      if (error.message?.includes("schema cache") || error.message?.includes("does not exist")) {
        return NextResponse.json({
          tickets: [],
          isDeveloper,
          needsMigration: true,
          error: "Database tables not found. Please execute migration 031_support_system.sql in Supabase SQL Editor.",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch profiles for created_by mapping
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p; });

    // Fetch latest message snippet for each ticket
    const enrichedTickets = await Promise.all(
      (tickets || []).map(async (t) => {
        const { data: lastMsg } = await supabase
          .from("support_messages")
          .select("message, sender_type, created_at, read_at")
          .eq("ticket_id", t.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const unreadSenderType = isDeveloper ? "client" : "developer";
        const { count: unreadCount } = await supabase
          .from("support_messages")
          .select("id", { count: "exact", head: true })
          .eq("ticket_id", t.id)
          .eq("sender_type", unreadSenderType)
          .is("read_at", null);

        return {
          ...t,
          profiles: profileMap[t.created_by] || { id: t.created_by, full_name: user.email?.split("@")[0] || "User", email: user.email },
          last_message: lastMsg?.message || null,
          last_message_at: lastMsg?.created_at || t.created_at,
          unread_count: unreadCount || 0,
        };
      })
    );

    return NextResponse.json({ tickets: enrichedTickets, isDeveloper });
  } catch (err: any) {
    console.error("GET /api/support/tickets caught error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
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
    const { subject, category, priority, description, attachmentUrl, attachmentName } = body;

    if (!subject || !category || !description) {
      return NextResponse.json({ error: "Subject, category, and description are required." }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    await ensureProfile(supabase, user);

    // 1. Create ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        subject,
        category,
        priority: priority || "Medium",
        status: "Open",
        created_by: user.id,
        created_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (ticketError || !ticket) {
      console.error("POST /api/support/tickets create error:", ticketError);
      const isMissingTable = ticketError?.message?.includes("schema cache") || ticketError?.message?.includes("does not exist");
      return NextResponse.json({
        error: isMissingTable
          ? "Database tables missing. Please run migration 031_support_system.sql in Supabase SQL Editor."
          : ticketError?.message || "Failed to create ticket"
      }, { status: 500 });
    }

    // 2. Create initial message (ticket description)
    const { error: msgError } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: ticket.id,
        sender_type: "client",
        sender_id: user.id,
        message: description,
        attachment_url: attachmentUrl || null,
        attachment_name: attachmentName || null,
        created_at: new Date().toISOString(),
      });

    if (msgError) {
      console.error("POST /api/support/tickets initial message error:", msgError);
    }

    const { data: creatorProfile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      ticket: {
        ...ticket,
        profiles: creatorProfile || { id: user.id, full_name: user.email?.split("@")[0] || "User", email: user.email },
        last_message: description,
        last_message_at: ticket.created_at,
        unread_count: 0,
      },
    });
  } catch (err: any) {
    console.error("POST /api/support/tickets caught error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
