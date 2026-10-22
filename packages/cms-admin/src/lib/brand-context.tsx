"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_BRAND, type BrandPack } from "./brand";

/** F210 — the brand the current address resolved to, chosen once on the
 *  server in app/layout.tsx and handed to every client component. */
const BrandContext = createContext<BrandPack>(DEFAULT_BRAND);

export function BrandProvider({ brand, children }: { brand: BrandPack; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandPack {
  return useContext(BrandContext);
}
