"use client";

import { useState, useEffect } from "react";
import { CustomSelect } from "@/components/ui/custom-select";

const CALENDAR_VIEWS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function PreferencesPanel() {
  const [calendarView, setCalendarView] = useState("week");
  const [agentsView, setAgentsView] = useState("grid");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/user-state")
      .then((r) => r.ok ? r.json() : null)
      .then((state) => {
        if (state?.calendarView) setCalendarView(state.calendarView);
        if (state?.agentsView) setAgentsView(state.agentsView);
      })
      .catch(() => {});
  }, []);

  function save(patch: Record<string, string>) {
    fetch("/api/admin/user-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }).catch(() => {});
  }

  const labelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 600,
    display: "block",
    marginBottom: "0.375rem",
    color: "var(--foreground)",
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Preferences</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Customize your default views and display settings.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        <div>
          <label style={labelStyle}>Default calendar view</label>
          <CustomSelect
            options={CALENDAR_VIEWS}
            value={calendarView}
            onChange={(v) => { setCalendarView(v); save({ calendarView: v }); }}
            style={{ maxWidth: "200px" }}
          />
          <p className="text-xs text-muted-foreground mt-1">Which view Calendar opens with by default.</p>
        </div>

        <div>
          <label style={labelStyle}>Agents list view</label>
          <CustomSelect
            options={[
              { value: "grid", label: "Grid" },
              { value: "list", label: "List" },
            ]}
            value={agentsView}
            onChange={(v) => { setAgentsView(v); save({ agentsView: v }); }}
            style={{ maxWidth: "200px" }}
          />
          <p className="text-xs text-muted-foreground mt-1">Grid or list view for AI Agents page.</p>
        </div>
      </div>

      {saved && (
        <p className="text-xs text-green-400">Preferences saved</p>
      )}
    </div>
  );
}
