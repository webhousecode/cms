import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";
import {
  getServers,
  getActiveServer,
  setActiveServerId,
  removeServer,
  signOutActiveServer,
  type StoredServer,
} from "@/lib/prefs";
import { clearBiometricJwt, isNative, platform } from "@/lib/bridge";
import type { TopicKey } from "./settings-types";

const TOPIC_META: { key: TopicKey; label: string; description: string }[] = [
  { key: "build_failed", label: "Build failed", description: "When a site build fails" },
  { key: "build_succeeded", label: "Build succeeded", description: "When a site build completes" },
  { key: "agent_completed", label: "AI agent done", description: "When a long-running AI task finishes" },
  { key: "curation_pending", label: "Curation pending", description: "New content awaiting your review" },
  { key: "link_check_failed", label: "Broken links", description: "When link checker finds issues" },
  { key: "scheduled_publish", label: "Scheduled publish", description: "When a scheduled post goes live" },
];

export function Settings() {
  const [, setLocation] = useLocation();
  const goBack = useCallback(() => setLocation("/home"), [setLocation]);
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });

  const [pushPermission, setPushPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [topicPrefs, setTopicPrefs] = useState<Record<TopicKey, boolean> | null>(null);
  const [pushExpanded, setPushExpanded] = useState(false);

  const [servers, setServers] = useState<StoredServer[]>([]);
  const [activeServerId, setActiveServerIdState] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null); // server id

  useEffect(() => {
    void (async () => {
      const [all, active] = await Promise.all([getServers(), getActiveServer()]);
      setServers(all);
      setActiveServerIdState(active?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (!isNative()) { setPushPermission("unknown"); return; }
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const status = await PushNotifications.checkPermissions();
        setPushPermission(status.receive === "granted" ? "granted" : "denied");
      } catch { setPushPermission("unknown"); }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { getServerUrl, getJwt } = await import("@/lib/prefs");
        const [server, jwt] = await Promise.all([getServerUrl(), getJwt()]);
        if (!server || !jwt) return;
        const res = await fetch(`${server}/api/mobile/push/preferences`, {
          headers: { Authorization: `Bearer ${jwt}` },
          credentials: "omit",
        });
        if (res.ok) {
          const data = (await res.json()) as { topics: Record<TopicKey, boolean> };
          setTopicPrefs(data.topics);
        }
      } catch {}
    })();
  }, []);

  async function toggleTopic(key: TopicKey) {
    if (!topicPrefs) return;
    const newVal = !topicPrefs[key];
    setTopicPrefs({ ...topicPrefs, [key]: newVal });
    try {
      const { getServerUrl, getJwt } = await import("@/lib/prefs");
      const [server, jwt] = await Promise.all([getServerUrl(), getJwt()]);
      if (!server || !jwt) return;
      await fetch(`${server}/api/mobile/push/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        credentials: "omit",
        body: JSON.stringify({ topics: { [key]: newVal } }),
      });
    } catch {
      setTopicPrefs({ ...topicPrefs, [key]: !newVal });
    }
  }

  async function handleSwitchServer(server: StoredServer) {
    await setActiveServerId(server.id);
    setActiveServerIdState(server.id);
    queryClient.clear();
    if (!server.jwt) {
      setLocation("/login");
    } else {
      setLocation("/home");
    }
  }

  async function handleRemoveServer(id: string) {
    await removeServer(id);
    const [all, active] = await Promise.all([getServers(), getActiveServer()]);
    setServers(all);
    setActiveServerIdState(active?.id ?? null);
    setConfirmRemove(null);
    queryClient.clear();
    if (all.length === 0) {
      await clearBiometricJwt();
      setLocation("/onboarding");
    } else if (id === activeServerId) {
      setLocation("/home");
    }
  }

  function handleLogout() {
    setLocation("/login");
    void signOutActiveServer();
    void clearBiometricJwt();
    queryClient.clear();
  }

  if (meQuery.isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      </Screen>
    );
  }

  const me = meQuery.data;

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={goBack} />}
        title={me?.user.name ?? "Settings"}
        subtitle="Settings"
      />

      <div className="flex flex-1 flex-col gap-4 px-6 pb-24 overflow-auto">

        {/* Servers */}
        <section className="rounded-xl bg-brand-darkSoft overflow-hidden">
          <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wider text-white/40">
            Servers
          </p>
          {servers.map((s, i) => {
            const isActive = s.id === activeServerId;
            const isConfirming = confirmRemove === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}
              >
                {/* Active indicator */}
                <div className={`w-2 h-2 shrink-0 rounded-full ${isActive ? "bg-brand-gold" : "bg-white/15"}`} />

                {/* Name + URL — tap to switch */}
                <button
                  type="button"
                  onClick={() => !isActive && handleSwitchServer(s)}
                  className="min-w-0 flex-1 text-left"
                  disabled={isActive}
                >
                  <p className={`text-sm font-medium truncate ${isActive ? "text-brand-gold" : "text-white"}`}>
                    {s.name ?? s.url}
                  </p>
                  {s.name && (
                    <p className="text-xs text-white/40 truncate">{s.url}</p>
                  )}
                  {!s.jwt && (
                    <p className="text-xs text-red-400/70">Not signed in</p>
                  )}
                </button>

                {/* Remove confirm */}
                {isConfirming ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span style={{ fontSize: "0.65rem", color: "var(--destructive)", fontWeight: 500, padding: "0 2px" }}>Remove?</span>
                    <button
                      onClick={() => handleRemoveServer(s.id)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "none", background: "var(--destructive)", color: "#fff", cursor: "pointer", lineHeight: 1 }}
                    >Yes</button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.35rem", borderRadius: "3px", border: "1px solid var(--border)", background: "transparent", color: "var(--foreground)", cursor: "pointer", lineHeight: 1 }}
                    >No</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(s.id)}
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/40 active:bg-white/10"
                    aria-label="Remove server"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}

          {/* Add server */}
          <button
            type="button"
            onClick={() => setLocation("/onboarding")}
            className="flex w-full items-center gap-3 px-4 py-3 border-t border-white/5 text-brand-gold active:bg-white/5"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium">Connect new server</span>
          </button>
        </section>

        {/* Push notifications — collapsible */}
        <section className="rounded-xl bg-brand-darkSoft overflow-hidden">
          <button
            type="button"
            onClick={() => setPushExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 active:bg-white/5"
          >
            <p className="text-sm font-medium">Push notifications</p>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  pushPermission === "granted"
                    ? "bg-green-500/20 text-green-400"
                    : pushPermission === "denied"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-white/10 text-white/50"
                }`}
              >
                {pushPermission === "granted" ? "Enabled" : pushPermission === "denied" ? "Denied" : "Unknown"}
              </span>
              <svg
                width="14" height="14" viewBox="0 0 16 16" fill="none"
                className={`text-white/40 transition-transform ${pushExpanded ? "rotate-180" : ""}`}
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </button>
          {pushExpanded && (
            <>
              {pushPermission === "denied" && (
                <p className="text-xs text-red-400/80 px-4 pb-2">
                  Push disabled. Open Indstillinger → CMS → Notifikationer for at aktivere.
                </p>
              )}
              {topicPrefs &&
                TOPIC_META.map((topic) => (
                  <button
                    key={topic.key}
                    type="button"
                    onClick={() => toggleTopic(topic.key)}
                    className="flex w-full items-center justify-between px-4 py-3 border-t border-white/5 text-left active:bg-white/5"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="text-sm">{topic.label}</p>
                      <p className="text-xs text-white/40">{topic.description}</p>
                    </div>
                    <div className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${topicPrefs[topic.key] ? "bg-brand-gold" : "bg-white/20"}`}>
                      <div className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${topicPrefs[topic.key] ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </button>
                ))}
            </>
          )}
        </section>

        {/* Sign out of current server */}
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          Sign out
        </Button>

        <p className="text-center text-xs text-white/30 py-2">
          webhouse.app v0.0.1 · {isNative() ? platform() : "web"}
        </p>
      </div>
    </Screen>
  );
}
