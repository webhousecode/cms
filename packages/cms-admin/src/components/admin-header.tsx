"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTabs } from "@/lib/tabs-context";
import { OrgSwitcher, SiteSwitcher } from "@/components/site-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Fingerprint, Check, Moon, Sun, Monitor, LogOut, Search, ExternalLink } from "lucide-react";
import { HelpButton } from "@/components/help-drawer";
import { useTheme } from "next-themes";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface SessionUser {
  email: string;
  name: string;
  id: string;
  gravatarUrl?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function ThemeItems() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Theme</DropdownMenuLabel>
      {([
        { value: "dark", label: "Dark", icon: Moon },
        { value: "light", label: "Light", icon: Sun },
        { value: "system", label: "System", icon: Monitor },
      ] as const).map(({ value, label, icon: Icon }) => (
        <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
          <Icon className="mr-2 h-4 w-4" />
          {label}
          {theme === value && <Check className="ml-auto h-4 w-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

function UserNav({ user }: { user: SessionUser | null }) {
  const displayName = user?.name ?? "Admin";
  const initials = user ? getInitials(user.name) : "?";
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-transparent border-0 p-0 cursor-pointer">
        <Avatar className="h-8 w-8">
          {user?.gravatarUrl && <AvatarImage src={user.gravatarUrl} alt={displayName} />}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: "223px" }}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold">{displayName}</p>
              {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/admin/account")}>
            <Settings className="mr-2 h-4 w-4" />
            Account Preferences
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <ThemeItems />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={logout} className="text-muted-foreground">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PreviewButton() {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [siteName, setSiteName] = useState("Site");
  const [fetchKey, setFetchKey] = useState(0);
  const { openTab } = useTabs();

  // Re-fetch on site switch
  useEffect(() => {
    function onSiteChange() { setFetchKey((k) => k + 1); }
    window.addEventListener("cms-site-change", onSiteChange);
    return () => window.removeEventListener("cms-site-change", onSiteChange);
  }, []);

  useEffect(() => {
    setPreviewUrl(""); // reset while loading
    fetch("/api/admin/site-config")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setPreviewUrl(data?.previewSiteUrl ?? "");
      })
      .catch(() => {});
    fetch("/api/cms/registry")
      .then((r) => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d?.registry) return;
        const orgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1] ?? d.registry.defaultOrgId;
        const siteId = document.cookie.match(/(?:^|; )cms-active-site=([^;]*)/)?.[1] ?? d.registry.defaultSiteId;
        const org = d.registry.orgs?.find((o: any) => o.id === orgId);
        const site = org?.sites?.find((s: any) => s.id === siteId);
        if (site?.name) setSiteName(site.name);
      })
      .catch(() => {});
  }, [fetchKey]);

  const openPreview = useCallback(async () => {
    if (previewUrl) {
      openTab(`/admin/preview?url=${encodeURIComponent(previewUrl)}`, `Preview: ${siteName}`);
    } else {
      // No external URL — start built-in preview server
      try {
        const res = await fetch("/api/preview-serve", { method: "POST" });
        if (res.ok) {
          const { url } = await res.json() as { url: string };
          openTab(`/admin/preview?url=${encodeURIComponent(url)}`, `Preview: ${siteName}`);
        }
      } catch { /* ignore */ }
    }
  }, [previewUrl, siteName, openTab]);

  // "p" shortcut → open preview
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "p" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      openPreview();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPreview]);

  return (
    <button
      type="button"
      onClick={openPreview}
      style={{
        background: "none",
        border: "1.5px solid var(--border)",
        cursor: "pointer",
        color: "var(--muted-foreground)",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        width: "2rem", height: "2rem",
        padding: 0,
      }}
      className="hover:border-foreground hover:text-foreground transition-colors"
      title="Preview site (p)"
    >
      <ExternalLink style={{ width: "0.9rem", height: "0.9rem" }} />
    </button>
  );
}

export function AdminHeader() {
  const { tabs, activeId } = useTabs();
  const activeTab = tabs.find((t) => t.id === activeId);
  const title = activeTab?.title;
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user?: SessionUser | null }) => {
        if (d.user) setUser(d.user);
      })
      .catch(() => {});
  }, []);

  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 31,
      height: "48px",
      display: "flex",
      alignItems: "center",
      borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--card)",
    }}>
      <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
        {title && (
          <>
            <div style={{ width: "1px", height: "1rem", backgroundColor: "var(--border)", alignSelf: "center", margin: "0 0.125rem" }} />
            <span style={{ fontSize: "0.875rem", color: "var(--muted-foreground)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "320px" }}>
              {title}
            </span>
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
        <OrgSwitcher />
        <SiteSwitcher />
        <PreviewButton />
        <HelpButton />
        <UserNav user={user} />
      </div>
    </header>
  );
}
