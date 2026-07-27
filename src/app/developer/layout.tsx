"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/theme-toggle";

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const isDeveloper = profile?.role === "developer" || user.email === "kandukurisrikar10@gmail.com";

        if (!isDeveloper) {
          router.push("/admin");
          return;
        }

        setUserEmail(user.email || "kandukurisrikar10@gmail.com");
        setLoading(false);
      } catch (err) {
        console.error("Developer auth check error:", err);
        router.push("/auth/login");
      }
    }
    checkAuth();
  }, [router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-fg-3">Loading Developer Dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-fg flex flex-col">
      {/* Top Developer Header */}
      <header className="h-16 bg-rail text-white border-b border-white/10 px-6 flex items-center justify-between gap-4 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500 flex items-center justify-center font-black text-sm text-black shadow-md shadow-amber-500/20">
            DEV
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-extrabold text-lg tracking-wider text-white">CORHAUS</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-extrabold px-2 py-0.5 rounded border border-amber-500/30">
                DEVELOPER DASHBOARD
              </span>
            </div>
            <span className="text-[10px] text-white/50 font-medium">Issue Tracking &amp; Maintenance Operations</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold text-white">Srikar (Lead Developer)</span>
            <span className="text-[10px] text-white/50">{userEmail}</span>
          </div>
          <button
            onClick={handleLogout}
            className="px-3.5 py-1.5 rounded-xl border border-white/20 text-xs font-bold hover:bg-white/10 transition-all"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Developer Body */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto flex flex-col min-h-0">
        {children}
      </main>
    </div>
  );
}
