// Read-only probe: finds a real upcoming class so we can reach the Razorpay key
// check without inventing data. Prints the class id, date, time, branch.
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
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];
  const { data, error } = await db
    .from("classes")
    .select("id, title, class_date, class_time, max_capacity, is_active, status, location_id")
    .gte("class_date", today)
    .eq("is_active", true)
    .neq("status", "cancelled")
    .order("class_date", { ascending: true })
    .limit(5);
  if (error) {
    console.error("query failed:", error.message);
    process.exit(1);
  }
  const { data: loc } = await db.from("locations").select("id, slug, name");
  console.log(JSON.stringify({ today, classes: data || [], locations: loc || [] }, null, 2));
})();