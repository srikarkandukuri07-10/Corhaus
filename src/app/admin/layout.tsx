"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/logo";
import LogoutButton from "@/components/logout-button";
import NotificationsButton from "@/components/notifications-button";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log("=== ADMIN LAYOUT (CLIENT) ===");
      console.log("GETUSER ERROR:", userError);

      if (!user) {
        console.log("AUTH USER: null -> redirecting to /auth/login");
        router.push("/auth/login");
        return;
      }

      console.log("AUTH USER EMAIL:", user.email);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      console.log("PROFILE QUERY ERROR:", profileError);
      console.log("PROFILE FOUND:", !!profile);
      console.log("ROLE:", profile?.role);

      if (profile?.role !== "admin") {
        console.log("DECISION: role is NOT admin -> redirect to /member");
        router.push("/member");
        return;
      }

      console.log("DECISION: role IS admin -> rendering admin dashboard");
      setIsAdmin(true);
      setLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          <p className="text-sm text-brand-navy/40">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const navItems = [
    { href: "/admin", label: "Dashboard", exact: true },
    { href: "/admin/classes/new", label: "Create Class", exact: true },
    { href: "/admin/scanner", label: "Scanner", exact: true },
    { href: "/admin/cancelled", label: "Cancelled", exact: true },
    { href: "/admin/members", label: "View Members", exact: false },
    { href: "/admin/previous-classes", label: "Previous Classes", exact: false },
  ];

  return (
    <div className="min-h-screen bg-brand-cream">
      <header className="bg-white border-b border-brand-sand/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Logo size="sm" />
              <nav className="hidden sm:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-brand-navy text-white"
                          : "text-brand-navy/60 hover:text-brand-navy hover:bg-brand-beige"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-brand-navy/60 font-medium hidden sm:block">Admin View</span>
              <NotificationsButton role="admin" />
              <LogoutButton />
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden border-t border-brand-sand/50 px-4 py-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-brand-navy text-white"
                    : "text-brand-navy/60 hover:text-brand-navy"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
