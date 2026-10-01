import { NextResponse } from "next/server";
import { audit, requireWhatsapp } from "@/lib/whatsapp/admin";
import { validateTemplateBody, validateTemplateKey } from "@/lib/whatsapp/templates";
import type { TemplateKey } from "@/lib/whatsapp/types";

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const auth = await requireWhatsapp("whatsapp.manage");
  if (!auth.ok) return auth.response;

  const { key } = await ctx.params;

  if (!validateTemplateKey(key)) {
    return NextResponse.json(
      { error: `Unknown template key "${key}".` },
      { status: 400 }
    );
  }
  const templateKey: TemplateKey = key;

  let body: {
    message_body?: unknown;
    is_enabled?: unknown;
    offset_minutes?: unknown;
    template_name?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_by: auth.admin.email };
  const touchedFields: string[] = [];

  if (typeof body.message_body === "string") {
    // Same validator the UI uses, so an invalid body can never be persisted.
    const check = validateTemplateBody(body.message_body, templateKey);
    if (!check.valid) {
      return NextResponse.json(
        { error: "Message template is not valid.", issues: check.issues },
        { status: 400 }
      );
    }
    patch.message_body = body.message_body;
    touchedFields.push("message_body");
  }

  if (typeof body.is_enabled === "boolean") {
    patch.is_enabled = body.is_enabled;
    touchedFields.push("is_enabled");
  }

  if (typeof body.template_name === "string" && body.template_name.trim()) {
    patch.template_name = body.template_name.trim().slice(0, 120);
    touchedFields.push("template_name");
  }

  if (body.offset_minutes !== undefined) {
    const mins = Number(body.offset_minutes);
    if (!Number.isInteger(mins) || mins < 5 || mins > 1440) {
      return NextResponse.json(
        { error: "Reminder time must be a whole number of minutes between 5 and 1440." },
        { status: 400 }
      );
    }
    patch.offset_minutes = mins;
    touchedFields.push("offset_minutes");
  }

  if (touchedFields.length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { service, email, role } = auth.admin;
    const { data, error } = await service
      .from("whatsapp_message_templates")
      .update(patch)
      .eq("template_key", templateKey)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error(`[whatsapp] template update failed (${templateKey}):`, error.message);
      return NextResponse.json(
        { error: "Unable to save the template." },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Template not found. Run migration 056 to seed templates." },
        { status: 404 }
      );
    }

    await audit(service, "whatsapp.template_updated", { email, role }, {
      template_key: templateKey,
      fields: touchedFields,
      is_enabled: (data as { is_enabled?: boolean }).is_enabled,
    });

    return NextResponse.json({ success: true, template: data });
  } catch (err) {
    console.error("[whatsapp] template update threw:", err);
    return NextResponse.json(
      { error: "Unable to save the template." },
      { status: 500 }
    );
  }
}