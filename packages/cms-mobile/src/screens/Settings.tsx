import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useSwipeBack } from "@/lib/use-swipe-back";
import { Screen } from "@/components/Screen";
import { ScreenHeader, BackButton, HeaderAvatar } from "@/components/ScreenHeader";
import { Button } from "@/components/Button";
import { Spinner } from "@/components/Spinner";
import { getMe } from "@/api/client";
import { clearAllAuth, getServerUrl } from "@/lib/prefs";
import { clearBiometricJwt, isNative, platform } from "@/lib/bridge";
import type { TopicKey } from "./settings-types";

// Inline the topic metadata so we don't need a server round-trip just for labels
const TOPIC_META: { key: TopicKey; label: string; description: string }[] = [
  { key: "build_failed", label: "Build failed", description: "When a site build fails" },
  { key: "build_succeeded", label: "Build succeeded", description: "When a site build completes" },
  { key: "agent_completed", label: "AI agent done", description: "When a long-running AI task finishes" },
  { key: "curation_pending", label: "Curation pending", description: "New content awaiting your review" },
  { key: "link_check_failed", label: "Broken links", description: "When link checker finds issues" },
  { key: "scheduled_publish", label: "Scheduled publish", description: "When a scheduled post goes live" },
];

/**
 * Settings screen — launched by tapping the Gravatar on Home.
 *
 * Sections:
 *   - Profile (name, email, server, push status)
 *   - Push notification topic preferences
 *   - Sign out
 *   - App version
 */
export function Settings() {
  const [, setLocation] = useLocation();
  const goBack = useCallback(() => setLocation("/home"), [setLocation]);
  useSwipeBack(goBack);
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: ["me"], queryFn: getMe });
  const serverQuery = useQuery({ queryKey: ["serverUrl"], queryFn: getServerUrl });

  const [pushPermission, setPushPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [topicPrefs, setTopicPrefs] = useState<Record<TopicKey, boolean> | null>(null);

  // Check push permission state on mount
  useEffect(() => {
    void (async () => {
      if (!isNative()) {
        setPushPermission("unknown");
        return;
      }
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const status = await PushNotifications.checkPermissions();
        setPushPermission(status.receive === "granted" ? "granted" : "denied");
      } catch {
        setPushPermission("unknown");
      }
    })();
  }, []);

  // Fetch topic preferences
  useEffect(() => {
    void (async () => {
      try {
        const server = await getServerUrl();
        const { getJwt } = await import("@/lib/prefs");
        const jwt = await getJwt();
        if (!server || !jwt) return;
        const res = await fetch(`${server}/api/mobile/push/preferences`, {
          headers: { Authorization: `Bearer ${jwt}` },
          credentials: "omit",
        });
        if (res.ok) {
          const data = (await res.json()) as { topics: Record<TopicKey, boolean> };
          setTopicPrefs(data.topics);
        }
      } catch {
        // silent — prefs just won't show
      }
    })();
  }, []);

  async function toggleTopic(key: TopicKey) {
    if (!topicPrefs) return;
    const newVal = !topicPrefs[key];
    // Optimistic update
    setTopicPrefs({ ...topicPrefs, [key]: newVal });
    try {
      const server = await getServerUrl();
      const { getJwt } = await import("@/lib/prefs");
      const jwt = await getJwt();
      if (!server || !jwt) return;
      await fetch(`${server}/api/mobile/push/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        credentials: "omit",
        body: JSON.stringify({ topics: { [key]: newVal } }),
      });
    } catch {
      // Revert on failure
      setTopicPrefs({ ...topicPrefs, [key]: !newVal });
    }
  }

  async function handleLogout() {
    await clearAllAuth();
    await clearBiometricJwt();
    queryClient.clear();
    setLocation("/login");
  }

  if (meQuery.isLoading) {
    return (
      <Screen>
        <div className="flex flex-1 items-center justify-center">
          <Spinner />
        </div>
      </Screen>
    );
  }

  const me = meQuery.data;

  return (
    <Screen>
      <ScreenHeader
        left={<BackButton onClick={() => setLocation("/home")} />}
        title="Settings"
        subtitle="Account"
      />

      <div className="flex flex-1 flex-col gap-4 px-6 pb-24 overflow-auto">
        {/* Profile card */}
        {me && (
          <div className="rounded-xl bg-brand-darkSoft p-4 flex items-center gap-4">
            <HeaderAvatar
              name={me.user.name ?? me.user.email}
              email={me.user.email}
              src={me.user.avatarUrl ?? undefined}
            />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium truncate">
                {me.user.name ?? me.user.email}
              </p>
              <p className="text-xs text-white/50 truncate">{me.user.email}</p>
              <p className="text-xs text-white/40 truncate mt-0.5">
                {serverQuery.data}
              </p>
            </div>
          </div>
        )}

        {/* Push notifications section */}
        <section className="rounded-xl bg-brand-darkSoft overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Push notifications</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  pushPermission === "granted"
                    ? "bg-green-500/20 text-green-400"
                    : pushPermission === "denied"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-white/10 text-white/50"
                }`}
              >
                {pushPermission === "granted"
                  ? "Enabled"
                  : pushPermission === "denied"
                    ? "Denied"
                    : "Unknown"}
              </span>
            </div>
            {pushPermission === "denied" && (
              <p className="text-xs text-red-400/80 mt-1">
                Push notifications are disabled. Open iOS Settings → webhouse.app
                → Notifications to enable.
              </p>
            )}
          </div>

          {/* Topic toggles */}
          {topicPrefs &&
            TOPIC_META.map((topic) => (
              <button
                key={topic.key}
                type="button"
                onClick={() => toggleTopic(topic.key)}
                className="flex w-full items-center justify-between px-4 py-3 border-b border-white/5 last:border-0 text-left hover:bg-white/5 active:bg-white/5"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm">{topic.label}</p>
                  <p className="text-xs text-white/40">{topic.description}</p>
                </div>
                <div
                  className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${
                    topicPrefs[topic.key]
                      ? "bg-brand-gold"
                      : "bg-white/20"
                  }`}
                >
                  <div
                    className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      topicPrefs[topic.key]
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </div>
              </button>
            ))}
        </section>

        {/* Sign out */}
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          Sign out
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-white/30 py-2">
          webhouse.app v0.0.1 · {isNative() ? platform() : "web"}
        </p>
      </div>
    </Screen>
  );
}
