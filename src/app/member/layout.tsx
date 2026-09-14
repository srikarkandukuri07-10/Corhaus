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
import ThemeToggle from "@/components/theme-toggle";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    let activeChannel: any = null;
    let timeoutId: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Loading timed out. Please refresh.")), 8000);
    });

    async function checkAuth() {
      try {
        const userPromise = supabase.auth.getUser();
        const {
          data: { user },
          error: userError,
        } = (await Promise.race([userPromise, timeoutPromise])) as any;

        if (userError || !user) {
          router.push("/auth/login");
          return;
        }

        const providers = user.app_metadata?.providers || [];
        if (providers.includes("google") && !providers.includes("email")) {
          setNeedsPassword(true);
        }

        const profilePromise = supabase
          .from("profiles")
          .select("role, phone_number")
          .eq("id", user.id)
          .maybeSingle();

        const { data: profile, error: profileError } = (await Promise.race([profilePromise, timeoutPromise])) as any;

        if (profileError) {
          await supabase.auth.signOut();
          router.push("/auth/login");
          return;
        }

        if (profile?.role === "admin") {
          router.push("/admin");
          return;
        }

        const userEmail = (user.email || "").trim().toLowerCase();

        const memberPromise = supabase
          .from("approved_members")
          .select("id, membership_status")
          .ilike("email", userEmail)
          .limit(1)
          .maybeSingle();

        const { data: memberRecord } = (await Promise.race([memberPromise, timeoutPromise])) as any;

        const isActiveStatus = memberRecord && (memberRecord.membership_status || "").toLowerCase() === "active";
        const hasMemberProfile = profile?.role === "member";

        if (!isActiveStatus && !hasMemberProfile) {
          await supabase.auth.signOut();
          router.push("/auth/login?error=not_approved");
          return;
        }

        setIsMember(true);
        setLoading(false);
        if (timeoutId) clearTimeout(timeoutId);

        if (memberRecord?.id) {
          activeChannel = supabase
            .channel(`membership-status-${user.id}`)
            .on(
              "postgres_changes",
              {
                event: "UPDATE",
                schema: "public",
                table: "approved_members",
                filter: `id=eq.${memberRecord.id}`,
              },
              (payload: any) => {
                if (payload.new?.membership_status === "inactive") {
                  supabase.auth.signOut().then(() => {
                    router.push("/auth/login?error=not_approved");
                  });
                }
              }
            )
            .subscribe();
        }
      } catch (err: any) {
        if (timeoutId) clearTimeout(timeoutId);
        console.error("member layout checkAuth error", err);
        setLoadError(err.message || "Failed to load. Please refresh.");
        setLoading(false);
        // Only sign out on auth errors, not timeout
        if (err.message !== "Loading timed out. Please refresh.") {
          // Don't auto sign out on timeout — let user retry
          if (!err.message.includes("timed out")) {
            await supabase.auth.signOut();
            router.push("/auth/login");
          }
        }
      }
    }

    checkAuth();

    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-fg-4">Loading...</p>
          <button
            onClick={async () => {
              try {
                await fetch("/api/auth/signout", { method: "POST", cache: "no-store" });
              } catch {}
              window.location.replace("/auth/login");
            }}
            className="mt-4 px-4 py-2 rounded-xl border border-line bg-surface text-xs font-bold text-fg hover:bg-hover"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="bg-surface rounded-2xl border border-line p-6 max-w-md w-full text-center space-y-4">
          <p className="text-sm font-semibold text-red-600">{loadError}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-bold">Retry</button>
            <button
              onClick={async () => {
                try {
                  await fetch("/api/auth/signout", { method: "POST", cache: "no-store" });
                } catch {}
                window.location.replace("/auth/login");
              }}
              className="px-5 py-2.5 rounded-xl border border-line bg-surface text-fg text-sm font-bold hover:bg-hover"
            >
              Sign Out
            </button>
          </div>
          <p className="text-xs text-fg-4">If this persists, please contact support.</p>
        </div>
      </div>
    );
  }

  if (!isMember) return null;

  const navItems = [
    {
      href: "/member",
      label: "Classes",
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      href: "/member/bookings",
      label: "Bookings",
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      href: "/member/attendance",
      label: "Attendance",
      exact: false,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      href: "/member/freeze",
      label: "Freeze",
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      ),
    },
    {
      href: "/member/referrals",
      label: "Referrals",
      exact: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-bar border-b border-line sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            <div className="flex items-center gap-4 sm:gap-8 min-w-0">
              <Logo size="sm" className="flex-shrink-0" />
              <nav className="hidden sm:flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  if (item.href === "/member/referrals") {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-300 transform active:scale-95 ${
                          isActive
                            ? "bg-gradient-to-r from-gradient-from via-gradient-mid to-gradient-to text-white shadow-md shadow-gradient-mid/25"
                            : "bg-gradient-to-r from-gradient-from/15 via-gradient-mid/15 to-gradient-to/15 text-fg-2 hover:from-gradient-from/25 hover:via-gradient-mid/25 hover:to-gradient-to/25 border border-line"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-accent text-white"
                          : "text-fg-3 hover:text-fg hover:bg-hover"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 min-w-0">
              <ThemeToggle />
              <NotificationsButton role="member" />
              <span className="text-xs font-medium text-green-600 bg-green-500/10 px-2 sm:px-2.5 py-1 rounded-full flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                <span className="hidden sm:inline">Member</span>
                <button
                  onClick={() => setProfileOpen(true)}
                  className="p-0.5 rounded-full hover:bg-green-500/20 transition-colors"
                  title="View Profile"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>
              </span>
              <LogoutButton />
            </div>
          </div>
        </div>
        <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      </header>

      {needsPassword && showPasswordBanner && (
        <div className="bg-rail text-white px-4 py-3 flex items-center justify-between animate-fade-in relative z-40">
          <div className="flex-1 text-center text-sm font-medium">
            Please secure your account by setting a password in your Profile Settings.
          </div>
          <button
            onClick={() => setShowPasswordBanner(false)}
            className="p-1 hover:bg-surface/10 rounded-lg transition-colors absolute right-4"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 pb-24 sm:pb-8 min-w-0">
        {children}
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-bar border-t border-line">
        <div className="flex items-stretch">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const isReferral = item.href === "/member/referrals";

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 text-[10px] font-semibold transition-colors touch-manipulation min-w-0 ${
                  isReferral
                    ? isActive ? "text-gradient-mid" : "text-fg-4"
                    : isActive ? "text-accent" : "text-fg-4"
                }`}
              >
                <span className={`flex-shrink-0 transition-transform ${isActive ? "scale-110" : ""}`}>
                  {item.icon}
                </span>
                <span className="truncate w-full text-center leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
