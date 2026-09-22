"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 10;

/**
 * Client-side pagination over an already-filtered list.
 * - `resetKey` should change whenever search/filters change so the view
 *   jumps back to page 1 (pass e.g. [search, status].join("|")).
 * - Page auto-clamps when the list shrinks (e.g. after a delete).
 */
export function usePagination<T>(items: T[], resetKey: string, pageSize: number = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return { page: safePage, totalPages, pageItems, setPage };
}

function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, 2, current - 1, current, current + 1, total - 1, total]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const btn =
    "min-w-[32px] h-8 px-2 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const idle = "border-line bg-surface text-fg-3 hover:bg-hover hover:text-fg";
  const active = "border-accent bg-accent text-white";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-line bg-surface">
      <p className="text-xs text-fg-4 font-semibold">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        <button
          className={`${btn} ${idle} px-3`}
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="text-xs text-fg-5 px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              className={`${btn} ${p === page ? active : idle}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}
        <button
          className={`${btn} ${idle} px-3`}
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
