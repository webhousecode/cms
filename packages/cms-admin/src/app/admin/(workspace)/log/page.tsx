"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, ShieldCheck, Terminal, Globe2, AlertCircle, AlertTriangle, Info, Activity, Clock, Users, AlertOctagon } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { TabTitle } from "@/lib/tabs-context";
import { CustomSelect } from "@/components/ui/custom-select";

type LogLayer = "audit" | "server" | "client";
type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  id: string;
  timestamp: string;
  layer: LogLayer;
  level: LogLevel;
  action: string;
  actor: {
    type: string;
    userId?: string;
    name?: string;
    email?: string;
    userAgent?: string;
  };
  target?: {
    type: string;
    collection?: string;
    slug?: string;
    title?: string;
  };
  details?: Record<string, unknown>;
  error?: { message: string; status?: number };
}

const LAYER_ICONS: Record<LogLayer, typeof ShieldCheck> = {
  audit: ShieldCheck,
  server: Terminal,
  client: Globe2,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: "rgb(74 222 128)",
  warn: "rgb(250 204 21)",
  error: "rgb(239 68 68)",
};

const LEVEL_ICONS: Record<LogLevel, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return `i dag ${time}`;
  if (isYesterday) return `i går ${time}`;
  return d.toLocaleString("da-DK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = "default",
}: {
  icon: typeof Info;
  label: string;
  value: number;
  sublabel?: string;
  tone?: "default" | "error";
}) {
  const accent = tone === "error" && value > 0 ? "rgb(239 68 68)" : "var(--muted-foreground)";
  return (
    <div style={{
      padding: "0.85rem 1rem",
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--card, var(--background))",
      display: "flex", flexDirection: "column", gap: "0.35rem",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: accent }}>
        <Icon style={{ width: 14, height: 14 }} />
        <span style={{ fontSize: "0.7rem", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{
        fontSize: "1.75rem", fontWeight: 600, lineHeight: 1,
        color: tone === "error" && value > 0 ? "rgb(239 68 68)" : "var(--foreground)",
        fontFamily: "monospace",
      }}>
        {value.toLocaleString("da-DK")}
      </div>
      {sublabel && (
        <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}>{sublabel}</div>
      )}
    </div>
  );
}

function formatAction(entry: LogEntry): string {
  const actor = entry.actor.name ?? entry.actor.email ?? entry.actor.type;
  const target = entry.target
    ? entry.target.collection && entry.target.slug
      ? `${entry.target.collection}/${entry.target.slug}`
      : entry.target.title ?? entry.target.type
    : "";
  return target ? `${actor} → ${entry.action} ${target}` : `${actor} → ${entry.action}`;
}

interface LogStats {
  total: number;
  events24h: number;
  activeUsers24h: number;
  errors24h: number;
}

