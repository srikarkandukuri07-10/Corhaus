// Removes any razorpay_webhook rows created by the signature self-test, so the
// production database is left exactly as it was.
const path = require("node:path");
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");

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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

(async () => {
  const { data, error } = await db
    .from("admin_notifications")
    .select("id, message, created_at")
    .eq("type", "razorpay_webhook")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("read failed:", error.message);
    process.exit(1);
  }

  const rows = data || [];
  if (rows.length === 0) {
    console.log("no razorpay_webhook rows found - nothing to clean");
    process.exit(0);
  }

  console.log(`found ${rows.length} razorpay_webhook row(s):`);
  rows.forEach((r) => console.log(`  ${r.id}  ${r.message}`));

  const testRows = rows.filter((r) =>
    /order_selftest|pay_selftest/.test(r.message || "")
  );

  if (testRows.length === 0) {
    console.log("none are self-test rows - leaving them alone");
    process.exit(0);
  }

  const ids = testRows.map((r) => r.id);
  const { error: delErr } = await db
    .from("admin_notifications")
    .delete()
    .in("id", ids);

  if (delErr) {
    console.error("delete failed:", delErr.message);
    process.exit(1);
  }
  console.log(`\ndeleted ${ids.length} self-test row(s)`);
})();