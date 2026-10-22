"use client";

import { useEffect, useState } from "react";
import { ScheduledCalendar } from "./calendar-client";
import { useT } from "@/lib/i18n-context";

interface ScheduledEvent {
  id: string;
  type: "publish" | "unpublish" | "backup" | "link-check";
  date: string;
  title: string;
  subtitle: string;
  href: string;
  excerpt?: string;
}

interface ScheduledData {
  events: ScheduledEvent[];
  calendarToken: string;
  orgId: string;
  siteId: string;
}

export function ScheduledPageClient() {
  const t = useT();
  const [data, setData] = useState<ScheduledData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/scheduled-events")
      .then((r) => r.ok ? r.json() : null)
      .then((d: ScheduledData | null) => { if (!cancelled && d) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) {
    return (
      <div style={{ padding: "2rem", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
        {t("tools.scheduled.loadingCalendar")}
      </div>
    );
  }

  return <ScheduledCalendar events={data.events} calendarToken={data.calendarToken} orgId={data.orgId} siteId={data.siteId} />;
}
