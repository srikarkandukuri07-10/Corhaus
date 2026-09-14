"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function MyFormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/member/forms", { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load");
        setForms(j.forms || []);
      } catch (e: any) {
        setError(e.message);
      }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="min-h-[40vh] flex flex-col items-center justify-center gap-2"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /><p className="text-xs text-fg-4">Loading your forms...</p></div>;
  if (error) return <div className="max-w-2xl mx-auto p-6 text-center"><p className="text-sm text-red-500">{error}</p></div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-fg">My Forms &amp; Waivers</h1>
        <p className="text-sm text-fg-3 mt-1">Complete required forms and view your signed waivers</p>
      </div>

      {forms.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-line p-8 text-center">
          <p className="text-sm text-fg-3">No forms available.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((f: any) => (
            <div key={f.id} className="bg-surface rounded-2xl border border-line p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-fg truncate">{f.name}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${f.is_required ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-surface-2 text-fg-3 border-line"}`}>{f.is_required ? "Required" : "Optional"}</span>
                </div>
                <p className="text-xs text-fg-3 mt-1 truncate">{f.description || ""}</p>
                <p className="text-xs mt-1 font-semibold">
                  {f.is_completed ? <span className="text-emerald-600">✓ Signed {f.signed_at ? new Date(f.signed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}</span> : <span className="text-amber-600">○ Pending • {f.field_count} fields</span>}
                </p>
              </div>
              {f.is_completed ? (
                <Link href={`/member/forms/${f.id}?view=1`} className="px-4 py-2 rounded-xl border border-line bg-surface-2 text-fg text-xs font-bold hover:bg-hover shrink-0">View</Link>
              ) : (
                <Link href={`/member/forms/${f.id}`} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 shrink-0">Complete</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
