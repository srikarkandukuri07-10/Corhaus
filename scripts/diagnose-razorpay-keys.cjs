/**
 * Diagnose a Razorpay 401 "Authentication failed".
 *
 * Run with your LIVE keys set in this shell:
 *
 *   $env:RAZORPAY_KEY_ID = "rzp_live_..."
 *   $env:RAZORPAY_KEY_SECRET = "..."
 *   node scripts/diagnose-razorpay-keys.cjs
 *
 * Falls back to .env.local if the env vars are absent.
 *
 * NEVER prints the secret. Only its length, and whether it has stray
 * whitespace - which is the single most common cause of this error.
 */
const path = require("node:path");
const fs = require("node:fs");

let keyId = process.env.RAZORPAY_KEY_ID || "";
let keySecret = process.env.RAZORPAY_KEY_SECRET || "";
let source = "environment";

if (!keyId || !keySecret) {
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
  keyId = keyId || env.RAZORPAY_KEY_ID || "";
  keySecret = keySecret || env.RAZORPAY_KEY_SECRET || "";
  source = ".env.local";
}

const problems = [];

function check(label, ok, detail) {
  const mark = ok ? "OK  " : "FAIL";
  console.log(`  [${mark}] ${label}${detail ? ` - ${detail}` : ""}`);
  if (!ok) problems.push(label);
}

console.log(`\nsource: ${source}\n`);

console.log("Shape checks");
check("Key ID is present", Boolean(keyId), keyId ? `length ${keyId.length}` : "missing");
check(
  "Key Secret is present",
  Boolean(keySecret),
  keySecret ? `length ${keySecret.length}` : "missing"
);

if (keyId) {
  check(
    "Key ID has the rzp_ prefix",
    keyId.startsWith("rzp_"),
    keyId.startsWith("rzp_live_")
      ? "live mode"
      : keyId.startsWith("rzp_test_")
        ? "TEST mode - cannot take real money"
        : `unexpected prefix "${keyId.slice(0, 4)}"`
  );
  check(
    "Key ID has no surrounding whitespace",
    keyId === keyId.trim(),
    keyId !== keyId.trim() ? "leading/trailing space or newline - THIS IS A COMMON CAUSE" : ""
  );
  check(
    "Key ID has no internal newline",
    !/[\r\n]/.test(keyId),
    /[\r\n]/.test(keyId) ? "contains a line break - copy again as a single line" : ""
  );
}

if (keySecret) {
  check(
    "Key Secret has no surrounding whitespace",
    keySecret === keySecret.trim(),
    keySecret !== keySecret.trim() ? "leading/trailing space or newline - THIS IS A COMMON CAUSE" : ""
  );
  check(
    "Key Secret has no internal newline",
    !/[\r\n]/.test(keySecret),
    /[\r\n]/.test(keySecret) ? "contains a line break - copy again as a single line" : ""
  );
  check(
    "Key Secret is not the webhook secret",
    !/^[0-9a-f]{40,}$/i.test(keySecret),
    /^[0-9a-f]{40,}$/i.test(keySecret)
      ? "this looks like the webhook secret, not the API key secret"
      : ""
  );
}

console.log("\nLive API call");
const Razorpay = require("razorpay");

if (!keyId || !keySecret) {
  console.log("  skipped - no keys to test");
} else {
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
  rzp.orders
    .create({
      amount: 100,
      currency: "INR",
      receipt: `diag_${Date.now()}`,
      notes: { probe: "auth-diagnosis" },
    })
    .then((o) => {
      console.log(`  [OK  ] authenticated - order ${o.id} created`);
      console.log("\n  => Your key pair is VALID.");
      console.log("     If production still 401s, the Vercel env vars differ from these.");
      process.exit(0);
    })
    .catch((err) => {
      const desc =
        err?.error?.description || err?.message || "(no description)";
      console.log(`  [FAIL] status ${err.statusCode ?? "(none)"} - ${desc}`);
      if (err.statusCode === 401) {
        console.log(
          "\n  401 means Razorpay could not validate the key pair. In order of likelihood:"
        );
        console.log("   1. Key ID and Key Secret came from DIFFERENT accounts or modes");
        console.log("   2. A stray space or newline was pasted into Vercel");
        console.log("   3. The keys were rotated or revoked after being copied");
        console.log("   4. The webhook secret was entered as the Key Secret by mistake");
      }
      process.exit(1);
    });
}

console.log(
  problems.length
    ? `\n${problems.length} shape problem(s) found above - fix those first.\n`
    : "\nNo shape problems detected.\n"
);