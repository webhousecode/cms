import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = "", ...rest },
  ref,
) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-sm font-medium text-white/70">{label}</span>
      )}
      <input
        ref={ref}
        {...rest}
        className={`min-h-touch rounded-xl border border-white/10 bg-brand-darkSoft px-4 text-base text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30 ${
          error ? "border-red-500" : ""
        } ${className}`}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
});
