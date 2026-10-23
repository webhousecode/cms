import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { UiLocale } from "@/i18n/locale"
import { formatDate as formatDateIn } from "@/lib/format-locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "23 Oct 2026" / "23. okt. 2026" — pass the admin locale (F211.2); English when omitted. */
export function formatDate(dateStr: string | undefined | null, locale: UiLocale = "en"): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return formatDateIn(d, locale);
}

/** Build a clean preview path — encodeURI keeps :// and / readable */
export function previewPath(url: string): string {
  return `/admin/preview?url=${encodeURI(url)}`;
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
