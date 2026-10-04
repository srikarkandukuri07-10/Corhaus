// Signed-webhook replay test against the locally running production build.
// Uses the webhook secret from .env.local.
//
// IMPORTANT: deliberately does NOT exercise the fulfilment happy path, because
// that would insert a real trial_members / leads / customers / invoices row
// into the production database. The brief forbids creating dummy records.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const secret = (
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("RAZORPAY_WEBHOOK_SECRET=")) || ""
)
  .replace("RAZORPAY_WEBHOOK_SECRET=", "")
  .trim();

const BASE = "http://127.0.0.1:3113/api/webhooks/razorpay";

async function post(body, sigSecret) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const sig = crypto
    .createHmac("sha256", sigSecret)
    .update(raw)
    .digest("hex");
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": sig,
    },
    body: raw,
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

let pass = 0;
let fail = 0;
function expect(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  -> ${detail}`);
  }
}

(async () => {
  console.log(`\n  secret length: ${secret.length}\n`);

  // 1. No signature at all
  {
    const r = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(
      "no signature -> 400",
      r.status === 400,
      `got ${r.status}`
    );
  }

  // 2. Wrong signature
  {
    const r = await post({ event: "payment.captured" }, "not-the-secret");
    expect(
      "wrong signature -> 400 Invalid signature",
      r.status === 400 && /Invalid signature/.test(r.body),
      `got ${r.status} ${r.body}`
    );
  }

  // 3. Valid signature, event we do not act on
  {
    const r = await post({ event: "refund.processed", payload: {} }, secret);
    const j = JSON.parse(r.body);
    expect(
      "valid sig + refund.processed -> 200 handled:false",
      r.status === 200 && j.received === true && j.handled === false,
      `got ${r.status} ${r.body}`
    );
  }

  // 4. Valid signature, payment.captured, order notes empty.
  //    Exercises payload parsing + the rejection branch without any DB write.
  {
    const r = await post(
      {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_selftest_no_notes",
              order_id: "order_selftest_no_notes",
              amount: 50000,
              notes: {},
            },
          },
        },
      },
      secret
    );
    const j = JSON.parse(r.body);
    expect(
      "valid sig + no order notes -> 200 outcome:rejected with reason",
      r.status === 200 && j.outcome === "rejected" && typeof j.detail === "string",
      `got ${r.status} ${r.body}`
    );
  }

  // 5. Valid signature, payment.captured, order id missing entirely
  {
    const r = await post(
      { event: "payment.captured", payload: { payment: { entity: {} } } },
      secret
    );
    const j = JSON.parse(r.body);
    expect(
      "valid sig + no order id -> 200 handled:false",
      r.status === 200 && j.handled === false,
      `got ${r.status} ${r.body}`
    );
  }

  // 6. Tampered body must not validate against a signature of the original
  {
    const original = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_a", order_id: "order_a" } } },
    });
    const tampered = original.replace("order_a", "order_b");
    const sig = crypto.createHmac("sha256", secret).update(original).digest("hex");
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": sig,
      },
      body: tampered,
    });
    expect(
      "tampered body rejected -> 400",
      res.status === 400,
      `got ${res.status}`
    );
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();