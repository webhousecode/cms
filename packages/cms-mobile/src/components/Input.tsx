import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** Show a clear (×) button when set. Called on tap. */
  onClear?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, onClear, className = "", ...rest },
  ref,
) {
  const showClear = onClear && rest.value;

  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-sm font-medium text-white/70">{label}</span>
      )}
      <div className="relative">
        <input
          ref={ref}
          {...rest}
          className={`min-h-touch w-full rounded-xl border border-white/10 bg-brand-darkSoft px-4 ${
            showClear ? "pr-10" : ""
          } text-base text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/30 ${
            error ? "border-red-500" : ""
          } ${className}`}
        />
        {showClear && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onClear();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white active:scale-90 transition-transform"
            aria-label="Clear"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  );
});
