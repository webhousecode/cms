import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { UpmetricsProvider } from "@/components/upmetrics-provider";
import { resolveBrand, brandCss } from "@/lib/brand";
import { BrandProvider } from "@/lib/brand-context";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

/** F210 — the brand follows the address the CMS is opened on. */
async function currentBrand() {
  const h = await headers();
  return resolveBrand(h.get("x-forwarded-host") ?? h.get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await currentBrand();
  return {
    title: brand.name,
    description: "AI-native content engine",
    icons: {
      icon: brand.favicon,
      apple: "/icons/apple-touch-icon.png",
    },
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      title: brand.name,
      statusBarStyle: "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await currentBrand();
  const css = brandCss(brand);
  // translate="no" + notranslate: webhouse.app is an app UI, not translatable
  // content. Browser auto-translation (Google Translate) mutates React-managed
  // text nodes and then crashes the whole app with removeChild/insertBefore
  // NotFoundError — reproduced by editors using ⌘K search on a Danish Chrome.
  return (
    <html lang="en" translate="no" suppressHydrationWarning className={cn("notranslate font-sans", geist.variable)}>
      {css ? (
        <head>
          <style data-brand={brand.id} dangerouslySetInnerHTML={{ __html: css }} />
        </head>
      ) : null}
      <body>
        <BrandProvider brand={brand}>
        <UpmetricsProvider />
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          themes={["light", "dark", "light-cool", "light-warm", "dark-cool", "dark-warm"]}
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
          <PwaRegister />
        </ThemeProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
