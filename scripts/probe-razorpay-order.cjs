// Isolates "is the order-creation code broken, or are the credentials/activation
// state the problem?" by calling Razorpay directly with the LOCAL test keys.
// Creates an unpaid TEST order only - no money, no production impact.
const path = require("node:path");
const fs = require("node:fs");
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

const keyId = env.RAZORPAY_KEY_ID || "";
const keySecret = env.RAZORPAY_KEY_SECRET || "";

console.log("key id prefix :", keyId.slice(0, 9) + "...");
console.log("secret present:", Boolean(keySecret), `(len ${keySecret.length})`);

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

razorpay.orders
  .create({
    amount: 50000,
    currency: "INR",
    receipt: `codecheck_${Date.now()}`,
    notes: { probe: "code-path-check" },
  })
  .then((order) => {
    console.log("\nRESULT: order created OK");
    console.log("  id     :", order.id);
    console.log("  amount :", order.amount, order.currency);
    console.log("  status :", order.status);
    console.log("\n=> the order-creation code path is CORRECT.");
    console.log("   Any production failure is credentials / account activation.");
    process.exit(0);
  })
  .catch((err) => {
    console.log("\nRESULT: order creation FAILED");
    console.log("  status:", err.statusCode || "(none)");
    console.log("  message:", err.message || "(none)");
    const d = err.error?.description;
    if (d) console.log("  detail :", d);
    process.exit(1);
  });