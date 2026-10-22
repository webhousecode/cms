"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";
import { useT } from "@/lib/i18n-context";
import { LANGUAGE_NAMES, UI_LOCALES } from "@/i18n/locale";

const AUTOMATIC = "auto";

/**
 * F211.1 — the admin language, stored on the user (global, not per site).
 * "Automatic" clears the choice: the brand's default, then the browser, decide.
 */
export function AdminLanguageSection() {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // no-store: show what the server holds, never a cached value.
    fetch("/api/admin/profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { uiLocale?: string | null } | null) => setValue(p?.uiLocale ?? AUTOMATIC))
      .catch(() => setValue(AUTOMATIC));
  }, []);

  async function choose(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiLocale: next === AUTOMATIC ? null : next }),
      });
      const body = (await res.json().catch(() => null)) as { uiLocale?: string | null } | null;
      // The server echoes what it stored — a 200 that stored something else is not a save.
      if (!res.ok || (body?.uiLocale ?? AUTOMATIC) !== next) throw new Error("not saved");
      toast.success(t("account.language.saved"));
      router.refresh();
    } catch {
      setValue(previous);
      toast.error(t("account.language.error"));
    } finally {
      setSaving(false);
    }
  }

  const options = [
    { value: AUTOMATIC, label: t("account.language.automatic") },
    ...UI_LOCALES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
  ];

  return (
    <div data-testid="account-language-section">
      <SectionHeading>{t("account.language.heading")}</SectionHeading>
      <label style={{ fontSize: "0.7rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>
        {t("account.language.label")}
      </label>
      <div data-testid="account-language-select" style={{ maxWidth: "16rem" }}>
        <CustomSelect
          options={options}
          value={value ?? AUTOMATIC}
          onChange={(v) => void choose(v)}
          disabled={value === null || saving}
        />
      </div>
      <p style={{ fontSize: "0.7rem", color: "var(--muted-foreground)", marginTop: "0.4rem" }}>
        {t("account.language.hint")}
      </p>
    </div>
  );
}
