"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    // Use hard navigation for reliability on mobile (router.push can be swallowed by overlays)
    try {
      router.push("/auth/login");
      // Fallback hard redirect after a tick if still on admin page
      setTimeout(() => {
        if (window.location.pathname.startsWith("/admin")) {
          window.location.href = "/auth/login";
        }
      }, 300);
    } catch {
      window.location.href = "/auth/login";
    }
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
