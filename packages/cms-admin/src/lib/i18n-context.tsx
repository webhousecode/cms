"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { translate, type Dict } from "@broberg/i18n";
import { SOURCE_LOCALE, type UiLocale } from "@/i18n/locale";

/** F211 — the admin language chosen on the server for this request. */
const I18nContext = createContext<{ locale: UiLocale; messages: Partial<Record<UiLocale, Dict>> }>({
  locale: SOURCE_LOCALE,
  messages: {},
});

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: UiLocale;
  messages: Partial<Record<UiLocale, Dict>>;
  children: ReactNode;
}) {
  return <I18nContext.Provider value={{ locale, messages }}>{children}</I18nContext.Provider>;
}

export function useLocale(): UiLocale {
  return useContext(I18nContext).locale;
}

/** t("account.language.label") — missing in the active language → English → the key. */
export function useT() {
  const { locale, messages } = useContext(I18nContext);
  return useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(messages as Record<string, Dict>, locale, key, vars, { fallbackLocale: SOURCE_LOCALE }),
    [locale, messages],
  );
}
