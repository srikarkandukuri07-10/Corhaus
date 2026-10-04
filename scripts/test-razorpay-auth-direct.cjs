/**
 * TEST 1 — Direct Razorpay API authentication test.
 *
 * Bypasses Next.js, Vercel and the Razorpay SDK entirely: raw HTTPS with HTTP
 * Basic auth straight to api.razorpay.com. This isolates the credential from
 * every layer of our application.
 *
 * Creates at most one harmless unpaid order of Rs 1 (100 paise) if the
 * credentials authenticate.
 *
 * SECURITY: never prints either credential, nor the Authorization header.
 * Only lengths, fingerprints and Razorpay's own response metadata.
 */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

function loadEnv() {
  const out = {};
  for (const line of fs
    .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
    .split(/\r?\n/)) {
    if (!line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || "";
const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET || "";

// ── Presence / shape only. Values are never printed. ────────────────────────
const fingerprint = (s, head, tail) =>
  s ? `${s.slice(0, head)}...${s.slice(-tail)}` : "(none)";

console.log("RAZORPAY AUTHENTICATION ISOLATION TEST");
console.log("\n--- Variable presence (no values) ---");
console.log(`  Key ID present            : ${keyId ? "yes" : "no"}`);
console.log(`  Key Secret present        : ${keySecret ? "yes" : "no"}`);
console.log(`  Key ID length             : ${keyId.length}`);
console.log(`  Key Secret length         : ${keySecret.length}`);
console.log(
  `  Key ID whitespace         : ${keyId !== keyId.trim() ? "YES (problem)" : "none"}`
);
console.log(
  `  Key Secret whitespace     : ${keySecret !== keySecret.trim() ? "YES (problem)" : "none"}`
);
console.log(`  Key ID mode               : ${
  keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unrecognised"
}`);
console.log(`  Key ID fingerprint        : ${fingerprint(keyId, 6, 4)}   [not a secret]`);
console.log(`  Key Secret fingerprint    : ${fingerprint(keySecret, 4, 3)}   [not a secret]`);

if (!keyId || !keySecret) {
  console.log("\nDIRECT_RAZORPAY_TEST = FAILED (variables missing)");
  process.exit(1);
}

// ── Raw HTTPS Basic auth, no SDK ────────────────────────────────────────────
const receipt = `corhaus_auth_debug_${Date.now()}`;
const payload = JSON.stringify({
  amount: 100,
  currency: "INR",
  receipt,
});
const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

console.log("\n--- Direct request to https://api.razorpay.com/v1/orders ---");
console.log(`  amount  : 100 (INR 1.00, debug receipt)`);
console.log(`  receipt : ${receipt}`);
console.log("  auth     : HTTP Basic (value not logged)\n");

const req = https.request(
  {
    hostname: "api.razorpay.com",
    path: "/v1/orders",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (c) => (body += c));
    res.on("end", () => {
      console.log(`  HTTP status : ${res.statusCode}`);
      let j = null;
      try {
        j = JSON.parse(body);
      } catch {
        /* non-JSON */
      }
      if (j && j.id) {
        console.log(`  Razorpay order id : ${j.id}`);
        console.log(`  currency          : ${j.currency}`);
        console.log(`  amount            : ${j.amount}`);
        console.log(`  status            : ${j.status}`);
        console.log(`  authorised        : ${j.authorised}`);
        console.log("\nDIRECT_RAZORPAY_TEST = SUCCESS");
      } else {
        const code = j?.error?.code ?? "(none)";
        const desc = j?.error?.description ?? "(none)";
        console.log(`  Razorpay error code        : ${code}`);
        console.log(`  Razorpay error description : ${desc}`);
        console.log(
          `  Authentication-related     : ${
            res.statusCode === 401 || /auth/i.test(String(desc)) ? "YES" : "no"
          }`
        );
        console.log("\nDIRECT_RAZORPAY_TEST = FAILED");
      }
    });
  }
);

req.on("error", (e) => {
  console.log(`  network error: ${e.message}`);
  console.log("\nDIRECT_RAZORPAY_TEST = FAILED (network)");
});
req.write(payload);
req.end();