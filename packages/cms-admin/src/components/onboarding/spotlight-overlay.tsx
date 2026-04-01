"use client";

import { useEffect, useState } from "react";

interface SpotlightOverlayProps {
  /** Target element to spotlight */
  targetEl: HTMLElement | null;
  /** Padding around the target cutout */
  padding?: number;
  /** Called when clicking the overlay (outside the target) */
  onClick?: () => void;
}

/**
 * Full-screen dimmer overlay with a cutout around the target element.
 * Gold glow ring around the cutout for brand accent.
 */
export function SpotlightOverlay({ targetEl, padding = 8, onClick }: SpotlightOverlayProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetEl) return;

    function update() {
      setRect(targetEl!.getBoundingClientRect());
    }
    update();

    // Recalculate on scroll/resize
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [targetEl]);

  if (!rect) return null;

  const cutout = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "auto",
      }}
    >
      {/* Dark overlay with box-shadow cutout */}
      <div
        style={{
          position: "absolute",
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
          borderRadius: 8,
          boxShadow: [
            "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            "0 0 0 4px rgba(247, 187, 46, 0.15)",
            "0 0 20px rgba(247, 187, 46, 0.08)",
          ].join(", "),
          pointerEvents: "none",
          transition: "all 0.3s ease-out",
        }}
      />
      {/* Allow clicks through the cutout to the target */}
      <div
        style={{
          position: "absolute",
          top: cutout.top,
          left: cutout.left,
          width: cutout.width,
          height: cutout.height,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
