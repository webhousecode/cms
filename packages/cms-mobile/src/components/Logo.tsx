interface LogoProps {
  /** Eye icon size in px (height = width) */
  size?: number;
  /** Show the wordmark SVG below the eye */
  withWordmark?: boolean;
  className?: string;
}

/**
 * Brand mark — eye glyph + optional wordmark.
 *
 * Both the eye and the wordmark are real SVG files from /logo/, copied
 * into /public/ at scaffold time. Vite serves them at the app root.
 *
 * NEVER replace these with plain text — the wordmark is part of the brand.
 */
export function Logo({ size = 96, withWordmark = true, className = "" }: LogoProps) {
  // Wordmark SVG has its own intrinsic ratio (1122.69 × 255.2 → ~4.4:1).
  // Scale its width to feel proportional to the eye.
  const wordmarkWidth = Math.round(size * 1.7);
  const wordmarkHeight = Math.round(wordmarkWidth / 4.4);

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/eye.svg"
        alt=""
        width={size}
        height={size}
        draggable={false}
        style={{ pointerEvents: "none" }}
      />
      {withWordmark && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/wordmark.svg"
          alt="webhouse.app"
          width={wordmarkWidth}
          height={wordmarkHeight}
          draggable={false}
          style={{ pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
