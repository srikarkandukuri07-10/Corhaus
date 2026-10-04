/**
 * Direct test of the Razorpay Payment Link API with the live keys.
 * Bypasses the admin route (which needs an admin session) so we can prove the
 * Razorpay side works at all.
 *
 * Creates one real payment link. It is UNPAID and harmless.
 * Never prints credentials.
 */
const fs = require("node:fs");
const path = require("node:path");
const Razorpay = require("razorpay");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET || "";

console.log("PAYMENT LINK API TEST\n");
console.log(`  key id present : ${Boolean(keyId)}  (mode ${
  keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "?"
})`);
console.log(`  key sec present: ${Boolean(keySecret)}\n`);

if (!keyId || !keySecret) {
  console.log("RESULT = FAILED (missing credentials)");
  process.exit(1);
}

const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

rzp.paymentLink
  .create({
    amount: 50000, // Rs 500
    currency: "INR",
    accept_partial: false,
    reference_id: "00000000-0000-0000-0000-000000000000",
    description: "Corhaus invoice TEST-DO-NOT-PAY",
    customer: { name: "Verify Test" },
    notify: { sms: false },
    reminder_enable: false,
  })
  .then((link) => {
    console.log("RESULT = SUCCESS");
    console.log(`  link id       : ${link.id}`);
    console.log(`  short_url     : ${link.short_url}`);
    console.log(`  reference_id  : ${link.reference_id}`);
    console.log(`  amount        : ${link.amount} ${link.currency}`);
    console.log(`  status        : ${link.status}`);
    console.log(`  expired       : ${link.expired}`);
    console.log(`\n  NOTE: this link is real and unpaid. Do not scan/pay it.`);
    process.exit(0);
  })
  .catch((err) => {
    console.log("RESULT = FAILED");
    console.log(`  http status   : ${err.statusCode ?? "(none)"}`);
    console.log(`  error code    : ${err.error?.code ?? "(none)"}`);
    console.log(`  description   : ${err.error?.description ?? err.message}`);
    process.exit(1);
  });
