"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, Globe, FileText, Check, HardDrive, Link2 } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";
import { PageHeader } from "@/components/page-header";

/* ─── Types ──────────────────────────────────────────────────── */

type EventType = "publish" | "unpublish" | "backup" | "link-check";
type ViewMode = "day" | "week" | "month" | "year";

interface ScheduledEvent {
  id: string;
  type: EventType;
  date: string;
  title: string;
  subtitle: string;
  href: string;
  excerpt?: string;
}

const EVENT_COLORS: Record<EventType, string> = {
  publish: "rgb(74 222 128)",
  unpublish: "rgb(239 68 68)",
  backup: "rgb(96 165 250)",
  "link-check": "rgb(168 85 247)",
};

const COLLECTION_COLORS = ["rgb(251 146 60)", "rgb(74 222 128)", "rgb(244 114 182)", "rgb(96 165 250)", "rgb(168 85 247)", "rgb(234 179 8)", "rgb(45 212 191)"];


const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ─── Helpers ────────────────────────────────────────────────── */

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function eventsByDateKey(events: ScheduledEvent[]): Map<string, ScheduledEvent[]> {
  const map = new Map<string, ScheduledEvent[]>();
  for (const e of events) {
    const key = e.date.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return map;
}

/** Get Monday-based week start for a date */
function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function isSameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

/* ─── Component ──────────────────────────────────────────────── */

export function ScheduledCalendar({ events, calendarToken, orgId, siteId }: { events: ScheduledEvent[]; calendarToken: string; orgId: string; siteId: string }) {
  const [copied, setCopied] = useState(false);
  const [scrollToNow, setScrollToNow] = useState(0); // increment to trigger scroll
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [view, setViewState] = useState<ViewMode>("week");

  // Load + persist calendar view preference
  useEffect(() => {
    fetch("/api/admin/user-state").then((r) => r.ok ? r.json() : null).then((state) => {
      if (state?.calendarView) setViewState(state.calendarView);
    }).catch(() => {});
  }, []);

  function setView(v: ViewMode) {
    setViewState(v);
    fetch("/api/admin/user-state", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarView: v }) }).catch(() => {});
  }
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const eventsMap = eventsByDateKey(events);

  // Build collection → color map (deterministic, sorted)
  const colColorMap = useMemo(() => {
    const names = [...new Set(events.map((e) => e.subtitle))].sort();
    const map = new Map<string, string>();
    names.forEach((n, i) => map.set(n, COLLECTION_COLORS[i % COLLECTION_COLORS.length]));
    return map;
  }, [events]);

  function navigate(dir: -1 | 1) {
    if (view === "year") {
      setYear((y) => y + dir);
    } else if (view === "month") {
      let m = month + dir;
      let y = year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      setMonth(m);
      setYear(y);
    } else if (view === "week") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + dir * 7);
      setSelectedDate(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + dir);
      setSelectedDate(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    }
  }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayKey);
    setScrollToNow((n) => n + 1);
  }

  return (
    <>
      <TabTitle value="Calendar" />
<div className="p-8" style={{ maxWidth: "1200px" }}>
        {/* Title */}
        <div style={{ marginBottom: "-17px" }}>
          <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase mb-1">Schedule</p>
          <h1 className="text-2xl font-bold text-foreground">Calendar</h1>
        </div>

        {/* View selector + Subscribe — centered */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["day", "week", "month", "year"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs rounded-md transition-colors capitalize ${view === v ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const feedPath = `/api/cms/scheduled/calendar.ics?token=${calendarToken}&org=${orgId}&site=${siteId}`;
                const host = window.location.host;
                const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
                if (isLocal) {
                  const url = `${window.location.origin}${feedPath}`;
                  navigator.clipboard.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 3000);
                  });
                } else {
                  window.location.href = `webcal://${host}${feedPath}`;
                }
              }}
              title="Subscribe to calendar feed"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Calendar className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Subscribe"}
            </button>
          </div>
          </div>
        </div>

        {/* Month/date label + navigation */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground" style={{ minWidth: "220px" }}>
            {view === "day"
              ? (() => { const d = new Date(selectedDate); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; })()
              : view === "year"
                ? `${year}`
                : `${MONTHS[month]} ${year}`}
          </h2>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={goToday} className="px-3 py-1 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors text-muted-foreground">
              Today
            </button>
            <button type="button" onClick={() => navigate(1)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main layout: sidebar + calendar */}
        <div style={{ display: "flex", gap: "1.5rem" }}>
          {/* Sidebar legend */}
          <CalendarSidebar events={events} todayKey={todayKey} colColorMap={colColorMap} />

          {/* Calendar grid */}
          <div style={{ flex: 1, minWidth: 0 }}>
        {view === "month" && (
          <MonthView
            year={year}
            month={month}
            todayKey={todayKey}
            selectedDate={selectedDate}
            eventsMap={eventsMap}
            onSelectDate={(key) => { setSelectedDate(key); setView("day"); }}
          />
        )}
        {view === "week" && (
          <WeekView
            selectedDate={selectedDate}
            todayKey={todayKey}
            eventsMap={eventsMap}
            onSelectDate={(key) => { setSelectedDate(key); setView("day"); }}
            scrollToNow={scrollToNow}
          />
        )}
        {view === "day" && (
          <DayView
            selectedDate={selectedDate}
            eventsMap={eventsMap}
          />
        )}
        {view === "year" && (
          <YearView
            year={year}
            todayKey={todayKey}
            eventsMap={eventsMap}
            onSelectMonth={(m) => { setMonth(m); setView("month"); }}
          />
        )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Month View ─────────────────────────────────────────────── */

function MonthView({ year, month, todayKey, selectedDate, eventsMap, onSelectDate }: {
  year: number; month: number; todayKey: string; selectedDate: string;
  eventsMap: Map<string, ScheduledEvent[]>; onSelectDate: (key: string) => void;
}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-based

  const cells: { key: string; day: number; inMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    cells.push({ key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()), day: d.getDate(), inMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push({ key: dateKey(year, month, d), day: d, inMonth: true });
  }
  // Next month padding
  while (cells.length % 7 !== 0) {
    const d = cells.length - startOffset - lastDay.getDate() + 1;
    const next = new Date(year, month + 1, d);
    cells.push({ key: dateKey(next.getFullYear(), next.getMonth(), next.getDate()), day: next.getDate(), inMonth: false });
  }

  return (
    <div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 border-t border-l border-border">
        {cells.map((cell) => {
          const dayEvents = eventsMap.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelectDate(cell.key)}
              className="border-r border-b border-border text-left transition-colors hover:bg-secondary/50"
              style={{ minHeight: "5.5rem", padding: "0.25rem 0.375rem", opacity: cell.inMonth ? 1 : 0.3 }}
            >
              <span
                className="text-xs font-medium inline-flex items-center justify-center"
                style={{
                  width: "1.5rem", height: "1.5rem", borderRadius: "9999px",
                  ...(isToday ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { color: "var(--foreground)" }),
                }}
              >
                {cell.day}
              </span>
              {dayEvents.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((evt) => (
                    <div
                      key={evt.id}
                      className="truncate rounded px-1 py-px"
                      title={`${evt.type === "publish" ? "Publish" : "Unpublish"}: ${evt.title}\n${evt.subtitle} · ${evt.date.slice(11, 16)}${evt.excerpt ? `\n${evt.excerpt}` : ""}`}
                      style={{
                        fontSize: "0.6rem",
                        lineHeight: "1.1rem",
                        background: `color-mix(in srgb, ${EVENT_COLORS[evt.type]} 15%, transparent)`,
                        color: EVENT_COLORS[evt.type],
                        borderLeft: `2px solid ${EVENT_COLORS[evt.type]}`,
                      }}
                    >
                      {evt.date.slice(11, 16)} {evt.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p style={{ fontSize: "0.55rem", color: "var(--muted-foreground)", paddingLeft: "0.25rem" }}>
                      +{dayEvents.length - 3} more
                    </p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Week View (time grid) ───────────────────────────────────── */

const TOTAL_HOURS = 24; // full day 00:00-24:00
const VIEW_HOURS = 11;  // visible window (07:00-18:00 default)
const WEEKEND_BG = "#262627";

function WeekView({ selectedDate, todayKey, eventsMap, onSelectDate, scrollToNow = 0 }: {
  selectedDate: string; todayKey: string;
  eventsMap: Map<string, ScheduledEvent[]>; onSelectDate: (key: string) => void;
  scrollToNow?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  const monday = getMonday(new Date(selectedDate));
  const days: { key: string; label: string; dayNum: number; monthName: string; isWeekend: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()),
      label: WEEKDAYS[i],
      dayNum: d.getDate(),
      monthName: MONTHS[d.getMonth()].slice(0, 3),
      isWeekend: i >= 5,
    });
  }

  // Get week number
  const weekNum = (() => {
    const d = new Date(monday);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 4);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + yearStart.getDay() + 1) / 7);
  })();

  const HOUR_HEIGHT = 52;

  // Auto-scroll to center NOW in viewport (on mount + when Today is clicked)
  useEffect(() => {
    if (!scrollRef.current) return;
    const n = new Date();
    const currentMinutes = n.getHours() * 60 + n.getMinutes();
    const nowHour = currentMinutes / 60;
    const centerHour = nowHour >= 7 && nowHour <= 18 ? nowHour : 7;
    const scrollTarget = (centerHour - VIEW_HOURS / 2) * HOUR_HEIGHT;
    scrollRef.current.scrollTop = Math.max(0, scrollTarget);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToNow]);

  // Update NOW marker every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const totalHeight = TOTAL_HOURS * HOUR_HEIGHT;
  const viewportHeight = VIEW_HOURS * HOUR_HEIGHT;
  const nowY = (nowMinutes / 60) * HOUR_HEIGHT;
  const hasToday = days.some((d) => d.key === todayKey);

  // Find all-day events (events without a specific time or recurring)
  // For now, all events have times so this section is empty — prepared for agents/recurring

  // Account for sticky header height in scroll
  const headerHeight = 36;

  // Pill position relative to scroll — need to track scrollTop for external pill
  const [scrollTop, setScrollTop] = useState(0);
  const pillY = nowY - scrollTop + headerHeight - 7;
  const pillVisible = hasToday && pillY > -5 && pillY < viewportHeight + headerHeight;

  return (
    <div style={{ position: "relative", marginLeft: "13px" }}>
      {/* NOW pill — outside scroll container so it's never clipped */}
      {pillVisible && (
        <div
          style={{
            position: "absolute",
            top: pillY,
            left: "-8px",
            width: "calc(3rem + 8px)",
            height: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.65rem",
            fontWeight: 700,
            color: "#fff",
            background: "rgb(239 68 68)",
            fontFamily: "monospace",
            zIndex: 50,
            borderRadius: "9999px",
            pointerEvents: "none",
          }}
        >
          {String(Math.floor(nowMinutes / 60)).padStart(2, "0")}.{String(nowMinutes % 60).padStart(2, "0")}
        </div>
      )}
    <div
      ref={scrollRef}
      className="calendar-scroll"
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      style={{ height: `${viewportHeight + headerHeight}px`, overflowY: "auto", position: "relative", borderRadius: "8px", border: "1px solid var(--border)" }}
    >
      {/* Header: week number + day columns — sticky */}
      <div style={{ display: "grid", gridTemplateColumns: "3rem repeat(7, 1fr)", position: "sticky", top: 0, zIndex: 30, background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", padding: "0.5rem 0", textAlign: "center", fontFamily: "monospace" }}>
          W{weekNum}
        </div>
        {days.map((day) => {
          const isToday = day.key === todayKey;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => onSelectDate(day.key)}
              style={{
                padding: "0.4rem 0",
                textAlign: "center",
                borderLeft: "1px solid var(--border)",
                background: day.isWeekend ? WEEKEND_BG : "var(--card)",
              }}
              className="hover:bg-secondary/50 transition-colors"
            >
              <span style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", textTransform: "uppercase" }}>{day.label} </span>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  ...(isToday
                    ? { background: "var(--primary)", color: "var(--primary-foreground)", borderRadius: "9999px", padding: "0.15rem 0.4rem" }
                    : { color: "var(--foreground)" }),
                }}
              >
                {day.dayNum}
              </span>
            </button>
          );
        })}
      </div>

      {/* Time grid */}
        <div style={{ display: "grid", gridTemplateColumns: "3rem repeat(7, 1fr)", position: "relative", height: `${totalHeight}px` }}>
          {/* Hour labels */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => {
            const hour = i;
            return (
              <div
                key={`h${hour}`}
                style={{
                  position: "absolute",
                  top: i * HOUR_HEIGHT,
                  left: 0,
                  width: "3rem",
                  height: HOUR_HEIGHT,
                  borderTop: "1px solid var(--border)",
                  fontSize: "0.6rem",
                  color: "var(--muted-foreground)",
                  textAlign: "right",
                  paddingRight: "0.4rem",
                  paddingTop: "0.15rem",
                  fontFamily: "monospace",
                }}
              >
                {String(hour).padStart(2, "0")}.00
              </div>
            );
          })}

          {/* Day columns */}
          {days.map((day, colIdx) => (
            <div
              key={day.key}
              style={{
                position: "absolute",
                top: 0,
                left: `calc(3rem + ${colIdx} * ((100% - 3rem) / 7))`,
                width: `calc((100% - 3rem) / 7)`,
                height: totalHeight,
                borderLeft: "1px solid var(--border)",
                background: day.isWeekend ? WEEKEND_BG : "transparent",
              }}
            >
              {/* Hour grid lines */}
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: i * HOUR_HEIGHT,
                    left: 0,
                    right: 0,
                    borderTop: "1px solid var(--border)",
                    height: HOUR_HEIGHT,
                  }}
                />
              ))}

              {/* Events */}
              {(eventsMap.get(day.key) ?? []).map((evt) => {
                const hour = parseInt(evt.date.slice(11, 13)) || 0;
                const minute = parseInt(evt.date.slice(14, 16)) || 0;
                const topPx = (hour + minute / 60) * HOUR_HEIGHT;
                const color = EVENT_COLORS[evt.type];
                return (
                  <Link
                    key={evt.id}
                    href={evt.href}
                    style={{
                      position: "absolute",
                      top: topPx,
                      left: "2px",
                      right: "2px",
                      height: `${HOUR_HEIGHT * 0.25}px`,
                      minHeight: "18px",
                      borderRadius: "4px",
                      padding: "1px 4px",
                      fontSize: "0.6rem",
                      lineHeight: "1rem",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      background: `color-mix(in srgb, ${color} 20%, transparent)`,
                      borderLeft: `3px solid ${color}`,
                      color: color,
                      textDecoration: "none",
                      zIndex: 10,
                    }}
                    title={`${evt.type === "publish" ? "Publish" : "Unpublish"}: ${evt.title}\n${evt.date.slice(11, 16)}${evt.excerpt ? `\n${evt.excerpt}` : ""}`}
                  >
                    {evt.date.slice(11, 16)} {evt.title}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* NOW line + dot (pill is rendered outside scroll container) */}
          {hasToday && (
            <div
              style={{
                position: "absolute",
                top: nowY,
                left: "calc(3rem + 2px)",
                right: 0,
                height: "2px",
                background: "#342122",
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <div style={{
                position: "absolute",
                left: `calc(${days.findIndex((d) => d.key === todayKey)} * (100% / 7) - 4px)`,
                top: "-3px",
                width: "8px",
                height: "8px",
                borderRadius: "9999px",
                background: "rgb(239 68 68)",
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Day View ───────────────────────────────────────────────── */

function DayView({ selectedDate, eventsMap }: {
  selectedDate: string; eventsMap: Map<string, ScheduledEvent[]>;
}) {
  const dayEvents = eventsMap.get(selectedDate) ?? [];

  if (dayEvents.length === 0) {
    return (
      <div className="rounded-xl border border-border p-12 text-center text-muted-foreground">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20" />
        <p className="text-sm">No events on this day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dayEvents.map((evt) => {
        const Icon = evt.type === "publish" ? Globe : evt.type === "backup" ? HardDrive : evt.type === "link-check" ? Link2 : FileText;
        const color = EVENT_COLORS[evt.type];
        return (
          <Link key={evt.id} href={evt.href} className="block">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 hover:bg-secondary/50 transition-all">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
              >
                <Icon style={{ width: "1rem", height: "1rem", color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{evt.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] px-1.5 py-0 rounded bg-secondary text-secondary-foreground">{evt.subtitle}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{evt.date.slice(11, 16)}</span>
                </div>
              </div>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded border shrink-0"
                style={{ color, borderColor: `color-mix(in srgb, ${color} 30%, transparent)` }}
              >
                {evt.type === "publish" ? "Publish" : "Unpublish"}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ─── Year View ──────────────────────────────────────────────── */

function YearView({ year, todayKey, eventsMap, onSelectMonth }: {
  year: number; todayKey: string;
  eventsMap: Map<string, ScheduledEvent[]>;
  onSelectMonth: (month: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {MONTHS.map((monthName, m) => {
        const firstDay = new Date(year, m, 1);
        const lastDay = new Date(year, m + 1, 0);
        const startOffset = (firstDay.getDay() + 6) % 7;

        // Count events in this month
        let monthEventCount = 0;
        for (let d = 1; d <= lastDay.getDate(); d++) {
          const key = dateKey(year, m, d);
          monthEventCount += (eventsMap.get(key) ?? []).length;
        }

        const cells: { day: number; key: string; inMonth: boolean }[] = [];
        for (let i = startOffset - 1; i >= 0; i--) {
          const d = new Date(year, m, -i);
          cells.push({ day: d.getDate(), key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()), inMonth: false });
        }
        for (let d = 1; d <= lastDay.getDate(); d++) {
          cells.push({ day: d, key: dateKey(year, m, d), inMonth: true });
        }
        while (cells.length % 7 !== 0) {
          const d = cells.length - startOffset - lastDay.getDate() + 1;
          const next = new Date(year, m + 1, d);
          cells.push({ day: next.getDate(), key: dateKey(next.getFullYear(), next.getMonth(), next.getDate()), inMonth: false });
        }

        return (
          <button
            key={m}
            type="button"
            onClick={() => onSelectMonth(m)}
            className="text-left p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-secondary/30 transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{monthName}</span>
              {monthEventCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{monthEventCount}</span>
              )}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {["M","T","W","T","F","S","S"].map((d, i) => (
                <span key={i} className="text-center text-[8px] text-muted-foreground">{d}</span>
              ))}
              {cells.map((cell, i) => {
                const hasEvents = (eventsMap.get(cell.key) ?? []).length > 0;
                const isToday = cell.key === todayKey;
                return (
                  <span
                    key={i}
                    className="text-center"
                    style={{
                      fontSize: "0.55rem",
                      lineHeight: "1.1rem",
                      opacity: cell.inMonth ? 1 : 0.25,
                      borderRadius: "9999px",
                      ...(isToday ? { background: "var(--primary)", color: "var(--primary-foreground)", fontWeight: 700 } : {}),
                      ...(hasEvents && !isToday ? { background: "color-mix(in srgb, rgb(74 222 128) 20%, transparent)", fontWeight: 600 } : {}),
                    }}
                  >
                    {cell.day}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Sidebar Legend ─────────────────────────────────────────── */

function CalendarSidebar({ events, todayKey, colColorMap }: { events: ScheduledEvent[]; todayKey: string; colColorMap: Map<string, string> }) {
  // Collection counts — only future events (compare with current time, not just date)
  const now = new Date().toISOString().slice(0, 19);
  const futureEvents = events.filter((e) => e.date > now);
  const collectionDocs = new Map<string, Set<string>>();
  for (const e of futureEvents) {
    if (!collectionDocs.has(e.subtitle)) collectionDocs.set(e.subtitle, new Set());
    collectionDocs.get(e.subtitle)!.add(e.id.replace(/^(pub|unpub)-/, ""));
  }
  const collectionCounts = new Map<string, number>();
  for (const [name, docs] of collectionDocs) {
    collectionCounts.set(name, docs.size);
  }

  // Unique doc counts (strip pub-/unpub- prefix to deduplicate same document)
  const docKey = (e: ScheduledEvent) => e.id.replace(/^(pub|unpub)-/, "");
  const futureDocIds = new Set(futureEvents.map(docKey));
  const todayDocIds = new Set(events.filter((e) => e.date.slice(0, 10) === todayKey).map(docKey));

  const colEntries = Array.from(collectionCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.6rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "var(--muted-foreground)",
    marginBottom: "0.5rem",
  };

  return (
    <div style={{ width: "140px", flexShrink: 0, paddingTop: "0.25rem" }}>
      {/* Collections */}
      <p style={sectionLabel}>Collections</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1.25rem" }}>
        {colEntries.map(([name, count]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "9999px", background: colColorMap.get(name) ?? "var(--muted-foreground)", flexShrink: 0 }} />
            <span style={{ fontSize: "0.75rem", fontWeight: 500, lineHeight: 1 }}>{name}</span>
            <span style={{ fontSize: "0.65rem", fontFamily: "monospace", color: "var(--muted-foreground)", lineHeight: 1 }}>{count}</span>
          </div>
        ))}
        {colEntries.length === 0 && (
          <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>No events</span>
        )}
      </div>

      {/* Event types */}
      <p style={sectionLabel}>Event Types</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "1.25rem" }}>
        {(Object.entries(EVENT_COLORS) as [EventType, string][]).map(([type, color]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "9999px", background: color }} />
            <span style={{ fontSize: "0.75rem" }}>
              {type === "publish" ? "Publish" : type === "unpublish" ? "Expiry" : type === "backup" ? "Backup" : "Link Check"}
            </span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Upcoming</p>
        <p style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1 }}>{futureDocIds.size}</p>
        <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>items pending</p>

        <p style={{ fontSize: "0.6rem", color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Today</p>
        <p style={{ fontSize: "1.75rem", fontWeight: 700, lineHeight: 1.1 }}>{todayDocIds.size}</p>
        <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>items scheduled</p>
      </div>
    </div>
  );
}
