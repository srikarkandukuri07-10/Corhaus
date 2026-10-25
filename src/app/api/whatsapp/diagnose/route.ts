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
  let waba1: any = null;
  let waba2: any = null;
  let template8619: any = null;
  let templateMeta: any = null;
  let phoneMeta: any = null;
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const version = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
      const token = process.env.WHATSAPP_ACCESS_TOKEN;

      const metaRes = await fetch(
        `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,account_mode,status,name_status`,
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

      // Query both known WABAs from the user's screenshot
      try {
        const res1 = await fetch(
          `https://graph.facebook.com/${version}/918072894571735?fields=id,name,currency,message_templates{id,name,status,language},phone_numbers{id,display_phone_number,verified_name}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        waba1 = await res1.json();
      } catch (e: any) {
        waba1 = { error: e.message };
      }

      try {
        const res2 = await fetch(
          `https://graph.facebook.com/${version}/1651335856436462?fields=id,name,currency,message_templates{id,name,status,language},phone_numbers{id,display_phone_number,verified_name}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        waba2 = await res2.json();
      } catch (e: any) {
        waba2 = { error: e.message };
      }

      // Directly query template 861956950314268 (class_booking_reminder2)
      let template8619: any = null;
      try {
        const tRes = await fetch(
          `https://graph.facebook.com/${version}/861956950314268?fields=id,name,status,language,category,components,parameter_format`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        template8619 = await tRes.json();
      } catch (tmplErr: any) {
        template8619 = { error: tmplErr.message };
      }

      // Query phone number metadata
      try {
        const pMetaRes = await fetch(
          `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}?metadata=1`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        phoneMeta = await pMetaRes.json();
      } catch (e: any) {
        phoneMeta = { error: e.message };
      }

      // Directly query template 3061502297550653
      try {
        const tmplByIdRes = await fetch(
          `https://graph.facebook.com/${version}/3061502297550653?fields=id,name,status,language,category,components`,
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
      .select("id, direction, phone, type, status, wa_message_id, created_at, error_code, error_message")
      .order("created_at", { ascending: false })
      .limit(10);

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
      meta_templates: metaTemplates,
      waba_918072894571735: waba1,
      waba_1651335856436462: waba2,
      template_8619: template8619,
      template_meta: templateMeta,
      phone_meta: phoneMeta,
      debug_token: debugTokenData?.data || null,
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

    const { normalizeIndianPhone } = await import("@/lib/whatsapp/phone");
    const norm = normalizeIndianPhone(phone);
    const toDigits = norm.ok ? norm.digits : phone.replace(/\D/g, "");

    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";

    const attempts: any[] = [];

    const templateName = body.template || "class_booking_reminder2";

    // Attempt 1: Named parameters, language 'en'
    const payload1 = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toDigits,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", parameter_name: "member_name", text: memberName },
              { type: "text", parameter_name: "class_name", text: "Reformer Pilates Intro" },
              { type: "text", parameter_name: "class_date", text: "Today" },
              { type: "text", parameter_name: "class_time", text: "5:00 PM" },
              { type: "text", parameter_name: "trainer_name", text: "Instructor Sarah" },
              { type: "text", parameter_name: "location_name", text: "Corhaus Studio - Hyderabad" },
            ],
          },
        ],
      },
    };

    const res1 = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload1),
    });
    const data1 = await res1.json();
    attempts.push({ mode: `named_en_${templateName}`, status: res1.status, response: data1 });

    // Attempt 2: Positional parameters, language 'en'
    if (data1.error) {
      const payload2 = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: memberName },
                { type: "text", text: "Reformer Pilates Intro" },
                { type: "text", text: "Today" },
                { type: "text", text: "5:00 PM" },
                { type: "text", text: "Instructor Sarah" },
                { type: "text", text: "Corhaus Studio - Hyderabad" },
              ],
            },
          ],
        },
      };

      const res2 = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload2),
      });
      const data2 = await res2.json();
      attempts.push({ mode: `positional_en_${templateName}`, status: res2.status, response: data2 });
    }

    // Attempt 3: If still error, try language 'en_US'
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.response?.error) {
      const payload3 = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", parameter_name: "member_name", text: memberName },
                { type: "text", parameter_name: "class_name", text: "Reformer Pilates Intro" },
                { type: "text", parameter_name: "class_date", text: "Today" },
                { type: "text", parameter_name: "class_time", text: "5:00 PM" },
                { type: "text", parameter_name: "trainer_name", text: "Instructor Sarah" },
                { type: "text", parameter_name: "location_name", text: "Corhaus Studio - Hyderabad" },
              ],
            },
          ],
        },
      };

      const res3 = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload3),
      });
      const data3 = await res3.json();
      attempts.push({ mode: `named_en_US_${templateName}`, status: res3.status, response: data3 });
    }

    // Also test sending default 'hello_world' template to see if this phone can send templates
    const payloadHelloWorld = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toDigits,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
      },
    };
    const resHw = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payloadHelloWorld),
    });
    const dataHw = await resHw.json();
    attempts.push({ mode: "hello_world", status: resHw.status, response: dataHw });

    const supabase = getServiceClient();
    for (const att of attempts) {
      const waMsgId = att.response?.messages?.[0]?.id;
      if (waMsgId) {
        await supabase.from("whatsapp_messages").insert({
          direction: "out",
          phone: toDigits,
          type: "template",
          body: `[Test] Template: ${att.mode}`,
          status: "sent",
          wa_message_id: waMsgId,
        });
      }
    }

    return NextResponse.json({
      phone: toDigits,
      attempts,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
    }, { status: 500 });
  }
}

