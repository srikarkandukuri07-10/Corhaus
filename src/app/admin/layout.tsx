"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import NotificationsButton from "@/components/notifications-button";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push("/auth/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError || !profile || profile.role !== "admin") {
          router.push("/member");
          return;
        }

        setIsAdmin(true);
        setLoading(false);
      } catch (err) {
        console.error("AdminLayout checkAuth error:", err);
        router.push("/auth/login");
      }
    }

    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F7F7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#009B9E]/30 border-t-[#009B9E] rounded-full animate-spin" />
          <p className="text-sm text-[#004D40]/70 font-medium">Loading Corhaus Admin...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const isBillingActive = pathname.startsWith("/admin/billing");

  return (
    <div className="min-h-screen bg-[#F0F7F7] flex font-sans">
      {/* ─── VIBRANT TEAL GRADIENT SIDEBAR ─────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 bg-gradient-to-b from-[#00897B] via-[#00695C] to-[#004D40] text-white flex-col fixed inset-y-0 left-0 z-50 shadow-xl border-r border-[#004D40]/40">
        {/* Logo Header */}
        <div className="p-6 flex flex-col items-center text-center border-b border-white/10">
          <Link href="/admin" className="flex flex-col items-center">
            {/* Gold Emblem Icon */}
            <div className="w-10 h-10 mb-1 flex items-center justify-center text-[#F0C46B]">
              <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none" stroke="currentColor">
                <path d="M20 5C20 5 12 15 12 25C12 29.4183 15.5817 33 20 33C24.4183 33 28 29.4183 28 25C28 15 20 5 20 5Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 20C15 20 20 12 20 28" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="20" cy="11" r="2.5" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-xl font-serif tracking-widest text-white uppercase font-bold">
              CORHAUS
            </span>
            <span className="text-[9px] tracking-[0.25em] text-[#F0C46B] font-semibold uppercase mt-0.5">
              PILATES FOR EVERYONE
            </span>
          </Link>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Main Dashboard */}
          <div>
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-[15px] font-semibold transition-all ${
                pathname === "/admin"
                  ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                  : "text-white hover:bg-white/10 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </Link>
          </div>

          {/* Section: PEOPLE & CLASSES */}
          <div>
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider px-3.5 mb-2">
              PEOPLE &amp; CLASSES
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/members"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  pathname.startsWith("/admin/members")
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Members</span>
              </Link>

              <Link
                href="/admin/freeze"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  pathname.startsWith("/admin/freeze")
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Freeze Management</span>
              </Link>

              <Link
                href="/admin/classes"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  pathname === "/admin/classes" || pathname.startsWith("/admin/classes")
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Classes &amp; Schedule</span>
              </Link>

              <Link
                href="/admin/previous-classes"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  pathname.startsWith("/admin/previous-classes")
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Previous Classes</span>
              </Link>

              <Link
                href="/admin/scanner"
                className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  pathname === "/admin/scanner"
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span>Attendance Scanner</span>
              </Link>
            </div>
          </div>

          {/* Section: SALES & BILLING */}
          <div>
            <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider px-3.5 mb-2">
              SALES &amp; BILLING
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/billing"
                className={`flex items-center justify-between px-4 py-2.5 rounded-2xl text-[15px] font-semibold transition-all ${
                  isBillingActive
                    ? "bg-gradient-to-r from-[#17D7B2] to-[#00C9A7] text-white shadow-lg shadow-[#17D7B2]/20 font-bold"
                    : "text-white hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Billing</span>
                </div>
              </Link>

              {/* Sub-items inside Billing section */}
              {isBillingActive && (
                <div className="ml-4 pl-3 border-l border-white/20 space-y-1 mt-1">
                  <Link
                    href="/admin/billing"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname === "/admin/billing"
                        ? "bg-white/20 text-white font-bold"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    • Create Bill
                  </Link>
                  <Link
                    href="/admin/billing/plan-items"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname.startsWith("/admin/billing/plan-items")
                        ? "bg-white/20 text-white font-bold"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    • Plan Catalogue
                  </Link>
                  <Link
                    href="/admin/billing/invoices"
                    className={`block px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      pathname.startsWith("/admin/billing/invoices")
                        ? "bg-white/20 text-white font-bold"
                        : "text-white/80 hover:text-white"
                    }`}
                  >
                    • Invoices
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white text-[#00695C] font-bold flex items-center justify-center text-sm shadow-md">
              A
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-white leading-tight">Admin</p>
              <p className="text-[10px] text-white/80">Super Admin</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#00695C] border-b border-white/10 z-40 flex items-center justify-between px-4 text-white">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-xl text-white hover:bg-white/10"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-serif font-bold text-lg tracking-wider text-white">CORHAUS</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsButton role="admin" />
          <LogoutButton />
        </div>
      </div>

      {/* Mobile Drawer Slideout */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="w-64 bg-gradient-to-b from-[#00897B] to-[#004D40] text-white flex-col relative z-10 p-4 space-y-5 h-full overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <span className="font-serif font-bold text-xl tracking-widest text-white">CORHAUS</span>
              <button onClick={() => setMobileOpen(false)} className="text-white font-bold text-lg">✕</button>
            </div>

            <nav className="space-y-1" onClick={() => setMobileOpen(false)}>
              <Link href="/admin" className="block px-4 py-2.5 rounded-xl font-bold text-white bg-white/20">
                Dashboard
              </Link>
              <Link href="/admin/members" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Members
              </Link>
              <Link href="/admin/freeze" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Freeze Management
              </Link>
              <Link href="/admin/classes" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Classes &amp; Schedule
              </Link>
              <Link href="/admin/previous-classes" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Previous Classes
              </Link>
              <Link href="/admin/scanner" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Attendance Scanner
              </Link>
              <Link href="/admin/billing" className="block px-4 py-2.5 rounded-xl font-semibold text-white">
                Billing
              </Link>
            </nav>
          </aside>
        </div>
      )}

      {/* ─── MAIN CONTENT CONTAINER ────────────────────────────────────────── */}
      <main className="flex-1 lg:pl-64 flex flex-col min-h-screen pt-16 lg:pt-0">
        {/* Top Header Bar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-[#004D40]/10 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search members, classes, invoices..."
              className="w-full pl-9 pr-4 py-2 rounded-2xl border border-[#004D40]/15 bg-[#F0F7F7] text-xs text-[#004D40] placeholder:text-[#004D40]/40 focus:outline-none focus:ring-1 focus:ring-[#009B9E]"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#004D40]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-4">
            <NotificationsButton role="admin" />
            <div className="flex items-center gap-2 bg-[#F0F7F7] border border-[#004D40]/15 px-3 py-1.5 rounded-full text-xs text-[#004D40] font-semibold">
              <div className="w-6 h-6 rounded-full bg-[#00695C] text-white flex items-center justify-center font-bold text-[11px]">
                A
              </div>
              <span>Admin</span>
            </div>
          </div>
        </header>

        {/* Page Content Body */}
        <div className="p-6 lg:p-8 flex-1 max-w-7xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
