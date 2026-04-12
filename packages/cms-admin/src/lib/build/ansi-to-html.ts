/**
 * F126 — Lightweight ANSI escape code → HTML converter.
 *
 * Handles common SGR codes (colors, bold, underline, reset).
 * Returns sanitized HTML safe for dangerouslySetInnerHTML.
 */

const ANSI_COLORS: Record<number, string> = {
  30: "#1e1e1e", // black
  31: "#e55561", // red
  32: "#8cc265", // green
  33: "#d18f52", // yellow
  34: "#4d9ee6", // blue
  35: "#c162de", // magenta
  36: "#42b3c2", // cyan
  37: "#d4d4d4", // white
  90: "#808080", // bright black (gray)
  91: "#ff6b6b", // bright red
  92: "#a6e22e", // bright green
  93: "#f0c674", // bright yellow
  94: "#69b7ff", // bright blue
  95: "#d48fd6", // bright magenta
  96: "#5fd7d7", // bright cyan
  97: "#ffffff", // bright white
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: "#1e1e1e",
  41: "#e55561",
  42: "#8cc265",
  43: "#d18f52",
  44: "#4d9ee6",
  45: "#c162de",
  46: "#42b3c2",
  47: "#d4d4d4",
};

/** Escape HTML entities to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert a line of text with ANSI escape codes to HTML.
 * Returns sanitized HTML string.
 */
export function ansiToHtml(line: string): string {
  // Strip the line of ANSI codes and convert to styled spans
  const parts: string[] = [];
  let currentStyles: string[] = [];

  // Match ANSI escape sequences: ESC[ ... m
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      const text = escapeHtml(line.slice(lastIndex, match.index));
      if (currentStyles.length > 0) {
        parts.push(`<span style="${currentStyles.join(";")}">${text}</span>`);
      } else {
        parts.push(text);
      }
    }
    lastIndex = match.index + match[0].length;

    // Parse SGR codes
    const codes = (match[1] || "0").split(";").map(Number);
    for (const code of codes) {
      if (code === 0) {
        // Reset
        currentStyles = [];
      } else if (code === 1) {
        currentStyles.push("font-weight:bold");
      } else if (code === 2) {
        currentStyles.push("opacity:0.7");
      } else if (code === 3) {
        currentStyles.push("font-style:italic");
      } else if (code === 4) {
        currentStyles.push("text-decoration:underline");
      } else if (code === 9) {
        currentStyles.push("text-decoration:line-through");
      } else if (ANSI_COLORS[code]) {
        currentStyles.push(`color:${ANSI_COLORS[code]}`);
      } else if (ANSI_BG_COLORS[code]) {
        currentStyles.push(`background:${ANSI_BG_COLORS[code]}`);
      }
    }
  }

  // Remaining text after last escape
  if (lastIndex < line.length) {
    const text = escapeHtml(line.slice(lastIndex));
    if (currentStyles.length > 0) {
      parts.push(`<span style="${currentStyles.join(";")}">${text}</span>`);
    } else {
      parts.push(text);
    }
  }

  return parts.join("");
}
