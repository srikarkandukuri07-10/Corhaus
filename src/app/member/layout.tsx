"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/logo";
import LogoutButton from "@/components/logout-button";
import ProfileModal from "@/components/profile-modal";
import NotificationsButton from "@/components/notifications-button";

export default function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [showPasswordBanner, setShowPasswordBanner] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log("=== MEMBER LAYOUT (CLIENT) ===");
      console.log("GETUSER ERROR:", userError);

      if (!user) {
        console.log("AUTH USER: null -> redirecting to /auth/login");
        router.push("/auth/login");
        return;
      }

      console.log("AUTH USER EMAIL:", user.email);

      const providers = user.app_metadata?.providers || [];
      if (providers.includes("google") && !providers.includes("email")) {
        setNeedsPassword(true);
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, phone_number")
        .eq("id", user.id)
        .maybeSingle();

      console.log("PROFILE QUERY ERROR:", profileError);
      console.log("PROFILE FOUND:", !!profile);
      console.log("ROLE:", profile?.role);

      if (profile?.role === "admin") {
        console.log("DECISION: role is admin -> redirect to /admin");
        router.push("/admin");
        return;
      }

      console.log("DECISION: role is member or null -> staying on /member");
      setIsMember(true);
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

  if (!isMember) return null;

  const navItems = [
    { href: "/member", label: "Classes", exact: true },
    { href: "/member/bookings", label: "My Bookings", exact: true },
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
            <div className="flex items-center gap-3">
              <NotificationsButton role="member" />
              <span className="text-xs font-medium text-brand-success bg-brand-success/10 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                Member
                <button
                  onClick={() => setProfileOpen(true)}
                  className="ml-0.5 p-0.5 rounded-full hover:bg-brand-success/20 transition-colors"
                  title="View Profile"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              </span>
              <LogoutButton />
            </div>
            <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
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

      {needsPassword && showPasswordBanner && (
        <div className="bg-brand-navy text-white px-4 py-3 flex items-center justify-between animate-fade-in relative z-40">
          <div className="flex-1 text-center text-sm font-medium">
            Please secure your account by setting a password in your Profile Settings.
          </div>
          <button 
            onClick={() => setShowPasswordBanner(false)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors absolute right-4"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
