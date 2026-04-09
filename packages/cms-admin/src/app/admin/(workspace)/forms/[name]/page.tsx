"use client";

import { use, useState, useEffect, useCallback } from "react";
import { ActionBar, ActionBarBreadcrumb } from "@/components/action-bar";
import { Download, Inbox } from "lucide-react";

interface Submission {
  id: string;
  form: string;
  data: Record<string, unknown>;
  status: "new" | "read" | "archived";
  createdAt: string;
  readAt?: string;
}

export default function FormInboxPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "read" | "archived">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(() => {
    const qs = filter !== "all" ? `?status=${filter}` : "";
    fetch(`/api/admin/forms/${name}/submissions${qs}`)
      .then((r) => r.json())
      .then((d: { submissions: Submission[] }) => setSubs(d.submissions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name, filter]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/admin/forms/${name}/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "read" }),
    });
    load();
  }

  async function archive(id: string) {
    await fetch(`/api/admin/forms/${name}/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    load();
  }

  async function deleteSub(id: string) {
    await fetch(`/api/admin/forms/${name}/submissions/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setSelected(null);
    load();
  }

  const selectedSub = subs.find((s) => s.id === selected);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Preview: pick first 2-3 string fields as summary
  function preview(data: Record<string, unknown>): string {
    return Object.values(data)
      .filter((v) => typeof v === "string" && v.length > 0)
      .slice(0, 3)
      .map((v) => String(v).slice(0, 60))
      .join(" · ");
  }

  return (
    <>
      <ActionBar>
        <ActionBarBreadcrumb items={["Forms", name]} />
        <a
          href={`/api/admin/forms/${name}/export`}
          download
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75rem",
            padding: "0.3rem 0.7rem",
            borderRadius: 5,
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--foreground)",
            textDecoration: "none",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          <Download size={14} /> CSV
        </a>
      </ActionBar>
      <div className="p-8 max-w-5xl">
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {(["all", "new", "read", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "0.3rem 0.7rem",
                borderRadius: 5,
                border: filter === f ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: filter === f ? "var(--primary)" : "var(--card)",
                color: filter === f ? "var(--primary-foreground)" : "var(--foreground)",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : subs.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className="mx-auto mb-3 text-muted-foreground" size={36} />
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "1rem" }}>
            {/* List */}
            <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {subs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    setSelected(sub.id);
                    if (sub.status === "new") markRead(sub.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: 6,
                    border: selected === sub.id ? "1px solid var(--primary)" : "1px solid var(--border)",
                    background: selected === sub.id ? "var(--accent)" : "var(--card)",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                    color: "inherit",
                  }}
                >
                  {/* Status dot */}
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: sub.status === "new" ? "var(--primary)" : sub.status === "read" ? "var(--muted-foreground)" : "var(--border)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: sub.status === "new" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preview(sub.data) || "(empty)"}
                    </div>
                    <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
                      {formatDate(sub.createdAt)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail panel */}
            {selectedSub && (
              <div
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  padding: "1.25rem",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              >
                <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
                  {formatDate(selectedSub.createdAt)} · {selectedSub.status}
                </div>
                <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {Object.entries(selectedSub.data).map(([k, v]) => (
                    <div key={k}>
                      <dt style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {k}
                      </dt>
                      <dd style={{ margin: "0.15rem 0 0", fontSize: "0.85rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {String(v ?? "")}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {selectedSub.status !== "archived" && (
                    <button
                      onClick={() => archive(selectedSub.id)}
                      style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: 4, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}
                    >
                      Archive
                    </button>
                  )}
                  {confirmDelete === selectedSub.id ? (
                    <>
                      <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px", alignSelf: "center" }}>Delete?</span>
                      <button
                        onClick={() => deleteSub(selectedSub.id)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(selectedSub.id)}
                      style={{ fontSize: "0.7rem", padding: "0.3rem 0.7rem", borderRadius: 4, border: "1px solid var(--destructive)", background: "transparent", color: "var(--destructive)", cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
