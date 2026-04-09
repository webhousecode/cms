import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";

interface NavigationStackProps {
  /** The "back" screen rendered underneath (e.g. Home) */
  backScreen: ReactNode;
  /** The "front" screen on top (e.g. Site, Settings) */
  children: ReactNode;
  /** Called when swipe-back completes */
  onBack: () => void;
}

/**
 * iOS-style navigation stack with interactive swipe-back.
 *
 * Renders the back screen underneath with parallax (-80px → 0) and
 * a dim overlay that fades as the front screen slides right.
 * The front screen follows the user's finger from the left edge.
 *
 * Same pattern as Safari, Instagram, and all native iOS apps.
 */
export function NavigationStack({ backScreen, children, onBack }: NavigationStackProps) {
  const x = useMotionValue(0);
  const edgeSwipeActive = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const decided = useRef(false);
  const isHorizontal = useRef(false);

  const EDGE_WIDTH = 28;
  const SCREEN_WIDTH = typeof window !== "undefined" ? window.innerWidth : 390;
  const THRESHOLD = SCREEN_WIDTH * 0.35;

  // Back screen parallax: starts offset left, slides to 0
  const backX = useTransform(x, [0, SCREEN_WIDTH], [-80, 0]);

  // Dim overlay on back screen: dark when covered, fades as front slides away
  const overlayOpacity = useTransform(x, [0, SCREEN_WIDTH], [0.45, 0]);

  // Shadow on left edge of front screen
  const shadowOpacity = useTransform(x, [0, SCREEN_WIDTH * 0.5], [0, 0.5]);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    if (touch.clientX <= EDGE_WIDTH) {
      edgeSwipeActive.current = true;
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      decided.current = false;
      isHorizontal.current = false;
    } else {
      edgeSwipeActive.current = false;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!edgeSwipeActive.current) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - startX.current;
    const dy = Math.abs(touch.clientY - startY.current);

    if (!decided.current && (Math.abs(dx) > 8 || dy > 8)) {
      decided.current = true;
      isHorizontal.current = Math.abs(dx) > dy;
    }

    if (!isHorizontal.current) return;
    x.set(Math.max(0, dx));
  }

  function handleTouchEnd() {
    if (!edgeSwipeActive.current || !isHorizontal.current) {
      edgeSwipeActive.current = false;
      return;
    }

    edgeSwipeActive.current = false;
    const currentX = x.get();

    if (currentX > THRESHOLD) {
      // Complete: navigate immediately
      x.set(0);
      onBack();
    } else {
      // Cancel: spring back
      void animate(x, 0, {
        type: "spring",
        stiffness: 400,
        damping: 35,
      });
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Back screen with parallax offset */}
      <motion.div className="absolute inset-0" style={{ x: backX }}>
        {backScreen}
      </motion.div>

      {/* Dim overlay on back screen */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none"
        style={{ opacity: overlayOpacity }}
        aria-hidden
      />

      {/* Front screen — slides right on swipe */}
      <motion.div
        className="absolute inset-0"
        style={{
          x,
          boxShadow: useTransform(
            shadowOpacity,
            (v) => `-12px 0 40px rgba(0,0,0,${v})`,
          ),
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </motion.div>
    </div>
  );
}
