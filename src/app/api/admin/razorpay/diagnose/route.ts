import { NextResponse } from "next/server";
import Razorpay from "razorpay";

/**
 * Admin-only Razorpay credential check.
 *
 * Exists because the only other way to see why order creation failed is to dig
 * through Vercel's log search. This returns the diagnosis directly in the
 * browser, and it is SAFE BY CONSTRUCTION:
 *
 *   - admin-only (requires billing.view), never public
 *   - returns booleans, lengths, prefixes and Razorpay's own error text
 *   - NEVER returns, logs or echoes any part of a secret
 *   - performs a READ-ONLY Razorpay call (payments.all with count=1), so it
 *     creates no order, charges nothing and leaves no test residue
 */
export async function GET() {
  try {
    const { verifyApiPermission } = await import("@/lib/rbac");
    const check = await verifyApiPermission("billing.view");
    if (!check.authorized) return check.response!;

    const keyId = process.env.RAZORPAY_KEY_ID || "";
    const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

    const report = {
      keyIdPresent: Boolean(keyId),
      keySecretPresent: Boolean(keySecret),
      webhookSecretPresent: Boolean(webhookSecret),
      keyIdMode: keyId.startsWith("rzp_live_")
        ? ("live" as const)
        : keyId.startsWith("rzp_test_")
          ? ("test" as const)
          : ("unrecognised" as const),
      keyIdLength: keyId.length,
      keySecretLength: keySecret.length,
      keyIdHasWhitespace: keyId !== keyId.trim(),
      keySecretHasWhitespace: keySecret !== keySecret.trim(),
      keyIdHasNewline: /[\r\n]/.test(keyId),
      keySecretHasNewline: /[\r\n]/.test(keySecret),
      // A 64-char lowercase hex value in the Key Secret slot means the webhook
      // secret was pasted into the wrong field.
      keySecretLooksLikeWebhookSecret: /^[0-9a-f]{40,}$/i.test(keySecret),
      webhookSecretTooShort: webhookSecret.length > 0 && webhookSecret.length < 16,
      authCheck: null as null | {
        ok: boolean;
        status: number | null;
        description: string;
        hint: string | null;
      },
      problems: [] as string[],
    };

    if (!keyId || !keySecret) {
      report.problems.push(
        "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set in this deployment."
      );
      return NextResponse.json(report);
    }

    if (report.keyIdHasWhitespace || report.keySecretHasWhitespace) {
      report.problems.push(
        "A key has leading or trailing whitespace. Delete the variable in Vercel and re-add it using Razorpay's copy button."
      );
    }
    if (report.keyIdHasNewline || report.keySecretHasNewline) {
      report.problems.push(
        "A key contains a line break. Copy it again as a single line."
      );
    }
    if (report.keySecretLooksLikeWebhookSecret) {
      report.problems.push(
        "RAZORPAY_KEY_SECRET looks like the webhook secret. These are different credentials - check they were not swapped."
      );
    }
    if (report.keyIdMode === "unrecognised") {
      report.problems.push(
        "RAZORPAY_KEY_ID does not start with rzp_live_ or rzp_test_. Check the value was copied completely."
      );
    }

    // Read-only auth probe: lists a single payment. Creates nothing.
    try {
      const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
      await rzp.payments.all({ count: 1 });
      report.authCheck = {
        ok: true,
        status: 200,
        description: "Razorpay accepted these credentials.",
        hint: null,
      };
    } catch (err) {
      const e = err as {
        statusCode?: number;
        error?: { code?: string; description?: string };
        message?: string;
      };
      const status = e?.statusCode ?? null;
      const description =
        e?.error?.description || e?.message || "Unknown error";
      report.authCheck = {
        ok: false,
        status,
        description,
        hint:
          status === 401
            ? "Razorpay rejected the key pair. The Key ID and Key Secret must come from the same Razorpay account and the same mode (both live or both test). Re-copy both from Settings -> Account & Settings -> API Keys."
            : status === 429
              ? "Rate limited by Razorpay. Wait a minute and refresh."
              : "Check the Vercel deployment logs for the full error.",
      };
      report.problems.push(
        `Razorpay rejected the credentials: ${description}`
      );
    }

    return NextResponse.json(report);
  } catch (err) {
    console.error("[razorpay] diagnose route error:", err);
    return NextResponse.json(
      { error: "Unable to run the diagnostic." },
      { status: 500 }
    );
  }
}