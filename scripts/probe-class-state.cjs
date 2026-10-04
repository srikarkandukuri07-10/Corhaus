// Read-only summary of the classes table so we know whether an end-to-end
// trial payment can even be attempted right now.
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
  const { count } = await db.from("classes").select("id", { count: "exact", head: true });
  const { data: all } = await db
    .from("classes")
    .select("id, title, class_date, class_time, is_active, status, location_id")
    .order("class_date", { ascending: false })
    .limit(8);

  const { data: trialPlan } = await db
    .from("billing_plan_items")
    .select("id, name, price, category, is_active, location_id")
    .ilike("name", "%Trial Session%");

  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split("T")[0];

  console.log("classes total:", count);
  console.log("today (IST):", todayIST);
  console.log("\nmost recent classes:");
  (all || []).forEach((c) =>
    console.log(`  ${c.class_date} ${String(c.class_time).slice(0, 5)}  active=${c.is_active} status=${c.status}  ${c.title}`)
  );
  console.log("\n'Trial Session' plan rows (this sets the trial price):");
  if (!trialPlan || trialPlan.length === 0) console.log("  NONE -> create-order falls back to Rs 500");
  trialPlan.forEach((p) =>
    console.log(`  ${p.name}  price=${p.price}  active=${p.is_active}  loc=${p.location_id}`)
  );
})();