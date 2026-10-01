"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useLockBody } from "@/lib/useLockBody";
import { usePermissions } from "@/lib/usePermissions";
import {
  TEMPLATE_VARIABLES_BY_KEY,
  type TemplateKey,
} from "@/lib/whatsapp/types";
import {
  MAX_TEMPLATE_LENGTH,
  extractUsedVariables,
  validateTemplateBody,
} from "@/lib/whatsapp/templates";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PublicState {
  connection_status: string;
  enabled: boolean;
  connected_phone: string | null;
  connected_at: string | null;
  last_connected_at: string | null;
  last_disconnected_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  qr: string | null;
  qr_expires_at: string | null;
  worker_online: boolean;
  worker_heartbeat_at: string | null;
  reminder_enabled: boolean;
  reminder_minutes: number;
  max_send_attempts: number;
}

interface Health {
  messages_sent: number;
  messages_failed: number;
  messages_pending: number;
  last_message: {
    at: string | null;
    template_key: string;
    member_name: string | null;
    phone: string;
  } | null;
  last_failure: {
    at: string | null;
    template_key: string;
    error: string | null;
  } | null;
  pending_command: { id: string; command: string; created_at: string } | null;
}

interface TemplateRow {
  id: string;
  template_key: TemplateKey;
  template_name: string;
  message_body: string;
  description: string | null;
  is_enabled: boolean;
  offset_minutes: number | null;
  updated_at: string;
  updated_by: string | null;
}

interface JobRow {
  id: string;
  template_key: string;
  member_name: string | null;
  recipient_phone: string;
  message_body: string;
  status: string;
  attempt_count: number;
  sent_at: string | null;
  failed_at: string | null;
  scheduled_for: string | null;
  error_message: string | null;
  trigger_type: string;
}

interface MemberOption {
  id: string;
  full_name: string;
  email: string;
  phone_display: string | null;
  phone_valid: boolean;
}

const REMINDER_CHOICES = [15, 30, 45, 60, 90, 120];

const STATUS_META: Record<string, { label: string; tone: string; dot: string }> = {
  DISCONNECTED: { label: "WhatsApp Not Connected", tone: "text-fg-3", dot: "bg-fg-5" },
  QR_REQUIRED: { label: "Scan Required", tone: "text-amber-600", dot: "bg-amber-500" },
  QR_READY: { label: "Waiting for WhatsApp scan", tone: "text-amber-600", dot: "bg-amber-500" },
  CONNECTING: { label: "Connecting to WhatsApp", tone: "text-text-gold", dot: "bg-text-gold" },
  CONNECTED: { label: "WhatsApp Connected", tone: "text-green-600", dot: "bg-green-500" },
  AUTHENTICATED: { label: "WhatsApp Connected", tone: "text-green-600", dot: "bg-green-500" },
  LOGGED_OUT: { label: "WhatsApp Logged Out", tone: "text-red-600", dot: "bg-red-500" },
  ERROR: { label: "Connection Error", tone: "text-red-600", dot: "bg-red-500" },
};

