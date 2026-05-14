"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  showValue?: boolean;
  valueFormat?: (v: number) => string;
  style?: CSSProperties;
  ariaLabel?: string;
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function snap(v: number, step: number, min: number) {
  if (step <= 0) return v;
  const n = Math.round((v - min) / step);
  return min + n * step;
}

export function CustomRangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  showValue = false,
  valueFormat,
  style,
  ariaLabel,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(false);

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const raw = min + ratio * (max - min);
      const snapped = clamp(snap(raw, step, min), min, max);
      if (snapped !== value) onChange(snapped);
    },
    [min, max, step, value, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    function move(e: MouseEvent) {
      setFromClientX(e.clientX);
    }
    function up() {
      setDragging(false);
    }
    function touchMove(e: TouchEvent) {
      if (e.touches.length > 0) setFromClientX(e.touches[0].clientX);
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    document.addEventListener("touchmove", touchMove, { passive: true });
    document.addEventListener("touchend", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", touchMove);
      document.removeEventListener("touchend", up);
    };
  }, [dragging, setFromClientX]);

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    let next = value;
    const big = Math.max(step, (max - min) / 10);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step;
    else if (e.key === "PageDown") next = value - big;
    else if (e.key === "PageUp") next = value + big;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else return;
    e.preventDefault();
    next = clamp(snap(next, step, min), min, max);
    if (next !== value) onChange(next);
  }

  const tooltipVisible = (hover || dragging) && !disabled && showValue;
  const display = valueFormat ? valueFormat(value) : String(value);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        padding: "0.875rem 0",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Track */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        onMouseDown={(e) => {
          if (disabled) return;
          setDragging(true);
          setFromClientX(e.clientX);
        }}
        onTouchStart={(e) => {
          if (disabled || e.touches.length === 0) return;
          setDragging(true);
          setFromClientX(e.touches[0].clientX);
        }}
        onKeyDown={handleKey}
        style={{
          position: "relative",
          width: "100%",
          height: "4px",
          borderRadius: "999px",
          background: "var(--muted)",
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
        }}
      >
        {/* Fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct}%`,
            borderRadius: "999px",
            background: "var(--primary)",
            transition: dragging ? "none" : "width 80ms",
          }}
        />
        {/* Thumb */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            width: "16px",
            height: "16px",
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            background: "var(--primary)",
            border: "2px solid var(--card)",
            boxShadow: dragging
              ? "0 0 0 6px color-mix(in srgb, var(--primary) 25%, transparent)"
              : hover && !disabled
              ? "0 0 0 4px color-mix(in srgb, var(--primary) 18%, transparent)"
              : "0 1px 2px rgba(0,0,0,0.2)",
            transition: dragging ? "none" : "box-shadow 120ms, left 80ms",
            pointerEvents: "none",
          }}
        />
        {/* Tooltip */}
        {tooltipVisible && (
          <div
            style={{
              position: "absolute",
              left: `${pct}%`,
              bottom: "calc(100% + 8px)",
              transform: "translateX(-50%)",
              padding: "0.15rem 0.4rem",
              borderRadius: "4px",
              background: "var(--foreground)",
              color: "var(--background)",
              fontSize: "0.7rem",
              fontFamily: "ui-monospace, SFMono-Regular, monospace",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
            }}
          >
            {display}
          </div>
        )}
      </div>
    </div>
  );
}
