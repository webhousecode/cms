"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Boxes, Users, CreditCard, Settings2 } from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

/**
 * Minimal sidebar for orgs with no sites.
 * Shows only org-level navigation: Sites, Team, Billing, Organization Settings.
 */
export function OrgSidebar() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [showLogoIcon, setShowLogoIcon] = useState(() => {
    if (typeof document === "undefined") return false;
    const cookie = document.cookie.match(/(?:^|; )cms-logo-icon=([^;]*)/)?.[1];
    return cookie !== undefined ? cookie === "true" : false;
  });

  useEffect(() => {
    function onLogoChange(e: Event) {
      setShowLogoIcon((e as CustomEvent).detail as boolean);
    }
    window.addEventListener("cms:logo-icon-changed", onLogoChange);
    return () => window.removeEventListener("cms:logo-icon-changed", onLogoChange);
  }, []);

  const navItems = [
    { href: "/admin/sites", label: "Sites", icon: Boxes },
    { href: "/admin/organizations/settings", label: "Organization Settings", icon: Settings2 },
  ];

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="p-0">
        <Link href="/admin/sites" className={`flex flex-col gap-2 px-3 ${showLogoIcon ? "items-center" : "items-start"}`} style={{ marginRight: "auto", marginLeft: "0.5rem", paddingTop: showLogoIcon ? "1.25rem" : "0.75rem", paddingBottom: showLogoIcon ? "1.25rem" : "0.75rem", textDecoration: "none" }}>
          {showLogoIcon ? (
            <img
              src={mounted && resolvedTheme === "light" ? "/webhouse.app-light-icon.svg" : "/webhouse.app-dark-icon.svg"}
              alt="webhouse.app"
              className="w-14 h-14"
            />
          ) : (
            <img
              src={mounted && resolvedTheme === "light" ? "/webhouse-wordmark-light.svg" : "/webhouse-wordmark-dark.svg"}
              alt="webhouse.app"
              className="h-11 w-auto"
              style={{ maxWidth: "100%", marginLeft: "-0.9rem" }}
            />
          )}
          <span style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: "0.75rem", marginTop: "-0.25rem", letterSpacing: "0.08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }} className="text-muted-foreground">
            AI-native content engine
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup style={{ padding: "0.5rem 0.5rem 0" }}>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(item.href)}
                  tooltip={item.label}
                  render={<Link href={item.href} />}
                >
                  <item.icon className="!w-5 !h-5" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
