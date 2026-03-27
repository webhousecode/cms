"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { MessageList, type ChatMessageUI, type ToolCall } from "./message-list";
import { ChatInput } from "./chat-input";
import { WelcomeScreen } from "./welcome-screen";
import { Plus, History, X } from "lucide-react";

interface ChatInterfaceProps {
  collections: Array<{ name: string; label: string }>;
  activeSiteId: string;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export function ChatInterface({ collections, activeSiteId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [siteName, setSiteName] = useState("your site");
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
        backgroundColor: "var(--background)",
      }}
    >
      {/* Chat toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "4px",
          padding: "4px 16px",
          borderBottom: hasMessages ? "1px solid var(--border)" : "none",
        }}
      >
        <button
          onClick={handleNewConversation}
          title="New conversation (Cmd+Shift+N)"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--muted-foreground)",
            padding: "6px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.75rem",
          }}
          className="hover:text-foreground hover:bg-muted transition-colors"
        >
          <Plus style={{ width: "14px", height: "14px" }} />
          New
        </button>
        <button
          onClick={loadHistory}
          title="Conversation history"
          style={{
            background: showHistory ? "var(--muted)" : "none",
            border: "none",
            cursor: "pointer",
            color: showHistory ? "var(--foreground)" : "var(--muted-foreground)",
            padding: "6px",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "0.75rem",
          }}
          className="hover:text-foreground hover:bg-muted transition-colors"
        >
          <History style={{ width: "14px", height: "14px" }} />
          History
        </button>
      </div>

      {/* History panel */}
      {showHistory && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "240px",
            overflowY: "auto",
            backgroundColor: "var(--card)",
          }}
        >
          {conversations.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
              No previous conversations
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: c.id === conversationId ? "var(--muted)" : "transparent",
                  cursor: "pointer",
                  color: "var(--foreground)",
                }}
                className="hover:bg-muted transition-colors"
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.title}
                </div>
                <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: "2px" }}>
                  {new Date(c.updatedAt).toLocaleDateString()}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Main content area */}
      {hasMessages ? (
        <MessageList messages={messages} isThinking={isThinking} />
      ) : (
        <WelcomeScreen siteName={siteName} onSuggestionClick={handleSuggestionClick} />
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isThinking} autoFocus />
    </div>
  );
}
