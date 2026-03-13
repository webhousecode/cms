"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Check, X, Pencil, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface QueueItem {
  id: string;
  agentId: string;
  agentName: string;
  collection: string;
  slug: string;
  title: string;
  status: "ready" | "in_review" | "approved" | "rejected" | "published";
  generatedAt: string;
  contentData: Record<string, unknown>;
  seoScore?: number;
  costUsd: number;
  rejectionFeedback?: string;
}

type TabId = "ready" | "in_review" | "approved" | "rejected";

const TABS: { id: TabId; label: string }[] = [
  { id: "ready", label: "Klar" },
  { id: "in_review", label: "Under review" },
  { id: "approved", label: "Godkendt" },
  { id: "rejected", label: "Afvist" },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Lige nu";
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  return `${days}d siden`;
}

export default function CurationPage() {
  const [tab, setTab] = useState<TabId>("ready");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/cms/curation?status=${tab}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [tab]);

  const loadCounts = useCallback(async () => {
    const res = await fetch("/api/cms/curation?stats=true");
    if (res.ok) setCounts(await res.json());
  }, []);

  useEffect(() => {
    setLoading(true);
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  async function handleApprove(id: string) {
    await fetch(`/api/cms/curation/${id}/approve`, { method: "POST" });
    loadItems();
    loadCounts();
  }

  async function handleReject(id: string) {
    if (!rejectFeedback.trim()) return;
    await fetch(`/api/cms/curation/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: rejectFeedback }),
    });
    setRejectingId(null);
    setRejectFeedback("");
    loadItems();
    loadCounts();
  }

  function handleSpeak(item: QueueItem) {
    const text = `${item.title}. ${
      typeof item.contentData.content === "string"
        ? item.contentData.content.slice(0, 300)
        : ""
    }`;
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">
          AI
        </p>
        <h1 className="text-3xl font-bold text-foreground">Kurerings-koe</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
              tab === t.id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {(counts[t.id] ?? 0) > 0 && (
              <span className="ml-1.5 text-xs bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full">
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Indlaeser...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>Ingen items i denne kategori.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">
                      {item.agentName}
                    </span>
                    <Badge variant="secondary">{item.collection}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(item.generatedAt)}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      ${item.costUsd.toFixed(3)}
                    </span>
                    {item.seoScore != null && (
                      <Badge
                        variant={item.seoScore >= 80 ? "default" : "secondary"}
                      >
                        SEO {item.seoScore}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    title="Laes op"
                    onClick={() => handleSpeak(item)}
                    className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  {tab === "ready" && (
                    <>
                      <button
                        type="button"
                        title="Godkend & Publicer"
                        onClick={() => handleApprove(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-600 text-white hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Godkend
                      </button>
                      <Link
                        href={`/admin/${item.collection}/${item.slug}`}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Rediger
                      </Link>
                      <button
                        type="button"
                        title="Afvis"
                        onClick={() => setRejectingId(item.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Afvis
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Reject feedback inline */}
              {rejectingId === item.id && (
                <div className="mt-3 flex gap-2">
                  <textarea
                    value={rejectFeedback}
                    onChange={(e) => setRejectFeedback(e.target.value)}
                    placeholder="Feedback til agenten..."
                    rows={2}
                    className="flex-1 text-sm p-2 rounded-md border border-border bg-background resize-none"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleReject(item.id)}
                      disabled={!rejectFeedback.trim()}
                      className="px-3 py-1.5 rounded-md text-xs bg-destructive text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Bekraeft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingId(null);
                        setRejectFeedback("");
                      }}
                      className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-secondary"
                    >
                      Annuller
                    </button>
                  </div>
                </div>
              )}

              {/* Show rejection feedback for rejected items */}
              {item.status === "rejected" && item.rejectionFeedback && (
                <p className="mt-2 text-xs text-destructive bg-destructive/5 p-2 rounded">
                  Feedback: {item.rejectionFeedback}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
