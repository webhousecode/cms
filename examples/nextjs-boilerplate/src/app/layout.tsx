import type { Metadata } from "next";
import { readGlobal } from "@/lib/content";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import "./globals.css";

export function generateMetadata(): Metadata {
  const global = readGlobal();
  return {
    title: {
      default: global.siteTitle,
      template: `%s — ${global.siteTitle}`,
    },
    description: global.siteDescription,
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const global = readGlobal();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var dark = localStorage.getItem('theme') === 'dark' ||
                    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  if (dark) document.documentElement.classList.add('dark');
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <Navbar
          siteTitle={global.siteTitle}
          navLinks={global.navLinks ?? []}
        />
        <main className="flex-1">{children}</main>
        <Footer footerText={global.footerText} siteTitle={global.siteTitle} />
      </body>
    </html>
  );
}
