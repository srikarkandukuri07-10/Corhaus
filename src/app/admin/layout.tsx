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
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#B89368]/30 border-t-[#B89368] rounded-full animate-spin" />
          <p className="text-sm text-[#4A3B32]/50 font-medium">Loading Corhaus Admin...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const isBillingActive = pathname.startsWith("/admin/billing");

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex">
      {/* ─── LIGHT LUXURY WARM BEIGE SIDEBAR ─────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 bg-[#F4EFE6] text-[#4A3B32] flex-col fixed inset-y-0 left-0 z-50 border-r border-[#E5DDD0]">
        {/* Logo Header */}
        <div className="p-6 flex flex-col items-center text-center border-b border-[#E5DDD0]/60">
          <Link href="/admin" className="flex flex-col items-center">
            {/* Gold Emblem Icon */}
            <div className="w-10 h-10 mb-1 flex items-center justify-center text-[#B89368]">
              <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none" stroke="currentColor">
                <path d="M20 5C20 5 12 15 12 25C12 29.4183 15.5817 33 20 33C24.4183 33 28 29.4183 28 25C28 15 20 5 20 5Z" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 20C15 20 20 12 20 28" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="20" cy="11" r="2.5" fill="currentColor"/>
              </svg>
            </div>
            <span className="text-xl font-serif tracking-widest text-[#362B24] uppercase font-medium">
              CORHAUS
            </span>
            <span className="text-[9px] tracking-[0.25em] text-[#B89368] font-semibold uppercase mt-0.5">
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
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                pathname === "/admin"
                  ? "bg-[#4A3B32] text-white shadow-sm"
                  : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </Link>
          </div>

          {/* Section: PEOPLE & CLASSES */}
          <div>
            <p className="text-[10px] font-bold text-[#8C7A6B] uppercase tracking-wider px-3.5 mb-1.5">
              PEOPLE &amp; CLASSES
            </p>
            <div className="space-y-0.5">
              <Link
                href="/admin/members"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith("/admin/members")
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Members</span>
              </Link>

              <Link
                href="/admin/classes/new"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/classes/new"
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Create Class</span>
              </Link>

              <Link
                href="/admin/previous-classes"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith("/admin/previous-classes")
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Previous Classes</span>
              </Link>

              <Link
                href="/admin/scanner"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/scanner"
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                <span>Attendance Scanner</span>
              </Link>

              <Link
                href="/admin/cancelled"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/cancelled"
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <span>Cancelled Classes</span>
              </Link>
            </div>
          </div>

          {/* Section: SALES & BILLING */}
          <div>
            <p className="text-[10px] font-bold text-[#8C7A6B] uppercase tracking-wider px-3.5 mb-1.5">
              SALES &amp; BILLING
            </p>
            <div className="space-y-0.5">
              <Link
                href="/admin/billing"
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isBillingActive
                    ? "bg-[#4A3B32] text-white shadow-sm"
                    : "text-[#4A3B32]/70 hover:bg-[#EAE2D5] hover:text-[#4A3B32]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Billing</span>
                </div>
              </Link>

              {/* Sub-items inside Billing section */}
              {isBillingActive && (
                <div className="ml-4 pl-3 border-l border-[#4A3B32]/20 space-y-0.5 mt-1">
                  <Link
                    href="/admin/billing"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname === "/admin/billing"
                        ? "bg-[#4A3B32]/10 text-[#4A3B32] font-semibold"
                        : "text-[#4A3B32]/60 hover:text-[#4A3B32]"
                    }`}
                  >
                    • Create Bill
                  </Link>
                  <Link
                    href="/admin/billing/plan-items"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname.startsWith("/admin/billing/plan-items")
                        ? "bg-[#4A3B32]/10 text-[#4A3B32] font-semibold"
                        : "text-[#4A3B32]/60 hover:text-[#4A3B32]"
                    }`}
                  >
                    • Plan Catalogue
                  </Link>
                  <Link
                    href="/admin/billing/invoices"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname.startsWith("/admin/billing/invoices")
                        ? "bg-[#4A3B32]/10 text-[#4A3B32] font-semibold"
                        : "text-[#4A3B32]/60 hover:text-[#4A3B32]"
                    }`}
                  >
                    • Invoices
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Admin User Profile + Logout */}
        <div className="p-4 border-t border-[#E5DDD0] bg-[#EAE2D5]/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#4A3B32] text-white flex items-center justify-center font-bold text-xs">
              A
            </div>
            <div>
              <p className="text-xs font-semibold text-[#4A3B32]">Admin</p>
              <p className="text-[10px] text-[#4A3B32]/50">Super Admin</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ─── MAIN RIGHT CONTENT AREA ───────────────────────────────────────────── */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top bar header */}
        <header className="bg-white border-b border-[#E5DDD0] sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl border border-[#E5DDD0] text-[#4A3B32]"
            >
              ☰
            </button>

            {/* Global Search Bar */}
            <div className="relative w-full hidden sm:block">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4A3B32]/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search members, classes, invoices..."
                className="w-full pl-10 pr-4 py-2 rounded-full border border-[#E5DDD0] bg-[#FAF7F2] text-xs text-[#4A3B32] placeholder:text-[#4A3B32]/40 focus:outline-none focus:ring-1 focus:ring-[#B89368]"
              />
            </div>
          </div>

          {/* Right header actions */}
          <div className="flex items-center gap-4">
            <NotificationsButton role="admin" />
            <div className="flex items-center gap-2 pl-3 border-l border-[#E5DDD0]">
              <div className="w-8 h-8 rounded-full bg-[#4A3B32] text-white flex items-center justify-center text-xs font-bold">
                A
              </div>
              <span className="text-xs font-semibold text-[#4A3B32] hidden md:inline">
                Admin
              </span>
            </div>
          </div>
        </header>

        {/* Mobile Slide-out Menu */}
        {mobileOpen && (
          <div className="lg:hidden bg-[#F4EFE6] text-[#4A3B32] p-4 space-y-3 border-b border-[#E5DDD0]">
            <Link href="/admin" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">Dashboard</Link>
            <Link href="/admin/members" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">Members</Link>
            <Link href="/admin/classes/new" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">Create Class</Link>
            <Link href="/admin/scanner" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">Scanner</Link>
            <Link href="/admin/billing" onClick={() => setMobileOpen(false)} className="block py-2 text-sm font-medium">Billing</Link>
          </div>
        )}

        {/* Page Content Container */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
