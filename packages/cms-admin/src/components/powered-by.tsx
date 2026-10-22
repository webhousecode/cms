"use client";

import type { CSSProperties } from "react";
import { useBrand } from "@/lib/brand-context";
import { isDefaultBrand } from "@/lib/brand";

/**
 * F210.3 — the "Powered by @webhouse/cms" line under the sign-in and gate
 * screens. Shown on webhouse's own brand only: on a customer's address
 * (cms.fysio.work) the product is theirs, so the line is left out entirely.
 */
export function PoweredBy({ docs = false, style }: { docs?: boolean; style?: CSSProperties }) {
  const brand = useBrand();
  if (!isDefaultBrand(brand)) return null;
  return (
    <p style={{ marginTop: "1.5rem", fontSize: "0.7rem", color: "hsl(0 0% 30%)", letterSpacing: "0.05em", ...style }}>
      Powered by <span style={{ color: "var(--brand-on-dark)", fontWeight: 500 }}>@webhouse/cms</span>
      {docs && (
        <>
          {" · "}
          <a
            data-testid="login-docs-link"
            href="https://docs.webhouse.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--brand-on-dark)", textDecoration: "none" }}
          >
            Docs
          </a>
        </>
      )}
    </p>
  );
}
