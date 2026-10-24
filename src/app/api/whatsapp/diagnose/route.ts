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
