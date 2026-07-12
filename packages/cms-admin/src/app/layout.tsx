import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { UpmetricsProvider } from "@/components/upmetrics-provider";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "webhouse.app",
  description: "AI-native content engine",
  icons: {
    icon: "/favicon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "webhouse.app",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // translate="no" + notranslate: webhouse.app is an app UI, not translatable
  // content. Browser auto-translation (Google Translate) mutates React-managed
  // text nodes and then crashes the whole app with removeChild/insertBefore
  // NotFoundError — reproduced by editors using ⌘K search on a Danish Chrome.
  return (
    <html lang="en" translate="no" suppressHydrationWarning className={cn("notranslate font-sans", geist.variable)}>
      <body>
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
      </body>
    </html>
  );
}
