import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { broadcastPush } from "@/lib/push/service";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function verifyAdminAuth() {
  try {
    const supabaseServer = await createServerClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return false;

    const { getUserRolePermissions } = await import("@/lib/rbac");
    const userPerms = await getUserRolePermissions(user);
    const adminEmail = process.env.ADMIN_EMAIL;
    const isAdminByEmail = adminEmail && user.email?.toLowerCase() === adminEmail.toLowerCase();

    return (
      isAdminByEmail ||
      userPerms.role === "Owner" ||
      userPerms.role === "Manager" ||
      userPerms.permissions.includes("*") ||
      userPerms.permissions.includes("classes.view")
    );
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("studio_holidays")
      .select("*")
      .order("start_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ holidays: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      start_date,
      end_date,
      title,
      message,
      notify_members = true,
      cancel_scheduled_classes = false,
      created_by,
    } = body;

    if (!start_date || !end_date || !title) {
      return NextResponse.json(
        { error: "Start date, end date, and title are required" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 1. Insert holiday
    const { data: holiday, error: insertErr } = await supabase
      .from("studio_holidays")
      .insert({
        start_date,
        end_date,
        title: title.trim(),
        message: (message || `Studio will remain closed from ${start_date} to ${end_date}.`).trim(),
        is_active: true,
        notify_members: Boolean(notify_members),
        created_by: created_by || "Admin",
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // 2. Optionally cancel classes falling in this date range
    let cancelledCount = 0;
    if (cancel_scheduled_classes) {
      const { data: cancelledClasses, error: cancelErr } = await supabase
        .from("classes")
        .update({ status: "Cancelled", cancellation_reason: `Studio Holiday: ${title}` })
        .gte("class_date", start_date)
        .lte("class_date", end_date)
        .eq("status", "Scheduled")
        .select("id");

      if (!cancelErr && cancelledClasses) {
        cancelledCount = cancelledClasses.length;
      }
    }

    // 3. Send Push Notification to all subscribed devices
    if (notify_members) {
      const dateText = start_date === end_date ? start_date : `${start_date} to ${end_date}`;
      broadcastPush({
        title: `📢 Studio Holiday: ${title}`,
        body: `Corhaus Studio will be closed on ${dateText}. ${message || "Scheduled classes during this period are paused."}`,
        url: "/member",
        tag: `holiday-${holiday.id}`,
      }).catch((e) => console.warn("[HOLIDAY PUSH ERROR]:", e));
    }

    return NextResponse.json({
      success: true,
      holiday,
      cancelledClassesCount: cancelledCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const isAuth = await verifyAdminAuth();
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Holiday ID is required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { error } = await supabase.from("studio_holidays").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
