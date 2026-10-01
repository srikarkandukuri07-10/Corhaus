import { NextResponse } from "next/server";
import { audit, requireWhatsapp } from "@/lib/whatsapp/admin";
import { enqueueWhatsappMessage } from "@/lib/whatsapp/enqueue";
import { validateTemplateKey } from "@/lib/whatsapp/templates";
import type { TemplateKey } from "@/lib/whatsapp/types";

// Test message (section 23).
//
// Only ever targets ONE explicitly selected real member. There is no
// broadcast path in this module, and `recipient_phone` is re-derived from the
// member record rather than accepted from the request body, so the number shown
// in the confirmation dialog is provably the number that will be used.

export async function POST(req: Request) {
  const auth = await requireWhatsapp("whatsapp.send");
  if (!auth.ok) return auth.response;

  let body: { member_id?: string; template_key?: string; confirmed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const memberId = String(body.member_id ?? "");
  const templateKeyRaw = String(body.template_key ?? "");

  if (!memberId) {
    return NextResponse.json(
      { error: "Select an approved member." },
      { status: 400 }
    );
  }
  if (!validateTemplateKey(templateKeyRaw)) {
    return NextResponse.json(
      { error: `Unknown template key "${templateKeyRaw}".` },
      { status: 400 }
    );
  }
  const templateKey: TemplateKey = templateKeyRaw;

  try {
    const { service, email, role } = auth.admin;

    const { data: member, error: mErr } = await service
      .from("approved_members")
      .select("id, full_name, phone_number, membership_status")
      .eq("id", memberId)
      .maybeSingle();

    if (mErr) throw new Error(mErr.message);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    // Dry run: the UI calls this first to show the exact recipient before the
    // admin confirms. Enqueues nothing.
    if (body.confirmed !== true) {
      const { normalizeIndianPhone, formatIndianPhone } = await import(
        "@/lib/whatsapp/phone"
      );
      const norm = normalizeIndianPhone(member.phone_number);
      return NextResponse.json({
        confirm: {
          member_id: member.id,
          member_name: member.full_name,
          template_key: templateKey,
          phone_display: formatIndianPhone(member.phone_number),
          phone_valid: norm.ok,
          warning: norm.ok
            ? null
            : norm.ok === false
              ? norm.reason
              : null,
          membership_status: member.membership_status,
        },
      });
    }

    // Unique nonce per explicit test send, so an admin may deliberately send
    // the same template twice without tripping the business-event dedupe.
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await enqueueWhatsappMessage({
      templateKey,
      approvedMemberId: member.id,
      idempotencyKey: `test:${member.id}:${templateKey}:${nonce}`,
      triggerType: "test",
    });

    if (!result.ok) {
      await audit(service, "whatsapp.test_message_failed", { email, role }, {
        member_id: member.id,
        template_key: templateKey,
        reason: result.reason,
        kind: result.kind,
      });
      const status = result.kind === "phone" ? 400 : result.kind === "template" ? 400 : 500;
      return NextResponse.json({ error: result.reason }, { status });
    }

    await audit(service, "whatsapp.test_message_queued", { email, role }, {
      member_id: member.id,
      member_name: member.full_name,
      template_key: templateKey,
      job_id: result.jobId,
    });

    return NextResponse.json({
      success: true,
      job_id: result.jobId,
      recipient: result.recipientPhone,
      message:
        "Test message queued. It will send on the next worker cycle, and its result appears in Message History.",
    });
  } catch (err) {
    console.error("[whatsapp] test send route error:", err);
    return NextResponse.json(
      { error: "Unable to queue the test message." },
      { status: 500 }
    );
  }
}