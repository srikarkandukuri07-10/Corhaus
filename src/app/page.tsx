import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Public visitors (including leads who strip /trial) see the trial page, not the login
    redirect("/trial");
  }

  // Authenticated users go to their dashboard
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin") redirect("/admin");
  redirect("/member");
}
