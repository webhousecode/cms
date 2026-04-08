import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  children: ReactNode;
}

/**
 * Primary button — 44pt min touch target, visible :active state,
 * loading + disabled states. Per the global "knapper skal give feedback" rule.
 */
export function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex min-h-touch items-center justify-center rounded-xl px-5 text-base font-medium";
  const variants = {
    primary: "bg-brand-gold text-brand-dark hover:bg-brand-goldDark",
    secondary: "bg-brand-darkSoft text-white border border-white/10 hover:bg-brand-darkPanel",
    ghost: "bg-transparent text-white hover:bg-white/5",
  };

  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            role="status"
          />
          <span>Working...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
