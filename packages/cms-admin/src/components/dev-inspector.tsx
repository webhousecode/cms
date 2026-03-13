"use client";

import { useEffect, useRef, useState } from "react";

/* Walk up the React fiber tree to find the nearest named components */
function getComponentName(el: Element): string | null {
  const fiberKey = Object.keys(el).find(
    (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
  );
  if (!fiberKey) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fiber = (el as any)[fiberKey];
  const names: string[] = [];
  const skip = new Set([
    // DOM elements
    "div","span","p","a","button","li","ul","ol","header","main","section",
    "nav","footer","form","input","label","td","tr","th","tbody","thead",
    "table","img","svg","path","g","circle","rect","h1","h2","h3","h4",
    // Radix / floating-ui internals
    "TooltipProvider","TooltipPortal","TooltipContent","TooltipTrigger",
    "FloatingDelayGroup","FloatingPortal","FloatingFocusManager",
    "PopoverPortal","PopoverContent","PopoverTrigger",
    "DialogPortal","DialogOverlay","DialogContent",
    "DropdownMenuPortal","DropdownMenuContent",
    "Primitive","Slot","SlotClone","Root","Portal",
    // TipTap internals
    "SegmentViewNode","NodeViewWrapper","NodeViewContent","EditorContent",
    "PureEditorContent","BubbleMenuView","FloatingMenuView",
    // React internals
    "Suspense","Fragment","Provider","Consumer","Context",
    // Next.js internals
    "ServerComponent","InnerLayoutRouter","OuterLayoutRouter","RedirectBoundary",
    "NotFoundBoundary","ScrollAndFocusHandler","RenderFromTemplateContext",
  ]);

  while (fiber && names.length < 4) {
    const t = fiber.type;
    if (t) {
      const name = typeof t === "function" ? (t.displayName || t.name) : null;
      if (name && !skip.has(name) && !name.startsWith("_") && !name.startsWith("Suspense")) {
        if (!names.includes(name)) names.push(name);
      }
    }
    fiber = fiber.return;
  }

  return names.length > 0 ? names.join(" › ") : null;
}

export function DevInspector() {
  const [active, setActive] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const rafRef = useRef<number | null>(null);

  function toggle() {
    setActive((v) => !v);
    setTooltip(null);
  }

  /* Ctrl+I to toggle, Cmd+C to copy tooltip */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.code === "KeyI") {
        e.preventDefault();
        toggle();
      }
      if (e.metaKey && e.code === "KeyC" && active) {
        const name = tooltip?.name;
        if (name) {
          e.preventDefault();
          navigator.clipboard.writeText(name).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tooltip]);

  /* Track mouse when active */
  useEffect(() => {
    if (!active) { setTooltip(null); return; }

    function onMove(e: MouseEvent) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el) { setTooltip(null); return; }
        const name = getComponentName(el);
        setTooltip(name ? { x: e.clientX, y: e.clientY, name } : null);
      });
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  /* Outline on hover */
  useEffect(() => {
    if (!active) return;
    const style = document.createElement("style");
    style.id = "dev-inspector-style";
    style.textContent = `
      body * { cursor: crosshair !important; }
      body *:hover { outline: 1.5px solid #f59e0b !important; outline-offset: 1px !important; }
    `;
    document.head.appendChild(style);
    return () => document.getElementById("dev-inspector-style")?.remove();
  }, [active]);

  return (
    <>
      {/* Toggle badge — always visible, clickable */}
      <button
        type="button"
        onClick={toggle}
        title="Toggle dev inspector (Ctrl+I)"
        style={{
          position: "fixed", bottom: "12px", right: "12px", zIndex: 9999,
          padding: "3px 8px", borderRadius: "6px", border: "none",
          background: active ? "#f59e0b" : "rgba(255,255,255,0.07)",
          color: active ? "#000" : "rgba(255,255,255,0.3)",
          fontSize: "10px", fontFamily: "monospace", fontWeight: active ? 700 : 400,
          letterSpacing: "0.06em", cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        {active ? "INSPECT ×" : "inspect"}
      </button>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: Math.min(tooltip.x + 14, window.innerWidth - 380),
          top: tooltip.y + 14,
          zIndex: 10000,
          maxWidth: "360px",
          padding: "5px 10px",
          borderRadius: "6px",
          background: "rgba(0,0,0,0.9)",
          border: "1px solid #f59e0b",
          color: "#f59e0b",
          fontSize: "11px",
          fontFamily: "monospace",
          fontWeight: 500,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {copied ? <span style={{ color: "#4ade80" }}>✓ copied</span> : tooltip.name}
          {!copied && <span style={{ opacity: 0.4, marginLeft: "0.75rem" }}>⌘C</span>}
        </div>
      )}
    </>
  );
}
