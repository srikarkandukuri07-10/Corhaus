"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const getPos = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: any) => {
    const c = e.currentTarget as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = getPos(e, c);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    setIsDrawing(true);
  };
  const move = (e: any) => {
    if (!isDrawing) return;
    const c = e.currentTarget as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = getPos(e, c);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#17181C";
    ctx.lineTo(p.x, p.y); ctx.stroke();
    e.preventDefault();
  };
  const end = (e: any) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const c = e.currentTarget as HTMLCanvasElement;
    try { onChange(c.toDataURL("image/png")); } catch {}
  };
  const clear = () => {
    const c = document.getElementById("sig-canvas-member") as HTMLCanvasElement | null;
    if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    onChange("");
  };
  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-line rounded-xl bg-surface-2/30 overflow-hidden touch-none" style={{ touchAction: "none" }}>
        <canvas id="sig-canvas-member" width={600} height={180} className="w-full h-[160px] cursor-crosshair touch-none" onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        {!value && <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-fg-4">Sign here</div>}
      </div>
      <button type="button" onClick={clear} className="text-xs font-semibold text-fg-3 hover:text-fg">Clear signature</button>
    </div>
  );
}

export default function MemberFormFillPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isView = searchParams.get("view") === "1";
  const [form, setForm] = useState<any>(null);
  const [fields, setFields] = useState<any[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewSubmission, setViewSubmission] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/member/forms/${id}`, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        if (j.alreadySubmitted && !isView) {
          router.replace("/member/required-forms");
          return;
        }
        if (j.alreadySubmitted && isView && j.submission) {
          // View mode: show snapshot + responses
          const snap = j.submission.form_snapshot || { form: j.form, fields: j.form.fields };
          setForm(snap.form || j.form);
          setFields(snap.fields || j.form.fields || []);
          setResponses(j.submission.responses || {});
          setSignature(j.submission.signature_data || "");
          setViewSubmission(j.submission);
        } else {
          setForm(j.form);
          setFields(j.form.fields || []);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, router, isView]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Validate required
    for (const f of fields) {
      if (!f.is_required) continue;
      if (f.field_type === "info_text") continue;
      if (f.field_type === "checkbox") {
        if (!responses[f.id]) { setError(`Please acknowledge: ${f.label}`); return; }
      } else if (f.field_type === "signature") {
        if (!signature) { setError("Please provide your signature"); return; }
      } else {
        const v = responses[f.id];
        if (v === undefined || v === null || String(v).trim() === "") { setError(`Please complete: ${f.label}`); return; }
      }
    }
    // Ensure signature field required has signature
    const hasSigField = fields.some((f: any) => f.field_type === "signature" && f.is_required);
    if (hasSigField && !signature) { setError("Please provide your signature"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/member/forms/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, signature_data: signature }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      router.push("/member/required-forms");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>;
  if (error && !form) return <div className="p-6 text-center text-sm text-red-500">{error}</div>;
  if (!form) return null;

  if (isView && viewSubmission) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 min-w-0">
        <div>
          <h1 className="text-xl font-bold text-fg">{form.name} <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-2">Signed {new Date(viewSubmission.signed_at).toLocaleDateString("en-IN")}</span></h1>
          <p className="text-sm text-fg-3 mt-1 break-words">{form.description}</p>
          <p className="text-xs text-fg-4 mt-1">Version {viewSubmission.form_version} • Signed {new Date(viewSubmission.signed_at).toLocaleString("en-IN")}</p>
        </div>
        <div className="space-y-5 bg-surface rounded-2xl border border-line p-4 sm:p-6">
          {fields.map((f: any) => {
            const val = (viewSubmission.responses || {})[f.id];
            return (
              <div key={f.id} className="space-y-1.5">
                {f.field_type === "info_text" ? (
                  <div className="p-3 rounded-xl bg-surface-2/40 border border-line text-sm text-fg-3 leading-relaxed whitespace-pre-wrap break-words">{f.label}</div>
                ) : f.field_type === "yes_no" ? (
                  <div><p className="text-sm font-semibold text-fg">{f.label}</p><p className="text-sm text-fg-3 mt-1">{val || "—"}</p></div>
                ) : f.field_type === "checkbox" ? (
                  <div><p className="text-sm font-semibold text-fg">{f.label}</p><p className="text-sm mt-1">{val ? "✓ Yes" : "—"}</p></div>
                ) : f.field_type === "signature" ? (
                  <div>
                    <p className="text-sm font-semibold text-fg">{f.label}</p>
                    {viewSubmission.signature_data ? <img src={viewSubmission.signature_data} alt="signature" className="mt-2 max-h-32 border border-line rounded-xl bg-white p-2" /> : <p className="text-xs text-fg-4">No signature</p>}
                  </div>
                ) : (
                  <div><p className="text-sm font-semibold text-fg">{f.label}</p><p className="text-sm text-fg-3 mt-1 break-words">{val || "—"}</p></div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 min-w-0">
      <div>
        <h1 className="text-xl font-bold text-fg">{form.name} {form.is_required && <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full ml-2">Required</span>}</h1>
        <p className="text-sm text-fg-3 mt-1 break-words">{form.description}</p>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5 bg-surface rounded-2xl border border-line p-4 sm:p-6">
        {fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            {f.field_type === "info_text" ? (
              <div className="p-3 rounded-xl bg-surface-2/40 border border-line text-sm text-fg-3 leading-relaxed whitespace-pre-wrap break-words">{f.label}</div>
            ) : f.field_type === "text" ? (
              <>
                <label className="block text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</label>
                {f.description && <p className="text-xs text-fg-3">{f.description}</p>}
                <input type="text" placeholder={f.placeholder || ""} value={responses[f.id] || ""} onChange={(e) => setResponses({ ...responses, [f.id]: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent" />
              </>
            ) : f.field_type === "textarea" ? (
              <>
                <label className="block text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</label>
                <textarea placeholder={f.placeholder || ""} value={responses[f.id] || ""} onChange={(e) => setResponses({ ...responses, [f.id]: e.target.value })} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
              </>
            ) : f.field_type === "yes_no" ? (
              <>
                <label className="block text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name={f.id} checked={responses[f.id]==="Yes"} onChange={()=> setResponses({...responses, [f.id]:"Yes"})} className="w-4 h-4 accent-accent" /> Yes</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name={f.id} checked={responses[f.id]==="No"} onChange={()=> setResponses({...responses, [f.id]:"No"})} className="w-4 h-4 accent-accent" /> No</label>
                </div>
              </>
            ) : f.field_type === "checkbox" ? (
              <label className="flex items-start gap-2 text-sm text-fg">
                <input type="checkbox" checked={!!responses[f.id]} onChange={(e)=> setResponses({...responses, [f.id]: e.target.checked})} className="w-4 h-4 mt-0.5 accent-accent" />
                <span>{f.label} {f.is_required && <span className="text-red-500">*</span>}</span>
              </label>
            ) : f.field_type === "signature" ? (
              <>
                <label className="block text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</label>
                <SignaturePad value={signature} onChange={setSignature} />
              </>
            ) : null}
          </div>
        ))}

        <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-accent text-white font-bold hover:bg-accent-2 disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit & Sign"}
        </button>
      </form>
    </div>
  );
}
