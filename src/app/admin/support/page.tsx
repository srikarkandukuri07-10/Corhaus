"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  category: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "In Progress" | "Waiting for Corhaus" | "Resolved" | "Closed";
  created_by: string;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  last_updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

interface Message {
  id: string;
  ticket_id: string;
  sender_type: "client" | "developer";
  sender_id: string;
  message: string;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  read_at: string | null;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

const CATEGORIES = [
  "Bug Report",
  "Feature Request",
  "UI Improvement",
  "Performance",
  "Billing",
  "Automation",
  "Other",
];

const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
const STATUS_FILTERS = ["All", "Open", "In Progress", "Waiting for Corhaus", "Resolved", "Closed"];

const EMOJIS = ["👍", "🙌", "❤️", "😊", "🚀", "⚡", "🐛", "✅", "⚠️", "❌", "📌", "💬"];

export default function SupportCenterPage() {
  const supabase = createClient();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // New Ticket Modal State
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("Bug Report");
  const [newPriority, setNewPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");
  const [newDescription, setNewDescription] = useState("");
  const [newAttachment, setNewAttachment] = useState<File | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);

  // Chat Input State
  const [inputMessage, setInputMessage] = useState("");
  const [chatAttachment, setChatAttachment] = useState<File | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalFileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom of message thread
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch Tickets List
  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/tickets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error("Failed to fetch tickets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Messages for Selected Ticket
  const fetchMessages = useCallback(async (ticketId: string) => {
    try {
      setMessagesLoading(true);
      const res = await fetch(`/api/support/tickets/${ticketId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.ticket) {
          setSelectedTicket((prev) => (prev?.id === ticketId ? { ...prev, ...data.ticket } : data.ticket));
        }
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Real-time Subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("support-center-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => {
        fetchTickets();
        if (selectedTicket) fetchMessages(selectedTicket.id);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, (payload) => {
        fetchTickets();
        if (selectedTicket && payload.new && (payload.new as any).ticket_id === selectedTicket.id) {
          fetchMessages(selectedTicket.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchTickets, fetchMessages, selectedTicket]);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Select Ticket Handler
  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    fetchMessages(ticket.id);
  };

  // Upload file helper
  const uploadFile = async (file: File): Promise<{ url: string; fileName: string } | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/support/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        return { url: data.url, fileName: data.fileName };
      }
    } catch (err) {
      console.error("File upload error:", err);
    }
    return null;
  };

  // Create Ticket Handler
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) return;

    setCreatingTicket(true);
    let attachmentUrl = null;
    let attachmentName = null;

    if (newAttachment) {
      const uploaded = await uploadFile(newAttachment);
      if (uploaded) {
        attachmentUrl = uploaded.url;
        attachmentName = uploaded.fileName;
      }
    }

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: newSubject,
          category: newCategory,
          priority: newPriority,
          description: newDescription,
          attachmentUrl,
          attachmentName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setShowNewTicketModal(false);
        setNewSubject("");
        setNewDescription("");
        setNewAttachment(null);
        await fetchTickets();
        if (data.ticket) {
          handleSelectTicket(data.ticket);
        }
      }
    } catch (err) {
      console.error("Failed to create ticket:", err);
    } finally {
      setCreatingTicket(false);
    }
  };

  // Send Message Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTicket || (!inputMessage.trim() && !chatAttachment)) return;

    setSendingMessage(true);
    let attachmentUrl = null;
    let attachmentName = null;

    if (chatAttachment) {
      const uploaded = await uploadFile(chatAttachment);
      if (uploaded) {
        attachmentUrl = uploaded.url;
        attachmentName = uploaded.fileName;
      }
    }

    try {
      const res = await fetch("/api/support/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selectedTicket.id,
          message: inputMessage,
          attachmentUrl,
          attachmentName,
        }),
      });

      if (res.ok) {
        setInputMessage("");
        setChatAttachment(null);
        setShowEmojiPicker(false);
        fetchMessages(selectedTicket.id);
        fetchTickets();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSendingMessage(false);
    }
  };

  // Client Ticket Actions (Accept Resolution / Still Having Issue)
  const handleTicketAction = async (action: "accept_resolution" | "still_having_issue") => {
    if (!selectedTicket) return;

    try {
      const res = await fetch(`/api/support/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.ok) {
        fetchMessages(selectedTicket.id);
        fetchTickets();
      }
    } catch (err) {
      console.error("Failed to execute ticket action:", err);
    }
  };

  // Filter & Search Tickets
  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== "All" && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.ticket_number.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Open":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "In Progress":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "Waiting for Corhaus":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "Resolved":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "Closed":
        return "bg-gray-500/10 text-gray-400 border-gray-500/20";
      default:
        return "bg-surface-2 text-fg-3 border-line";
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case "Critical":
        return "bg-red-500/15 text-red-400 border-red-500/30";
      case "High":
        return "bg-orange-500/15 text-orange-400 border-orange-500/30";
      case "Medium":
        return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-surface-2 text-fg-4 border-line";
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col font-sans max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-fg tracking-tight">
            Corhaus <span className="text-accent">Support Center</span>
          </h1>
          <p className="text-xs text-fg-3 mt-1 font-medium">
            Real-time developer chat, feature requests, and issue resolution
          </p>
        </div>
        <button
          onClick={() => setShowNewTicketModal(true)}
          className="px-5 py-2.5 bg-accent text-white font-extrabold text-xs rounded-2xl hover:bg-accent-2 transition-all shadow-md shadow-accent/20 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Raise Ticket
        </button>
      </div>

      {/* Main 2-Panel Chat Layout */}
      <div className="flex-1 bg-surface rounded-3xl border border-line overflow-hidden flex flex-col md:flex-row shadow-sm min-h-0">
        {/* Left Panel: Ticket List & Search */}
        <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-line flex flex-col flex-shrink-0 bg-surface-2/30">
          {/* Search & Filters */}
          <div className="p-4 border-b border-line space-y-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by Ticket ID or Subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {STATUS_FILTERS.map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                    statusFilter === st
                      ? "bg-accent text-white shadow-xs"
                      : "bg-surface-2 border border-line text-fg-3 hover:bg-hover"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket List */}
          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {loading ? (
              <div className="p-8 text-center text-xs text-fg-4 font-semibold">Loading support tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-fg-4 space-y-2">
                <p className="font-bold">No tickets found</p>
                <p className="text-[11px]">Click &quot;Raise Ticket&quot; above to submit an issue or request.</p>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = selectedTicket?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTicket(t)}
                    className={`w-full text-left p-4 transition-all flex flex-col gap-2 relative ${
                      isSelected
                        ? "bg-accent/10 border-l-4 border-l-accent"
                        : "hover:bg-surface-2/60"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-xs text-accent tracking-wide">{t.ticket_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(t.status)}`}>
                        {t.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-xs text-fg line-clamp-1">{t.subject}</h4>

                    {t.last_message && (
                      <p className="text-[11px] text-fg-3 line-clamp-1 font-medium">{t.last_message}</p>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-fg-4 font-semibold pt-1">
                      <span className={`px-1.5 py-0.5 rounded border ${getPriorityBadgeClass(t.priority)}`}>
                        {t.priority}
                      </span>
                      <span>
                        {t.last_message_at
                          ? new Date(t.last_message_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                          : ""}
                      </span>
                    </div>

                    {t.unread_count > 0 && (
                      <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                        {t.unread_count}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Panel: Selected Ticket Thread */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface">
          {selectedTicket ? (
            <>
              {/* Ticket Header */}
              <div className="p-4 border-b border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-2/20 flex-shrink-0">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-accent tracking-wider">{selectedTicket.ticket_number}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadgeClass(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getPriorityBadgeClass(selectedTicket.priority)}`}>
                      {selectedTicket.priority} Priority
                    </span>
                    <span className="text-[10px] text-fg-4 font-medium">&bull; Category: {selectedTicket.category}</span>
                  </div>
                  <h2 className="text-base font-extrabold text-fg mt-1">{selectedTicket.subject}</h2>
                </div>

                <div className="text-[11px] text-fg-4 font-semibold text-right">
                  Created {new Date(selectedTicket.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>

              {/* Client Confirmation Action Banner (When status is Resolved) */}
              {selectedTicket.status === "Resolved" && (
                <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs flex-shrink-0">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>The developer marked this ticket as Resolved. Please confirm if the issue is resolved.</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleTicketAction("accept_resolution")}
                      className="px-4 py-2 bg-emerald-600 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-700 transition-all shadow-xs"
                    >
                      ✓ Accept Resolution
                    </button>
                    <button
                      onClick={() => handleTicketAction("still_having_issue")}
                      className="px-4 py-2 bg-rose-600/80 text-white font-extrabold text-xs rounded-xl hover:bg-rose-700 transition-all shadow-xs"
                    >
                      ⚠️ Still Having Issue
                    </button>
                  </div>
                </div>
              )}

              {/* Read-only Banner for Closed Tickets */}
              {selectedTicket.status === "Closed" && (
                <div className="p-3 bg-surface-2 border-b border-line text-center text-xs font-bold text-fg-4 flex-shrink-0">
                  🔒 This ticket is closed and read-only.
                </div>
              )}

              {/* Chat Thread Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messagesLoading ? (
                  <div className="p-8 text-center text-xs text-fg-4 font-semibold">Loading messages...</div>
                ) : (
                  messages.map((m) => {
                    const isClient = m.sender_type === "client";
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isClient ? "items-end" : "items-start"} space-y-1`}
                      >
                        <div className="flex items-center gap-2 text-[10px] text-fg-4 font-bold px-1">
                          <span>{isClient ? "Corhaus Team" : "Developer (Srikar)"}</span>
                          <span>&bull;</span>
                          <span>{new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>

                        <div
                          className={`max-w-lg p-3.5 rounded-2xl text-xs space-y-2 shadow-xs ${
                            isClient
                              ? "bg-accent text-white rounded-tr-xs"
                              : "bg-surface-2 border border-line text-fg rounded-tl-xs"
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>

                          {/* Attachment Rendering */}
                          {m.attachment_url && (
                            <div className="pt-2 border-t border-white/20">
                              {m.attachment_url.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                                <a href={m.attachment_url} target="_blank" rel="noreferrer" className="block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={m.attachment_url}
                                    alt="Attachment"
                                    className="max-h-48 rounded-xl object-cover border border-black/10 hover:opacity-90 transition-opacity"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={m.attachment_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`inline-flex items-center gap-2 p-2 rounded-xl text-xs font-bold ${
                                    isClient ? "bg-black/20 text-white" : "bg-surface border border-line text-accent"
                                  }`}
                                >
                                  📎 {m.attachment_name || "Download Attachment"}
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Read status indicator */}
                        <div className="text-[9px] text-fg-4 font-semibold px-1">
                          {isClient && (m.read_at ? "✓✓ Read" : "✓ Delivered")}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              {selectedTicket.status !== "Closed" && (
                <form onSubmit={handleSendMessage} className="p-3 border-t border-line bg-surface-2/30 flex flex-col gap-2 flex-shrink-0">
                  {/* Selected Attachment Preview */}
                  {chatAttachment && (
                    <div className="flex items-center justify-between p-2 bg-surface border border-line rounded-xl text-xs text-fg">
                      <span className="font-semibold truncate">📎 {chatAttachment.name}</span>
                      <button
                        type="button"
                        onClick={() => setChatAttachment(null)}
                        className="text-fg-4 hover:text-red-400 font-bold ml-2"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Emoji Quick Picker */}
                  {showEmojiPicker && (
                    <div className="flex items-center gap-2 p-2 bg-surface border border-line rounded-xl overflow-x-auto">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            setInputMessage((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="text-base hover:scale-125 transition-transform"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="p-2 rounded-xl text-fg-4 hover:text-fg hover:bg-surface-2 transition-all text-sm"
                      title="Add Emoji"
                    >
                      😊
                    </button>

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-xl text-fg-4 hover:text-fg hover:bg-surface-2 transition-all"
                      title="Attach File"
                    >
                      📎
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => setChatAttachment(e.target.files?.[0] || null)}
                      className="hidden"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                    />

                    <input
                      type="text"
                      placeholder="Type a reply..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      className="flex-1 p-2.5 rounded-xl border border-line-2 bg-surface-2 text-xs text-fg placeholder:text-fg-4 focus:outline-none focus:ring-1 focus:ring-accent"
                    />

                    <button
                      type="submit"
                      disabled={sendingMessage || (!inputMessage.trim() && !chatAttachment)}
                      className="px-4 py-2.5 bg-accent text-white font-extrabold text-xs rounded-xl hover:bg-accent-2 transition-all shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <span>Send</span>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-fg-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center text-xl font-bold">
                💬
              </div>
              <div>
                <h3 className="font-extrabold text-fg text-sm">Select a ticket to start chatting</h3>
                <p className="text-xs text-fg-4 mt-1">Choose a ticket from the left panel or raise a new one.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-extrabold text-fg">Raise Support Ticket</h3>
              <button
                onClick={() => setShowNewTicketModal(false)}
                className="w-8 h-8 rounded-full bg-surface-2 hover:bg-accent/10 text-fg-3 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-fg mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="Brief summary of the issue or request"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-fg mb-1">Category *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-fg mb-1">Priority *</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-fg mb-1">Description *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Provide detailed information about your bug report or feature request..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-line-2 bg-surface-2 text-fg focus:ring-1 focus:ring-accent focus:outline-none resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-fg mb-1">Attachment (Optional - Image / PDF / Doc)</label>
                <div
                  onClick={() => modalFileInputRef.current?.click()}
                  className="p-4 border-2 border-dashed border-line-2 hover:border-accent rounded-2xl bg-surface-2/50 text-center cursor-pointer transition-colors"
                >
                  {newAttachment ? (
                    <span className="font-bold text-accent">📎 {newAttachment.name}</span>
                  ) : (
                    <span className="text-fg-4 font-medium">Click to select screenshot or document</span>
                  )}
                </div>
                <input
                  type="file"
                  ref={modalFileInputRef}
                  onChange={(e) => setNewAttachment(e.target.files?.[0] || null)}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.txt"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-5 py-2.5 border border-line-2 rounded-xl font-bold text-fg hover:bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTicket}
                  className="px-6 py-2.5 bg-accent text-white font-extrabold rounded-xl hover:bg-accent-2 shadow-md shadow-accent/20 disabled:opacity-50"
                >
                  {creatingTicket ? "Raising Ticket..." : "Raise Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
