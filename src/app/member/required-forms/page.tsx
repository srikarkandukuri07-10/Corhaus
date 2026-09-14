"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RequiredFormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);

  async function fetchForms() {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("/api/member/forms", { cache: "no-store", signal: controller.signal });
      clearTimeout(t);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load forms");
      if (j.forms) {
        const pending = j.forms.filter((f: any) => f.is_required && !f.is_completed);
        setForms(pending);
        if (pending.length === 0) {
          // No required pending — let them see dashboard, but also show optional forms hint
          // Don't auto-redirect immediately; show the "All completed" state instead
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message || "Failed to load forms. Please refresh.");
    }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchForms(); }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-xs text-fg-4">Loading your forms...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
        <button onClick={() => { setLoading(true); setError(null); fetchForms(); }} className="px-6 py-2 rounded-xl bg-accent text-white text-sm font-bold">Retry</button>
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">✓</div>
        <h2 className="text-xl font-bold text-fg">All required forms completed.</h2>
        <p className="text-sm text-fg-3">You have no pending required forms. You can still complete optional forms from My Forms.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/member" className="px-6 py-3 rounded-xl bg-accent text-white font-bold text-center">Continue to Dashboard</Link>
          <Link href="/member/my-forms" className="px-6 py-3 rounded-xl border border-line bg-surface text-fg font-bold text-center">View My Forms</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6 space-y-6 min-w-0">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-extrabold text-fg">Complete Your Forms</h1>
        <p className="text-sm text-fg-3">Before accessing the Corhaus Member Portal, please complete the following required forms.</p>
      </div>

      <div className="space-y-3">
        {forms.map((f) => (
          <div key={f.id} className="bg-surface rounded-2xl border border-line p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-fg truncate">{f.name}</p>
              <p className="text-xs text-fg-3 mt-0.5">Required</p>
            </div>
            <Link href={`/member/forms/${f.id}`} className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 shrink-0">
              Complete Form
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
