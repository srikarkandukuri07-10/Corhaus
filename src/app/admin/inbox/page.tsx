"use client";

import { useEffect, useState, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface Conversation {
  phone: string;
  formattedPhone: string;
  memberId: string | null;
  memberName: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  unreadCount: number;
}

interface Message {
  id: string;
  wa_message_id?: string | null;
  direction: "in" | "out";
  phone: string;
  type: string;
  body: string | null;
  template_name?: string | null;
  status: "dry_run" | "queued" | "sent" | "delivered" | "read" | "failed" | "received";
  error_code?: string | null;
  error_message?: string | null;
  created_at: string;
  wa_timestamp?: string | null;
}

interface ReplyWindow {
  allowed: boolean;
  remainingHours: number;
  lastInboundAt: string | null;
}

interface ActiveContact {
  id?: string | null;
  name: string | null;
  phone: string;
  formattedPhone: string;
  email?: string | null;
}

// ─── DATE & TIME HELPERS ─────────────────────────────────────────────────────

function formatMessageTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return "";
  }
}

function formatConversationTime(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = new Date();

    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return formatMessageTime(isoStr);
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(d);
    }
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
    }).format(d);
  } catch {
    return "";
  }
}

function formatDateHeader(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "TODAY";
    if (diffDays === 1) return "YESTERDAY";

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    })
      .format(d)
      .toUpperCase();
  } catch {
    return "";
  }
}

function calculateWindowRemaining(lastInboundAt: string | null | undefined): {
  allowed: boolean;
  text: string;
} {
  if (!lastInboundAt) {
    return { allowed: false, text: "Reply window closed" };
  }
  const lastTime = new Date(lastInboundAt).getTime();
  const diffMs = Date.now() - lastTime;
  const totalWindowMs = 24 * 60 * 60 * 1000;
  const remainingMs = totalWindowMs - diffMs;

  if (remainingMs <= 0) {
    return { allowed: false, text: "24h window closed" };
  }

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return {
      allowed: true,
      text: `${hours}h ${minutes}m remaining`,
    };
  }
  return {
    allowed: true,
    text: `${minutes}m remaining`,
  };
}

function parseHumanMessage(body: string | null | undefined): { isTemplate: boolean; templateLabel?: string; text: string } {
  if (!body) return { isTemplate: false, text: "" };

  if (body.startsWith("[Template:") || body.startsWith("[Test] Template:")) {
    const headerEnd = body.indexOf("]");
    const templateName = body.slice(body.indexOf("Template:") + 9, headerEnd).trim();
    const paramsStr = body.slice(headerEnd + 1).trim();

    const params: Record<string, string> = {};
    paramsStr.split(",").forEach((part) => {
      const eq = part.indexOf("=");
      if (eq > 0) {
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1).trim();
        params[k] = v;
      }
    });

    if (templateName.includes("class_booking_reminder") || templateName.includes("class_reminder")) {
      const member = params.member_name || "there";
      const cls = params.class_name || "class";
      const date = params.class_date || "Today";
      const time = params.class_time ? ` at ${params.class_time}` : "";
      const trainer = params.trainer_name ? ` with trainer ${params.trainer_name}` : "";
      const loc = params.location_name ? ` at ${params.location_name}` : "";
      return {
        isTemplate: true,
        templateLabel: "Class Reminder",
        text: `Hi ${member}! This is a reminder for your upcoming ${cls} scheduled for ${date}${time}${trainer}${loc}. We look forward to seeing you!`,
      };
    }

    if (templateName.includes("booking") || templateName.includes("confirmed")) {
      const member = params.member_name || "there";
      const cls = params.class_name || "class";
      const date = params.class_date || "Today";
      const time = params.class_time ? ` at ${params.class_time}` : "";
      return {
        isTemplate: true,
        templateLabel: "Booking Confirmed",
        text: `Hi ${member}! Your booking for ${cls} on ${date}${time} has been confirmed. See you at the studio!`,
      };
    }

    if (templateName.includes("payment") || templateName.includes("receipt")) {
      const member = params.member_name || "there";
      const invoice = params.invoice_number ? ` (Inv #${params.invoice_number})` : "";
      const amount = params.amount ? ` of ${params.amount}` : "";
      return {
        isTemplate: true,
        templateLabel: "Payment Receipt",
        text: `Hi ${member}! Thank you for your payment${amount}${invoice}. Your receipt has been generated and confirmed.`,
      };
    }

    if (templateName === "hello_world") {
      return {
        isTemplate: true,
        templateLabel: "Test Message",
        text: "Hello World! This is a test message from Corhaus Pilates via Meta WhatsApp Cloud API.",
      };
    }

    const paramLines = Object.entries(params)
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .join("\n");
    return {
      isTemplate: true,
      templateLabel: templateName.replace(/_/g, " "),
      text: paramLines || body,
    };
  }

  return { isTemplate: false, text: body };
}

