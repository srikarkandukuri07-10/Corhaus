"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RequiredFormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function fetchForms() {
    try {
      const res = await fetch("/api/member/forms", { cache: "no-store" });
      const j = await res.json();
      if (j.forms) {
        const pending = j.forms.filter((f: any) => f.is_required && !f.is_completed);
        setForms(pending);
        if (pending.length === 0) {
          router.replace("/member");
        }
      }
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchForms(); }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">✓</div>
        <h2 className="text-xl font-bold text-fg">All required forms completed.</h2>
        <Link href="/member" className="inline-block px-6 py-3 rounded-xl bg-accent text-white font-bold">Continue to Dashboard</Link>
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
