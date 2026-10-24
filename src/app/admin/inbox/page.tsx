"use client";

import { useEffect, useState, useRef, useCallback } from "react";

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

function formatTime(isoStr: string | null | undefined): string {
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

function formatDateHeader(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();

    if (isToday) return "Today";

    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return "";
  }
}

export default function AdminWhatsAppInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyWindow, setReplyWindow] = useState<ReplyWindow | null>(null);
  const [activeContact, setActiveContact] = useState<{ name: string | null; phone: string; formattedPhone: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const selectedPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch conversations list
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/whatsapp/conversations", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.warn("Failed to fetch conversations:", err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // 2. Fetch messages for the currently selected conversation
  const fetchMessagesForPhone = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${phone}/messages`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // Only apply if the phone is still selected
        if (selectedPhoneRef.current === phone) {
          setMessages(data.messages || []);
          setReplyWindow(data.replyWindow || null);
          setActiveContact({
            name: data.member?.name || null,
            phone: data.phone,
            formattedPhone: data.formattedPhone,
          });
        }
      }
    } catch (err) {
      console.warn("Failed to fetch messages:", err);
    }
  }, []);

  // Polling loop every 5 seconds
  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      await fetchConversations();
    };
    if (mounted) {
      loadInitial();
    }

    const interval = setInterval(() => {
      fetchConversations();
      if (selectedPhoneRef.current) {
        fetchMessagesForPhone(selectedPhoneRef.current);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchConversations, fetchMessagesForPhone]);

  // When a conversation is clicked
  const handleSelectConversation = async (c: Conversation) => {
    setSelectedPhone(c.phone);
    setSendError(null);
    setLoadingChat(true);
    setActiveContact({
      name: c.memberName,
      phone: c.phone,
      formattedPhone: c.formattedPhone,
    });

    // Optimistically clear unread badge in list
    setConversations((prev) =>
      prev.map((item) => (item.phone === c.phone ? { ...item, unreadCount: 0 } : item))
    );

    await fetchMessagesForPhone(c.phone);
    setLoadingChat(false);
    setTimeout(scrollToBottom, 100);
  };

  // Send reply message
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhone || !replyText.trim() || sending) return;

    setSending(true);
    setSendError(null);
    const textToSend = replyText.trim();

    try {
      const res = await fetch(`/api/admin/whatsapp/conversations/${selectedPhone}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSend }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setSendError(data.error || "Failed to send message. Please try again.");
      } else {
        setReplyText("");
        // Instantly reload messages
        await fetchMessagesForPhone(selectedPhone);
        await fetchConversations();
        setTimeout(scrollToBottom, 50);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error. Please try again.";
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen bg-canvas overflow-hidden">
      {/* Top Header */}
      <div className="border-b border-line bg-surface px-4 py-3 sm:px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-600 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.964 9.964 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-fg">WhatsApp Inbox</h1>
            <p className="text-xs text-fg-3">Read and answer member WhatsApp messages</p>
          </div>
        </div>

        <button
          onClick={() => {
            fetchConversations();
            if (selectedPhone) fetchMessagesForPhone(selectedPhone);
          }}
          className="text-xs font-semibold text-fg-3 hover:text-fg bg-surface border border-line px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          title="Refresh messages"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.038 8.038 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column: Conversation List */}
        <div
          className={`w-full md:w-80 lg:w-96 border-r border-line bg-surface flex flex-col ${
            selectedPhone ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-line bg-bar/50">
            <p className="text-xs font-semibold text-fg-3 uppercase tracking-wider">
              Conversations ({conversations.length})
            </p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {loadingList && conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-fg-4">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-fg-4 space-y-2">
                <p>No WhatsApp messages yet.</p>
                <p className="text-xs text-fg-3">Inbound member replies and outbound reminders will appear here.</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = selectedPhone === c.phone;
                return (
                  <button
                    key={c.phone}
                    onClick={() => handleSelectConversation(c)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 hover:bg-hover ${
                      isSelected ? "bg-accent/10 border-l-4 border-accent" : ""
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-accent/15 text-accent font-bold flex items-center justify-center shrink-0 text-sm">
                      {c.memberName ? c.memberName.charAt(0).toUpperCase() : "#"}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <p className="text-sm font-bold text-fg truncate">
                          {c.memberName || c.formattedPhone}
                        </p>
                        <span className="text-[11px] text-fg-4 shrink-0">
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </div>

                      {c.memberName && (
                        <p className="text-[11px] text-fg-4 font-mono mb-1 truncate">
                          {c.formattedPhone}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-fg-3 truncate">
                          {c.lastMessagePreview || "No message content"}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {c.unreadCount}
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

        {/* Right column: Chat View */}
        <div
          className={`flex-1 flex flex-col bg-canvas ${
            selectedPhone ? "flex" : "hidden md:flex"
          }`}
        >
          {selectedPhone ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-line bg-surface p-3 sm:px-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedPhone(null)}
                    className="md:hidden p-1.5 -ml-1 text-fg-3 hover:text-fg rounded-lg"
                    aria-label="Back to conversations"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="w-9 h-9 rounded-full bg-accent text-white font-bold flex items-center justify-center text-sm shrink-0">
                    {activeContact?.name ? activeContact.name.charAt(0).toUpperCase() : "#"}
                  </div>

                  <div>
                    <h2 className="text-sm font-bold text-fg">
                      {activeContact?.name || activeContact?.formattedPhone}
                    </h2>
                    <p className="text-xs text-fg-3 font-mono">
                      {activeContact?.formattedPhone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Messages Scroll Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                {loadingChat && messages.length === 0 ? (
                  <div className="text-center py-10 text-sm text-fg-4">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-sm text-fg-4">
                    No messages in this conversation yet.
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isOutbound = m.direction === "out";
                    const isDryRun = m.status === "dry_run";
                    const isFailed = m.status === "failed";
                    const isRead = m.status === "read";
                    const isDelivered = m.status === "delivered";

                    // Show date divider if first message or date changed
                    const prevMsg = messages[idx - 1];
                    const showDate =
                      !prevMsg ||
                      formatDateHeader(m.created_at) !== formatDateHeader(prevMsg.created_at);

                    return (
                      <div key={m.id || idx} className="space-y-2">
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="text-[11px] font-semibold text-fg-4 bg-surface px-2.5 py-0.5 rounded-full border border-line">
                              {formatDateHeader(m.created_at)}
                            </span>
                          </div>
                        )}

                        <div
                          className={`flex flex-col ${
                            isOutbound ? "items-end" : "items-start"
                          }`}
                        >
                          <div
                            className={`max-w-[85%] sm:max-w-md px-4 py-2.5 rounded-2xl shadow-sm text-sm whitespace-pre-wrap ${
                              isOutbound
                                ? "bg-accent text-white rounded-tr-none"
                                : "bg-surface text-fg border border-line rounded-tl-none"
                            }`}
                          >
                            <p>{m.body}</p>

                            <div
                              className={`flex items-center justify-end gap-1.5 mt-1 text-[10px] ${
                                isOutbound ? "text-white/80" : "text-fg-4"
                              }`}
                            >
                              <span>{formatTime(m.created_at)}</span>

                              {/* Status ticks for outgoing */}
                              {isOutbound && (
                                <span className="flex items-center" title={`Status: ${m.status}`}>
                                  {isDryRun ? (
                                    <span className="bg-white/20 px-1 rounded text-[9px]">dry run</span>
                                  ) : isFailed ? (
                                    <span className="text-red-300 font-bold" title={m.error_message || "Failed"}>
                                      ✕
                                    </span>
                                  ) : isRead ? (
                                    <span className="text-sky-300 font-bold" title="Read">✓✓</span>
                                  ) : isDelivered ? (
                                    <span className="text-white/80" title="Delivered">✓✓</span>
                                  ) : (
                                    <span className="text-white/80" title="Sent">✓</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {isFailed && m.error_message && (
                            <p className="text-[11px] text-red-500 mt-1 max-w-xs text-right">
                              Send failed: {m.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input & 24h Window Banner */}
              <div className="border-t border-line bg-surface p-3 sm:p-4">
                {/* 24-hour reply window status banner */}
                <div className="mb-2">
                  {replyWindow?.allowed ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>
                        You can reply for {replyWindow.remainingHours}{" "}
                        {replyWindow.remainingHours === 1 ? "more hour" : "more hours"}.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>
                        24-hour reply window closed. You can reply after the member messages again.
                      </span>
                    </div>
                  )}
                </div>

                {sendError && (
                  <div className="mb-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 font-semibold">
                    {sendError}
                  </div>
                )}

                {/* Form input */}
                <form onSubmit={handleSendReply} className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply(e);
                        }
                      }}
                      disabled={!replyWindow?.allowed || sending}
                      placeholder={
                        replyWindow?.allowed
                          ? "Type a reply... (Enter to send, Shift+Enter for new line)"
                          : "24-hour reply window closed"
                      }
                      rows={2}
                      className="w-full resize-none admin-input px-3 py-2 text-sm placeholder:text-fg-4 disabled:opacity-50 disabled:bg-canvas disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!replyWindow?.allowed || !replyText.trim() || sending}
                    className="h-10 px-4 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Send</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      </>
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-fg-4 space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-surface border border-line flex items-center justify-center text-fg-3">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.964 9.964 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <p className="text-base font-bold text-fg">No conversation selected</p>
                <p className="text-xs text-fg-3 max-w-sm mt-1">
                  Select a member from the conversation list on the left to read their message history and reply.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
