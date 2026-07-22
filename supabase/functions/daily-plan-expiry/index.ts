// Supabase Edge Function: daily-plan-expiry
// Scheduled to run at midnight IST (18:30 UTC) every day.
// 
// Schedule in Supabase Dashboard → Edge Functions → Schedules:
//   Cron expression: 30 18 * * *   (18:30 UTC = midnight IST)
//
// This function marks expired member_purchased_plans and revokes
// dashboard access for members who have no remaining active plans.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc("check_plan_expiry");

  if (error) {
    console.error("Expiry check failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("Expiry check result:", data);
  return new Response(JSON.stringify({ success: true, result: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
