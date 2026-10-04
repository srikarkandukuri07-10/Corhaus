import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Razorpay from "razorpay";
import {
  canCollectOnline,
  createInvoicePaymentLink,
  outstandingBalance,
  type InvoiceForPayment,
} from "@/lib/razorpay/invoicePayment";

/**
 * Creates a Razorpay Payment Link for an invoice's outstanding balance so the
 * member can pay online (UPI / card / netbanking) from the counter.
 *
 * Idempotent: if the invoice already has a payment link, that link is returned
 * rather than a second one being created. Staff re-clicking "Collect payment"
 * must not produce a second payable link for the same invoice.
 *
 * Requires an admin with billing.create; branch-scoped so staff cannot collect
 * against another branch's invoice.
 */
export async function POST(req: Request) {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.create");
    if (!check.authorized) return check.response!;

    const { createClient: createServerClient } = await import(
      "@/lib/supabase/server"
    );
    const supabaseServer = await createServerClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json(
        { error: "Online payments are not configured." },
        { status: 500 }
      );
    }

    let body: { invoiceId?: string; refresh?: boolean; amountRupees?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const invoiceId = String(body.invoiceId || "");
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required." }, { status: 400 });
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: row, error: invErr } = await service
      .from("invoices")
      .select(
        "id, invoice_number, grand_total, amount_paid, payment_status, location_id, customer_name, customer_email, customer_phone, razorpay_payment_link_id, razorpay_payment_link_url"
      )
      .eq("id", invoiceId)
      .maybeSingle();

    if (invErr) {
      console.error("[razorpay] invoice lookup failed:", invErr.message);
      return NextResponse.json({ error: "Could not load the invoice." }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }

    const invoice = row as unknown as InvoiceForPayment & {
      location_id: string | null;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
    };

    // Branch isolation: staff may only collect against their own branch.
    const { getLocationAccess } = await import("@/lib/location");
    const access = await getLocationAccess({
      id: user.id,
      email: user.email || "",
    });
    if (
      invoice.location_id &&
      access.locationIds.length > 0 &&
      !access.locationIds.includes(invoice.location_id)
    ) {
      return NextResponse.json(
        { error: "This invoice belongs to another location." },
        { status: 403 }
      );
    }

    const outstanding = outstandingBalance(invoice);

    // Already collected - tell the caller rather than erroring, so the UI can
    // simply close the panel.
    if (outstanding <= 0) {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        amount: 0,
        message: "This invoice is already settled.",
      });
    }

    // Return the existing link instead of minting a second one. `refresh` forces
    // a new link, for the case where an old link expired or was cancelled.
    if (invoice.razorpay_payment_link_url && !body.refresh) {
      return NextResponse.json({
        success: true,
        reused: true,
        url: invoice.razorpay_payment_link_url,
        linkId: invoice.razorpay_payment_link_id,
        amount: outstanding,
        invoiceNumber: invoice.invoice_number,
      });
    }

    if (!canCollectOnline(invoice)) {
      return NextResponse.json(
        {
          error: `This invoice cannot take an online payment (status: ${invoice.payment_status}).`,
        },
        { status: 400 }
      );
    }

    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

    const result = await createInvoicePaymentLink(razorpay, {
      invoice,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      customerPhone: invoice.customer_phone,
      // The billing screen declares what is being collected now. The QR must
      // collect exactly that figure, not the leftover balance.
      ...(typeof body.amountRupees === "number" && body.amountRupees > 0
        ? { amountRupees: Math.min(body.amountRupees, invoice.grand_total ?? body.amountRupees) }
        : {}),
    });

    if (!result.ok) {
      const status = /auth|credential|api key/i.test(result.reason || "")
        ? 502
        : 500;
      return NextResponse.json(
        {
          error:
            "Could not create the payment link. If Razorpay is rejecting the credentials, check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel.",
          detail: result.reason,
        },
        { status }
      );
    }

    const { error: updErr } = await service
      .from("invoices")
      .update({
        razorpay_payment_link_id: result.linkId,
        razorpay_payment_link_url: result.url,
        payment_link_created_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (updErr) {
      console.error("[razorpay] could not store payment link on invoice:", updErr.message);
    }

    try {
      await service.from("invoice_payment_audit").insert({
        invoice_id: invoiceId,
        action: "payment_link_created",
        actor_email: user.email || null,
        details: { link_id: result.linkId, amount: outstanding },
      });
    } catch (e) {
      console.error("[razorpay] audit write failed:", e);
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      linkId: result.linkId,
      amount: outstanding,
      invoiceNumber: invoice.invoice_number,
    });
  } catch (err) {
    console.error("[razorpay] payment-link route error:", err);
    return NextResponse.json(
      { error: "Unable to create the payment link." },
      { status: 500 }
    );
  }
}