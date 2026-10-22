"use client";

import { Fragment, useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { ClipboardList, Plus, Lock } from "lucide-react";
import { useT } from "@/lib/i18n-context";

/** Renders a translated sentence whose {placeholders} are React nodes. */
function withParts(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((p, i) => {
    const m = p.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m && m[1] in parts ? parts[m[1]] : p}</Fragment>;
  });
}

interface FormSummary {
  name: string;
  label: string;
  fieldCount: number;
  unread: number;
  source: "config" | "admin";
  hasAutoReply: boolean;
}

export default function FormsListPage() {
  const t = useT();
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/forms")
      .then((r) => r.json())
      .then((d: { forms: FormSummary[] }) => setForms(d.forms ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div data-testid="forms-root">
      <ActionBar>
        <ActionBarBreadcrumb items={[t("tools.forms.title")]} />
        <Link
          href="/admin/forms/builder"
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            marginLeft: "auto", fontSize: "0.78rem", padding: "0.35rem 0.75rem",
            borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--primary)", color: "var(--primary-foreground)",
            textDecoration: "none", fontWeight: 600,
          }}
        >
          <Plus size={14} /> {t("tools.forms.newForm")}
        </Link>
      </ActionBar>
      <div className="p-8 max-w-4xl">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("tools.forms.loading")}</p>
        ) : forms.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground" size={36} />
            <h2 className="text-lg font-semibold mb-1">{t("tools.forms.noForms")}</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {withParts(t("tools.forms.noFormsHint"), {
                config: <code className="text-xs px-1.5 py-0.5 rounded bg-muted">cms.config.ts</code>,
                forms: <code className="text-xs px-1.5 py-0.5 rounded bg-muted">forms</code>,
              })}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {forms.map((f) => (
              <Link
                key={f.name}
                href={`/admin/forms/${f.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "1rem 1.25rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "border-color 0.15s",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{f.label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                    <span>{t("tools.forms.fieldCountEndpoint", { n: f.fieldCount, name: f.name })}</span>
                    {f.source === "config" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontSize: "0.6rem", padding: "0.1rem 0.4rem", borderRadius: 3, border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                        <Lock size={9} /> {t("tools.forms.configBadge")}
                      </span>
                    )}
                  </div>
                </div>
                {f.unread > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "1.5rem",
                      height: "1.5rem",
                      padding: "0 0.4rem",
                      borderRadius: 999,
                      background: "var(--primary)",
                      color: "var(--primary-foreground)",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                    }}
                  >
                    {f.unread}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
