"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SettingsSidebar } from "../invoice-settings/page";

// ── Types ─────────────────────────────────────────────────────────────────
type FormField = {
  id?: string;
  field_type: "text" | "textarea" | "yes_no" | "checkbox" | "info_text" | "signature";
  label: string;
  placeholder?: string;
  description?: string;
  is_required: boolean;
  options?: any;
  sort_order: number;
};

type FormRecord = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_required: boolean;
  is_system_template: boolean;
  version: number;
  field_count: number;
  signed_count: number;
};

// ── Signature Canvas (simple) ──────────────────────────────────────────────
function SignaturePad({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(!!value);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    } else {
      return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
    }
  };

  const start = (e: any) => {
    if (disabled) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  };
  const move = (e: any) => {
    if (!isDrawing || disabled) return;
    const canvas = e.currentTarget as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#17181C";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    e.preventDefault();
  };
  const end = (e: any) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = e.currentTarget as HTMLCanvasElement;
    try {
      onChange(canvas.toDataURL("image/png"));
    } catch {}
  };
  const clear = () => {
    const canvas = document.getElementById("sig-canvas") as HTMLCanvasElement | null;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
    setHasDrawn(false);
  };

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-line rounded-xl bg-surface-2/30 overflow-hidden touch-none" style={{ touchAction: "none" }}>
        <canvas
          id="sig-canvas"
          width={600}
          height={180}
          className="w-full h-[160px] sm:h-[180px] cursor-crosshair touch-none"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!hasDrawn && !value && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-fg-4 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              Signature will be drawn here
            </span>
          </div>
        )}
      </div>
      {!disabled && (
        <button type="button" onClick={clear} className="text-xs font-semibold text-fg-3 hover:text-fg">
          Clear signature
        </button>
      )}
      {value && <img src={value} alt="signature" className="hidden" />}
    </div>
  );
}

// ── Field Renderer (for preview / member) ─────────────────────────────────
function FieldRenderer({ field, value, onChange, error }: { field: FormField; value: any; onChange: (v: any) => void; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-fg">
        {field.label} {field.is_required && <span className="text-red-500">*</span>}
      </label>
      {field.description && <p className="text-xs text-fg-3 break-words">{field.description}</p>}
      {field.field_type === "text" && (
        <input type="text" placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5 focus:outline-none focus:ring-1 focus:ring-accent" />
      )}
      {field.field_type === "textarea" && (
        <textarea placeholder={field.placeholder || ""} value={value || ""} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5 focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
      )}
      {field.field_type === "yes_no" && (
        <div className="flex gap-3">
          {["Yes", "No"].map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm font-medium text-fg cursor-pointer">
              <input type="radio" name={field.label} checked={value === opt} onChange={() => onChange(opt)} className="w-4 h-4 accent-accent" />
              {opt}
            </label>
          ))}
        </div>
      )}
      {field.field_type === "checkbox" && (
        <label className="flex items-start gap-2 text-sm text-fg cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 mt-0.5 accent-accent" />
          <span>{field.label}</span>
        </label>
      )}
      {field.field_type === "info_text" && (
        <div className="p-3 rounded-xl bg-surface-2/40 border border-line text-sm text-fg-3 leading-relaxed whitespace-pre-wrap break-words">
          {field.label}
          {field.description && <div className="mt-1 text-xs text-fg-4">{field.description}</div>}
        </div>
      )}
      {field.field_type === "signature" && (
        <SignaturePad value={value || ""} onChange={onChange} />
      )}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

