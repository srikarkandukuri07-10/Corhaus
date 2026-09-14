"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function MyFormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/member/forms", { cache: "no-store" });
        const j = await res.json();
        if (j.forms) {
          const completed = j.forms.filter((f: any) => f.is_completed);
          setForms(completed);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-fg">My Forms &amp; Waivers</h1>
        <p className="text-sm text-fg-3 mt-1">Your completed consent forms</p>
      </div>

      {forms.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-line p-8 text-center">
          <p className="text-sm text-fg-3">No completed forms yet.</p>
          <Link href="/member/required-forms" className="inline-block mt-3 px-5 py-2 rounded-xl bg-accent text-white text-sm font-bold">View Required Forms</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((f: any) => (
            <div key={f.id} className="bg-surface rounded-2xl border border-line p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg truncate">{f.name}</p>
                <p className="text-xs text-emerald-600 font-semibold mt-0.5">✓ Signed {f.signed_at ? new Date(f.signed_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}</p>
              </div>
              <Link href={`/member/forms/${f.id}?view=1`} className="px-4 py-2 rounded-xl border border-line bg-surface-2 text-fg text-xs font-bold hover:bg-hover shrink-0">View</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
