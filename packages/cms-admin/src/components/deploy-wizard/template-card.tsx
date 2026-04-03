"use client";

import { Tag } from "lucide-react";

interface Props {
  id: string;
  name: string;
  description: string;
  tags: string[];
  screenshotUrl: string;
  selected: boolean;
  onClick: () => void;
}

export function TemplateCard({ name, description, tags, screenshotUrl, selected, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        padding: 0,
        borderRadius: 10,
        border: selected ? "2px solid #F7BB2E" : "1px solid var(--border)",
        background: "var(--card)",
        cursor: "pointer",
        overflow: "hidden",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: selected ? "0 0 0 3px rgba(247, 187, 46, 0.15)" : "none",
      }}
    >
      {/* Screenshot */}
      <div style={{
        width: "100%",
        aspectRatio: "16/10",
        background: "var(--muted)",
        overflow: "hidden",
      }}>
        {screenshotUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={screenshotUrl}
            alt={name}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "0.75rem 0.85rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem", color: "var(--foreground)" }}>
          {name}
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", lineHeight: 1.4, marginBottom: "0.5rem" }}>
          {description}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{
              fontSize: "0.62rem",
              padding: "0.15rem 0.4rem",
              borderRadius: 4,
              background: selected ? "rgba(247, 187, 46, 0.12)" : "var(--muted)",
              color: selected ? "#F7BB2E" : "var(--muted-foreground)",
              fontWeight: 500,
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
