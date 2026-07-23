"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
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
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-brown/30 border-t-brand-brown rounded-full animate-spin" />
          <p className="text-sm text-brand-navy/40 font-medium">Loading Corhaus Admin...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  const isBillingActive = pathname.startsWith("/admin/billing");

  return (
    <div className="min-h-screen bg-[#F9F6F0] flex">
      {/* ─── DARK VERTICAL LEFT SIDEBAR ────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 bg-[#0F2E23] text-white flex-col fixed inset-y-0 left-0 z-50 shadow-xl">
        {/* Logo Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <Logo size="sm" />
            <span className="text-[10px] tracking-widest text-[#C4A47C] font-semibold uppercase mt-1">
              Pilates for Everyone
            </span>
          </div>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Main Dashboard */}
          <div>
            <Link
              href="/admin"
              className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                pathname === "/admin"
                  ? "bg-[#1C4435] text-white shadow-md border-l-4 border-l-[#C4A47C]"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-lg">📊</span>
              <span>Dashboard</span>
            </Link>
          </div>

          {/* Section: People & Classes */}
          <div>
            <p className="text-[10px] font-bold text-[#C4A47C] uppercase tracking-wider px-3 mb-2">
              People &amp; Classes
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/members"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith("/admin/members")
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">👥</span>
                <span>Members</span>
              </Link>

              <Link
                href="/admin/classes/new"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/classes/new"
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">📅</span>
                <span>Create Class</span>
              </Link>

              <Link
                href="/admin/previous-classes"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname.startsWith("/admin/previous-classes")
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">🕒</span>
                <span>Previous Classes</span>
              </Link>

              <Link
                href="/admin/scanner"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/scanner"
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">📱</span>
                <span>Attendance Scanner</span>
              </Link>

              <Link
                href="/admin/cancelled"
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  pathname === "/admin/cancelled"
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="text-base">🚫</span>
                <span>Cancelled Classes</span>
              </Link>
            </div>
          </div>

          {/* Section: Sales & Billing */}
          <div>
            <p className="text-[10px] font-bold text-[#C4A47C] uppercase tracking-wider px-3 mb-2">
              Sales &amp; Billing
            </p>
            <div className="space-y-1">
              <Link
                href="/admin/billing"
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isBillingActive
                    ? "bg-[#1C4435] text-white font-semibold"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base">💳</span>
                  <span>Billing</span>
                </div>
                {isBillingActive && (
                  <span className="text-[10px] bg-[#C4A47C] text-[#0F2E23] px-1.5 py-0.5 rounded-full font-bold">
                    Active
                  </span>
                )}
              </Link>

              {/* Nested Sub-options under Billing */}
              {isBillingActive && (
                <div className="ml-4 pl-3 border-l border-white/15 space-y-1 mt-1">
                  <Link
                    href="/admin/billing"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname === "/admin/billing"
                        ? "bg-[#C4A47C]/20 text-[#C4A47C] font-semibold"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    • Create Bill
                  </Link>

                  <Link
                    href="/admin/billing/plan-items"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname.startsWith("/admin/billing/plan-items")
                        ? "bg-[#C4A47C]/20 text-[#C4A47C] font-semibold"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    • Plan Catalogue
                  </Link>

                  <Link
                    href="/admin/billing/invoices"
                    className={`block px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      pathname.startsWith("/admin/billing/invoices")
                        ? "bg-[#C4A47C]/20 text-[#C4A47C] font-semibold"
                        : "text-white/60 hover:text-white"
                    }`}
                  >
                    • Invoices
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Admin Info + Sign out */}
        <div className="p-4 border-t border-white/10 bg-[#0A221A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#C4A47C] text-[#0F2E23] flex items-center justify-center font-bold text-xs">
              A
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Admin</p>
              <p className="text-[10px] text-white/50">Super Admin</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* ─── MAIN RIGHT CONTENT AREA ───────────────────────────────────────────── */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top bar header */}
        <header className="bg-white border-b border-[#E8E2D5] sticky top-0 z-40 px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 max-w-xl">
            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden p-2 rounded-xl border border-brand-sand text-brand-navy"
            >
              ☰
            </button>

            {/* Global Search Bar */}
            <div className="relative w-full hidden sm:block">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-navy/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search members, classes, invoices..."
                className="w-full pl-10 pr-4 py-2 rounded-full border border-brand-sand/70 bg-brand-cream/40 text-xs text-brand-navy placeholder:text-brand-navy/30 focus:outline-none focus:ring-1 focus:ring-brand-brown"
              />
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-4">
            <NotificationsButton role="admin" />
            <div className="flex items-center gap-2 pl-3 border-l border-brand-sand/60">
              <div className="w-8 h-8 rounded-full bg-[#0F2E23] text-white flex items-center justify-center text-xs font-bold">
                A
              </div>
              <span className="text-xs font-semibold text-brand-navy hidden md:inline">
                Admin
              </span>
            </div>
          </div>
        </header>

        {/* Mobile Slide-out Menu */}
        {mobileOpen && (
          <div className="lg:hidden bg-[#0F2E23] text-white p-4 space-y-4 border-b border-white/10">
            <Link
              href="/admin"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              📊 Dashboard
            </Link>
            <Link
              href="/admin/members"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              👥 Members
            </Link>
            <Link
              href="/admin/classes/new"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              📅 Create Class
            </Link>
            <Link
              href="/admin/scanner"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              📱 Scanner
            </Link>
            <Link
              href="/admin/billing"
              onClick={() => setMobileOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              💳 Billing
            </Link>
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
