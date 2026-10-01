import { NextResponse } from "next/server";
import { audit, readSettings, requireWhatsapp, toPublicState } from "@/lib/whatsapp/admin";

// Reminder timer configuration (section 17). Persisted in Supabase, never
// hardcoded, and read by the worker - not by any browser timer.

export async function GET() {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  try {
    const settings = await readSettings(auth.admin.service);
    return NextResponse.json(toPublicState(settings));
  } catch (err) {
    console.error("[whatsapp] settings read failed:", err);
    return NextResponse.json(
      { error: "Unable to load reminder settings." },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireWhatsapp("whatsapp.manage");
  if (!auth.ok) return auth.response;

  let body: {
    reminder_enabled?: unknown;
    reminder_minutes?: unknown;
    max_send_attempts?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_by: auth.admin.email };
  const touched: string[] = [];

  if (typeof body.reminder_enabled === "boolean") {
    patch.reminder_enabled = body.reminder_enabled;
    touched.push("reminder_enabled");
  }

  if (body.reminder_minutes !== undefined) {
    const mins = Number(body.reminder_minutes);
    if (!Number.isInteger(mins) || mins < 5 || mins > 1440) {
      return NextResponse.json(
        {
          error:
            "Reminder time must be a whole number of minutes between 5 and 1440 (24 hours).",
        },
        { status: 400 }
      );
    }
    patch.reminder_minutes = mins;
    touched.push("reminder_minutes");
  }

  if (body.max_send_attempts !== undefined) {
    const attempts = Number(body.max_send_attempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) {
      return NextResponse.json(
        { error: "Maximum send attempts must be between 1 and 10." },
        { status: 400 }
      );
    }
    patch.max_send_attempts = attempts;
    touched.push("max_send_attempts");
  }

  if (touched.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { service, email, role } = auth.admin;
    const { error } = await service
      .from("whatsapp_settings")
      .update(patch)
      .eq("id", "default");

    if (error) {
      console.error("[whatsapp] settings update failed:", error.message);
      return NextResponse.json(
        { error: "Unable to save reminder settings." },
        { status: 500 }
      );
    }

    await audit(service, "whatsapp.timer_changed", { email, role }, {
      changes: patch,
    });

    const settings = await readSettings(service);
    return NextResponse.json({ success: true, ...toPublicState(settings) });
  } catch (err) {
    console.error("[whatsapp] settings update threw:", err);
    return NextResponse.json(
      { error: "Unable to save reminder settings." },
      { status: 500 }
    );
  }
}