const JOB_STATUS_TONE: Record<string, string> = {
  SENT: "text-green-600 bg-green-500/10 border-green-500/20",
  PENDING: "text-text-gold bg-text-gold/10 border-text-gold/20",
  PROCESSING: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  FAILED: "text-red-600 bg-red-500/10 border-red-500/20",
  CANCELLED: "text-fg-4 bg-hover border-line",
};

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IntegrationPage() {
  const { hasPerm, loading: permLoading } = usePermissions();

  const [state, setState] = useState<PublicState | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "error" | "warn" | "info"; text: string } | null>(null);

  // QR rendering
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrClock, setQrClock] = useState<number | null>(null);

  // Template editor
  const [editingKey, setEditingKey] = useState<TemplateKey | null>(null);
  const [draftBody, setDraftBody] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftOffset, setDraftOffset] = useState<number>(45);
  const [templateIssues, setTemplateIssues] = useState<Array<{ variable: string | null; message: string }>>([]);
  const [preview, setPreview] = useState<{ text: string; meta: Record<string, unknown> } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Test message
  const [testMemberId, setTestMemberId] = useState("");
  const [testTemplateKey, setTestTemplateKey] = useState<TemplateKey>("class_reminder");
  const [testConfirm, setTestConfirm] = useState<{
    member_name: string;
    phone_display: string | null;
    phone_valid: boolean;
    warning: string | null;
  } | null>(null);
  const [testSending, setTestSending] = useState(false);

  // History filter
  const [historyFilter, setHistoryFilter] = useState("ALL");

  const [showDisconnect, setShowDisconnect] = useState(false);

  useLockBody(!!testConfirm || showDisconnect);

  const canManage = hasPerm("whatsapp.manage");
  const canSend = hasPerm("whatsapp.send");

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/status", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error || "Unable to load WhatsApp status.");
        return;
      }
      const body = await res.json();
      setState(body);
      setHealth(body.health ?? null);
    } catch {
      setActionError("Network error while reading WhatsApp status.");
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/templates", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setTemplates(body.templates ?? []);
    } catch {
      console.error("Failed to load templates");
    }
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const url = `/api/admin/whatsapp/jobs?status=${encodeURIComponent(historyFilter)}&limit=150`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setJobs(body.jobs ?? []);
    } catch {
      console.error("Failed to load message history");
    }
  }, [historyFilter]);

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/members?limit=200", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      setMembers(body.members ?? []);
    } catch {
      console.error("Failed to load members");
    }
  }, []);

  useEffect(() => {
    if (permLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadTemplates(), loadJobs(), loadMembers()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only on mount / permission resolution. historyFilter
    // changes are handled by the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permLoading]);

  // Poll only while the session actually needs watching (a QR is pending or the
  // worker is mid-handshake). Once connected we settle down. This is the admin
  // UI reacting to real state changes - the reminder timer is NOT here.
  const needsPolling =
    !!state &&
    !["CONNECTED", "AUTHENTICATED"].includes(state.connection_status) &&
    (!!state.qr || state.connection_status === "CONNECTING");

  useEffect(() => {
    if (!needsPolling) return;
    const id = setInterval(loadStatus, 2500);
    return () => clearInterval(id);
  }, [needsPolling, loadStatus]);

  // Slow heartbeat poll so "worker online" stays honest.
  useEffect(() => {
    const id = setInterval(loadStatus, 30000);
    return () => clearInterval(id);
  }, [loadStatus]);

  useEffect(() => {
    // The status filter changes the query, so refetch when it changes.
    // The initial fetch is handled by the mount effect above.
    void loadJobs();
  }, [loadJobs]);

  // ─── QR lifecycle ──────────────────────────────────────────────────────────
  // One 1s clock drives both the countdown and expiry, so an expired pairing
  // code is never left on screen and never re-rendered as valid. The QR itself
  // is fetched state; expiry and the countdown are derived from the clock, so
  // there is no stored copy that can drift out of sync.

  const qrExpiresMs = state?.qr_expires_at
    ? new Date(state.qr_expires_at).getTime()
    : null;

  const qrExpired = qrExpiresMs !== null && qrClock !== null && qrClock >= qrExpiresMs;
  const activeQr = state?.qr && !qrExpired ? state.qr : null;

  const qrSecondsLeft = useMemo(() => {
    if (qrExpiresMs === null || qrClock === null || qrExpired) return null;
    return Math.max(0, Math.floor((qrExpiresMs - qrClock) / 1000));
  }, [qrExpiresMs, qrClock, qrExpired]);

  // Clock only runs while a QR is on screen.
  useEffect(() => {
    if (!state?.qr) return;
    const tick = () => setQrClock(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.qr]);

  useEffect(() => {
    let cancelled = false;
    const qr = activeQr;

    if (!qr) {
      setQrDataUrl(null);
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#0b0b0b", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("QR render failed:", err);
        if (!cancelled) {
          setQrDataUrl(null);
          setBanner({ tone: "error", text: "Could not render the pairing QR code." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeQr]);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function sendCommand(command: "CONNECT" | "DISCONNECT" | "RECONNECT") {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/admin/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const body = await res.json();
      if (!res.ok) {
        setActionError(body.error || "Request failed.");
        return;
      }
      setActionSuccess(
        command === "DISCONNECT"
          ? "WhatsApp disconnected. Automated messages are paused."
          : "Request queued. The WhatsApp worker will start a session shortly."
      );
      if (!body.worker_online) {
        setBanner({
          tone: "warn",
          text: "The WhatsApp worker is not reporting a heartbeat. Deploy the worker before expecting messages to send.",
        });
      }
      await loadStatus();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  function openEditor(tpl: TemplateRow) {
    setEditingKey(tpl.template_key);
    setDraftBody(tpl.message_body);
    setDraftName(tpl.template_name);
    setDraftOffset(tpl.offset_minutes ?? 45);
    setTemplateIssues([]);
    setPreview(null);
    setPreviewError(null);
    setActionError(null);
  }

  function closeEditor() {
    setEditingKey(null);
    setTemplateIssues([]);
    setPreview(null);
    setPreviewError(null);
  }

  const editorValidation = useMemo(
    () => (editingKey ? validateTemplateBody(draftBody, editingKey) : null),
    [draftBody, editingKey]
  );

  async function saveTemplate() {
    if (!editingKey) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/whatsapp/templates/${editingKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_body: draftBody,
          template_name: draftName,
          offset_minutes: editingKey === "class_reminder" ? draftOffset : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (Array.isArray(body.issues)) setTemplateIssues(body.issues);
        setActionError(body.error || "Could not save the template.");
        return;
      }
      setActionSuccess(`Saved "${draftName}".`);
      closeEditor();
      await Promise.all([loadTemplates(), loadStatus()]);
    } catch {
      setActionError("Network error while saving.");
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleTemplate(tpl: TemplateRow) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/templates/${tpl.template_key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: !tpl.is_enabled }),
      });
      if (!res.ok) {
        const body = await res.json();
        setActionError(body.error || "Could not update the template.");
        return;
      }
      setActionSuccess(
        `${tpl.template_name} ${tpl.is_enabled ? "disabled" : "enabled"}.`
      );
      await loadTemplates();
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function saveReminderSettings(patch: {
    reminder_enabled?: boolean;
    reminder_minutes?: number;
    max_send_attempts?: number;
  }) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) {
        setActionError(body.error || "Could not save reminder settings.");
        return;
      }
      setActionSuccess("Reminder settings saved.");
      await Promise.all([loadStatus(), loadTemplates()]);
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function requestPreview() {
    if (!editingKey) return;
    setPreviewing(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_key: editingKey,
          member_id: testMemberId || undefined,
          message_body: draftBody,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPreview(null);
        setPreviewError(body.error || "Preview failed.");
        return;
      }
      setPreview({ text: body.preview, meta: body.resolved_from ?? {} });
    } catch {
      setPreviewError("Network error while previewing.");
    } finally {
      setPreviewing(false);
    }
  }

  async function prepareTest() {
    if (!testMemberId) {
      setActionError("Select a member first.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: testMemberId, template_key: testTemplateKey }),
      });
      const body = await res.json();
      if (!res.ok) {
        setActionError(body.error || "Could not prepare the test message.");
        return;
      }
      setTestConfirm(body.confirm);
    } catch {
      setActionError("Network error.");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmTest() {
    setTestSending(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: testMemberId,
          template_key: testTemplateKey,
          confirmed: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setActionError(body.error || "Could not queue the test message.");
        setTestConfirm(null);
        return;
      }
      setTestConfirm(null);
      setActionSuccess(
        `Test message queued for ${body.recipient}. Watch Message History for the result.`
      );
      await Promise.all([loadJobs(), loadStatus()]);
    } catch {
      setActionError("Network error.");
    } finally {
      setTestSending(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (permLoading || loading) {
    return (
      <div className="bg-surface border border-line rounded-2xl py-16 text-center text-sm text-fg-4">
        Loading integration…
      </div>
    );
  }

  if (!hasPerm("whatsapp.view")) {
    return (
      <div className="bg-surface rounded-3xl border border-line p-8 text-center space-y-3">
        <p className="text-sm font-bold text-fg">Access Denied</p>
        <p className="text-xs text-fg-4">
          Your role does not include the <code>whatsapp.view</code> permission.
        </p>
      </div>
    );
  }

  const status = state?.connection_status ?? "DISCONNECTED";
  const meta = STATUS_META[status] ?? STATUS_META.DISCONNECTED;
  const isConnected = status === "CONNECTED" || status === "AUTHENTICATED";
  const editingTemplate = templates.find((t) => t.template_key === editingKey) ?? null;
  const usedVars = editingKey ? extractUsedVariables(draftBody) : [];

  return (
    <div className="space-y-6 animate-fade-in pb-12 min-w-0 max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-fg tracking-tight truncate">
            Integration
          </h1>
          <p className="text-xs text-fg-3 mt-1">
            WhatsApp connection, message templates, reminders and delivery history
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-3 py-2 rounded-xl text-xs font-extrabold border flex items-center gap-2 ${isConnected ? "bg-green-500/10 border-green-500/25 text-green-600" : "bg-surface-2 border-line text-fg-3"}`}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : meta.dot}`} />
            {isConnected ? "Connected" : "Not connected"}
          </span>
          {canManage && (
            <button
              onClick={() => sendCommand("RECONNECT")}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl bg-surface border border-accent/30 text-accent hover:bg-accent/5 text-xs font-bold disabled:opacity-50"
            >
              Reconnect
            </button>
          )}
          {canManage && isConnected && (
            <button
              onClick={() => setShowDisconnect(true)}
              disabled={actionLoading}
              className="px-4 py-2 rounded-xl bg-surface border border-red-400/30 text-red-500 hover:bg-red-500/5 text-xs font-bold disabled:opacity-50"
            >
              Disconnect
            </button>
          )}
          {canManage && !isConnected && (
            <button
              onClick={() => sendCommand("CONNECT")}
              disabled={actionLoading}
              className="px-5 py-2 rounded-xl bg-accent hover:bg-accent-2 text-white text-xs font-bold shadow-md shadow-accent/25 disabled:opacity-50"
            >
              Connect WhatsApp
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-4 bg-red-500/10 border border-red-500/25 text-red-600 text-xs font-semibold rounded-2xl flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold shrink-0">✕</button>
        </div>
      )}
      {actionSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 text-xs font-semibold rounded-2xl flex items-center justify-between gap-3">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="font-bold shrink-0">✕</button>
        </div>
      )}
      {banner && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 text-amber-700 text-xs font-semibold rounded-2xl flex items-center justify-between gap-3">
          <span>{banner.text}</span>
          <button onClick={() => setBanner(null)} className="font-bold shrink-0">✕</button>
        </div>
      )}

      {/* Connection */}
      <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-line bg-surface-2/50">
          <h2 className="text-sm font-extrabold text-fg">WhatsApp Connection</h2>
          <p className="text-[11px] text-fg-4 mt-0.5">
            One WhatsApp Web session for the whole studio. Pair once from this page.
          </p>
        </div>

        <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500" : meta.dot}`} />
              <span className={`text-sm font-extrabold ${meta.tone}`}>{meta.label}</span>
            </div>

            {!state?.worker_online && (
              <p className="text-[11px] text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                The WhatsApp worker is offline. Nothing can be sent until it is
                deployed and heartbeating. See <code>worker/README.md</code>.
              </p>
            )}

            <dl className="text-[11px] space-y-1.5">
              {[
                ["Connected number", isConnected ? state?.connected_phone ?? "—" : "—"],
                ["Connected at", fmtDateTime(state?.connected_at)],
                ["Last connected", fmtDateTime(state?.last_connected_at)],
                ["Last disconnected", fmtDateTime(state?.last_disconnected_at)],
                ["Worker heartbeat", fmtDateTime(state?.worker_heartbeat_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-fg-4">{label}</dt>
                  <dd className="font-mono text-fg-2 text-right break-all">{value}</dd>
                </div>
              ))}
            </dl>

            {(status === "LOGGED_OUT" || status === "ERROR") && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-2">
                <p className="text-[11px] font-bold text-red-600">
                  {status === "LOGGED_OUT"
                    ? "The WhatsApp session has expired."
                    : "The WhatsApp connection reported an error."}
                </p>
                {state?.last_error && (
                  <p className="text-[11px] text-red-600/90 break-words">
                    {state.last_error}
                    {state.last_error_at ? ` (${fmtDateTime(state.last_error_at)})` : ""}
                  </p>
                )}
                <p className="text-[11px] text-fg-3">
                  Reconnect and scan the new QR code to resume messaging.
                </p>
                {canManage && (
                  <button
                    onClick={() => sendCommand("RECONNECT")}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-accent text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Reconnect WhatsApp
                  </button>
                )}
              </div>
            )}

            {(status === "DISCONNECTED" && !state?.last_error) && (
              <p className="text-[11px] text-fg-3">
                Automated messages are paused. Bookings, cancellations and
                attendance are unaffected.
              </p>
            )}
          </div>

          {/* QR panel */}
          <div className="flex flex-col items-center justify-center p-4 bg-surface-2/40 rounded-2xl border border-line min-h-[280px]">
            {isConnected ? (
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-green-500/15 text-green-600 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-extrabold text-green-600">WhatsApp Connected</p>
                <p className="text-[11px] text-fg-4">
                  {state?.connected_phone
                    ? `Paired as ${state.connected_phone}`
                    : "Paired"}
                </p>
              </div>
            ) : status === "CONNECTING" ? (
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-fg">Connecting to WhatsApp…</p>
                <p className="text-[11px] text-fg-4 max-w-[260px]">
                  The worker is starting a session. A QR code will appear here
                  automatically.
                </p>
              </div>
            ) : qrDataUrl ? (
              <div className="text-center space-y-2">
                <p className="text-xs font-bold text-fg">WhatsApp Not Connected</p>
                <p className="text-[11px] text-fg-4">
                  Scan this QR code using WhatsApp on your phone
                </p>
                <img
                  src={qrDataUrl}
                  alt="WhatsApp pairing QR code"
                  className="w-[260px] h-[260px] rounded-xl border border-line bg-white p-2"
                />
                <p className="text-[11px] font-bold text-text-gold">
                  {qrSecondsLeft !== null && qrSecondsLeft > 0
                    ? `Waiting for WhatsApp scan… ${qrSecondsLeft}s`
                    : "Waiting for WhatsApp scan…"}
                </p>
                <ol className="text-[11px] text-fg-4 text-left space-y-0.5 max-w-[280px]">
                  <li>1. Open WhatsApp on your phone</li>
                  <li>2. Go to Settings → Linked Devices</li>
                  <li>3. Tap “Link a Device” and scan this code</li>
                </ol>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-hover text-fg-4 flex items-center justify-center mx-auto">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.964 9.964 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-fg">
                  {status === "QR_REQUIRED" ? "Waiting for QR code…" : "WhatsApp Not Connected"}
                </p>
                <p className="text-[11px] text-fg-4 max-w-[260px]">
                  {state?.last_error
                    ? state.last_error
                    : "Press Connect WhatsApp to generate a pairing QR code. It refreshes automatically."}
                </p>
                {canManage && (
                  <button
                    onClick={() => sendCommand(status === "QR_REQUIRED" ? "RECONNECT" : "CONNECT")}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-accent text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    {status === "QR_REQUIRED" ? "Generate new QR" : "Connect WhatsApp"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Health */}
      <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-line bg-surface-2/50">
          <h2 className="text-sm font-extrabold text-fg">Integration Health</h2>
          <p className="text-[11px] text-fg-4 mt-0.5">
            Live delivery counters. No session credentials are exposed here.
          </p>
        </div>
        <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["WhatsApp status", isConnected ? "Connected" : meta.label],
            ["Messages sent", String(health?.messages_sent ?? 0)],
            ["Pending", String(health?.messages_pending ?? 0)],
            ["Failed", String(health?.messages_failed ?? 0)],
            ["Last successful connection", fmtDateTime(state?.last_connected_at)],
            ["Last message", health?.last_message ? `${health.last_message.template_key} → ${health.last_message.member_name ?? health.last_message.phone}` : "—"],
            ["Last message at", fmtDateTime(health?.last_message?.at)],
            ["Last worker execution", fmtDateTime(state?.worker_heartbeat_at)],
          ].map(([label, value]) => (
            <div key={label} className="p-3 rounded-2xl bg-surface-2/50 border border-line">
              <p className="text-[10px] uppercase tracking-wider text-fg-5 font-bold">{label}</p>
              <p className="text-xs font-extrabold text-fg mt-1 break-words">{value}</p>
            </div>
          ))}
        </div>
        {health?.last_failure && (
          <div className="px-5 pb-5">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] font-bold text-red-600">
                Last failure · {health.last_failure.template_key} · {fmtDateTime(health.last_failure.at)}
              </p>
              <p className="text-[11px] text-red-600/90 break-words mt-0.5">
                {health.last_failure.error ?? "No detail recorded."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Templates + editor */}
      <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-line bg-surface-2/50">
          <h2 className="text-sm font-extrabold text-fg">Message Templates</h2>
          <p className="text-[11px] text-fg-4 mt-0.5">
            Each business event has its own template. Changes apply to new messages only.
          </p>
        </div>

        <div className="divide-y divide-line">
          {templates.length === 0 && (
            <p className="text-xs text-fg-4 px-5 py-6 text-center">
              No templates found. Run migration 056 to seed them.
            </p>
          )}
          {templates.map((tpl) => (
            <div key={tpl.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-fg">{tpl.template_name}</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      tpl.is_enabled
                        ? "text-green-600 bg-green-500/10 border-green-500/20"
                        : "text-fg-4 bg-hover border-line"
                    }`}
                  >
                    {tpl.is_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {tpl.description && (
                  <p className="text-[11px] text-fg-4 mt-0.5">{tpl.description}</p>
                )}
                {tpl.template_key === "class_reminder" && (
                  <p className="text-[11px] text-accent mt-1">
                    {tpl.offset_minutes ?? state?.reminder_minutes ?? 45} minutes before class
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleTemplate(tpl)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 rounded-xl border border-line bg-surface-2 text-fg text-xs font-bold hover:bg-hover disabled:opacity-50"
                  >
                    {tpl.is_enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => openEditor(tpl)}
                    className="px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Editor */}
        {editingKey && editingTemplate && (
          <div className="border-t border-line bg-surface-2/40 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-extrabold text-fg">
                Edit · {editingTemplate.template_name}
              </h3>
              <button onClick={closeEditor} className="text-xs font-bold text-fg-4 hover:text-fg">
                Close
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                Template name
              </label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-line bg-surface text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {editingKey === "class_reminder" && (
              <div>
                <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                  Send this many minutes before class
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {REMINDER_CHOICES.map((m) => (
                    <button
                      key={m}
                      onClick={() => setDraftOffset(m)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                        draftOffset === m
                          ? "bg-accent text-white border-accent"
                          : "bg-surface border-line text-fg-3 hover:bg-hover"
                      }`}
                    >
                      {m} min
                    </button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={draftOffset}
                    onChange={(e) => setDraftOffset(Number(e.target.value))}
                    className="w-20 px-3 py-1.5 rounded-xl border border-line bg-surface text-xs font-bold text-fg"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                Message
              </label>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={9}
                maxLength={MAX_TEMPLATE_LENGTH}
                className="w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-sm text-fg font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-fg-5">
                  {draftBody.length}/{MAX_TEMPLATE_LENGTH}
                </span>
                {editorValidation && !editorValidation.valid && (
                  <span className="text-[11px] font-bold text-red-600">
                    {editorValidation.issues.length} problem(s)
                  </span>
                )}
                {editorValidation?.valid && (
                  <span className="text-[11px] font-bold text-green-600">Valid</span>
                )}
              </div>
            </div>

            {(templateIssues.length > 0 ||
              (editorValidation && editorValidation.issues.length > 0)) && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 space-y-1">
                {(templateIssues.length
                  ? templateIssues
                  : editorValidation?.issues ?? []
                ).map((issue, i) => (
                  <p key={i} className="text-[11px] font-bold text-red-600">
                    {issue.message}
                  </p>
                ))}
              </div>
            )}

            <div>
              <p className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                Available variables
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARIABLES_BY_KEY[editingKey].map((v) => (
                  <button
                    key={v}
                    onClick={() => setDraftBody((b) => `${b}{{${v}}}`)}
                    title={usedVars.includes(v) ? "Used in this message" : "Click to insert"}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border ${
                      usedVars.includes(v)
                        ? "bg-accent/10 border-accent/30 text-accent font-bold"
                        : "bg-surface border-line text-fg-4 hover:border-accent/40"
                    }`}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-fg-5 mt-1.5">
                Highlighted variables are used in this message. All of them must
                resolve from real records or the message will not be sent.
              </p>
            </div>

            {/* Preview */}
            <div className="p-4 rounded-2xl bg-surface border border-line">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">
                  Preview
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={testMemberId}
                    onChange={(e) => setTestMemberId(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-line bg-surface-2 text-[11px] font-semibold text-fg max-w-[190px]"
                  >
                    <option value="">Select a real member…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={requestPreview}
                    disabled={previewing}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    {previewing ? "Building…" : "Refresh"}
                  </button>
                </div>
              </div>

              {previewError && (
                <p className="text-[11px] font-bold text-red-600">{previewError}</p>
              )}

              {preview ? (
                <div className="space-y-2">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-fg bg-surface-2/60 border border-line rounded-xl p-3">
                    {preview.text}
                  </pre>
                  <p className="text-[10px] text-fg-5">
                    Rendered from {String(preview.meta.member ?? "—")}
                    {preview.meta.has_booking
                      ? ` · ${String(preview.meta.class_name ?? "")} (${String(preview.meta.booking_id ?? "")})`
                      : " · this member has no booking yet, so class fields cannot resolve"}
                  </p>
                </div>
              ) : (
                !previewError && (
                  <p className="text-[11px] text-fg-4">
                    Pick an approved member and press Refresh. Preview uses their real
                    class details — no sample data.
                  </p>
                )
              )}
            </div>

            {canManage && (
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-line">
                <button
                  onClick={closeEditor}
                  className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-fg hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  disabled={actionLoading || !editorValidation?.valid}
                  className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 disabled:opacity-50"
                >
                  {actionLoading ? "Saving…" : "Save Template"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Reminder timer */}
      <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-line bg-surface-2/50">
          <h2 className="text-sm font-extrabold text-fg">Reminder Timer</h2>
          <p className="text-[11px] text-fg-4 mt-0.5">
            Runs server-side in the WhatsApp worker on Asia/Kolkata time. Closing this
            page does not stop reminders.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-line cursor-pointer">
            <input
              type="checkbox"
              checked={state?.reminder_enabled ?? false}
              onChange={(e) => saveReminderSettings({ reminder_enabled: e.target.checked })}
              disabled={!canManage || actionLoading}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-xs font-bold text-fg">Class reminder enabled</span>
          </label>

          <div>
            <p className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-2">
              Send reminder
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {REMINDER_CHOICES.map((m) => (
                <button
                  key={m}
                  onClick={() => saveReminderSettings({ reminder_minutes: m })}
                  disabled={!canManage || actionLoading}
                  className={`px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                    state?.reminder_minutes === m
                      ? "bg-accent text-white border-accent"
                      : "bg-surface border-line text-fg-3 hover:bg-hover"
                  }`}
                >
                  [{m}] minutes before class
                </button>
              ))}
            </div>
            <p className="text-[10px] text-fg-5 mt-2">
              The class reminder template override (if set) takes precedence over this
              default.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[11px] font-bold text-fg-3 uppercase tracking-wider">
              Max send attempts
            </label>
            {[1, 2, 3, 5].map((n) => (
              <button
                key={n}
                onClick={() => saveReminderSettings({ max_send_attempts: n })}
                disabled={!canManage || actionLoading}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                  state?.max_send_attempts === n
                    ? "bg-accent text-white border-accent"
                    : "bg-surface border-line text-fg-3 hover:bg-hover"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="text-[10px] text-fg-5">
              After this many failures a message is marked FAILED and never retried.
            </span>
          </div>
        </div>
      </section>

      {/* Test message */}
      {canSend && (
        <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-line bg-surface-2/50">
            <h2 className="text-sm font-extrabold text-fg">Send Test Message</h2>
            <p className="text-[11px] text-fg-4 mt-0.5">
              Goes to exactly one real, explicitly selected member. There is no
              broadcast option.
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                  Member
                </label>
                <select
                  value={testMemberId}
                  onChange={(e) => setTestMemberId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 text-xs font-semibold text-fg"
                >
                  <option value="">-- Choose an approved member --</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} · {m.phone_display ?? "no valid number"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-fg-3 uppercase tracking-wider mb-1.5">
                  Template
                </label>
                <select
                  value={testTemplateKey}
                  onChange={(e) => setTestTemplateKey(e.target.value as TemplateKey)}
                  className="w-full px-3 py-2 rounded-xl border border-line bg-surface-2 text-xs font-semibold text-fg"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.template_key} disabled={!t.is_enabled}>
                      {t.template_name}
                      {t.is_enabled ? "" : " (disabled)"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={prepareTest}
                disabled={actionLoading || !testMemberId}
                className="px-5 py-2.5 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 disabled:opacity-50"
              >
                Send Test Message
              </button>
            </div>
          </div>
        </section>
      )}

      {/* History */}
      <section className="bg-surface rounded-3xl border border-line shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-line bg-surface-2/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-fg">Message History</h2>
            <p className="text-[11px] text-fg-4 mt-0.5">
              Every queued message with its real delivery outcome.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {["ALL", "SENT", "PENDING", "PROCESSING", "FAILED", "CANCELLED"].map((s) => (
              <button
                key={s}
                onClick={() => setHistoryFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                  historyFilter === s
                    ? "bg-accent text-white border-accent"
                    : "bg-surface-2 border-line text-fg-3 hover:bg-hover"
                }`}
              >
                {s === "ALL" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {jobs.length === 0 ? (
          <p className="text-xs text-fg-4 px-5 py-8 text-center">
            No messages here yet.
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-2 border-b border-line text-fg-2 font-extrabold uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-5">Member</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Attempts</th>
                    <th className="py-3.5 px-4">Sent / Failed</th>
                    <th className="py-3.5 px-5">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-semibold text-fg">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-surface-2/70 transition-colors">
                      <td className="py-4 px-5">
                        <p className="font-bold truncate max-w-[180px]">
                          {job.member_name ?? "—"}
                        </p>
                        <p className="text-[10px] text-fg-5 font-mono truncate max-w-[180px]">
                          {job.id.slice(0, 8)}
                        </p>
                      </td>
                      <td className="py-4 px-4 font-mono text-fg-2 whitespace-nowrap">
                        {job.recipient_phone}
                      </td>
                      <td className="py-4 px-4 text-fg-3 whitespace-nowrap">
                        {job.template_key.replace(/_/g, " ")}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-1 rounded-full border whitespace-nowrap ${
                            JOB_STATUS_TONE[job.status] ?? "text-fg-4 bg-hover border-line"
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-fg-3">{job.attempt_count}</td>
                      <td className="py-4 px-4 text-fg-3 whitespace-nowrap">
                        {fmtDateTime(job.sent_at ?? job.failed_at ?? job.scheduled_for)}
                      </td>
                      <td className="py-4 px-5 text-[11px] text-fg-4 max-w-[240px] break-words">
                        {job.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden divide-y divide-line">
              {jobs.map((job) => (
                <div key={job.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-fg truncate">
                      {job.member_name ?? "—"}
                    </p>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        JOB_STATUS_TONE[job.status] ?? "text-fg-4 bg-hover border-line"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-fg-3">
                    {job.recipient_phone} · {job.template_key.replace(/_/g, " ")}
                  </p>
                  <p className="text-[10px] text-fg-4">
                    Attempts {job.attempt_count} · {fmtDateTime(job.sent_at ?? job.failed_at)}
                  </p>
                  {job.error_message && (
                    <p className="text-[10px] text-red-600 break-words">{job.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Disconnect confirmation */}
      {showDisconnect && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-fg">Disconnect WhatsApp?</h3>
            <p className="text-xs text-fg-3">
              Automated WhatsApp messages will stop until WhatsApp is connected again.
              Bookings, cancellations, classes and attendance are unaffected.
            </p>
            <p className="text-[11px] text-fg-4">
              Templates, timer settings and message history are all preserved.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDisconnect(false)}
                className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-fg hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowDisconnect(false);
                  await sendCommand("DISCONNECT");
                }}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test send confirmation */}
      {testConfirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-surface rounded-3xl border border-line shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-extrabold text-fg">Send this message to:</h3>
            <div className="p-3 rounded-xl bg-surface-2 border border-line space-y-1">
              <p className="text-sm font-bold text-fg">{testConfirm.member_name}</p>
              <p className="text-sm font-mono text-accent">{testConfirm.phone_display ?? "No valid number"}</p>
              <p className="text-[11px] text-fg-4">
                Template: {testTemplateKey.replace(/_/g, " ")}
              </p>
            </div>
            {testConfirm.warning && (
              <p className="text-[11px] font-bold text-red-600">{testConfirm.warning}</p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setTestConfirm(null)}
                className="px-4 py-2 rounded-xl border border-line text-xs font-bold text-fg hover:bg-hover"
              >
                Cancel
              </button>
              <button
                onClick={confirmTest}
                disabled={testSending || !testConfirm.phone_valid}
                className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-2 disabled:opacity-50"
              >
                {testSending ? "Queueing…" : "Send Test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
