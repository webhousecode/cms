"use client";

import dynamic from "next/dynamic";

// Render sidebar client-only to avoid Base UI tooltip ID hydration mismatches
// (Base UI auto-generates IDs that differ between SSR and client hydration)
const AppSidebarInner = dynamic(
  () => import("@/components/sidebar").then((m) => m.AppSidebar),
  { ssr: false }
);

export function AppSidebarClient(props: {
  collections: { name: string; label: string }[];
  globals: { name: string; label: string }[];
}) {
  return <AppSidebarInner {...props} />;
}
