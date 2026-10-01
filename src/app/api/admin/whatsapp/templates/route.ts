import { NextResponse } from "next/server";
import { requireWhatsapp } from "@/lib/whatsapp/admin";

export async function GET() {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  try {
    const { service } = auth.admin;
    const { data, error } = await service
      .from("whatsapp_message_templates")
      .select("*")
      .order("template_key", { ascending: true });

    if (error) {
      console.error("[whatsapp] templates read failed:", error.message);
      return NextResponse.json(
        { error: "Unable to load message templates." },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error("[whatsapp] templates route error:", err);
    return NextResponse.json(
      { error: "Unable to load message templates." },
      { status: 500 }
    );
  }
}