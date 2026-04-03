"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { TemplateCard } from "./template-card";
import { SectionHeading } from "@/components/ui/section-heading";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  screenshotUrl: string;
  hasContent: boolean;
}

interface Props {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function StepTemplate({ selected, onSelect }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/deploy/templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem", color: "var(--muted-foreground)" }}>
        <Loader2 className="animate-spin" style={{ width: 20, height: 20, marginRight: "0.5rem" }} />
        Loading templates...
      </div>
    );
  }

  // Group by category
  const withContent = templates.filter((t) => t.hasContent);
  const boilerplates = templates.filter((t) => !t.hasContent);

  return (
    <div>
      <SectionHeading>Choose a template</SectionHeading>
      <p style={{ fontSize: "0.78rem", color: "var(--muted-foreground)", marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
        Pick a site template to deploy. Each includes a CMS schema and sample content.
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: "1rem",
      }}>
        {withContent.map((t) => (
          <TemplateCard
            key={t.id}
            id={t.id}
            name={t.name}
            description={t.description}
            tags={t.tags}
            screenshotUrl={t.screenshotUrl}
            selected={selected === t.id}
            onClick={() => onSelect(t.id)}
          />
        ))}
      </div>

      {boilerplates.length > 0 && (
        <>
          <h3 style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Starter Boilerplates
          </h3>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: "1rem",
          }}>
            {boilerplates.map((t) => (
              <TemplateCard
                key={t.id}
                id={t.id}
                name={t.name}
                description={t.description}
                tags={t.tags}
                screenshotUrl={t.screenshotUrl}
                selected={selected === t.id}
                onClick={() => onSelect(t.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
