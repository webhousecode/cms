"use client";

import { useSchedulerEvents } from "@/hooks/use-scheduler-events";

export function SchedulerNotifier() {
  useSchedulerEvents();
  return null;
}
