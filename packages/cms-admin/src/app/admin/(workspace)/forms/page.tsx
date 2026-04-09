"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { ClipboardList } from "lucide-react";

interface FormSummary {
  name: string;
  label: string;
  fieldCount: number;
  unread: number;
}

export default function FormsListPage() {
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
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Forms"]} />
      </ActionBar>
      <div className="p-8 max-w-4xl">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : forms.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="mx-auto mb-3 text-muted-foreground" size={36} />
            <h2 className="text-lg font-semibold mb-1">No forms configured</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Define forms in your <code className="text-xs px-1.5 py-0.5 rounded bg-muted">cms.config.ts</code> under
              the <code className="text-xs px-1.5 py-0.5 rounded bg-muted">forms</code> array. Each form creates a
              public submission endpoint and an inbox here.
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
                  <div style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", marginTop: "0.15rem" }}>
                    {f.fieldCount} fields · POST /api/forms/{f.name}
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
    </>
  );
}
