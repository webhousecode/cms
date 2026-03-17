"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Globe, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabTitle } from "@/lib/tabs-context";

type EventType = "publish" | "unpublish";

interface ScheduledEvent {
  id: string;
  type: EventType;
  date: string;
  title: string;
  subtitle: string;
  href: string;
}

function groupByDate(events: ScheduledEvent[]): Map<string, ScheduledEvent[]> {
  const groups = new Map<string, ScheduledEvent[]>();
  for (const event of events) {
    // Use date part directly from stored string (no timezone conversion)
    const datePart = event.date.slice(0, 10); // "2026-03-26"
    const [y, m, d] = datePart.split("-");
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const key = `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  return groups;
}

const EVENT_CONFIG: Record<EventType, { icon: typeof Clock; color: string; label: string }> = {
  publish: { icon: Globe, color: "rgb(74 222 128)", label: "Publish" },
  unpublish: { icon: FileText, color: "rgb(239 68 68)", label: "Unpublish" },
};

export function ScheduledCalendar({ events }: { events: ScheduledEvent[] }) {
  const [filter, setFilter] = useState<EventType | "all">("all");

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const grouped = groupByDate(filtered);

  const typeCounts: Record<string, number> = {};
  for (const e of events) {
    typeCounts[e.type] = (typeCounts[e.type] ?? 0) + 1;
  }

  return (
    <>
      <TabTitle value="Calendar" />
      <div className="p-8 max-w-4xl">
        <div className="mb-8">
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Schedule</p>
          <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 flex-wrap">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")} count={events.length} label="All" color="var(--muted-foreground)" />
          <FilterButton active={filter === "publish"} onClick={() => setFilter("publish")} count={typeCounts.publish ?? 0} label="Publish" color={EVENT_CONFIG.publish.color} />
          <FilterButton active={filter === "unpublish"} onClick={() => setFilter("unpublish")} count={typeCounts.unpublish ?? 0} label="Expiry" color={EVENT_CONFIG.unpublish.color} />
        </div>

        {events.length === 0 && (
          <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium mb-2">Nothing scheduled</p>
            <p className="text-sm">Scheduled publishes and expiries will appear here.</p>
          </div>
        )}

        {filtered.length === 0 && events.length > 0 && (
          <p className="text-sm text-muted-foreground">No events match this filter.</p>
        )}

        {filtered.length > 0 && (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([dateLabel, dayEvents]) => (
              <div key={dateLabel}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
                  {dateLabel}
                </p>
                <div className="space-y-1.5">
                  {dayEvents.map((event) => {
                    const cfg = EVENT_CONFIG[event.type];
                    const Icon = cfg.icon;
                    return (
                      <Link key={event.id} href={event.href} className="block">
                        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-secondary/50 transition-all">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: `color-mix(in srgb, ${cfg.color} 12%, transparent)` }}
                          >
                            <Icon style={{ width: "1rem", height: "1rem", color: cfg.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{event.subtitle}</Badge>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                {event.date.slice(11, 16)}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0"
                            style={{ color: cfg.color, borderColor: `color-mix(in srgb, ${cfg.color} 30%, transparent)` }}
                          >
                            {cfg.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FilterButton({ active, onClick, count, label, color }: {
  active: boolean; onClick: () => void; count: number; label: string; color: string;
}) {
  if (count === 0 && !active) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "0.3rem",
        padding: "0.2rem 0.6rem", borderRadius: "9999px", fontSize: "0.75rem",
        fontFamily: "monospace", cursor: "pointer", transition: "all 120ms", whiteSpace: "nowrap",
        border: `1px solid ${active ? color : "var(--border)"}`,
        background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent",
        color: active ? color : "var(--muted-foreground)",
      }}
    >
      {label} <span style={{ opacity: 0.7 }}>{count}</span>
    </button>
  );
}
