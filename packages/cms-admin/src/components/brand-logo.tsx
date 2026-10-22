"use client";

import type { CSSProperties } from "react";
import { useBrand } from "@/lib/brand-context";
import { DEFAULT_BRAND } from "@/lib/brand";

/**
 * F210 — the product's logo for the address the CMS is opened on.
 *
 * `wordmark` is the name logo; `icon` is the square mark. The webhouse brand
 * has both. A customer brand whose logo already carries its symbol has no
 * separate icon, so `icon` renders nothing for it rather than showing the mark
 * twice.
 */
export function BrandLogo({
  variant,
  light,
  style,
  className,
}: {
  variant: "wordmark" | "icon";
  /** true = artwork for a light background. */
  light: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const brand = useBrand();
  const isDefault = brand.id === DEFAULT_BRAND.id;

  if (variant === "icon") {
    if (!isDefault) return null;
    const src = light ? "/webhouse.app-light-icon.svg" : "/webhouse.app-dark-icon.svg";
    return <img src={src} alt="" style={style} className={className} />;
  }

  const src = light ? brand.logo.light : brand.logo.dark;
  return <img src={src} alt={brand.name} style={style} className={className} />;
}
