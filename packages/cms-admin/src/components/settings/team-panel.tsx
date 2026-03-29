"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { UserPlus, Trash2, Copy, Check, Mail, Shield, Pencil, Eye, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { SectionHeading } from "@/components/ui/section-heading";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  invitedBy?: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

interface AvailableUser {
  id: string;
  email: string;
  name: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
};

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "var(--primary)",
    editor: "var(--chart-2, #22c55e)",
    viewer: "var(--muted-foreground)",
  };
  return (
    <span
      style={{
        fontSize: "0.65rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        padding: "0.15rem 0.5rem",
        borderRadius: "9999px",
        background: `color-mix(in srgb, ${colors[role] ?? "var(--muted-foreground)"} 15%, transparent)`,
        color: colors[role] ?? "var(--muted-foreground)",
      }}
    >
      {role}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      title="Copy invite link"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px",
        color: copied ? "var(--primary)" : "var(--muted-foreground)",
        display: "flex",
        alignItems: "center",
      }}
      className="hover:text-foreground transition-colors"
    >
      {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
    </button>
  );
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function TeamPanel() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [lastInviteLink, setLastInviteLink] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ sent: boolean; error?: string } | null>(null);

  // Autocomplete
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [usersRes, invRes, meRes, availRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/invitations"),
        fetch("/api/auth/me"),
        fetch("/api/admin/users/available"),
      ]);
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users);
      }
      if (invRes.ok) {
        const data = await invRes.json();
        setInvitations(data.invitations);
      }
      if (meRes.ok) {
        const data = await meRes.json();
        if (data.user) setCurrentUserId(data.user.id);
      }
      if (availRes.ok) {
        const data = await availRes.json();
        setAvailableUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError("");
    setLastInviteLink("");
    setEmailStatus(null);
    try {
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? "Failed to create invitation");
        return;
      }
      // Build invite link
      const link = `${window.location.origin}/admin/invite/${data.invitation.token}`;
      setLastInviteLink(link);
      setEmailStatus({ sent: data.emailSent ?? false, error: data.emailError });
      toast.success("Invitation sent", { description: inviteEmail.trim() });
      setInviteEmail("");
      load();
    } catch {
      setInviteError("Network error");
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(userId: string, newRole: string) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function handleDeleteUser(userId: string) {
    await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    toast.success("User removed");
    load();
  }

  async function handleRevokeInvite(invId: string) {
    await fetch(`/api/admin/invitations/${invId}`, { method: "DELETE" });
    setConfirmRevokeId(null);
    toast.success("Invitation revoked");
    load();
  }

  function filteredSuggestions(query: string): AvailableUser[] {
    const q = query.toLowerCase();
    return availableUsers.filter(
      (u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading team...</p>;
  }

  return (
    <div data-testid="panel-team" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Invite form */}
      <div>
        <SectionHeading>Invite a team member</SectionHeading>
        <p className="text-xs text-muted-foreground" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Invite an existing user or a new email address to this site.
        </p>
        <form onSubmit={handleInvite} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setShowSuggestions(e.target.value.length > 0 && filteredSuggestions(e.target.value).length > 0);
              }}
              onFocus={() => {
                if (inviteEmail.length > 0 && filteredSuggestions(inviteEmail).length > 0) {
                  setShowSuggestions(true);
                } else if (availableUsers.length > 0 && inviteEmail.length === 0) {
                  setShowSuggestions(true);
                }
              }}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              required
              autoComplete="off"
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "var(--input)",
                color: "var(--foreground)",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && (
              <div
                ref={suggestionsRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                  zIndex: 50,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                {(inviteEmail.length === 0 ? availableUsers : filteredSuggestions(inviteEmail)).map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setInviteEmail(u.email);
                      setShowSuggestions(false);
                      inputRef.current?.focus();
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.1rem",
                      width: "100%",
                      padding: "0.5rem 0.75rem",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                    }}
                    className="hover:bg-accent transition-colors"
                  >
                    <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "var(--foreground)" }}>{u.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}>{u.email}</span>
                  </button>
                ))}
                {inviteEmail.length > 0 && filteredSuggestions(inviteEmail).length === 0 && availableUsers.length > 0 && (
                  <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "var(--muted-foreground)" }}>
                    New email — will create invitation for new user
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ width: 120 }}>
            <CustomSelect
              options={ROLE_OPTIONS}
              value={inviteRole}
              onChange={setInviteRole}
            />
          </div>
          <Button type="submit" size="sm" disabled={inviting} className="gap-1.5">
            <UserPlus className="w-3.5 h-3.5" />
            {inviting ? "Sending..." : "Invite"}
          </Button>
        </form>
        {inviteError && (
          <p className="text-sm mt-2" style={{ color: "var(--destructive)" }}>{inviteError}</p>
        )}
        {lastInviteLink && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--card)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Mail style={{ width: 14, height: 14, color: "var(--primary)", flexShrink: 0 }} />
            <code
              style={{
                fontSize: "0.75rem",
                color: "var(--muted-foreground)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {lastInviteLink}
            </code>
            <CopyButton text={lastInviteLink} />
          </div>
        )}
        {lastInviteLink && emailStatus && (
          <p
            className="text-xs mt-1.5"
            style={{ color: emailStatus.sent ? "var(--chart-2, #22c55e)" : "var(--muted-foreground)" }}
          >
            {emailStatus.sent
              ? "Invitation email sent!"
              : emailStatus.error
                ? `Email not sent: ${emailStatus.error}`
                : "Email not configured — share the link manually. Set up Resend in Settings → Email."}
          </p>
        )}
      </div>

      {/* Team members */}
      <div>
        <SectionHeading>Team members</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {users.map((user) => {
            const Icon = ROLE_ICONS[user.role] ?? Eye;
            const isMe = user.id === currentUserId;
            return (
              <div
                key={user.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "var(--muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="text-sm font-medium text-foreground">{user.name}</span>
                    {isMe && (
                      <span
                        style={{
                          fontSize: "0.6rem",
                          padding: "0.1rem 0.4rem",
                          borderRadius: "9999px",
                          background: "var(--muted)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        you
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.email}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {isMe ? (
                    <RoleBadge role={user.role} />
                  ) : (
                    <>
                      <div style={{ width: 100 }}>
                        <CustomSelect
                          options={ROLE_OPTIONS}
                          value={user.role}
                          onChange={(r) => handleChangeRole(user.id, r)}
                        />
                      </div>
                      {confirmDeleteId === user.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(user.id)}
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              border: "none",
                              background: "var(--destructive)",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            style={{
                              fontSize: "0.65rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: "4px",
                              border: "1px solid var(--border)",
                              background: "transparent",
                              color: "var(--foreground)",
                              cursor: "pointer",
                            }}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(user.id)}
                          title="Remove user"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--muted-foreground)",
                            padding: "4px",
                            display: "flex",
                            alignItems: "center",
                          }}
                          className="hover:text-destructive transition-colors"
                        >
                          <Trash2 style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div>
          <SectionHeading>Pending invitations</SectionHeading>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {invitations.map((inv) => {
              const expired = new Date(inv.expiresAt) < new Date();
              return (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    opacity: expired ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Mail style={{ width: 14, height: 14, color: "var(--muted-foreground)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="text-sm text-foreground" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.email}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className="text-xs text-muted-foreground">
                        <Clock style={{ width: 10, height: 10, display: "inline", verticalAlign: "middle", marginRight: 3 }} />
                        {expired ? "Expired" : `Expires in ${timeUntil(inv.expiresAt)}`}
                      </span>
                    </div>
                  </div>
                  <RoleBadge role={inv.role} />
                  <CopyButton text={`${window.location.origin}/admin/invite/${inv.token}`} />
                  {confirmRevokeId === inv.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.id)}
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          border: "none",
                          background: "var(--destructive)",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        style={{
                          fontSize: "0.65rem",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--foreground)",
                          cursor: "pointer",
                        }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(inv.id)}
                      title="Revoke invitation"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--muted-foreground)",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                      }}
                      className="hover:text-destructive transition-colors"
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
