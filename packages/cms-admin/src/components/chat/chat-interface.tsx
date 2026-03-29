"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageList, type ChatMessageUI, type ToolCall } from "./message-list";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";
import { Pencil, Check, X, Trash2, MoreHorizontal, Star } from "lucide-react";

interface ChatInterfaceProps {
  collections: Array<{ name: string; label: string }>;
  activeSiteId: string;
  visible?: boolean;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  starred?: boolean;
}

export function ChatInterface({ collections, activeSiteId, visible }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingText, setThinkingText] = useState("");
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [siteName, setSiteName] = useState("your site");
  const [showHistory, setShowHistory] = useState(false);
  const [showThinking, setShowThinking] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cms-chat-show-thinking") === "true";
  });
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Listen for header button events
  useEffect(() => {
    function onNewChat() { handleNewConversation(); }
    function onToggleHist() { loadHistory(); }
    window.addEventListener("chat-new", onNewChat);
    window.addEventListener("chat-toggle-history", onToggleHist);
    return () => {
      window.removeEventListener("chat-new", onNewChat);
      window.removeEventListener("chat-toggle-history", onToggleHist);
    };
  });

  // ESC closes history drawer
  useEffect(() => {
    if (!showHistory) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowHistory(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showHistory]);

  // Fetch site name
  useEffect(() => {
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.siteName) setSiteName(d.siteName); })
      .catch(() => {});
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      // Add user message
      const userMsg: ChatMessageUI = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setIsThinking(true);
      setThinkingText("");
      setThinkingStartTime(Date.now());

      // Build API messages (only role + content)
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Create assistant message placeholder
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessageUI = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Stream response
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch("/api/cms/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abort.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Chat request failed" }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${err.error ?? "Request failed"}`, isStreaming: false }
                : m
            )
          );
          setIsThinking(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                handleSSEEvent(assistantId, eventType, parsed);
              } catch { /* skip parse errors */ }
              eventType = "";
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || "Connection lost. Please try again.", isStreaming: false }
                : m
            )
          );
        }
      }

      // Finalize streaming message
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setIsThinking(false);
      setThinkingStartTime(null);
      abortRef.current = null;

      // Save conversation (use ref to get latest messages including streamed AI response)
      saveConversation(conversationId, messagesRef.current);
    },
    [messages, conversationId]
  );

  function handleSSEEvent(assistantId: string, event: string, data: any) {
    switch (event) {
      case "text":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + (data.text ?? "") } : m
          )
        );
        break;

      case "tool_call":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const tc: ToolCall = { tool: data.tool, input: data.input, status: "running" };
            return { ...m, toolCalls: [...(m.toolCalls ?? []), tc] };
          })
        );
        break;

      case "tool_result":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = (m.toolCalls ?? []).map((tc) =>
              tc.tool === data.tool && tc.status === "running"
                ? { ...tc, result: data.result, status: "done" as const }
                : tc
            );
            return { ...m, toolCalls };
          })
        );
        break;

      case "form":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, inlineForm: data } : m
          )
        );
        break;

      case "artifact":
        setIsThinking(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, artifact: data } : m
          )
        );
        break;

      case "thinking":
        setThinkingText((prev) => prev + (data.text ?? "") + "\n");
        break;

      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + `\n\nError: ${data.message}`, isStreaming: false }
              : m
          )
        );
        break;
    }
  }

  async function saveConversation(id: string, msgs: ChatMessageUI[]) {
    const title = msgs[0]?.content.slice(0, 60) ?? "New conversation";
    try {
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title,
          messages: msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: new Date().toISOString(),
            toolCalls: m.toolCalls,
          })),
        }),
      });
    } catch { /* ignore save errors */ }
  }

  function handleNewConversation() {
    setMessages([]);
    setConversationId(crypto.randomUUID());
    setShowHistory(false);
  }

  async function loadHistory() {
    setShowHistory((v) => !v);
    if (!showHistory) {
      try {
        const res = await fetch("/api/cms/chat/conversations");
        if (res.ok) {
          const { conversations: convs } = await res.json();
          setConversations(convs ?? []);
        }
      } catch { /* ignore */ }
    }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (res.ok) {
        const { conversation } = await res.json();
        setConversationId(conversation.id);
        setMessages(
          (conversation.messages ?? []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCalls: m.toolCalls?.map((tc: any) => ({ ...tc, status: "done" })),
          }))
        );
        setShowHistory(false);
      }
    } catch { /* ignore */ }
  }

  async function renameConversation(id: string, newTitle: string) {
    try {
      // Load, rename, save
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (!res.ok) return;
      const { conversation } = await res.json();
      conversation.title = newTitle;
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c))
      );
    } catch { /* ignore */ }
  }

  async function toggleStar(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const newStarred = !conv.starred;
    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, starred: newStarred } : c))
    );
    try {
      const res = await fetch(`/api/cms/chat/conversations/${id}`);
      if (!res.ok) return;
      const { conversation } = await res.json();
      conversation.starred = newStarred;
      await fetch("/api/cms/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      });
    } catch { /* ignore */ }
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/cms/chat/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If we deleted the active conversation, start fresh
      if (id === conversationId) {
        handleNewConversation();
      }
    } catch { /* ignore */ }
  }

  const handleSuggestionClick = useCallback(
    (message: string) => {
      // If the suggestion ends with a space (e.g. "Search my content for "),
      // don't send — focus the input instead
      if (message.endsWith(" ")) {
        // We'll handle this by setting initial text — for now just send
        handleSend(message.trimEnd());
      } else {
        handleSend(message);
      }
    },
    [handleSend]
  );

  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
        backgroundColor: "var(--background)",
      }}
    >
      {/* History drawer — left side panel (ESC to close) */}
      {showHistory && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowHistory(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 998,
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          />
          {/* Drawer */}
          <div
            style={{
              position: "fixed", top: 0, left: 0, bottom: 0, width: "400px", zIndex: 999,
              background: "var(--card)", borderRight: "1px solid var(--border)",
              boxShadow: "4px 0 20px rgba(0,0,0,0.3)",
              display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Conversations</span>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "4px" }}
              >
                <X style={{ width: "16px", height: "16px" }} />
              </button>
            </div>
            {/* List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversations.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                  No previous conversations
                </div>
              ) : (
                [...conversations].sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0)).map((c) => (
                  <HistoryItem
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    updatedAt={c.updatedAt}
                    isActive={c.id === conversationId}
                    onLoad={() => loadConversation(c.id)}
                    starred={c.starred}
                    onRename={(newTitle) => renameConversation(c.id, newTitle)}
                    onDelete={() => deleteConversation(c.id)}
                    onStar={() => toggleStar(c.id)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      {hasMessages ? (
        <MessageList
          messages={messages}
          isThinking={isThinking}
          thinkingText={thinkingText}
          thinkingStartTime={thinkingStartTime}
          showThinking={showThinking}
        />
      ) : (
        <WelcomeScreen siteName={siteName} onSuggestionClick={handleSuggestionClick} />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isThinking}
        visible={visible}
        lastUserMessage={messages.filter((m) => m.role === "user").pop()?.content}
      >
        <button
          type="button"
          onClick={() => { const next = !showThinking; setShowThinking(next); localStorage.setItem("cms-chat-show-thinking", String(next)); }}
          title={showThinking ? "Hide thinking process" : "Show thinking process"}
          style={{
            display: "inline-flex", alignItems: "center", gap: "4px",
            padding: "2px 8px", borderRadius: "4px", fontSize: "0.65rem",
            border: "1px solid var(--border)", cursor: "pointer",
            background: showThinking ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
            color: showThinking ? "var(--primary)" : "var(--muted-foreground)",
            fontWeight: 500, transition: "all 150ms",
          }}
        >
          <span style={{ fontSize: "0.7rem" }}>💭</span> Thinking
        </button>
      </ChatInput>
    </div>
  );
}

function HistoryItem({ id, title, updatedAt, isActive, starred, onLoad, onRename, onDelete, onStar }: {
  id: string; title: string; updatedAt: string; isActive: boolean; starred?: boolean;
  onLoad: () => void; onRename: (t: string) => void; onDelete: () => void; onStar: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  if (editing) {
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "8px 16px", borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--muted)",
        }}
      >
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(editValue); setEditing(false); }
            if (e.key === "Escape") { setEditValue(title); setEditing(false); }
          }}
          style={{
            flex: 1, fontSize: "0.8rem", padding: "4px 6px", borderRadius: "4px",
            border: "1px solid var(--border)", backgroundColor: "var(--background)",
            color: "var(--foreground)", outline: "none", fontFamily: "inherit",
          }}
        />
        <button onClick={() => { onRename(editValue); setEditing(false); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgb(74 222 128)", padding: "2px" }}>
          <Check style={{ width: "14px", height: "14px" }} />
        </button>
        <button onClick={() => { setEditValue(title); setEditing(false); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: "2px" }}>
          <X style={{ width: "14px", height: "14px" }} />
        </button>
      </div>
    );
  }

  const menuItemStyle = {
    display: "flex", alignItems: "center", gap: "8px", width: "100%",
    padding: "7px 12px", border: "none", background: "transparent",
    color: "var(--foreground)", cursor: "pointer", fontSize: "0.75rem",
    borderRadius: "4px", textAlign: "left" as const,
  };

  return (
    <div
      style={{
        display: "flex", alignItems: "center", position: "relative",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isActive ? "var(--muted)" : "transparent",
      }}
      className="hover:bg-muted transition-colors"
    >
      {starred && (
        <Star style={{ width: "10px", height: "10px", color: "#F7BB2E", fill: "#F7BB2E", flexShrink: 0, marginLeft: "10px" }} />
      )}
      <button
        onClick={onLoad}
        style={{
          flex: 1, textAlign: "left", padding: starred ? "10px 8px 10px 6px" : "10px 16px",
          border: "none", backgroundColor: "transparent",
          cursor: "pointer", color: "var(--foreground)",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 500, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
          {title}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
          {new Date(updatedAt).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </button>

      {/* More button */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setConfirmDelete(false); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted-foreground)", padding: "8px 10px",
          opacity: menuOpen ? 1 : 0.4, flexShrink: 0,
          transition: "opacity 150ms",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.opacity = "0.4"; }}
      >
        <MoreHorizontal style={{ width: "14px", height: "14px" }} />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          style={{
            position: "absolute", top: "100%", right: "8px", zIndex: 10,
            background: "var(--card)", border: "1px solid var(--border)",
            borderRadius: "8px", padding: "4px", minWidth: "140px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); setMenuOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Star style={{ width: "13px", height: "13px", ...(starred ? { color: "#F7BB2E", fill: "#F7BB2E" } : {}) }} />
            {starred ? "Unstar" : "Star"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setEditing(true); }}
            style={menuItemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Pencil style={{ width: "13px", height: "13px" }} />
            Rename
          </button>
          {confirmDelete ? (
            <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 12px" }}>
              <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Delete?</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "none", background: "var(--destructive)", color: "#fff",
                  cursor: "pointer", lineHeight: 1 }}>Yes</button>
              <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              style={{ ...menuItemStyle, color: "var(--destructive)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Trash2 style={{ width: "13px", height: "13px" }} />
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
