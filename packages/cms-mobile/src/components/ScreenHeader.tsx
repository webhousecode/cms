import type { ReactNode } from "react";
import { Avatar } from "./Avatar";

interface ScreenHeaderProps {
  /**
   * Left slot — usually an Avatar (Home) or a back button (Site).
   * Both render at the same fixed 48×48 pixel slot so the visual
   * landmark NEVER shifts between screens. This is the rule.
   */
  left: ReactNode;
  /** Title — large, single line, truncates */
  title: string;
  /** Subtitle — small, single line under the title */
  subtitle?: string;
  /** Optional right slot — chip, badge, action icon */
  right?: ReactNode;
}

/**
 * Universal screen header — pixel-locked geometry across all screens.
 *
 * Why: layout hops between screens are jarring and unprofessional. The
 * avatar on Home and the back button on Site MUST land on the same x/y
 * pixel coordinates. This component enforces that.
 *
 * Slots:
 *   [48px left]  [flex title/subtitle]  [auto right]
 *   ^padding-x: 24, padding-y: 24, gap: 12
 *
 * Use this in EVERY screen. No bespoke headers.
 */
export function ScreenHeader({ left, title, subtitle, right }: ScreenHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-6 pt-6 pb-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center">
        {left}
      </div>
      <div className="min-w-0 flex-1">
        {subtitle && (
          <p className="text-xs uppercase text-white/40 tracking-wider truncate">
            {subtitle}
          </p>
        )}
        <p className="text-base font-medium truncate">{title}</p>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

/**
 * Convenience: a back-arrow button shaped exactly like the avatar slot
 * so swapping Avatar ↔ BackButton in the `left` slot causes ZERO layout shift.
 */
interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export function BackButton({ onClick, label = "Back" }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-darkSoft border border-white/10 text-white/80 hover:border-white/30 active:scale-95"
    >
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <path
          d="M10 4l-4 4 4 4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Avatar wrapper that fits the 48×48 slot. Just delegates to <Avatar/>
 * with size=48 — kept here so callers don't have to repeat the size.
 */
export function HeaderAvatar(props: { name: string; email?: string; src?: string }) {
  return <Avatar {...props} size={48} />;
}
