import { NextResponse } from "next/server";
import { requireWhatsapp } from "@/lib/whatsapp/admin";
import { getServiceClient } from "@/lib/whatsapp/enqueue";
import {
  firstName,
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  renderTemplate,
  TemplateRenderError,
  validateTemplateBody,
  validateTemplateKey,
  type TemplateContext,
} from "@/lib/whatsapp/templates";

// Live preview (section 16). Resolves against a REAL member, booking and class
// from the production database - never fabricated sample data. If no member is
// supplied the response says so explicitly instead of inventing values.

export async function POST(req: Request) {
  const auth = await requireWhatsapp("whatsapp.view");
  if (!auth.ok) return auth.response;

  let body: { template_key?: string; member_id?: string; message_body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const templateKey = String(body.template_key ?? "");
  if (!validateTemplateKey(templateKey)) {
    return NextResponse.json(
      { error: `Unknown template key "${templateKey}".` },
      { status: 400 }
    );
  }

  const messageBody =
    typeof body.message_body === "string" && body.message_body.trim()
      ? body.message_body
      : null;

  if (!messageBody) {
    return NextResponse.json(
      { error: "No message to preview." },
      { status: 400 }
    );
  }

  const validation = validateTemplateBody(messageBody, templateKey);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Message contains problems.", issues: validation.issues },
      { status: 400 }
    );
  }

  if (!body.member_id) {
    return NextResponse.json(
      {
        error:
          "Select an approved member to preview with their real class details.",
        needs_member: true,
      },
      { status: 400 }
    );
  }

  try {
    const service = getServiceClient();

    const { data: member, error: mErr } = await service
      .from("approved_members")
      .select("id, full_name, email, membership_status, location_id")
      .eq("id", body.member_id)
      .maybeSingle();

    if (mErr) throw new Error(mErr.message);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    // Prefer this member's most recent booking so the preview shows a real
    // class rather than an invented one.
    const { data: booking } = await service
      .from("bookings")
      .select("id, class_id")
      .eq("member_id", member.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const context: TemplateContext = {
      member_name: member.full_name,
      member_first_name: firstName(member.full_name),
      membership_status: member.membership_status,
    };

    if (booking) {
      context.booking_id = booking.id;
      const { data: cls } = await service
        .from("classes")
        .select("id, title, instructor, class_date, class_time, location_id")
        .eq("id", booking.class_id)
        .maybeSingle();

      if (cls) {
        context.class_name = cls.title;
        context.trainer_name = cls.instructor;
        context.class_date = formatIstDate(cls.class_date as unknown as string);
        context.class_time = formatIstTime(cls.class_time as unknown as string);
        context.class_datetime = formatIstDateTime(
          cls.class_date as unknown as string,
          cls.class_time as unknown as string
        );

        const locId = member.location_id ?? (cls.location_id as string | null);
        if (locId) {
          const { data: loc } = await service
            .from("locations")
            .select("name")
            .eq("id", locId)
            .maybeSingle();
          context.location_name = loc?.name ?? "";
        }
      }
    }

    // Every placeholder must resolve, exactly as at send time.
    try {
      const rendered = renderTemplate(messageBody, context);
      return NextResponse.json({
        preview: rendered,
        resolved_from: {
          member: member.full_name,
          has_booking: Boolean(booking),
          booking_id: context.booking_id ?? null,
          class_name: context.class_name ?? null,
        },
      });
    } catch (err) {
      if (err instanceof TemplateRenderError) {
        return NextResponse.json(
          {
            error:
              "This message cannot be sent yet: the member's records do not contain every value it needs.",
            unresolved_variable: err.variable,
          },
          { status: 400 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("[whatsapp] preview route error:", err);
    return NextResponse.json(
      { error: "Unable to build a preview." },
      { status: 500 }
    );
  }
}