function WhatsAppFormattedText({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <span className="whitespace-pre-wrap break-words leading-relaxed">
      {lines.map((line, lIdx) => {
        const parts = line.split(/(\*.*?\*|_.*?_|~.*?~|https?:\/\/[^\s]+)/g);
        return (
          <span key={lIdx}>
            {parts.map((part, pIdx) => {
              if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
                return <strong key={pIdx} className="font-bold">{part.slice(1, -1)}</strong>;
              }
              if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
                return <em key={pIdx} className="italic">{part.slice(1, -1)}</em>;
              }
              if (part.startsWith("~") && part.endsWith("~") && part.length > 2) {
                return <del key={pIdx} className="line-through opacity-80">{part.slice(1, -1)}</del>;
              }
              if (part.startsWith("http://") || part.startsWith("https://")) {
                return (
                  <a
                    key={pIdx}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-blue-600 dark:text-blue-400 hover:opacity-80 break-all"
                  >
                    {part}
                  </a>
                );
              }
              return part;
            })}
            {lIdx < lines.length - 1 && "\n"}
          </span>
        );
      })}
    </span>
  );
}

// ─── AVATAR COLOR GENERATOR ──────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-emerald-600 text-white",
  "bg-teal-600 text-white",
  "bg-cyan-700 text-white",
  "bg-blue-600 text-white",
  "bg-indigo-600 text-white",
  "bg-violet-600 text-white",
  "bg-amber-600 text-white",
  "bg-rose-600 text-white",
];

function getAvatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ─── INNER INBOX COMPONENT ───────────────────────────────────────────────────

