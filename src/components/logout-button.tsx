"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm font-medium text-brand-navy/60 hover:text-brand-navy border border-brand-sand rounded-xl hover:bg-brand-beige transition-all"
    >
      Sign Out
    </button>
  );
}
