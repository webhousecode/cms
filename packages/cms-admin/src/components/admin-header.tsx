"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTabs } from "@/lib/tabs-context";
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
import { Settings, Check, Moon, Sun, Monitor, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
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
          <DropdownMenuItem onClick={() => window.location.href = "/admin/settings"}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
              <Settings style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
              Settings
            </span>
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
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0 1rem" }}>
        <UserNav user={user} />
      </div>
    </header>
  );
}
