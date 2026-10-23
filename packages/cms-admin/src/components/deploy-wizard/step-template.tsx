"use client";

import { useState, useEffect } from "react";
import { Loader2, Globe } from "lucide-react";
import { TemplateCard } from "./template-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { useT } from "@/lib/i18n-context";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  screenshotUrl: string;
  hasContent: boolean;
}

interface OrgSite {
  id: string;
  name: string;
  adapter: string;
}

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function StepTemplate({ selected, onSelect }: Props) {
  const t = useT();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sites, setSites] = useState<OrgSite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/deploy/templates").then((r) => r.json()).catch(() => ({ templates: [] })),
      fetch("/api/cms/registry").then((r) => r.json()).catch(() => ({ registry: null })),
    ]).then(([tmplData, regData]) => {
      setTemplates(tmplData.templates ?? []);
      // Extract sites from the ACTIVE org only (not all orgs)
      if (regData.registry?.orgs) {
        const activeOrgId = document.cookie.match(/(?:^|; )cms-active-org=([^;]*)/)?.[1] ?? regData.registry.defaultOrgId;
        const activeOrg = regData.registry.orgs.find((o: { id: string }) => o.id === activeOrgId) ?? regData.registry.orgs[0];
        const orgSites: OrgSite[] = [];
        if (activeOrg) {
          for (const site of activeOrg.sites ?? []) {
            orgSites.push({ id: site.id, name: site.name, adapter: site.adapter });
          }
        }
        setSites(orgSites);
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--muted-foreground)" }}>
        <Loader2 className="animate-spin" style={{ width: 20, height: 20, marginRight: "0.5rem" }} />
        {t("misc.deployWizard.template.loading")}
      </div>
    );
  }

  const withContent = templates.filter((tpl) => tpl.hasContent);
  const boilerplates = templates.filter((tpl) => !tpl.hasContent);

  return (
    <div>
      <SectionHeading>{t("misc.deployWizard.template.title")}</SectionHeading>
      <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        {t("misc.deployWizard.template.intro")}
      </p>

      {/* ── Existing sites ── */}
      {sites.length > 0 && (
        <>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            {t("misc.deployWizard.template.yourSites")}
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "0.75rem",
            marginBottom: "2rem",
          }}>
            {sites.map((site) => (
              <button
                data-testid={`deploy-site-select-${site.id}`}
                key={site.id}
                type="button"
                onClick={() => onSelect(`site:${site.id}`)} // i18n-ignore: selection id passed to onSelect
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.75rem 1rem",
                  borderRadius: 8,
                  border: selected === `site:${site.id}` ? "2px solid var(--brand)" : "1px solid var(--border)",
                  background: "var(--card)",
                  cursor: "pointer",
                  textAlign: "left",
                  boxShadow: selected === `site:${site.id}` ? "0 0 0 3px color-mix(in srgb, var(--brand) 15%, transparent)" : "none",
                }}
              >
                <Globe style={{ width: 18, height: 18, color: selected === `site:${site.id}` ? "var(--brand)" : "var(--muted-foreground)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>{site.name}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)" }}>
                    {site.adapter} · {site.id}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Templates ── */}
      <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
        {t("misc.deployWizard.template.templates")}
      </h3>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "1rem",
      }}>
        {withContent.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            id={tpl.id}
            name={tpl.name}
            description={tpl.description}
            tags={tpl.tags}
            screenshotUrl={tpl.screenshotUrl}
            selected={selected === tpl.id}
            onClick={() => onSelect(tpl.id)}
          />
        ))}
      </div>

      {boilerplates.length > 0 && (
        <>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2rem", marginBottom: "0.75rem" }}>
            {t("misc.deployWizard.template.boilerplates")}
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1rem",
          }}>
            {boilerplates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                id={tpl.id}
                name={tpl.name}
                description={tpl.description}
                tags={tpl.tags}
                screenshotUrl={tpl.screenshotUrl}
                selected={selected === tpl.id}
                onClick={() => onSelect(tpl.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
