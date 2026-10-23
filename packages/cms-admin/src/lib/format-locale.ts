/**
 * F211.2 — dates, times and numbers in the ADMIN's language.
 *
 * Every text a person reads in cms-admin follows the admin language — that
 * includes "23. okt. 2026" vs "23 Oct 2026" and "1.234" vs "1,234". Never the
 * browser's locale (no-arg toLocale*), never a hardcoded one.
 *
 * Dates and times always carry an explicit zone: Europe/Copenhagen. On the
 * server the container runs UTC; in the browser it is the owner's zone anyway.
 *
 * Pure helpers take the UiLocale; client components use useFormat(), server
 * code passes `await getRequestLocale()` (from @/i18n/server).
 */
import type { UiLocale } from "@/i18n/locale";
import { useLocale } from "@/lib/i18n-context";

export const FORMAT_TIME_ZONE = "Europe/Copenhagen";

const TAGS: Record<UiLocale, string> = { da: "da-DK", en: "en-GB" };

/** The BCP-47 tag a UiLocale formats with. */
export function formatTag(locale: UiLocale): string {
  return TAGS[locale] ?? TAGS.en;
}

type DateInput = Date | string | number;

function toDate(v: DateInput): Date {
  return v instanceof Date ? v : new Date(v);
}

const DATE_DEFAULT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TIME_DEFAULT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

/** A date — "23 Oct 2026" / "23. okt. 2026" by default. */
export function formatDate(value: DateInput, locale: UiLocale, opts: Intl.DateTimeFormatOptions = DATE_DEFAULT): string {
  return toDate(value).toLocaleDateString(formatTag(locale), { ...opts, timeZone: FORMAT_TIME_ZONE });
}

/** A date with a clock time — the locale's default date+time unless opts say otherwise. */
export function formatDateTime(value: DateInput, locale: UiLocale, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(value).toLocaleString(formatTag(locale), { ...(opts ?? {}), timeZone: FORMAT_TIME_ZONE });
}

/** A clock time — "14:05" by default. */
export function formatTime(value: DateInput, locale: UiLocale, opts: Intl.DateTimeFormatOptions = TIME_DEFAULT): string {
  return toDate(value).toLocaleTimeString(formatTag(locale), { ...opts, timeZone: FORMAT_TIME_ZONE });
}

/** A number — "1,234" / "1.234". */
export function formatNumber(value: number, locale: UiLocale, opts?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(formatTag(locale), opts);
}

/** Client hook: the helpers above, bound to the admin language of this page. */
export function useFormat() {
  const locale = useLocale();
  return {
    locale,
    tag: formatTag(locale),
    date: (v: DateInput, opts?: Intl.DateTimeFormatOptions) => formatDate(v, locale, opts),
    dateTime: (v: DateInput, opts?: Intl.DateTimeFormatOptions) => formatDateTime(v, locale, opts),
    time: (v: DateInput, opts?: Intl.DateTimeFormatOptions) => formatTime(v, locale, opts),
    number: (v: number, opts?: Intl.NumberFormatOptions) => formatNumber(v, locale, opts),
  };
}
