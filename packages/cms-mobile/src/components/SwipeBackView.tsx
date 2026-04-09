import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";

interface SwipeBackViewProps {
  children: ReactNode;
  onBack: () => void;
}

/**
 * iOS-style interactive swipe-back gesture.
 *
 * Wraps a screen's content. When the user swipes from the left edge,
 * the current screen slides right following their finger in real-time.
 * A shadow and dimmed background appear underneath, simulating the
 * previous screen being revealed. On release past the threshold (or
 * with sufficient velocity), the animation completes and navigates back.
 *
 * Replaces the old useSwipeBack hook which did a hard navigate with
 * no visual transition.
 */
export function SwipeBackView({ children, onBack }: SwipeBackViewProps) {
  const x = useMotionValue(0);
  const edgeSwipeActive = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const decided = useRef(false);
  const isHorizontal = useRef(false);

  const EDGE_WIDTH = 28;
  const SCREEN_WIDTH = typeof window !== "undefined" ? window.innerWidth : 390;
  const THRESHOLD = SCREEN_WIDTH * 0.35;
  const VELOCITY_THRESHOLD = 400;

  // Shadow on left edge of current screen, fades as it moves right
  const shadowOpacity = useTransform(x, [0, SCREEN_WIDTH], [0, 0.6]);

  // Background darkens as screen slides away (simulates dimmed previous screen)
  const bgOpacity = useTransform(x, [0, SCREEN_WIDTH], [0.5, 0]);

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

    // Decide direction on first significant movement
    if (!decided.current && (Math.abs(dx) > 8 || dy > 8)) {
      decided.current = true;
      isHorizontal.current = Math.abs(dx) > dy;
    }

    if (!isHorizontal.current) return;

    // Only move right (positive dx), don't allow swiping left
    const clamped = Math.max(0, dx);
    x.set(clamped);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!edgeSwipeActive.current || !isHorizontal.current) {
      edgeSwipeActive.current = false;
      return;
    }

    const touch = e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - startX.current;
    const currentX = x.get();

    // Calculate velocity (approximate from final position)
    const velocity = dx > 0 ? (dx / 0.3) : 0; // rough estimate

    edgeSwipeActive.current = false;

    if (currentX > THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      // Complete: navigate immediately — the user already saw the screen move.
      // No need to wait for animation; the route change replaces the screen.
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
    <div className="relative h-full w-full">
      {/* Background layer — simulates dimmed previous screen */}
      <motion.div
        className="absolute inset-0 bg-brand-dark"
        style={{ opacity: bgOpacity }}
        aria-hidden
      />

      {/* Current screen — slides right on swipe */}
      <motion.div
        className="relative h-full w-full"
        style={{
          x,
          boxShadow: useTransform(
            shadowOpacity,
            (v) => `-8px 0 24px rgba(0,0,0,${v})`,
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
