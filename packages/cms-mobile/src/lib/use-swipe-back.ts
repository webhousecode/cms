import { useEffect, useRef } from "react";

/**
 * iOS-style swipe-from-left-edge to navigate back.
 *
 * Detects a touch starting within 20px of the left screen edge,
 * tracks horizontal movement, and if the swipe exceeds 80px rightward
 * (or has sufficient velocity), triggers the onBack callback.
 *
 * Attach to any screen that has a "back" concept.
 */
export function useSwipeBack(onBack: () => void) {
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const startedFromEdge = useRef(false);

  useEffect(() => {
    const EDGE_WIDTH = 24; // px from left edge to recognize as edge swipe
    const MIN_DISTANCE = 80; // px horizontal to trigger back
    const MAX_Y_DRIFT = 80; // px vertical allowed (prevents scroll conflicts)

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      if (touch.clientX <= EDGE_WIDTH) {
        startXRef.current = touch.clientX;
        startYRef.current = touch.clientY;
        startedFromEdge.current = true;
      } else {
        startedFromEdge.current = false;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!startedFromEdge.current || startXRef.current === null || startYRef.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startXRef.current;
      const dy = Math.abs(touch.clientY - startYRef.current);

      if (dx > MIN_DISTANCE && dy < MAX_Y_DRIFT) {
        onBack();
      }

      startXRef.current = null;
      startYRef.current = null;
      startedFromEdge.current = false;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [onBack]);
}
