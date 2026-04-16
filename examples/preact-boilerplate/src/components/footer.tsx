interface FooterProps {
  footerText?: string;
  siteTitle: string;
}

export function Footer({ footerText, siteTitle }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer class="border-t border-border bg-card mt-auto">
      <div class="mx-auto max-w-5xl px-4 py-8">
        <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p class="text-sm text-muted">
            © {year} {siteTitle}
          </p>
          {footerText && (
            <p
              class="text-sm text-muted"
              dangerouslySetInnerHTML={{ __html: footerText }}
            />
          )}
        </div>
      </div>
    </footer>
  );
}