export default function FormsWaiversPage() {
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingForm, setEditingForm] = useState<FormRecord | null>(null);
  const [builderName, setBuilderName] = useState("");
  const [builderDesc, setBuilderDesc] = useState("");
  const [builderRequired, setBuilderRequired] = useState(false);
  const [builderActive, setBuilderActive] = useState(true);
  const [builderFields, setBuilderFields] = useState<FormField[]>([]);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  // Preview state
  const [previewForm, setPreviewForm] = useState<any>(null);

  async function fetchForms() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/forms", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setForms(j.forms || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchForms();
  }, []);

  function openCreate() {
    setEditingForm(null);
    setBuilderName("");
    setBuilderDesc("");
    setBuilderRequired(false);
    setBuilderActive(true);
    setBuilderFields([]);
    setSelectedFieldIdx(null);
    setBuilderError(null);
    setShowBuilder(true);
  }

  async function openEdit(form: FormRecord) {
    setBuilderError(null);
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      const f = j.form;
      setEditingForm(form);
      setBuilderName(f.name);
      setBuilderDesc(f.description || "");
      setBuilderRequired(!!f.is_required);
      setBuilderActive(!!f.is_active);
      setBuilderFields((f.fields || []).map((x: any, i: number) => ({ ...x, sort_order: i })));
      setSelectedFieldIdx(null);
      setShowBuilder(true);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function openPreview(form: FormRecord) {
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setPreviewForm(j.form);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleActive(form: FormRecord) {
    try {
      const res = await fetch(`/api/admin/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !form.is_active }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      fetchForms();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function addField(type: FormField["field_type"]) {
    const base: FormField = {
      field_type: type,
      label: type === "text" ? "Text Field" : type === "textarea" ? "Long Text" : type === "yes_no" ? "Yes / No Question" : type === "checkbox" ? "I agree" : type === "info_text" ? "Information" : "Member Signature",
      placeholder: "",
      description: "",
      is_required: type === "signature" ? true : false,
      sort_order: builderFields.length,
    };
    if (type === "text") base.placeholder = "Enter text";
    if (type === "textarea") base.placeholder = "Enter details";
    if (type === "info_text") {
      base.label = "Please read the following information carefully.";
      base.description = "";
    }
    setBuilderFields([...builderFields, base]);
    setSelectedFieldIdx(builderFields.length);
  }

  function updateSelectedField(patch: Partial<FormField>) {
    if (selectedFieldIdx === null) return;
    const next = [...builderFields];
    next[selectedFieldIdx] = { ...next[selectedFieldIdx], ...patch };
    setBuilderFields(next);
  }

  function deleteField(idx: number) {
    const next = builderFields.filter((_, i) => i !== idx);
    setBuilderFields(next.map((f, i) => ({ ...f, sort_order: i })));
    setSelectedFieldIdx(null);
  }

  function moveField(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= builderFields.length) return;
    const next = [...builderFields];
    const tmp = next[idx];
    next[idx] = next[j];
    next[j] = tmp;
    setBuilderFields(next.map((f, i) => ({ ...f, sort_order: i })));
    setSelectedFieldIdx(j);
  }

  async function handleSave() {
    setBuilderError(null);
    if (!builderName.trim()) {
      setBuilderError("Form Name is required");
      return;
    }
    if (builderFields.length === 0) {
      setBuilderError("Add at least one field");
      return;
    }
    // Validate signature exists at least one if required forms? Not mandatory
    setSaving(true);
    try {
      const payload = {
        name: builderName.trim(),
        description: builderDesc.trim(),
        is_required: builderRequired,
        is_active: builderActive,
        fields: builderFields,
      };
      const url = editingForm ? `/api/admin/forms/${editingForm.id}` : "/api/admin/forms";
      const method = editingForm ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setShowBuilder(false);
      fetchForms();
    } catch (e: any) {
      setBuilderError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in flex flex-col md:flex-row gap-6">
      <SettingsSidebar />
      <main className="flex-1 space-y-6 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-fg">Forms &amp; Waivers</h1>
            <p className="text-xs text-fg-4 mt-1">Create and manage digital consent forms for members</p>
          </div>
          <button onClick={openCreate} className="px-5 py-2.5 rounded-xl bg-[#3B5BFF] text-white text-sm font-bold hover:bg-[#2f4ae0] shadow-md flex items-center justify-center gap-2 w-full sm:w-auto">
            <span className="text-lg leading-none">+</span> Create Form
          </button>
        </div>

        {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          </div>
        ) : forms.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-line p-12 text-center">
            <p className="text-sm font-bold text-fg">No forms created yet.</p>
            <p className="text-xs text-fg-3 mt-1">Create your first consent form.</p>
            <button onClick={openCreate} className="mt-4 px-5 py-2.5 rounded-xl bg-[#3B5BFF] text-white text-sm font-bold">+ Create Form</button>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map((f) => (
              <div key={f.id} className="bg-surface rounded-2xl border border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-fg truncate">{f.name}</h3>
                    {f.is_system_template && <span className="text-[10px] font-semibold text-fg-4 bg-surface-2 border border-line px-2 py-0.5 rounded-md">System Template</span>}
                  </div>
                  <p className="text-xs text-fg-3 mt-1 truncate break-words">{f.description || "—"}</p>
                  <p className="text-xs text-fg-4 mt-1.5">
                    {f.field_count} fields <span className="mx-1">•</span> {f.signed_count} members signed
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <label className="flex items-center gap-2 text-xs font-semibold text-fg-3 cursor-pointer">
                    <input type="checkbox" checked={f.is_active} onChange={() => toggleActive(f)} className="w-9 h-5 appearance-none rounded-full bg-surface-2 border border-line relative transition-colors checked:bg-[#3B5BFF] checked:border-[#3B5BFF] before:content-[''] before:absolute before:top-0.5 before:left-0.5 before:w-4 before:h-4 before:bg-white before:rounded-full before:transition-transform checked:before:translate-x-4" />
                    {f.is_active ? "Active" : "Inactive"}
                  </label>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${f.is_required ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-surface-2 text-fg-3 border-line"}`}>
                    {f.is_required ? "Required" : "Optional"}
                  </span>
                  <span className="w-px h-6 bg-line hidden sm:block" />
                  <button onClick={() => openPreview(f)} className="text-xs font-bold text-fg hover:text-accent flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    Preview
                  </button>
                  <button onClick={() => openEdit(f)} className="text-xs font-bold text-fg hover:text-accent flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit
                  </button>
                  <button onClick={() => toggleActive(f)} className={`text-xs font-bold ${f.is_active ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}>
                    {f.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Builder Modal/Page */}
        {showBuilder && (
          <div className="fixed inset-0 z-50 bg-canvas/95 backdrop-blur-sm overflow-y-auto">
            <div className="min-h-screen">
              {/* Top bar */}
              <div className="sticky top-0 z-10 bg-surface border-b border-line px-4 sm:px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowBuilder(false)} className="w-8 h-8 rounded-xl hover:bg-surface-2 flex items-center justify-center">←</button>
                  <div>
                    <h2 className="text-sm font-bold text-fg">{editingForm ? "Edit Form" : "Create Form"}</h2>
                    <p className="text-xs text-fg-4">Design a new consent form for members</p>
                  </div>
                </div>
                <button onClick={handleSave} disabled={saving} className="px-5 py-2 rounded-xl bg-[#8B8FFF]/30 text-[#3B5BFF] border border-[#8B8FFF]/40 text-xs font-bold hover:bg-[#8B8FFF]/40 disabled:opacity-50">
                  {saving ? "Saving..." : "Save Form"}
                </button>
              </div>

              <div className="max-w-[1400px] mx-auto p-4 sm:p-6 space-y-4">
                {builderError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">{builderError}</div>}

                {/* Basic Info */}
                <div className="bg-surface rounded-xl border border-line p-4 sm:p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-fg mb-1">Form Name *</label>
                    <input value={builderName} onChange={(e) => setBuilderName(e.target.value)} placeholder="e.g. Health Declaration" className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5 focus:outline-none focus:ring-1 focus:ring-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-fg mb-1">Description</label>
                    <textarea value={builderDesc} onChange={(e) => setBuilderDesc(e.target.value)} placeholder="Brief description of this form" rows={2} className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface-2/40 text-sm text-fg placeholder:text-fg-5 focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                  </div>
                  <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-line">
                    <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                      <input type="checkbox" checked={builderRequired} onChange={(e) => setBuilderRequired(e.target.checked)} className="w-4 h-4 accent-[#3B5BFF]" />
                      Mandatory — Members must sign to complete registration
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                      <input type="checkbox" checked={builderActive} onChange={(e) => setBuilderActive(e.target.checked)} className="w-4 h-4 accent-[#3B5BFF]" />
                      Active — Form is available for signing
                    </label>
                  </div>
                </div>

                {/* Builder Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                  {/* Form Fields List */}
                  <div className="bg-surface rounded-xl border border-line p-4 min-h-[300px]">
                    <p className="text-xs font-bold text-fg mb-3">Form Fields</p>
                    {builderFields.length === 0 ? (
                      <div className="border border-dashed border-line rounded-xl p-8 text-center text-xs text-fg-4">No fields yet. Add fields using the buttons below.</div>
                    ) : (
                      <div className="space-y-2">
                        {builderFields.map((field, idx) => (
                          <div key={idx} onClick={() => setSelectedFieldIdx(idx)} className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer ${selectedFieldIdx === idx ? "bg-accent/5 border-accent/30" : "bg-surface-2/40 border-line hover:border-accent/20"}`}>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-fg truncate">{field.label} {field.is_required && <span className="text-red-500">*</span>}</p>
                              <p className="text-[11px] text-fg-4 capitalize">{field.field_type.replace("_", " ")} {field.is_required ? "• Required" : "• Optional"}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button type="button" onClick={(e) => { e.stopPropagation(); moveField(idx, -1); }} className="w-7 h-7 rounded-lg hover:bg-surface border border-transparent hover:border-line flex items-center justify-center text-fg-3">↑</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); moveField(idx, 1); }} className="w-7 h-7 rounded-lg hover:bg-surface border border-transparent hover:border-line flex items-center justify-center text-fg-3">↓</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteField(idx); }} className="w-7 h-7 rounded-lg hover:bg-red-50 text-red-500 flex items-center justify-center">×</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 pt-4 border-t border-line">
                      <p className="text-[11px] font-bold text-fg-5 uppercase tracking-wider mb-2">Add Field</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => addField("text")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Text</button>
                        <button type="button" onClick={() => addField("textarea")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-sky-400" /> Textarea</button>
                        <button type="button" onClick={() => addField("yes_no")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5">? Yes / No</button>
                        <button type="button" onClick={() => addField("checkbox")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5"><span className="w-3 h-3 border border-line rounded flex items-center justify-center text-[8px]">☑</span> Checkbox</button>
                        <button type="button" onClick={() => addField("info_text")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5"><span className="w-2 h-2 bg-blue-400 rounded-sm" /> Info Text</button>
                        <button type="button" onClick={() => addField("signature")} className="px-3 py-1.5 rounded-full border border-line bg-surface-2 text-xs font-semibold text-fg flex items-center gap-1.5">✍ Signature</button>
                      </div>
                    </div>
                  </div>

                  {/* Field Properties */}
                  <div className="bg-surface rounded-xl border border-line p-4 h-fit">
                    <p className="text-xs font-bold text-fg mb-3">Field Properties</p>
                    {selectedFieldIdx === null || !builderFields[selectedFieldIdx] ? (
                      <p className="text-xs text-fg-4 text-center py-8">Select a field from the list to edit its properties, or add a new field below.</p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[11px] font-bold text-fg mb-1">Label *</label>
                          <input value={builderFields[selectedFieldIdx].label} onChange={(e) => updateSelectedField({ label: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent" />
                        </div>
                        {(builderFields[selectedFieldIdx].field_type === "text" || builderFields[selectedFieldIdx].field_type === "textarea") && (
                          <div>
                            <label className="block text-[11px] font-bold text-fg mb-1">Placeholder</label>
                            <input value={builderFields[selectedFieldIdx].placeholder || ""} onChange={(e) => updateSelectedField({ placeholder: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent" />
                          </div>
                        )}
                        {builderFields[selectedFieldIdx].field_type === "info_text" && (
                          <div>
                            <label className="block text-[11px] font-bold text-fg mb-1">Content</label>
                            <textarea value={builderFields[selectedFieldIdx].description || ""} onChange={(e) => updateSelectedField({ description: e.target.value })} rows={4} className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2/40 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-xs font-semibold text-fg cursor-pointer">
                          <input type="checkbox" checked={builderFields[selectedFieldIdx].is_required} onChange={(e) => updateSelectedField({ is_required: e.target.checked })} className="w-4 h-4 accent-[#3B5BFF]" />
                          Required field
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {previewForm && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <div className="min-h-screen flex items-center justify-center p-4">
              <div className="bg-surface rounded-2xl border border-line shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-fg">{previewForm.name}</h3>
                    <p className="text-xs text-fg-3">{previewForm.description}</p>
                  </div>
                  <button onClick={() => setPreviewForm(null)} className="w-8 h-8 rounded-xl hover:bg-surface-2 flex items-center justify-center">×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {(previewForm.fields || []).map((f: any) => (
                    <div key={f.id}>
                      {f.field_type === "info_text" ? (
                        <div className="p-3 rounded-xl bg-surface-2/40 border border-line text-sm text-fg-3 leading-relaxed whitespace-pre-wrap">{f.label}{f.description ? `\n\n${f.description}` : ""}</div>
                      ) : f.field_type === "yes_no" ? (
                        <div>
                          <p className="text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</p>
                          <div className="flex gap-4 mt-1.5">
                            <label className="flex items-center gap-1.5 text-sm"><input type="radio" disabled /> Yes</label>
                            <label className="flex items-center gap-1.5 text-sm"><input type="radio" disabled /> No</label>
                          </div>
                        </div>
                      ) : f.field_type === "checkbox" ? (
                        <label className="flex items-start gap-2 text-sm text-fg"><input type="checkbox" disabled /> {f.label} {f.is_required && <span className="text-red-500">*</span>}</label>
                      ) : f.field_type === "signature" ? (
                        <div>
                          <p className="text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</p>
                          <div className="mt-2 h-32 border-2 border-dashed border-line rounded-xl bg-surface-2/30 flex items-center justify-center text-xs text-fg-4">Signature will be drawn here</div>
                        </div>
                      ) : f.field_type === "textarea" ? (
                        <div>
                          <p className="text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</p>
                          <div className="mt-1.5 h-20 rounded-xl border border-line bg-surface-2/40" />
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold text-fg">{f.label} {f.is_required && <span className="text-red-500">*</span>}</p>
                          <div className="mt-1.5 h-10 rounded-xl border border-line bg-surface-2/40" />
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-fg-4 text-center pt-4 border-t border-line">This is a preview. Members will see this form during registration.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
