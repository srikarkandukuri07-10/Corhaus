"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/logo";
import NotificationsButton from "@/components/notifications-button";
import LocationSwitcher from "@/components/location-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { PERMISSIONS_REFRESH_EVENT } from "@/lib/usePermissions";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionBroken, setSessionBroken] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState<string>("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [staffProfile, setStaffProfile] = useState<any>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileProfileMenuOpen, setMobileProfileMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    async function checkAuth() {
      try {
        // Determine permissions and staff role directly from RBAC API
        const permRes = await fetch("/api/admin/my-permissions");
        const permData = await permRes.json();

        if (permRes.ok && permData.role) {
          const resolvedRole = permData.role;
          if (resolvedRole === "Guest") {
            router.push("/auth/login");
            return;
          }
          if (resolvedRole === "Member") {
            router.push("/member");
            return;
          }

          setIsAdmin(true);
          setRole(resolvedRole);
          if (Array.isArray(permData.permissions)) {
            setPermissions(permData.permissions);
          }
          // ── Browser-session gate ──────────────────────────────────
          // Server cookies alone are NOT enough: catalogue, invoices, member
          // search, classes and other sections read Supabase directly from the
          // browser, which needs its own session. Without it, RLS returns
          // empty lists with no error (the "missing data" incident). Never
          // render dashboard pages in that state — block loudly instead.
          // getSession() reads local storage only, so a Supabase outage
          // cannot false-trigger this.
          try {
            const { createClient } = await import("@/lib/supabase/client");
            const browserClient = createClient();
            const { data: { session: browserSession } } = await browserClient.auth.getSession();
            if (!browserSession) {
              setSessionBroken(true);
              setLoading(false);
              return;
            }
          } catch {
            setSessionBroken(true);
            setLoading(false);
            return;
          }
          setLoading(false);
          // Fetch actual staff profile for dynamic header (name/role/initial)
          try {
            const profRes = await fetch(`/api/admin/my-profile?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } as any });
            if (profRes.ok) {
              const pj = await profRes.json();
              if (pj.staff) setStaffProfile(pj.staff);
            }
          } catch {}
        } else {
          router.push("/auth/login");
        }
      } catch {
        router.push("/auth/login");
      }
    }

    checkAuth();
  }, [router]);

  // If the browser session is lost mid-use (revoked/expired refresh token),
  // direct reads would silently go empty again — bounce to login instead.
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const browserClient = createClient();
        const { data } = browserClient.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") window.location.replace("/auth/login");
        });
        sub = data.subscription;
      } catch {}
    })();
    return () => {
      try {
        sub?.unsubscribe();
      } catch {}
    };
  }, []);
  // Listen for permission updates + profile refresh (after My Profile save)
  useEffect(() => {
    async function refreshPermissions() {
      try {
        const permRes = await fetch("/api/admin/my-permissions");
        const permData = await permRes.json();
        if (permRes.ok) {
          if (permData.role) setRole(permData.role);
          if (Array.isArray(permData.permissions)) {
            setPermissions(permData.permissions);
          }
        }
      } catch (_) {}
    }
    async function refreshProfile() {
      try {
        const pr = await fetch(`/api/admin/my-profile?t=${Date.now()}`, { cache: "no-store", headers: { "Cache-Control": "no-cache" } as any });
        if (pr.ok) {
          const pj = await pr.json();
          if (pj.staff) setStaffProfile(pj.staff);
        }
      } catch {}
    }

    const onProfileUpdated = () => refreshProfile();
    window.addEventListener(PERMISSIONS_REFRESH_EVENT, refreshPermissions);
    window.addEventListener("corhaus:profile-updated", onProfileUpdated);
    return () => {
      window.removeEventListener(PERMISSIONS_REFRESH_EVENT, refreshPermissions);
      window.removeEventListener("corhaus:profile-updated", onProfileUpdated);
    };
  }, []);

  // Close profile menus on route change or outside click
  useEffect(() => {
    setProfileMenuOpen(false);
    setMobileProfileMenuOpen(false);
  }, [pathname]);

  const displayName = (staffProfile?.full_name || "").trim() || (role ? role : "Admin");
  // Preserve single-initial visual style but make it dynamic from actual name
  const displayInitial = displayName ? displayName.trim().charAt(0).toUpperCase() : (role ? role.charAt(0).toUpperCase() : "A");
  const displayRole = (staffProfile?.role || role || "Staff").trim() || "Staff";
  const isOwnerUser = role === "Owner" || permissions.includes("*");

  // Robust sign out — server clears httpOnly cookies, then hard-navigates
  const handleSignOut = useCallback(async () => {
    setMobileOpen(false);
    setProfileMenuOpen(false);
    setMobileProfileMenuOpen(false);
    try {
      await fetch("/api/auth/signout", { method: "POST", cache: "no-store" });
    } catch {}
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("sb-zmzevqorbdogwishiahw-auth-token");
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith("sb-")) localStorage.removeItem(k);
        });
      } catch {}
    } catch {}
    window.location.replace("/auth/login");
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <p className="text-sm text-fg-3 font-medium">Loading Corhaus Admin...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  if (sessionBroken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="max-w-md w-full bg-surface border border-line rounded-2xl p-6 text-center space-y-3">
          <p className="text-lg font-bold text-fg">Sign-in incomplete</p>
          <p className="text-sm text-fg-3">
            Your server sign-in is valid, but the browser session needed to load
            dashboard data (members, catalogue, invoices, classes) is missing.
            Pages would show empty lists, so they are blocked instead.
          </p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  const hasPerm = (p: string) => {
    if (loading) return true;
    const normRole = (role || "").toLowerCase();
    if (
      !normRole ||
      normRole === "manager" ||
      normRole === "admin" ||
      normRole === "owner" ||
      normRole === "developer" ||
      permissions.includes("*")
    ) {
      return true;
    }
    return permissions.includes(p);
  };

  const isBillingActive =
    pathname.startsWith("/admin/billing") && !pathname.startsWith("/admin/billing/plan-items");

  const navLinkClass = (isActive: boolean) =>
    isActive ? "sidebar-active text-white font-bold" : "text-on-rail hover:text-white hover:bg-rail-hover font-semibold";

  const navLinkClassWithPerm = (isActive: boolean, perm: string) => {
    if (!hasPerm(perm)) {
      return "text-on-rail-3 opacity-60 cursor-not-allowed font-semibold";
    }
    return navLinkClass(isActive);
  };

  const renderLinkText = (label: string, perm?: string) => label;

  const mobileLink = (perm: string, href: string, label: string) => {
    if (hasPerm(perm)) {
      const isActive = href === "/admin" ? pathname === href : pathname.startsWith(href);
      return (
        <Link
          href={href}
          className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
            isActive
              ? "sidebar-active text-white font-bold"
              : "text-on-rail hover:text-white hover:bg-rail-hover"
          }`}
        >
          {label}
        </Link>
      );
    }
    return (
      <span className="flex items-center justify-between px-3 py-3 rounded-xl text-sm font-semibold text-on-rail-3 opacity-60 cursor-not-allowed">
        {label}
        <svg className="w-3.5 h-3.5 text-on-rail-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
      </span>
    );
  };


  return (
    <div className="min-h-screen admin-shell flex font-sans">
      {/* ─── SIDEBAR ────────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-[272px] bg-rail text-white flex-col fixed inset-y-0 left-0 z-50 border-r border-line-rail">
        {/* Logo Header — rectangle that fills header, image not stretched */}
        <div className="px-3 py-3 border-b border-white/10">
          <Logo href="/admin" variant="white" size="banner" />
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {/* Main Dashboard */}
          <div>
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClass(pathname === "/admin")}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </Link>
          </div>

          {/* Section: PEOPLE & CLASSES */}
          <div>
            <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 mb-2">
              PEOPLE &amp; CLASSES
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/members"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname === "/admin/members" || (pathname.startsWith("/admin/members") && !pathname.startsWith("/admin/members/history")), "members.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                {renderLinkText("Members", "members.view")}
              </Link>

              <Link
                href="/admin/trial-members"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/trial-members"), "members.trial")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                {renderLinkText("Trial Members", "members.trial")}
              </Link>

              <Link
                href="/admin/leads"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/leads"), "members.trial")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                {renderLinkText("Leads & Enquiries", "members.trial")}
              </Link>

              <Link
                href="/admin/freeze"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/freeze"), "members.edit")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {renderLinkText("Freeze Management", "members.edit")}
              </Link>

              <Link
                href="/admin/classes"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname === "/admin/classes" || pathname.startsWith("/admin/classes"), "classes.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {renderLinkText("Classes & Schedule", "classes.view")}
              </Link>

              <Link
                href="/admin/pt"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname === "/admin/pt" || pathname.startsWith("/admin/pt"), "pt.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {renderLinkText("PT Scheduler", "pt.view")}
              </Link>

              <Link
                href="/admin/previous-classes"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/previous-classes"), "classes.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {renderLinkText("Previous Classes", "classes.view")}
              </Link>

              <Link
                href="/admin/scanner"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname === "/admin/scanner", "attendance.scan")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                {renderLinkText("Attendance Scanner", "attendance.scan")}
              </Link>
            </div>
          </div>

          {/* Section: SALES & BILLING */}
          <div>
            <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 mb-2">
              SALES &amp; BILLING
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/billing"
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(isBillingActive, "billing.view")}`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {renderLinkText("Billing", "billing.view")}
                </div>
              </Link>

              <Link
                href="/admin/packages"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/packages") || pathname.startsWith("/admin/billing/plan-items"), "packages.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                {renderLinkText("Packages & Plans", "packages.view")}
              </Link>

              {/* Sub-items inside Billing section */}
              {isBillingActive && hasPerm("billing.view") && (
                <div className="ml-4 pl-3 border-l border-white/15 space-y-1 mt-1">
                  <Link
                    href="/admin/billing"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname === "/admin/billing"
                        ? "bg-surface/20 text-white font-bold"
                        : "text-on-rail-2 hover:text-white"
                    }`}
                  >
                    Create Bill
                  </Link>
                  <Link
                    href="/admin/billing/plan-items"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname.startsWith("/admin/billing/plan-items")
                        ? "bg-surface/20 text-white font-bold"
                        : "text-on-rail-2 hover:text-white"
                    }`}
                  >
                    Plan Catalogue
                  </Link>
                  <Link
                    href="/admin/billing/invoices"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname.startsWith("/admin/billing/invoices")
                        ? "bg-surface/20 text-white font-bold"
                        : "text-on-rail-2 hover:text-white"
                    }`}
                  >
                    Invoices
                  </Link>
                </div>
              )}
              <Link
                href="/admin/expenses"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/expenses"), "expenses.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {renderLinkText("Expenses", "expenses.view")}
              </Link>
            </div>
          </div>

          {/* Section: ANALYTICS & REPORTS */}
          <div>
            <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 mb-2">
              ANALYTICS &amp; REPORTS
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/reports"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClassWithPerm(pathname.startsWith("/admin/reports"), "reports.view")}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {renderLinkText("Reports", "reports.view")}
              </Link>
            </div>
          </div>

          {/* Section: SETTINGS */}
          {(role === "Manager" || role === "Owner") && (
            <div>
              <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 mb-2">
                SETTINGS
              </p>
              <div className="space-y-1">
                <Link
                  href="/admin/settings"
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${navLinkClass(pathname.startsWith("/admin/settings"))}`}
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Settings</span>
                  </div>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Footer — clickable, dynamic name/role/initial */}
        <div className="p-4 border-t border-white/10 bg-black/20 relative">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/admin/profile"
              className="flex items-center gap-3 flex-1 min-w-0 rounded-xl p-1 -m-1 hover:bg-white/10 transition-colors group/profile text-left"
              title="Open My Profile"
            >
              <div className="w-9 h-9 rounded-full bg-accent text-white font-bold flex items-center justify-center text-sm ring-1 ring-accent/30 shrink-0">
                {displayInitial}
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-white leading-tight truncate group-hover/profile:text-white">{displayName}</p>
                <p className="text-[10px] text-on-rail-2 truncate">{displayRole}</p>
              </div>
            </Link>
            <button
              onClick={() => setProfileMenuOpen((v) => !v)}
              className="w-8 h-8 rounded-xl hover:bg-white/10 flex items-center justify-center text-on-rail-2 hover:text-white shrink-0"
              aria-label="Profile menu"
              aria-expanded={profileMenuOpen}
            >
              <svg className={`w-4 h-4 transition-transform ${profileMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          {profileMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setProfileMenuOpen(false)} aria-hidden />
              <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface border border-line rounded-2xl shadow-xl overflow-hidden z-50 py-1 animate-fade-in max-h-[60vh] overflow-y-auto">
                <div className="px-4 py-3 border-b border-line">
                  <p className="text-sm font-bold text-fg truncate">{displayName}</p>
                  <p className="text-xs text-fg-3">{displayRole}</p>
                </div>
                <Link href="/admin/profile" onClick={() => setProfileMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-fg hover:bg-hover w-full text-left">
                  <svg className="w-4 h-4 text-fg-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  My Profile
                </Link>
                <button type="button" onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 text-left touch-manipulation">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-rail border-b border-white/10 z-40 flex items-center justify-between px-3 text-white">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2.5 rounded-xl text-white hover:bg-rail-hover flex-shrink-0 touch-manipulation"
            aria-label="Open navigation"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <Logo size="banner" />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 relative">
          <ThemeToggle />
          <LocationSwitcher compact showManage={isOwnerUser} />
          <NotificationsButton role="admin" />
          <button
            onClick={() => setMobileProfileMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 p-1 pr-2 rounded-full hover:bg-white/10 transition-colors touch-manipulation"
            aria-label="Open profile menu"
            aria-expanded={mobileProfileMenuOpen}
          >
            <div className="w-8 h-8 rounded-full bg-accent text-white font-bold flex items-center justify-center text-xs shrink-0">
              {displayInitial}
            </div>
            <svg className={`w-3 h-3 text-white/80 hidden sm:block transition-transform ${mobileProfileMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          {mobileProfileMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMobileProfileMenuOpen(false)} aria-hidden />
              <div className="fixed right-3 top-[60px] w-64 max-w-[85vw] bg-surface border border-line rounded-2xl shadow-xl overflow-hidden z-50 py-1 animate-fade-in">
                <div className="px-4 py-3 border-b border-line">
                  <p className="text-sm font-bold text-fg truncate">{displayName}</p>
                  <p className="text-xs text-fg-3">{displayRole}</p>
                </div>
                <Link href="/admin/profile" onClick={() => setMobileProfileMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-fg hover:bg-hover w-full text-left">
                  <svg className="w-4 h-4 text-fg-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  My Profile
                </Link>
                <button type="button" onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 text-left touch-manipulation">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile Drawer Slideout */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="w-[280px] max-w-[88vw] bg-rail text-white flex flex-col relative z-10 h-full overflow-y-auto shadow-2xl">
            {/* Drawer Header — rectangle logo fills width */}
            <div className="flex items-center gap-3 px-3 py-3 border-b border-white/10 flex-shrink-0">
              <div className="flex-1 min-w-0">
                <Logo href="/admin" variant="white" size="banner" />
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="w-8 h-8 rounded-xl text-white hover:bg-rail-hover flex items-center justify-center flex-shrink-0"
                aria-label="Close navigation"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Role pill — clickable profile */}
            <Link href="/admin/profile" onClick={() => setMobileOpen(false)} className="px-4 py-3 border-b border-white/10 flex-shrink-0 flex items-center gap-3 hover:bg-white/5 transition-colors">
              <div className="w-9 h-9 rounded-full bg-accent text-white font-bold flex items-center justify-center text-sm ring-2 ring-accent/30 shrink-0">
                {displayInitial}
              </div>
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold text-white leading-tight truncate">{displayName}</p>
                <p className="text-[11px] text-on-rail-2 truncate">{displayRole}</p>
              </div>
            </Link>

            {/* Branch switcher — full-width card for touch */}
            <div className="px-4 py-3 border-b border-white/10 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] mb-2">Branch</p>
              <LocationSwitcher showManage={isOwnerUser} />
            </div>

            {/* Nav Items */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" onClick={() => setMobileOpen(false)}>
              {/* Dashboard */}
              <Link
                href="/admin"
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                  pathname === "/admin" ? "sidebar-active text-white font-bold" : "text-on-rail hover:text-white hover:bg-rail-hover"
                }`}
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Dashboard
              </Link>

              <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 pt-3 pb-1">PEOPLE &amp; CLASSES</p>
              {mobileLink("members.view", "/admin/members", "Members")}
              {mobileLink("members.trial", "/admin/trial-members", "Trial Members")}
              {mobileLink("members.trial", "/admin/leads", "Leads & Enquiries")}
              {mobileLink("members.edit", "/admin/freeze", "Freeze Management")}
              {mobileLink("classes.view", "/admin/classes", "Classes & Schedule")}
              {mobileLink("classes.view", "/admin/previous-classes", "Previous Classes")}
              {mobileLink("pt.view", "/admin/pt", "PT Scheduler")}
              {mobileLink("attendance.scan", "/admin/scanner", "Attendance Scanner")}

              <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 pt-4 pb-1">SALES &amp; BILLING</p>
              {mobileLink("billing.view", "/admin/billing", "Billing")}
              {mobileLink("packages.view", "/admin/packages", "Packages & Plans")}
              {mobileLink("expenses.view", "/admin/expenses", "Expenses")}

              <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 pt-4 pb-1">ANALYTICS</p>
              {mobileLink("reports.view", "/admin/reports", "Reports & Analytics")}

              {(role === "Manager" || role === "Owner") && (
                <>
                  <p className="text-[10px] font-bold text-on-rail-3 uppercase tracking-[0.12em] px-3 pt-4 pb-1">SETTINGS</p>
                  <Link
                    href="/admin/settings"
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all ${
                      pathname.startsWith("/admin/settings") ? "sidebar-active text-white font-bold" : "text-on-rail hover:text-white hover:bg-rail-hover"
                    }`}
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </Link>
                </>
              )}
            </nav>

            {/* Drawer Footer — My Profile + Sign Out */}
            <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-white/10 flex-shrink-0 space-y-2">
              <Link href="/admin/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 w-full px-3 py-3 rounded-xl text-sm font-semibold text-white hover:bg-white/10 transition-colors touch-manipulation">
                <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                My Profile
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white/90 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors touch-manipulation"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      <main className="flex-1 lg:pl-[272px] flex flex-col min-h-screen pt-14 lg:pt-0 min-w-0 max-w-full overflow-x-hidden">
        {/* Top Header Bar — desktop only version (hidden on mobile, which has its own header above) */}
        <header className="hidden lg:flex bg-bar/90 backdrop-blur-md border-b border-line-bar px-4 xl:px-6 py-3 items-center justify-between gap-3 sticky top-0 z-30">
          <div className="relative flex-1 max-w-lg min-w-0">
            <input
              type="text"
              placeholder="Search members, classes, invoices..."
              className="admin-input w-full pl-9 pr-4 py-2 text-xs placeholder:text-fg-4 focus:ring-2 focus:ring-accent/15 truncate"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2 xl:gap-3 flex-shrink-0">
            <ThemeToggle />
            {hasPerm("staff.view") ? (
              <Link
                href="/admin/staff"
                title="Staff & Trainers"
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  pathname.startsWith("/admin/staff")
                    ? "bg-accent text-white border-accent shadow-sm"
                    : "bg-surface border-line-2 text-fg hover:bg-hover"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Staff</span>
              </Link>
            ) : (
              <span
                title="Locked: Requires staff.view permission"
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-line-2 bg-surface opacity-50 cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Staff</span>
              </span>
            )}
            {hasPerm("support.view") ? (
              <Link
                href="/admin/support"
                title="Support"
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  pathname.startsWith("/admin/support")
                    ? "bg-accent text-white border-accent shadow-sm"
                    : "bg-surface border-line-2 text-fg hover:bg-hover"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Support</span>
              </Link>
            ) : (
              <span
                title="Locked: Requires support.view permission"
                className="relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-line-2 bg-surface opacity-50 cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Support</span>
              </span>
            )}
            <NotificationsButton role="admin" />
            <LocationSwitcher showManage={isOwnerUser} />
            <div className="relative">
              <Link
                href="/admin/profile"
                className="flex items-center gap-2 bg-surface border border-line-2 px-3 py-1.5 rounded-full text-xs text-fg font-semibold hover:bg-hover transition-colors group/profile"
                title="Open My Profile"
              >
                <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                  {displayInitial}
                </div>
                <span className="truncate max-w-[120px]">{displayName}</span>
                <span className="text-fg-3 hidden sm:inline">· {displayRole}</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <div className="p-3 sm:p-5 lg:p-8 flex-1 max-w-[1440px] w-full mx-auto min-w-0 max-w-full overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
