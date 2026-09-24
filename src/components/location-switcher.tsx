"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useActiveLocation } from "@/lib/useActiveLocation";

/**
 * Instagram-style branch switcher. Shows only branches the caller may access
 * (server-derived). Switching reloads so every section re-fetches cleanly.
 */
export default function LocationSwitcher({
  compact = false,
  showManage = false,
}: {
  compact?: boolean;
  showManage?: boolean;
}) {
  const { activeLocationId, locations, loading, switchLocation } = useActiveLocation();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const active = locations.find((l) => l.id === activeLocationId) || null;
  // Single authorized branch (typical member/single-branch staff): static label.
  if (!loading && locations.length <= 1) {
    return (
      <span
        title={active ? `Current branch: ${active.name}` : "Branch"}
        className={`flex items-center gap-1.5 rounded-xl border border-line-2 bg-surface text-fg font-semibold ${
          compact ? "px-2 py-1.5 text-[11px] max-w-[120px]" : "px-3 py-2 text-xs"
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="truncate">{active?.name || "Branch"}</span>
      </span>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => {
          setError(null);
          setOpen((v) => !v);
        }}
        title={active ? `Current branch: ${active.name} — click to switch` : "Switch branch"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-xl border border-line-2 bg-surface text-fg font-semibold hover:bg-hover transition-colors ${
          compact ? "px-2 py-1.5 text-[11px] max-w-[130px]" : "px-3 py-2 text-xs"
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        <span className="truncate">{loading ? "…" : active?.name || "Branch"}</span>
        <svg className={`w-3 h-3 text-fg-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-64 max-w-[80vw] bg-surface border border-line rounded-2xl shadow-xl overflow-hidden z-50 py-1.5 animate-fade-in"
        >
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-fg-4">
            Switch Location
          </p>
          {locations.map((l) => {
            const isActive = l.id === activeLocationId;
            return (
              <button
                key={l.id}
                role="option"
                aria-selected={isActive}
                disabled={switching || isActive}
                onClick={async () => {
                  if (isActive) {
                    setOpen(false);
                    return;
                  }
                  setSwitching(true);
                  setError(null);
                  try {
                    await switchLocation(l.id);
                  } catch (e: any) {
                    setError(e?.message || "Switch failed.");
                    setSwitching(false);
                  }
                }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-left transition-colors touch-manipulation ${
                  isActive ? "text-fg" : "text-fg-2 hover:bg-hover hover:text-fg"
                } disabled:opacity-60`}
              >
                <span className={`w-4 shrink-0 text-center ${isActive ? "text-emerald-500" : "text-transparent"}`}>✓</span>
                <span className="truncate">{l.name}</span>
              </button>
            );
          })}
          {error && <p className="px-4 py-1.5 text-xs font-semibold text-red-500">{error}</p>}
          {showManage && (
            <Link
              href="/admin/settings/locations"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-accent hover:bg-hover border-t border-line touch-manipulation"
            >
              <span className="w-4 text-center shrink-0">+</span>
              <span>Manage Locations</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
