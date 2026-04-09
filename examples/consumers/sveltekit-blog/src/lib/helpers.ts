/** Safely extract a string field from doc.data. Client-safe (no node:fs). */
export function getString(doc: { data?: Record<string, unknown> } | null, key: string, fallback = ''): string {
  if (!doc?.data) return fallback;
  const v = doc.data[key];
  return typeof v === 'string' ? v : fallback;
}
