"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageList, type ChatMessageUI, type ToolCall } from "./message-list";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";
import { Pencil, Check, X } from "lucide-react";

interface ChatInterfaceProps {
  collections: Array<{ name: string; label: string }>;
  activeSiteId: string;
  visible?: boolean;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export function ChatInterface({ collections, activeSiteId, visible }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [siteName, setSiteName] = useState("your site");
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
      abortRef.current = null;

      // Save conversation
      saveConversation(conversationId, updatedMessages);
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
      {/* History drawer — left side panel */}
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
              position: "fixed", top: 0, left: 0, bottom: 0, width: "300px", zIndex: 999,
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
                conversations.map((c) => (
                  <HistoryItem
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    updatedAt={c.updatedAt}
                    isActive={c.id === conversationId}
                    onLoad={() => loadConversation(c.id)}
                    onRename={(newTitle) => renameConversation(c.id, newTitle)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Main content area */}
      {hasMessages ? (
        <MessageList messages={messages} isThinking={isThinking} />
      ) : (
        <WelcomeScreen siteName={siteName} onSuggestionClick={handleSuggestionClick} />
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isThinking} visible={visible} />
    </div>
  );
}

function HistoryItem({ id, title, updatedAt, isActive, onLoad, onRename }: {
  id: string; title: string; updatedAt: string; isActive: boolean;
  onLoad: () => void; onRename: (t: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

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

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        borderBottom: "1px solid var(--border)",
        backgroundColor: isActive ? "var(--muted)" : "transparent",
      }}
      className="hover:bg-muted transition-colors"
    >
      <button
        onClick={onLoad}
        style={{
          flex: 1, textAlign: "left", padding: "10px 16px",
          border: "none", backgroundColor: "transparent",
          cursor: "pointer", color: "var(--foreground)",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
          {new Date(updatedAt).toLocaleString("da-DK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        title="Rename"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--muted-foreground)", padding: "8px 12px",
          opacity: 0.5,
        }}
        className="hover:opacity-100"
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
      >
        <Pencil style={{ width: "12px", height: "12px" }} />
      </button>
    </div>
  );
}
