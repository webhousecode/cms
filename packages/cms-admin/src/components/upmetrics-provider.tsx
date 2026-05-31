"use client";

import { useEffect } from "react";
import { init } from "@upmetrics/sdk";

// Browser-side error tracking → Upmetrics (project "cms"). The DSN public key is
// not a secret (Sentry-style), so NEXT_PUBLIC_* is correct. init() runs in an
// effect so it never executes during SSR; auto-instrument hooks window.onerror /
// unhandledrejection / failed fetches.
export function UpmetricsProvider() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_UPMETRICS_DSN;
    if (!dsn) return;
    init({ dsn, environment: process.env.NODE_ENV, release: "cms-admin" });
  }, []);
  return null;
}
