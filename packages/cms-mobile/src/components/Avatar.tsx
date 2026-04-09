import { useState } from "react";

interface AvatarProps {
  /** Display name — used for initials fallback */
  name: string;
  /** Email — used for the initial-letter fallback if no name */
  email?: string;
  /** Resolved avatar URL (gravatar, github, etc) — may 404 */
  src?: string;
  size?: number;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * User avatar with the same fallback chain as cms-admin's web Avatar:
 *   1. Try `src` (Gravatar `d=404` or GitHub `.png`)
 *   2. On image load error → fall back to initials on the brand-gold background
 *   3. If no name/email → fall back to "?"
 *
 * Pure component — no native plugins. Works on web preview and on device.
 */
export function Avatar({ name, email, src, size = 48 }: AvatarProps) {
  const [errored, setErrored] = useState(false);

  const initials =
    getInitials(name) || (email?.[0]?.toUpperCase() ?? "?");

  const showImage = src && !errored;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full border border-white/10 bg-brand-gold flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-semibold text-brand-dark"
          style={{ fontSize: Math.max(12, Math.round(size * 0.4)) }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
