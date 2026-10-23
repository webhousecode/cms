"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Download, ShieldCheck, Terminal, Globe2, AlertCircle, AlertTriangle, Info, Activity, Clock, Users, AlertOctagon, X } from "lucide-react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { TabTitle } from "@/lib/tabs-context";
import { CustomSelect } from "@/components/ui/custom-select";
import { CustomDateInput } from "@/components/ui/custom-date-input";
import { useT } from "@/lib/i18n-context";
import { formatDateTime, formatTime as fmtTime, useFormat } from "@/lib/format-locale";
import type { UiLocale } from "@/i18n/locale";

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

function formatTime(iso: string, t: (key: string, vars?: Record<string, string | number>) => string, locale: UiLocale): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const isToday = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = fmtTime(d, locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  if (isToday) return t("tools.log.today", { time });
  if (isYesterday) return t("tools.log.yesterday", { time });
  return formatDateTime(d, locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function FilterChip({ label, testLabel, onRemove }: { label: string; testLabel: string; onRemove: () => void }) {
  const t = useT();
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.3rem",
      padding: "0.15rem 0.5rem", borderRadius: 999,
      border: "1px solid var(--border)",
      background: "var(--muted, rgba(255,255,255,0.03))",
      color: "var(--foreground)",
      fontSize: "0.65rem", fontWeight: 500,
    }}>
      {label}
      <button
        type="button"
        data-testid={`filter-chip-remove-${testLabel.toLowerCase().replace(/\s+/g, '-')}`}
        onClick={onRemove}
        aria-label={t("tools.log.removeFilter", { label })}
        style={{
          display: "inline-flex", alignItems: "center",
          background: "transparent", border: "none",
          color: "var(--muted-foreground)",
          cursor: "pointer", padding: 0,
        }}
      >
        <X style={{ width: 11, height: 11 }} />
      </button>
    </span>
  );
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
  const fmt = useFormat();
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
        {fmt.number(value)}
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
  const t = useT();
  const fmt = useFormat();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<Set<LogLayer>>(new Set(["audit", "server", "client"]));
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("layers", Array.from(layers).join(","));
      if (level !== "all") params.set("level", level);
      if (actionFilter) params.set("action", actionFilter);
      if (dateFrom) params.set("since", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) params.set("until", `${dateTo}T23:59:59.999Z`);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
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
  }, [layers, level, actionFilter, dateFrom, dateTo, pageSize, page]);

  // Reset to first page when filters change
  useEffect(() => {
    setPage(1);
  }, [layers, level, actionFilter, dateFrom, dateTo, pageSize]);

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
    if (dateFrom) params.set("since", `${dateFrom}T00:00:00.000Z`);
    if (dateTo) params.set("until", `${dateTo}T23:59:59.999Z`);
    params.set("format", format);
    window.location.href = `/api/admin/log/export?${params.toString()}`;
  }

  return (
    <div data-testid="log-root">
      <TabTitle value={t("tools.log.title")} />
      <ActionBar
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              data-testid="log-refresh-button"
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
              {t("tools.log.refresh")}
            </button>
            <button
              type="button"
              data-testid="log-export-csv-button"
              onClick={() => exportLog("csv")}
              title={t("tools.log.exportCsvTitle")}
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              {t("tools.log.csv")}
            </button>
            <button
              type="button"
              data-testid="log-export-json-button"
              onClick={() => exportLog("json")}
              title={t("tools.log.exportJsonTitle")}
              style={{
                height: 28, display: "inline-flex", alignItems: "center", gap: "0.35rem",
                padding: "0 0.75rem", borderRadius: 6,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--foreground)",
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              {t("tools.log.json")}
            </button>
          </div>
        }
      >
        <ActionBarBreadcrumb items={[t("tools.log.title")]} />
      </ActionBar>

      <div style={{ padding: "2rem", maxWidth: "72rem" }}>
        {/* Stat cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}>
          <StatCard icon={Activity} label={t("tools.log.statTotal")} value={stats?.total ?? 0} sublabel={t("tools.log.statTotalSub")} />
          <StatCard icon={Clock} label={t("tools.log.stat24h")} value={stats?.events24h ?? 0} sublabel={t("tools.log.last24h")} />
          <StatCard icon={Users} label={t("tools.log.statUsers")} value={stats?.activeUsers24h ?? 0} sublabel={t("tools.log.last24h")} />
          <StatCard icon={AlertOctagon} label={t("tools.log.statErrors")} value={stats?.errors24h ?? 0} sublabel={t("tools.log.last24h")} tone={stats && stats.errors24h > 0 ? "error" : "default"} />
        </div>

        {/* Filtered count line + active filter chips */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", margin: "0 0 1.25rem", minHeight: 22 }}>
          <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
            {total === 1 ? t("tools.log.matchOne", { n: total }) : t("tools.log.matchOther", { n: total })}
          </span>
          {level !== "all" && (
            <FilterChip label={t("tools.log.chipLevel", { value: t(`tools.log.level.${level}`) })} testLabel={`Level: ${level}`} onRemove={() => setLevel("all")} />
          )}
          {actionFilter && (
            <FilterChip label={t("tools.log.chipAction", { value: actionFilter })} testLabel={`Action: ${actionFilter}`} onRemove={() => setActionFilter("")} />
          )}
          {dateFrom && (
            <FilterChip label={t("tools.log.chipFrom", { value: dateFrom })} testLabel={`From: ${dateFrom}`} onRemove={() => setDateFrom("")} />
          )}
          {dateTo && (
            <FilterChip label={t("tools.log.chipTo", { value: dateTo })} testLabel={`To: ${dateTo}`} onRemove={() => setDateTo("")} />
          )}
          {layers.size < 3 && (
            <FilterChip
              label={t("tools.log.chipLayers", { value: Array.from(layers).map((x) => t(`tools.log.layer.${x}`)).join(", ") })}
              testLabel={`Layers: ${Array.from(layers).join(", ")}`}
              onRemove={() => setLayers(new Set(["audit", "server", "client"]))}
            />
          )}
          {(level !== "all" || actionFilter || dateFrom || dateTo || layers.size < 3) && (
            <button
              type="button"
              data-testid="filter-clear-all"
              onClick={() => {
                setLevel("all");
                setActionFilter("");
                setDateFrom("");
                setDateTo("");
                setLayers(new Set(["audit", "server", "client"]));
              }}
              style={{
                fontSize: "0.65rem", color: "var(--muted-foreground)",
                background: "transparent", border: "none", cursor: "pointer",
                textDecoration: "underline", padding: 0,
              }}
            >
              {t("tools.log.clearAll")}
            </button>
          )}
        </div>

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
                data-testid={`filter-layer-${l}`}
                onClick={() => toggleLayer(l)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.3rem",
                  height: 28,
                  padding: "0 0.75rem", borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: active ? "var(--brand)" : "transparent",
                  color: active ? "#0D0D0D" : "var(--muted-foreground)",
                  fontSize: "0.72rem", fontWeight: 500, cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                <Icon style={{ width: 12, height: 12 }} />
                {t(`tools.log.layer.${l}`)}
              </button>
            );
          })}
          <CustomSelect
            value={level}
            onChange={(v) => setLevel(v as LogLevel | "all")}
            options={[
              { value: "all", label: t("tools.log.level.all") },
              { value: "info", label: t("tools.log.level.info") },
              { value: "warn", label: t("tools.log.level.warn") },
              { value: "error", label: t("tools.log.level.error") },
            ]}
            style={{ height: 28, fontSize: "0.72rem", minWidth: 130 }}
          />
          <input
            type="text"
            data-testid="filter-action-input"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            placeholder={t("tools.log.actionPlaceholder")}
            style={{
              height: 28,
              padding: "0 0.6rem", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--background)",
              color: "var(--foreground)", fontSize: "0.72rem", minWidth: 240,
            }}
          />
          <div style={{ minWidth: 150 }}>
            <CustomDateInput value={dateFrom} onChange={setDateFrom} />
          </div>
          <span style={{ color: "var(--muted-foreground)", fontSize: "0.72rem" }}>–</span>
          <div style={{ minWidth: 150 }}>
            <CustomDateInput value={dateTo} onChange={setDateTo} />
          </div>
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
              {t("tools.log.noEvents")}
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
                <span style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{formatTime(e.timestamp, t, fmt.locale)}</span>
                <LevelIcon style={{ width: 13, height: 13, color: LEVEL_COLORS[e.level] }} />
                <LayerIcon style={{ width: 13, height: 13, color: "var(--muted-foreground)" }} />
                <span style={{ color: "var(--muted-foreground)", fontSize: "0.62rem", textTransform: "uppercase" }}>{t(`tools.log.layer.${e.layer}`)}</span>
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

        {/* Pagination */}
        {total > pageSize && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "1rem", marginTop: "1rem",
            fontSize: "0.72rem", color: "var(--muted-foreground)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>
                {t("tools.log.showing", { from: (page - 1) * pageSize + 1, to: Math.min(page * pageSize, total), total })}
              </span>
              <span>•</span>
              <label>
                {t("tools.log.perPage")}
                <select
                  value={pageSize}
                  data-testid="log-page-size-select"
                  onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                  style={{
                    marginLeft: "0.35rem",
                    height: 24, padding: "0 0.4rem", borderRadius: 4,
                    border: "1px solid var(--border)", background: "var(--background)",
                    color: "var(--foreground)", fontSize: "0.7rem",
                  }}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <button
                type="button"
                data-testid="pagination-prev"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  height: 28, padding: "0 0.75rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: page === 1 ? "var(--muted-foreground)" : "var(--foreground)",
                  fontSize: "0.72rem",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                {t("tools.log.previous")}
              </button>
              <span style={{ padding: "0 0.5rem" }}>
                {t("tools.log.pageOf", { page, pages: Math.max(1, Math.ceil(total / pageSize)) })}
              </span>
              <button
                type="button"
                data-testid="pagination-next"
                onClick={() => setPage(page + 1)}
                disabled={page * pageSize >= total}
                style={{
                  height: 28, padding: "0 0.75rem", borderRadius: 6,
                  border: "1px solid var(--border)", background: "transparent",
                  color: page * pageSize >= total ? "var(--muted-foreground)" : "var(--foreground)",
                  fontSize: "0.72rem",
                  cursor: page * pageSize >= total ? "not-allowed" : "pointer",
                  opacity: page * pageSize >= total ? 0.5 : 1,
                }}
              >
                {t("tools.log.next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
