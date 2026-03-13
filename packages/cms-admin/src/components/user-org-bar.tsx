"use client";

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
import { Settings, Building2, Check, Plus, LayoutGrid, Moon, Sun, Monitor, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Placeholder — replace with real auth session when available
const PLACEHOLDER_USER = {
  name: "Christian Broberg",
  email: "cb@webhouse.dk",
  initials: "CB",
};

const PLACEHOLDER_ORGS = [
  { id: "personal", name: "Personal", isPersonal: true },
  { id: "webhouse", name: "WebHouse", isPersonal: false },
];

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

function OrgSwitcher() {
  const current = PLACEHOLDER_ORGS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-muted-foreground transition-colors focus-visible:outline-none bg-transparent border-0 cursor-pointer p-0">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span>{current.isPersonal ? "Personal" : current.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground"><path d="m6 9 6 6 6-6"/></svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: "14rem" }}>
        {PLACEHOLDER_ORGS.map((org) => (
          <DropdownMenuItem key={org.id}>
            <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>{org.isPersonal ? "Personal" : org.name}</span>
            {org.id === "personal" && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-muted-foreground">
          <LayoutGrid className="mr-2 h-4 w-4" />
          All organizations
        </DropdownMenuItem>
        <DropdownMenuItem className="text-muted-foreground">
          <Plus className="mr-2 h-4 w-4" />
          New organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserNav() {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-transparent border-0 p-0 cursor-pointer">
        <Avatar className="h-8 w-8">
          <AvatarImage
            src={`https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y`}
            alt={PLACEHOLDER_USER.name}
          />
          <AvatarFallback className="text-xs">{PLACEHOLDER_USER.initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" style={{ width: "223px" }}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal px-3 py-2.5">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{PLACEHOLDER_USER.name}</p>
              <p className="text-xs text-muted-foreground">{PLACEHOLDER_USER.email}</p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/admin/settings")}>
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
          <DropdownMenuItem className="text-muted-foreground">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Drop-in right-side header bar: OrgSwitcher + UserNav */
export function UserOrgBar() {
  return (
    <div className="flex items-center gap-3">
      <OrgSwitcher />
      <UserNav />
    </div>
  );
}
