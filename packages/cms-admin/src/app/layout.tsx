import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { UpmetricsProvider } from "@/components/upmetrics-provider";
import { brandForRequest, brandCss, brandFont } from "@/lib/brand";
import { BrandProvider } from "@/lib/brand-context";
import { I18nProvider } from "@/lib/i18n-context";
import { clientMessages, resolveUiLocale, type UiLocale } from "@/i18n/locale";
import { getSessionUser, getUserById } from "@/lib/auth";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

/** F210 — the brand follows the address the CMS is opened on. */
async function currentBrand() {
  return brandForRequest(await headers());
}

/** F211 — the admin language for this request: the user's choice → the
 *  brand's default → the browser → English. Read per request, never cached. */
async function currentUiLocale(brandDefault: string | undefined): Promise<UiLocale> {
  const h = await headers();
  let user: string | null = null;
  try {
    const session = await getSessionUser(await cookies());
    if (session) user = (await getUserById(session.id))?.uiLocale ?? null;
  } catch { /* signed out or unreadable session → automatic */ }
  return resolveUiLocale({ user, brand: brandDefault, acceptLanguage: h.get("accept-language") });
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
  const font = brandFont(brand);
  const locale = await currentUiLocale(brand.defaultLocale);
  // translate="no" + notranslate: webhouse.app is an app UI, not translatable
  // content. Browser auto-translation (Google Translate) mutates React-managed
  // text nodes and then crashes the whole app with removeChild/insertBefore
  // NotFoundError — reproduced by editors using ⌘K search on a Danish Chrome.
  return (
    <html lang={locale} translate="no" suppressHydrationWarning className={cn("notranslate font-sans", geist.variable)}>
      {css ? (
        <head>
          {font && <link rel="stylesheet" href={font.stylesheet} data-brand-font={brand.id} />}
          <style data-brand={brand.id} dangerouslySetInnerHTML={{ __html: css }} />
        </head>
      ) : null}
      <body>
        <BrandProvider brand={brand}>
        <I18nProvider locale={locale} messages={clientMessages(locale)}>
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
        </I18nProvider>
        </BrandProvider>
      </body>
    </html>
  );
}
