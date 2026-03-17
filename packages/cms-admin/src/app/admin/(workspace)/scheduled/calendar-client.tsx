"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, ChevronLeft, ChevronRight, Globe, FileText } from "lucide-react";
import { TabTitle } from "@/lib/tabs-context";

/* ─── Types ──────────────────────────────────────────────────── */

type EventType = "publish" | "unpublish";
type ViewMode = "month" | "week" | "day";

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
};

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

export function ScheduledCalendar({ events, calendarToken }: { events: ScheduledEvent[]; calendarToken: string }) {
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const [view, setView] = useState<ViewMode>("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const eventsMap = eventsByDateKey(events);

  function navigate(dir: -1 | 1) {
    if (view === "month") {
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
  }

  return (
    <>
      <TabTitle value="Calendar" />
      <div className="p-8" style={{ maxWidth: "1100px" }}>
        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              {view === "day"
                ? new Date(selectedDate).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                : `${MONTHS[month]} ${year}`}
            </h1>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={goToday} className="px-2 py-1 rounded-md text-xs font-medium hover:bg-secondary transition-colors text-muted-foreground">
                Today
              </button>
              <button type="button" onClick={() => navigate(1)} className="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              {(["day", "week", "month"] as ViewMode[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors capitalize ${view === v ? "bg-secondary text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = `webcal://${window.location.host}/api/cms/scheduled/calendar.ics?token=${calendarToken}`; }}
              title="Subscribe in Apple Calendar"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary transition-colors text-muted-foreground"
            >
              <Calendar className="w-3.5 h-3.5" />
              Subscribe
            </button>
          </div>
        </div>

        {/* Calendar views */}
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
          />
        )}
        {view === "day" && (
          <DayView
            selectedDate={selectedDate}
            eventsMap={eventsMap}
          />
        )}
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

/* ─── Week View ──────────────────────────────────────────────── */

function WeekView({ selectedDate, todayKey, eventsMap, onSelectDate }: {
  selectedDate: string; todayKey: string;
  eventsMap: Map<string, ScheduledEvent[]>; onSelectDate: (key: string) => void;
}) {
  const monday = getMonday(new Date(selectedDate));
  const days: { key: string; label: string; dayNum: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()),
      label: WEEKDAYS[i],
      dayNum: d.getDate(),
    });
  }

  return (
    <div className="grid grid-cols-7 border-t border-l border-border">
      {days.map((day) => {
        const dayEvents = eventsMap.get(day.key) ?? [];
        const isToday = day.key === todayKey;
        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onSelectDate(day.key)}
            className="border-r border-b border-border text-left transition-colors hover:bg-secondary/50"
            style={{ minHeight: "16rem", padding: "0.5rem" }}
          >
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[10px] text-muted-foreground font-medium uppercase">{day.label}</span>
              <span
                className="text-xs font-medium inline-flex items-center justify-center"
                style={{
                  width: "1.5rem", height: "1.5rem", borderRadius: "9999px",
                  ...(isToday ? { background: "var(--primary)", color: "var(--primary-foreground)" } : { color: "var(--foreground)" }),
                }}
              >
                {day.dayNum}
              </span>
            </div>
            <div className="space-y-1">
              {dayEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="truncate rounded px-1.5 py-0.5"
                  title={`${evt.type === "publish" ? "Publish" : "Unpublish"}: ${evt.title}\n${evt.subtitle} · ${evt.date.slice(11, 16)}${evt.excerpt ? `\n${evt.excerpt}` : ""}`}
                  style={{
                    fontSize: "0.65rem",
                    lineHeight: "1.2rem",
                    background: `color-mix(in srgb, ${EVENT_COLORS[evt.type]} 15%, transparent)`,
                    color: EVENT_COLORS[evt.type],
                    borderLeft: `2px solid ${EVENT_COLORS[evt.type]}`,
                  }}
                >
                  {evt.date.slice(11, 16)} {evt.title}
                </div>
              ))}
            </div>
          </button>
        );
      })}
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
        const Icon = evt.type === "publish" ? Globe : FileText;
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