function AdminWhatsAppInboxInner() {
  const searchParams = useSearchParams();
  const queryPhone = searchParams.get("phone");
  const queryName = searchParams.get("name");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyWindow, setReplyWindow] = useState<ReplyWindow | null>(null);
  const [activeContact, setActiveContact] = useState<ActiveContact | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "unread">("all");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [showMemberDetails, setShowMemberDetails] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const selectedPhoneRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceFromBottom > 150);
  }, []);

  // 1. Fetch conversations list
  const fetchConversations = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingList(true);
    try {
      const res = await fetch("/api/admin/whatsapp/conversations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.warn("Failed to fetch conversations:", err);
    } finally {
      if (!isSilent) setLoadingList(false);
    }
  }, []);

  // 2. Fetch messages for currently selected conversation
  const fetchMessagesForPhone = useCallback(async (phone: string, isSilent = false) => {
    if (!isSilent) setLoadingChat(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${phone}/messages`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (selectedPhoneRef.current === phone) {
          setMessages(data.messages || []);
          setReplyWindow(data.replyWindow || null);
          setActiveContact((prev) => ({
            id: data.member?.id || prev?.id || null,
            name: data.member?.name || prev?.name || null,
            phone: data.phone,
            formattedPhone: data.formattedPhone,
            email: data.member?.email || prev?.email || null,
          }));
        }
      }
    } catch (err) {
      console.warn("Failed to fetch messages:", err);
    } finally {
      if (!isSilent) setLoadingChat(false);
    }
  }, []);

  // Initial load and polling loop (every 5 seconds)
  useEffect(() => {
    let mounted = true;
    fetchConversations(false);

    const interval = setInterval(() => {
      if (mounted) {
        fetchConversations(true);
        if (selectedPhoneRef.current) {
          fetchMessagesForPhone(selectedPhoneRef.current, true);
        }
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchConversations, fetchMessagesForPhone]);

  // Deep linking via query param (?phone=...&name=...)
  useEffect(() => {
    if (!queryPhone) return;
    const rawDigits = queryPhone.replace(/\D/g, "");
    if (!rawDigits) return;

    const targetDigits = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits;
    const last10 = rawDigits.slice(-10);

    // Format display phone
    const formatted = rawDigits.length === 10
      ? `+91 ${rawDigits.slice(0, 5)} ${rawDigits.slice(5)}`
      : `+${rawDigits}`;

    // Look for match in existing conversations
    const matched = conversations.find((c) => c.phone === targetDigits || c.phone.endsWith(last10));

    if (matched) {
      setSelectedPhone(matched.phone);
      setActiveContact({
        id: matched.memberId,
        name: matched.memberName || queryName || null,
        phone: matched.phone,
        formattedPhone: matched.formattedPhone,
      });
      fetchMessagesForPhone(matched.phone, false);
    } else {
      // Synthesize new conversation draft item
      const draftConv: Conversation = {
        phone: targetDigits,
        formattedPhone: formatted,
        memberId: null,
        memberName: queryName || null,
        lastInboundAt: null,
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: "Draft conversation",
        unreadCount: 0,
      };

      setConversations((prev) => {
        if (prev.some((c) => c.phone === targetDigits || c.phone.endsWith(last10))) return prev;
        return [draftConv, ...prev];
      });

      setSelectedPhone(targetDigits);
      setActiveContact({
        id: null,
        name: queryName || null,
        phone: targetDigits,
        formattedPhone: formatted,
      });
      fetchMessagesForPhone(targetDigits, false);
    }
  }, [queryPhone, queryName, conversations.length, fetchMessagesForPhone]);

  // When clicking a conversation
  const handleSelectConversation = async (c: Conversation) => {
    setSelectedPhone(c.phone);
    setSendError(null);
    setReplyText("");
    setShowMemberDetails(false);
    setShowTemplateMenu(false);
    setActiveContact({
      id: c.memberId,
      name: c.memberName,
      phone: c.phone,
      formattedPhone: c.formattedPhone,
    });

    // Optimistically zero unread badge
    setConversations((prev) =>
      prev.map((item) => (item.phone === c.phone ? { ...item, unreadCount: 0 } : item))
    );

    await fetchMessagesForPhone(c.phone, false);
    setTimeout(() => scrollToBottom(false), 50);
  };

  // Send message
  const handleSendReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPhone || !replyText.trim() || sending) return;

    const textToSend = replyText.trim();
    setSending(true);
    setSendError(null);

    // Optimistic message append
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: Message = {
      id: tempId,
      direction: "out",
      phone: selectedPhone,
      type: "text",
      body: textToSend,
      status: "queued",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setReplyText("");
    setTimeout(() => scrollToBottom(true), 50);

    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${selectedPhone}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSend }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setSendError(data.error || "Failed to send message. Please try again.");
        // Rollback optimistic message or mark failed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, status: "failed", error_message: data.error } : m
          )
        );
      } else {
        await fetchMessagesForPhone(selectedPhone, true);
        await fetchConversations(true);
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setSendError(msg);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed", error_message: msg } : m))
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  // Send approved WhatsApp template (works even when 24h window is closed)
  const handleSendTemplate = async (templateEvent: string) => {
    if (!selectedPhone || sending) return;
    setSending(true);
    setSendError(null);
    setShowTemplateMenu(false);

    const contactName = activeContact?.name?.replace(/\s*\((Trial|Lead)\)/, "").trim() || "there";
    const defaultParams: Record<string, string> = {
      member_name: contactName,
      class_name: "Pilates Session",
      class_date: "Upcoming",
      class_time: "Scheduled Time",
      trainer_name: "Corhaus Instructor",
      location_name: "Corhaus Studio",
      invoice_number: `INV-${Date.now().toString().slice(-6)}`,
      amount: "Rs. 1,000",
    };

    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${selectedPhone}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: templateEvent,
          params: defaultParams,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setSendError(data.error || "Failed to send template message.");
      } else {
        await fetchMessagesForPhone(selectedPhone, true);
        await fetchConversations(true);
        setTimeout(() => scrollToBottom(true), 50);
      }
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSending(false);
    }
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (activeFilter === "unread" && c.unreadCount === 0) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const nameMatch = c.memberName?.toLowerCase().includes(q);
      const phoneMatch = c.phone.includes(q) || c.formattedPhone.toLowerCase().includes(q);
      const previewMatch = c.lastMessagePreview.toLowerCase().includes(q);
      return nameMatch || phoneMatch || previewMatch;
    });
  }, [conversations, activeFilter, searchQuery]);

  const totalUnreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  }, [conversations]);

  const windowRemaining = calculateWindowRemaining(replyWindow?.lastInboundAt);

  return (
    <div className="w-full h-[calc(100dvh-130px)] min-h-[580px] max-h-[920px] rounded-2xl border border-line-2 bg-surface shadow-sm overflow-hidden flex flex-col md:flex-row relative">
      {/* ──────────────────────────────────────────────────────────────────────────
          LEFT PANE: CONVERSATION LIST (WhatsApp Style)
      ────────────────────────────────────────────────────────────────────────── */}
      <div
        className={`w-full md:w-80 lg:w-96 flex flex-col border-r border-line bg-surface shrink-0 h-full ${
          selectedPhone ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header Bar */}
        <div className="h-16 px-4 bg-surface-2/80 border-b border-line flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <WhatsAppIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-fg leading-tight">WhatsApp Chats</h1>
              <p className="text-[11px] text-fg-3">Official Cloud API</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                fetchConversations(false);
                if (selectedPhone) fetchMessagesForPhone(selectedPhone, false);
              }}
              title="Refresh conversations"
              className="w-8 h-8 rounded-full flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface transition-colors"
            >
              <svg className={`w-4 h-4 ${loadingList ? "animate-spin text-emerald-600" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.038 8.038 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 border-b border-line bg-surface space-y-2 shrink-0">
          <div className="relative flex items-center">
            <svg className="w-4 h-4 text-fg-4 absolute left-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full bg-surface-2 border border-line-2 rounded-xl pl-9 pr-8 py-1.5 text-xs text-fg placeholder:text-fg-4 focus:outline-none focus:border-emerald-600 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-fg-4 hover:text-fg text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                activeFilter === "all"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg border border-line"
              }`}
            >
              All ({conversations.length})
            </button>
            <button
              onClick={() => setActiveFilter("unread")}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeFilter === "unread"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-surface-2 text-fg-3 hover:text-fg border border-line"
              }`}
            >
              <span>Unread</span>
              {totalUnreadCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    activeFilter === "unread"
                      ? "bg-white text-emerald-700"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  {totalUnreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Conversations Scroll List */}
        <div className="flex-1 overflow-y-auto divide-y divide-line/60">
          {loadingList && conversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-fg-4 space-y-2">
              <div className="w-5 h-5 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin mx-auto" />
              <p>Loading WhatsApp conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-xs text-fg-4 space-y-1.5">
              <div className="w-10 h-10 rounded-full bg-surface-2 text-fg-4 flex items-center justify-center mx-auto mb-2">
                <WhatsAppIcon className="w-5 h-5 opacity-40" />
              </div>
              <p className="font-semibold text-fg">No conversations found</p>
              <p className="text-fg-4 text-[11px]">
                {searchQuery ? "Try a different search term" : "Click WhatsApp on any member, trial member, or lead to start."}
              </p>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = selectedPhone === c.phone;
              const hasUnread = (c.unreadCount || 0) > 0;
              const avatarBg = getAvatarColor(c.memberName || c.phone);

              return (
                <button
                  key={c.phone}
                  onClick={() => handleSelectConversation(c)}
                  className={`w-full text-left px-3.5 py-3 transition-colors flex items-center gap-3 relative ${
                    isSelected
                      ? "bg-surface-2 border-l-4 border-emerald-600 shadow-2xs"
                      : "hover:bg-hover active:bg-surface-2"
                  }`}
                >
                  {/* Contact Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-12 h-12 rounded-full ${avatarBg} font-bold flex items-center justify-center text-sm shadow-2xs`}
                    >
                      {c.memberName ? c.memberName.charAt(0).toUpperCase() : "#"}
                    </div>
                    {/* Member badge dot */}
                    {c.memberId && (
                      <span
                        className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-surface rounded-full"
                        title="Approved Studio Member"
                      />
                    )}
                  </div>

                  {/* Conversation Meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p
                        className={`text-sm truncate ${
                          hasUnread ? "font-bold text-fg" : "font-semibold text-fg"
                        }`}
                      >
                        {c.memberName || c.formattedPhone}
                      </p>
                      <span
                        className={`text-[11px] shrink-0 font-medium ${
                          hasUnread ? "text-emerald-600 font-bold" : "text-fg-4"
                        }`}
                      >
                        {formatConversationTime(c.lastMessageAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-xs truncate leading-snug ${
                          hasUnread ? "text-fg font-semibold" : "text-fg-3"
                        }`}
                      >
                        {parseHumanMessage(c.lastMessagePreview).text || "No message content"}
                      </p>

                      {hasUnread && (
                        <span className="shrink-0 bg-emerald-600 text-white text-[11px] font-bold rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center shadow-xs">
                          {c.unreadCount > 99 ? "99+" : c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          RIGHT PANE: CHAT CANVAS (Authentic WhatsApp Look & Feel)
      ────────────────────────────────────────────────────────────────────────── */}
      <div
        className={`flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative h-full overflow-hidden ${
          selectedPhone ? "flex" : "hidden md:flex"
        }`}
      >
        {selectedPhone ? (
          <>
            {/* WhatsApp Top Header Bar */}
            <div className="h-16 px-4 bg-surface border-b border-line flex items-center justify-between shrink-0 shadow-2xs z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setSelectedPhone(null)}
                  className="md:hidden p-1.5 -ml-1 text-fg-3 hover:text-fg rounded-lg"
                  aria-label="Back to conversations"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Avatar */}
                <div
                  className={`w-10 h-10 rounded-full ${getAvatarColor(
                    activeContact?.name || activeContact?.phone || ""
                  )} font-bold flex items-center justify-center text-sm shadow-xs shrink-0 cursor-pointer`}
                  onClick={() => setShowMemberDetails((v) => !v)}
                >
                  {activeContact?.name ? activeContact.name.charAt(0).toUpperCase() : "#"}
                </div>

                <div
                  className="min-w-0 cursor-pointer"
                  onClick={() => setShowMemberDetails((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-fg truncate">
                      {activeContact?.name || activeContact?.formattedPhone}
                    </h2>
                    {activeContact?.id && (
                      <span className="hidden sm:inline-block text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.2 rounded-full">
                        Member
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-fg-4 truncate flex items-center gap-1.5">
                    <span>{activeContact?.formattedPhone}</span>
                    {replyWindow && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${windowRemaining.allowed ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                        • {windowRemaining.text}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchMessagesForPhone(selectedPhone, false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors"
                  title="Reload messages"
                >
                  <svg className={`w-4 h-4 ${loadingChat ? "animate-spin text-emerald-600" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.038 8.038 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                <button
                  onClick={() => setShowMemberDetails((v) => !v)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    showMemberDetails
                      ? "bg-emerald-600 text-white"
                      : "text-fg-3 hover:text-fg hover:bg-surface-2"
                  }`}
                  title="Contact info"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12c0 4.418-4.03 8-9 8a9.964 9.964 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Chat Body & Messages Canvas */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* WhatsApp Messages Scrollable Area */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-3 relative"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0.02) 1px, transparent 1px)`,
                  backgroundSize: "20px 20px",
                }}
              >
                {loadingChat && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-2 text-xs text-fg-4">
                    <div className="w-6 h-6 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
                    <p>Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-white/70 dark:bg-surface/70 border border-line flex items-center justify-center text-fg-4">
                      <WhatsAppIcon className="w-6 h-6 opacity-40 text-emerald-600" />
                    </div>
                    <p className="text-xs font-semibold text-fg">No message history yet</p>
                    <p className="text-[11px] text-fg-4 max-w-xs">
                      Send a message or template below to begin conversation with this contact.
                    </p>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isOutbound = m.direction === "out";
                    const isDryRun = m.status === "dry_run";
                    const isFailed = m.status === "failed";
                    const isRead = m.status === "read";
                    const isDelivered = m.status === "delivered";
                    const isQueued = m.status === "queued";

                    // Date divider pill
                    const prevMsg = messages[idx - 1];
                    const showDate =
                      !prevMsg || formatDateHeader(m.created_at) !== formatDateHeader(prevMsg.created_at);

                    return (
                      <div key={m.id || idx} className="space-y-2">
                        {showDate && (
                          <div className="flex justify-center my-3 sticky top-2 z-10">
                            <span className="text-[10px] font-bold text-fg-3 uppercase tracking-wider bg-white/90 dark:bg-surface/90 px-3 py-1 rounded-lg border border-line shadow-2xs backdrop-blur-xs">
                              {formatDateHeader(m.created_at)}
                            </span>
                          </div>
                        )}

                        <div className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}>
                          {/* Bubble Container */}
                          <div
                            className={`max-w-[85%] sm:max-w-[70%] md:max-w-[62%] px-3.5 py-2 shadow-2xs text-xs sm:text-[13px] leading-relaxed relative ${
                              isOutbound
                                ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-2xl rounded-tr-xs"
                                : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] border border-line/60 rounded-2xl rounded-tl-xs"
                            }`}
                          >
                            {/* Automated Template indicator */}
                            {m.template_name && (
                              <div className="mb-1 pb-1 border-b border-black/10 dark:border-white/10 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                                <span>⚡ Automated Template:</span>
                                <span className="font-mono truncate">{m.template_name}</span>
                              </div>
                            )}

                            {/* Message Body */}
                            {(() => {
                              const parsed = parseHumanMessage(m.body);
                              return (
                                <>
                                  {parsed.isTemplate && parsed.templateLabel && (
                                    <div className="mb-1 pb-1 border-b border-black/10 dark:border-white/10 flex items-center gap-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                                      <span>⚡ {parsed.templateLabel}</span>
                                    </div>
                                  )}
                                  <WhatsAppFormattedText text={parsed.text} />
                                </>
                              );
                            })()}

                            {/* Timestamp & Status Ticks */}
                            <div className="flex items-center justify-end gap-1 mt-1 -mb-0.5 text-[10px] select-none text-[#667781] dark:text-[#8696a0]">
                              <span>{formatMessageTime(m.created_at || m.wa_timestamp)}</span>

                              {isOutbound && (
                                <span className="flex items-center ml-0.5">
                                  {isDryRun ? (
                                    <span className="bg-black/10 dark:bg-white/10 px-1 rounded text-[9px] font-mono">
                                      dry-run
                                    </span>
                                  ) : isFailed ? (
                                    <span
                                      className="text-red-500 font-bold text-[11px]"
                                      title={m.error_message || "Message delivery failed"}
                                    >
                                      ✕
                                    </span>
                                  ) : isQueued ? (
                                    <span title="Queued">⏱</span>
                                  ) : isRead ? (
                                    <span className="text-[#53bdeb] font-bold text-[11px]" title="Read">
                                      ✓✓
                                    </span>
                                  ) : isDelivered ? (
                                    <span className="text-[#667781] dark:text-[#8696a0] font-bold text-[11px]" title="Delivered">
                                      ✓✓
                                    </span>
                                  ) : (
                                    <span className="text-[#667781] dark:text-[#8696a0] font-bold text-[11px]" title="Sent">
                                      ✓
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Failure Error Tag */}
                          {isFailed && m.error_message && (
                            <p className="text-[10px] text-red-500 font-medium mt-1 max-w-xs text-right">
                              Delivery error: {m.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollBottom && (
                <button
                  onClick={() => scrollToBottom(true)}
                  className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-surface border border-line-2 shadow-md flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface-2 transition-all z-20"
                  title="Scroll to latest messages"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </button>
              )}

              {/* Member Quick Info Slideout Drawer */}
              {showMemberDetails && (
                <div className="w-72 sm:w-80 border-l border-line bg-surface p-4 flex flex-col justify-between shrink-0 h-full overflow-y-auto animate-slide-left z-20 shadow-md">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-line">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-fg">Contact Details</h3>
                      <button
                        onClick={() => setShowMemberDetails(false)}
                        className="text-fg-4 hover:text-fg text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="text-center py-2 space-y-1">
                      <div
                        className={`w-16 h-16 rounded-full mx-auto ${getAvatarColor(
                          activeContact?.name || activeContact?.phone || ""
                        )} text-xl font-bold flex items-center justify-center shadow-xs`}
                      >
                        {activeContact?.name ? activeContact.name.charAt(0).toUpperCase() : "#"}
                      </div>
                      <h4 className="text-sm font-bold text-fg pt-1">
                        {activeContact?.name || activeContact?.formattedPhone}
                      </h4>
                      <p className="text-xs text-fg-4 font-mono">{activeContact?.formattedPhone}</p>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-surface-2 border border-line">
                        <span className="text-[10px] uppercase font-bold text-fg-4 block">Status</span>
                        <span className="font-semibold text-fg">
                          {activeContact?.id ? "Active Studio Member" : "Non-member / Inquiry"}
                        </span>
                      </div>

                      {activeContact?.email && (
                        <div className="p-2.5 rounded-xl bg-surface-2 border border-line">
                          <span className="text-[10px] uppercase font-bold text-fg-4 block">Email</span>
                          <span className="font-semibold text-fg break-all">{activeContact.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {activeContact?.id && (
                    <div className="pt-4 border-t border-line">
                      <Link
                        href={`/admin/members/${activeContact.id}/history`}
                        className="w-full py-2 px-3 rounded-xl bg-accent text-white text-xs font-bold text-center block hover:bg-accent-2 transition-colors shadow-xs"
                      >
                        View Full Member Profile &rarr;
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* WhatsApp Input Bar */}
            <div className="border-t border-line bg-surface p-2.5 sm:p-3 shrink-0 shadow-xs z-10 space-y-2">
              {/* Window Closed / Quick Template Notice */}
              {replyWindow && !replyWindow.allowed && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <span className="font-bold">⚠️ 24h Window Closed</span>
                    <span className="text-[11px] text-fg-3 hidden sm:inline">• Send an approved template to re-open</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => handleSendTemplate("class_reminder")}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors shadow-2xs"
                    >
                      ⚡ Class Reminder
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => handleSendTemplate("booking_confirmed")}
                      className="px-2.5 py-1 rounded-lg bg-surface-2 border border-line hover:bg-hover text-fg font-bold text-[11px] transition-colors"
                    >
                      ⚡ Confirmation
                    </button>
                  </div>
                </div>
              )}

              {sendError && (
                <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 font-semibold flex items-center justify-between">
                  <span>{sendError}</span>
                  <button onClick={() => setSendError(null)} className="text-red-500 font-bold ml-2">✕</button>
                </div>
              )}

              {/* Chat Input Pill (WhatsApp Style) */}
              <form onSubmit={handleSendReply} className="flex items-end gap-2 relative">
                {/* Template menu popup */}
                {showTemplateMenu && (
                  <div className="absolute bottom-full mb-2 left-0 w-64 bg-surface border border-line rounded-2xl shadow-xl p-2 space-y-1 z-30">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-fg-4 px-2 py-1">Quick Templates</p>
                    <button
                      type="button"
                      onClick={() => handleSendTemplate("class_reminder")}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-fg hover:bg-surface-2 transition-colors flex items-center justify-between"
                    >
                      <span>⚡ Class Reminder</span>
                      <span className="text-[10px] text-fg-4 font-mono">Meta approved</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendTemplate("booking_confirmed")}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-fg hover:bg-surface-2 transition-colors flex items-center justify-between"
                    >
                      <span>⚡ Booking Confirmation</span>
                      <span className="text-[10px] text-fg-4 font-mono">Meta approved</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendTemplate("payment_receipt")}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-fg hover:bg-surface-2 transition-colors flex items-center justify-between"
                    >
                      <span>⚡ Payment Receipt</span>
                      <span className="text-[10px] text-fg-4 font-mono">Meta approved</span>
                    </button>
                  </div>
                )}

                {/* Templates dropdown button */}
                <button
                  type="button"
                  onClick={() => setShowTemplateMenu((v) => !v)}
                  title="Send Meta WhatsApp Template"
                  className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 transition-colors ${
                    showTemplateMenu
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-surface-2 border-line-2 text-fg-3 hover:text-fg hover:bg-surface-2/80"
                  }`}
                >
                  <span className="text-sm font-bold">⚡</span>
                </button>

                <div className="flex-1 bg-surface-2 border border-line-2 rounded-2xl flex items-center px-3 py-1.5 focus-within:border-emerald-600 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    disabled={sending}
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    rows={1}
                    className="w-full resize-none bg-transparent text-xs sm:text-sm text-fg placeholder:text-fg-4 focus:outline-none max-h-24 leading-normal disabled:opacity-50"
                  />
                </div>

                {/* Circular WhatsApp Green Send Button */}
                <button
                  type="submit"
                  disabled={!replyText.trim() || sending}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center shrink-0 shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Send message"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4 -mr-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          /* ─── EMPTY STATE (WhatsApp Web Style) ─────────────────────────── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-20 h-20 rounded-3xl bg-surface border border-line shadow-sm flex items-center justify-center text-emerald-600">
              <WhatsAppIcon className="w-10 h-10 text-emerald-600" />
            </div>

            <div className="space-y-1.5 max-w-sm">
              <h2 className="text-lg font-bold text-fg">WhatsApp for Corhaus</h2>
              <p className="text-xs text-fg-3 leading-relaxed">
                Send and receive messages with your members, trial members, and leads directly through the official WhatsApp Cloud API.
              </p>
            </div>

            <div className="pt-4 border-t border-line/60 flex items-center gap-1.5 text-[11px] text-fg-4 font-medium">
              <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Meta WhatsApp Cloud API &bull; End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN EXPORT WITH SUSPENSE BOUNDARY ──────────────────────────────────────

export default function AdminWhatsAppInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full h-[calc(100dvh-130px)] min-h-[580px] rounded-2xl border border-line-2 bg-surface flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-xs text-fg-4">Loading WhatsApp Inbox...</p>
          </div>
        </div>
      }
    >
      <AdminWhatsAppInboxInner />
    </Suspense>
  );
}
