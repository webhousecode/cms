import type { ReactNode } from "react";

interface ScreenProps {
  children: ReactNode;
  className?: string;
}

/** Safe-area-aware screen container. Use as the root of every screen. */
export function Screen({ children, className = "" }: ScreenProps) {
  return (
    <div
      className={`flex min-h-screen flex-col bg-brand-dark text-white safe-top safe-bottom ${className}`}
    >
      {children}
    </div>
  );
}
