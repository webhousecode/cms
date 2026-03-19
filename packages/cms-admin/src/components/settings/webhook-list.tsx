"use client";

import { useState } from "react";
import { Plus, Copy, ChevronUp, ChevronDown, Check, Send } from "lucide-react";

export interface WebhookEntry {
  id: string;
  url: string;
}

interface Props {
  webhooks: WebhookEntry[];
  onChange: (webhooks: WebhookEntry[]) => void;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export function WebhookList({ webhooks, onChange: onChangeRaw }: Props) {
  function onChange(w: WebhookEntry[]) {
    onChangeRaw(w);
    window.dispatchEvent(new CustomEvent("cms:settings-dirty"));
  }
  const [newUrl, setNewUrl] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);

  function add() {
    const url = newUrl.trim();
    if (!url) return;
    onChange([...webhooks, { id: uid(), url }]);
    setNewUrl("");
  }

  function remove(id: string) {
    onChange(webhooks.filter((w) => w.id !== id));
    setConfirmRemove(null);
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    const next = [...webhooks];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }

  function moveDown(idx: number) {
    if (idx >= webhooks.length - 1) return;
    const next = [...webhooks];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  async function sendTest(url: string, id: string) {
    setTesting(id);
    setTestResult(null);
    try {
      const isDiscord = url.includes("discord.com/api/webhooks");
      const isSlack = url.includes("hooks.slack.com");
      const body = isDiscord
        ? { content: "Test from webhouse.app", embeds: [{ title: "Webhook Test", description: "This webhook is configured correctly.", color: 0xF7BB2E, footer: { text: "webhouse.app" } }] }
        : isSlack
          ? { text: "*webhouse.app* — Webhook test successful." }
          : { event: "webhook.test", timestamp: new Date().toISOString(), source: "webhouse.app" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setTestResult({ id, ok: res.ok });
    } catch {
      setTestResult({ id, ok: false });
    }
    setTesting(null);
    setTimeout(() => setTestResult(null), 3000);
  }

  return (
    <div>
      {/* Existing webhooks */}
      {webhooks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.5rem" }}>
          {webhooks.map((wh, idx) => (
            <div
              key={wh.id}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem",
                padding: "0.35rem 0.5rem", borderRadius: "0.375rem",
                border: "1px solid var(--border)", background: "var(--background)",
                fontSize: "0.75rem", fontFamily: "monospace",
              }}
            >
              {/* Order number */}
              <span style={{ color: "var(--muted-foreground)", fontSize: "0.6rem", width: "1rem", textAlign: "center", flexShrink: 0 }}>
                {idx + 1}
              </span>

              {/* URL */}
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--foreground)" }}>
                {wh.url}
              </span>

              {/* Test */}
              <button
                type="button"
                onClick={() => sendTest(wh.url, wh.id)}
                disabled={testing === wh.id}
                title="Send test"
                style={{
                  display: "flex", alignItems: "center", padding: "0.15rem",
                  background: "none", border: "none", cursor: testing === wh.id ? "wait" : "pointer",
                  color: testResult?.id === wh.id
                    ? testResult.ok ? "rgb(74 222 128)" : "var(--destructive)"
                    : "var(--muted-foreground)",
                  flexShrink: 0,
                }}
              >
                {testResult?.id === wh.id
                  ? testResult.ok ? <Check style={{ width: 12, height: 12 }} /> : <span style={{ fontSize: "0.6rem" }}>fail</span>
                  : <Send style={{ width: 12, height: 12 }} />}
              </button>

              {/* Copy */}
              <button
                type="button"
                onClick={() => copyUrl(wh.url, wh.id)}
                title="Copy URL"
                style={{
                  display: "flex", alignItems: "center", padding: "0.15rem",
                  background: "none", border: "none", cursor: "pointer",
                  color: copied === wh.id ? "rgb(74 222 128)" : "var(--muted-foreground)",
                  flexShrink: 0,
                }}
              >
                {copied === wh.id ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
              </button>

              {/* Move up */}
              <button
                type="button"
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                title="Move up"
                style={{
                  display: "flex", alignItems: "center", padding: "0.15rem",
                  background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer",
                  color: idx === 0 ? "var(--border)" : "var(--muted-foreground)",
                  flexShrink: 0,
                }}
              >
                <ChevronUp style={{ width: 12, height: 12 }} />
              </button>

              {/* Move down */}
              <button
                type="button"
                onClick={() => moveDown(idx)}
                disabled={idx === webhooks.length - 1}
                title="Move down"
                style={{
                  display: "flex", alignItems: "center", padding: "0.15rem",
                  background: "none", border: "none",
                  cursor: idx === webhooks.length - 1 ? "default" : "pointer",
                  color: idx === webhooks.length - 1 ? "var(--border)" : "var(--muted-foreground)",
                  flexShrink: 0,
                }}
              >
                <ChevronDown style={{ width: 12, height: 12 }} />
              </button>

              {/* Remove */}
              {confirmRemove === wh.id ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                  <button type="button" onClick={() => remove(wh.id)}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                      border: "none", background: "var(--destructive)", color: "#fff",
                      cursor: "pointer", lineHeight: 1 }}>Yes</button>
                  <button type="button" onClick={() => setConfirmRemove(null)}
                    style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px",
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}>No</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(wh.id)}
                  title="Remove webhook"
                  style={{
                    width: "18px", height: "18px", borderRadius: "50%", border: "none",
                    background: "transparent", cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center", color: "var(--muted-foreground)",
                    fontSize: "0.9rem", lineHeight: 1, flexShrink: 0,
                  }}
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add new webhook */}
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="https://discord.com/api/webhooks/... or any URL"
          style={{
            flex: 1, padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
            border: "1px solid var(--border)", background: "var(--background)",
            color: "var(--foreground)", fontSize: "0.75rem", fontFamily: "monospace",
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newUrl.trim()}
          style={{
            display: "flex", alignItems: "center", gap: "0.25rem",
            padding: "0.4rem 0.6rem", borderRadius: "0.375rem",
            border: "1px solid var(--border)", background: "transparent",
            color: newUrl.trim() ? "var(--foreground)" : "var(--muted-foreground)",
            cursor: newUrl.trim() ? "pointer" : "default",
            fontSize: "0.75rem", flexShrink: 0,
          }}
        >
          <Plus style={{ width: 14, height: 14 }} />
          Add
        </button>
      </div>
    </div>
  );
}
