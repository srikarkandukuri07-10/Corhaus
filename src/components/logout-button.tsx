"use client";

import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const supabase = createClient();

  async function handleLogout() {
    try {
      await fetch("/api/auth/signout", { method: "POST", cache: "no-store" });
    } catch {}
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("sb-zmzevqorbdogwishiahw-auth-token");
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("sb-")) localStorage.removeItem(k);
        });
      } catch {}
    } catch {}
    window.location.replace("/auth/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 text-sm font-medium text-fg-3 hover:text-fg border border-line rounded-xl hover:bg-hover transition-all"
    >
      Sign Out
    </button>
  );
}
