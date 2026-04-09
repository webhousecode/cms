import type { ReactNode } from "react";

interface ScreenProps {
  children: ReactNode;
  className?: string;
}

/** Safe-area-aware screen container. Use as the root of every screen.
 *  Uses h-screen + overflow-hidden so the page fills the viewport exactly.
 *  Screens with scrollable content use overflow-auto on inner containers. */
export function Screen({ children, className = "" }: ScreenProps) {
  return (
    <div
      className={`flex h-screen flex-col overflow-hidden bg-brand-dark text-white safe-top safe-bottom ${className}`}
    >
      {children}
    </div>
  );
}
