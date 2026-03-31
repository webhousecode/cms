"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Reads URL hash (e.g. #media-processing) and scrolls to the matching element
 * with a gold glow animation to draw attention.
 */
export function SettingsAnchorScroll() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    // Small delay to let the settings panel render
    const timer = setTimeout(() => {
      const el = document.getElementById(hash);
      if (!el) return;

      // Find the next SettingsCard (sibling or parent container)
      const card = el.nextElementSibling?.nextElementSibling as HTMLElement | null;
      const target = card ?? el;

      target.scrollIntoView({ behavior: "smooth", block: "center" });

      // Apply glow animation
      target.style.transition = "box-shadow 0.3s ease";
      target.style.boxShadow = "0 0 0 2px #F7BB2E, 0 0 20px rgba(247, 187, 46, 0.3)";
      target.style.borderRadius = "12px";

      // Fade out glow after 2 seconds
      setTimeout(() => {
        target.style.boxShadow = "";
      }, 2500);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchParams]);

  return null;
}