export default function EventLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<Set<LogLayer>>(new Set(["audit", "server", "client"]));
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [actionFilter, setActionFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("layers", Array.from(layers).join(","));
      if (level !== "all") params.set("level", level);
      if (actionFilter) params.set("action", actionFilter);
      params.set("limit", "200");
      const [feedRes, statsRes] = await Promise.all([
        fetch(`/api/admin/log?${params.toString()}`),
        fetch(`/api/admin/log?stats=1`),
      ]);
      const data = await feedRes.json() as { entries: LogEntry[]; total: number };
      const statsData = await statsRes.json() as LogStats;
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
      setStats(statsData);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [layers, level, actionFilter]);

  useEffect(() => { load(); }, [load]);

  function toggleLayer(l: LogLayer) {
    const next = new Set(layers);
    if (next.has(l)) next.delete(l); else next.add(l);
    if (next.size === 0) next.add(l);
    setLayers(next);
  }

  function exportLog(format: "csv" | "json") {
    const params = new URLSearchParams();
    params.set("layers", Array.from(layers).join(","));
    if (level !== "all") params.set("level", level);
    if (actionFilter) params.set("action", actionFilter);
    params.set("format", format);
    window.location.href = `/api/admin/log/export?${params.toString()}`;
  }

  return (
    <>
      <TabTitle value="Event Log" />
      <ActionBar
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} style={{ width: 13, height: 13 }} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => exportLog("csv")}
              title="Export filtered events as CSV (for GDPR data requests)"
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportLog("json")}
              title="Export filtered events as JSON"
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              JSON
            </button>
          </div>
        }
      >
        <ActionBarBreadcrumb items={["Event Log"]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "72rem" }}>
        {/* Stat cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}>
          <StatCard icon={Activity} label="Total activities" value={stats?.total ?? 0} sublabel="Total" />
          <StatCard icon={Clock} label="Last 24 hours" value={stats?.events24h ?? 0} sublabel="Sidste 24 timer" />
          <StatCard icon={Users} label="Active users" value={stats?.activeUsers24h ?? 0} sublabel="Sidste 24 timer" />
          <StatCard icon={AlertOctagon} label="Errors" value={stats?.errors24h ?? 0} sublabel="Sidste 24 timer" tone={stats && stats.errors24h > 0 ? "error" : "default"} />
        </div>

        {/* Filtered count line */}
        <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", margin: "0 0 1.25rem" }}>
          {total} event{total === 1 ? "" : "s"} match current filters
        </p>

        {/* Filters — fixed-height row prevents layout shift when toggled */}
        <div style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1.5rem",
          minHeight: 32,
        }}>
          {(["audit", "server", "client"] as LogLayer[]).map((l) => {
            const Icon = LAYER_ICONS[l];
            const active = layers.has(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => toggleLayer(l)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  height: 28,
                  padding: "0 0.75rem", borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: active ? "#F7BB2E" : "transparent",
                  color: active ? "#0D0D0D" : "var(--muted-foreground)",
                  fontSize: "0.72rem", fontWeight: 500, cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                <Icon style={{ width: 12, height: 12 }} />
                {l}
              </button>
            );
          })}
          <CustomSelect
            value={level}
            onChange={(v) => setLevel(v as LogLevel | "all")}
            options={[
              { value: "all", label: "All levels" },
              { value: "info", label: "Info" },
              { value: "warn", label: "Warn" },
              { value: "error", label: "Error" },
            ]}
            style={{ height: 28, fontSize: "0.72rem", minWidth: 130 }}
          />
          <input
            type="text"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder="Filter action (e.g. document.)"
            style={{
              height: 28,
              padding: "0 0.6rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.72rem", minWidth: 240,
            }}
          />
        </div>

        {/* Entries — left-aligned, fixed columns. Empty state stays left. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {entries.length === 0 && !loading && (
            <div style={{
              padding: "0.75rem 0",
              color: "var(--muted-foreground)",
              fontSize: "0.78rem",
              textAlign: "left",
            }}>
              No events match the current filters.
            </div>
          )}
          {entries.map((e) => {
            const LayerIcon = LAYER_ICONS[e.layer];
            const LevelIcon = LEVEL_ICONS[e.level];
            return (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 20px 20px 70px 1fr",
                  gap: "0.6rem",
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: e.level === "error" ? "rgba(239,68,68,0.05)" : "transparent",
                  fontSize: "0.72rem",
                  fontFamily: "monospace",
                  alignItems: "center",
                }}
              >
                <span style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{formatTime(e.timestamp)}</span>
                <LevelIcon style={{ width: 13, height: 13, color: LEVEL_COLORS[e.level] }} />
                <LayerIcon style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                <span style={{ color: "var(--muted-foreground)", fontSize: "0.62rem", textTransform: "uppercase" }}>{e.layer}</span>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--foreground)" }}>{formatAction(e)}</span>
                  {e.error?.message && (
                    <span style={{ color: LEVEL_COLORS.error, marginLeft: "0.5rem" }}>— {e.error.message}</span>
                  )}
                  {e.details && Object.keys(e.details).length > 0 && (
                    <span style={{ color: "var(--muted-foreground)", marginLeft: "0.5rem" }}>
                      {Object.entries(e.details).slice(0, 3).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
