/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/whatsapp/service";

export async function GET() {
  const envStatus = {
    WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED ?? "(not set)",
    has_WHATSAPP_APP_SECRET: Boolean(process.env.WHATSAPP_APP_SECRET),
    WHATSAPP_APP_SECRET_len: process.env.WHATSAPP_APP_SECRET?.length ?? 0,
    has_WHATSAPP_VERIFY_TOKEN: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    WHATSAPP_VERIFY_TOKEN_len: process.env.WHATSAPP_VERIFY_TOKEN?.length ?? 0,
    has_WHATSAPP_ACCESS_TOKEN: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    WHATSAPP_ACCESS_TOKEN_prefix: process.env.WHATSAPP_ACCESS_TOKEN
      ? `${process.env.WHATSAPP_ACCESS_TOKEN.slice(0, 7)}...`
      : "(not set)",
    has_WHATSAPP_PHONE_NUMBER_ID: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "(not set)",
    WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION ?? "v25.0",
    has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  let metaApiCheck: any = null;
  let metaTemplates: any = null;
  let debugTokenData: any = null;
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const version = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
      const token = process.env.WHATSAPP_ACCESS_TOKEN;

      const metaRes = await fetch(
        `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      metaApiCheck = await metaRes.json();

      // Inspect debug_token to get WABA ID
      const debugRes = await fetch(
        `https://graph.facebook.com/${version}/debug_token?input_token=${token}&access_token=${token}`
      );
      debugTokenData = await debugRes.json();

      // Directly query the template by its Meta ID from the screenshot: 3061502297550653
      try {
        const tmplByIdRes = await fetch(
          `https://graph.facebook.com/${version}/3061502297550653?fields=name,status,language,category,components`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        metaTemplates = await tmplByIdRes.json();
      } catch (tmplErr: any) {
        metaTemplates = { error: tmplErr.message };
      }
    } catch (e: any) {
      metaApiCheck = { error: e.message };
    }
  }

  try {
    const supabase = getServiceClient();

    const { count: msgCount, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true });

    const { count: convCount, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("*", { count: "exact", head: true });

    const { data: latestMsg } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, phone, type, status, created_at, error_code, error_message")
      .order("created_at", { ascending: false })
      .limit(3);

    const { data: latestConvs } = await supabase
      .from("whatsapp_conversations")
      .select("phone, last_inbound_at, last_message_at, unread_count, last_message_preview")
      .order("last_message_at", { ascending: false })
      .limit(3);

    return NextResponse.json({
      status: "ok",
      server_time: new Date().toISOString(),
      env: envStatus,
      meta_account: metaApiCheck,
      meta_templates: metaTemplates?.data || metaTemplates,
      debug_token: debugTokenData?.data?.granular_scopes || null,
      db: {
        messages_total: msgCount ?? 0,
        messages_error: msgErr?.message ?? null,
        conversations_total: convCount ?? 0,
        conversations_error: convErr?.message ?? null,
        latest_messages: latestMsg ?? [],
        latest_conversations: latestConvs ?? [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      status: "error",
      error: message,
      env: envStatus,
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = body.phone || "8309909784";
    const memberName = body.memberName || "Test_Member";

    const { sendTemplate, sendText } = await import("@/lib/whatsapp/service");

    if (body.type === "text") {
      const res = await sendText(phone, body.text || "Hello from Corhaus Pilates dashboard!");
      return NextResponse.json({ action: "sendText", phone, result: res });
    }

    const res = await sendTemplate("class_reminder", phone, {
      member_name: memberName,
      class_name: "Reformer Pilates Intro",
      class_date: "Today",
      class_time: "5:00 PM",
      trainer_name: "Instructor Sarah",
      location_name: "Corhaus Studio - Hyderabad",
    });

    return NextResponse.json({
      action: "sendTemplate",
      event: "class_reminder",
      phone,
      result: res,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
    }, { status: 500 });
  }
}

