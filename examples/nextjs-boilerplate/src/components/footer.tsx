interface FooterProps {
  footerText?: string;
  siteTitle: string;
}

export function Footer({ footerText, siteTitle }: FooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted">
            {year} {siteTitle}
          </p>
          {footerText && <p className="text-sm text-muted">{footerText}</p>}
        </div>
      </div>
    </footer>
  );
}
