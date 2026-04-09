"use client";

import { useEffect, useState, useRef } from "react";
import type { TourStep } from "@/lib/onboarding/tours";

interface TourTooltipProps {
  step: TourStep;
  locale: string;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

const TOOLTIP_WIDTH = 320;
const ARROW_SIZE = 8;
const GAP = 12;

/**
 * Onboarding tooltip — dark card with gold accent, arrow, and step counter.
 * Positions itself relative to the target element using getBoundingClientRect().
 */
export function TourTooltip({
  step,
  locale,
  currentStep,
  totalSteps,
  onNext,
  onSkip,
}: TourTooltipProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const title = locale === "da" ? step.titleDa : step.title;
  const body = locale === "da" ? step.bodyDa : step.body;
  const isLast = currentStep === totalSteps - 1;
  const buttonLabel = isLast
    ? locale === "da" ? "Lad os gå!" : "Let's go!"
    : locale === "da" ? "Forstået" : "Got it";

  // Recalculate position from target selector (provider already ensured it exists)
  useEffect(() => {
    setVisible(false);
    const el = document.querySelector(step.target) as HTMLElement | null;
    if (!el) return;

    const timer = setTimeout(() => {
      setTargetRect(el.getBoundingClientRect());
      requestAnimationFrame(() => setVisible(true));
    }, 100);

    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [step.target]);

  // Keyboard shortcuts: Esc to skip the tour, Enter to advance.
  // Ignore Enter when an editable element is focused (textarea, contenteditable, etc.)
  // so the user can still type newlines while a tooltip is visible.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
        return;
      }
      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        if (tag === "textarea" || target?.isContentEditable) return;
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onSkip]);

  if (!targetRect) return null;

  // Calculate tooltip position based on placement
  const pos = calculatePosition(targetRect, step.placement, tooltipRef.current);

  return (
    <div
      ref={tooltipRef}
      style={{
        position: "fixed",
        zIndex: 9999,
        left: pos.left,
        top: pos.top,
        width: TOOLTIP_WIDTH,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${step.placement === "top" ? "8px" : "-8px"})`,
        transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
        pointerEvents: "auto",
      }}
    >
      {/* Card */}
      <div
        style={{
          background: "#0D0D0D",
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(247, 187, 46, 0.3)",
          padding: "1rem 1.25rem",
          position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={onSkip}
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
            padding: "2px 4px",
          }}
          aria-label="Skip tour"
        >
          ×
        </button>

        {/* Title */}
        <div
          style={{
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.95rem",
            marginBottom: "0.4rem",
            paddingRight: "1.5rem",
          }}
        >
          {title}
        </div>

        {/* Body */}
        <div
          style={{
            color: "rgba(255,255,255,0.65)",
            fontSize: "0.85rem",
            lineHeight: 1.5,
            marginBottom: "0.85rem",
          }}
        >
          {body}
        </div>

        {/* Footer: step counter + button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              color: "rgba(247, 187, 46, 0.5)",
              fontSize: "0.7rem",
              fontWeight: 500,
            }}
          >
            {currentStep + 1} / {totalSteps}
          </span>

          <button
            onClick={onNext}
            style={{
              background: "#F7BB2E",
              color: "#0D0D0D",
              border: "none",
              borderRadius: 6,
              padding: "0.35rem 0.85rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "filter 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
          >
            {buttonLabel}
          </button>
        </div>

        {/* Arrow */}
        <Arrow placement={step.placement} targetRect={targetRect} tooltipLeft={pos.left} tooltipTop={pos.top} />
      </div>
    </div>
  );
}

function calculatePosition(
  rect: DOMRect,
  placement: TourStep["placement"],
  tooltipEl: HTMLDivElement | null,
): { left: number; top: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  // Use actual tooltip height if available, otherwise estimate
  const tooltipHeight = tooltipEl?.offsetHeight ?? 160;

  switch (placement) {
    case "right":
      return {
        left: rect.right + GAP,
        top: Math.max(8, cy - tooltipHeight / 2),
      };
    case "left":
      return {
        left: rect.left - TOOLTIP_WIDTH - GAP,
        top: Math.max(8, cy - tooltipHeight / 2),
      };
    case "bottom":
      return {
        left: Math.max(8, cx - TOOLTIP_WIDTH / 2),
        top: rect.bottom + GAP,
      };
    case "top":
      return {
        left: Math.max(8, cx - TOOLTIP_WIDTH / 2),
        top: Math.max(8, rect.top - GAP - tooltipHeight),
      };
  }
}

function Arrow({
  placement,
  targetRect,
  tooltipLeft,
  tooltipTop,
}: {
  placement: TourStep["placement"];
  targetRect: DOMRect;
  tooltipLeft: number;
  tooltipTop: number;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
    borderStyle: "solid",
  };

  switch (placement) {
    case "right":
      Object.assign(style, {
        left: -ARROW_SIZE,
        top: targetRect.top + targetRect.height / 2 - tooltipTop - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px 0`,
        borderColor: "transparent #0D0D0D transparent transparent",
      });
      break;
    case "left":
      Object.assign(style, {
        right: -ARROW_SIZE,
        top: targetRect.top + targetRect.height / 2 - tooltipTop - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px 0 ${ARROW_SIZE}px ${ARROW_SIZE}px`,
        borderColor: "transparent transparent transparent #0D0D0D",
      });
      break;
    case "bottom":
      Object.assign(style, {
        top: -ARROW_SIZE,
        left: targetRect.left + targetRect.width / 2 - tooltipLeft - ARROW_SIZE,
        borderWidth: `0 ${ARROW_SIZE}px ${ARROW_SIZE}px ${ARROW_SIZE}px`,
        borderColor: "transparent transparent #0D0D0D transparent",
      });
      break;
    case "top":
      Object.assign(style, {
        bottom: -ARROW_SIZE,
        left: targetRect.left + targetRect.width / 2 - tooltipLeft - ARROW_SIZE,
        borderWidth: `${ARROW_SIZE}px ${ARROW_SIZE}px 0 ${ARROW_SIZE}px`,
        borderColor: "#0D0D0D transparent transparent transparent",
      });
      break;
  }

  return <div style={style} />;
}
