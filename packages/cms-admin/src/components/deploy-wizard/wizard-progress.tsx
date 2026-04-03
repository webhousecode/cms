"use client";

import { Check } from "lucide-react";

interface Props {
  steps: ReadonlyArray<{ num: number; label: string }>;
  current: number;
}

export function WizardProgress({ steps, current }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {steps.map((step, i) => {
        const isActive = step.num === current;
        const isCompleted = step.num < current;

        return (
          <div key={step.num} style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: i < steps.length - 1 ? 1 : undefined }}>
            {/* Circle */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: isCompleted ? "#F7BB2E" : isActive ? "#F7BB2E" : "var(--muted)",
              color: isCompleted || isActive ? "#0D0D0D" : "var(--muted-foreground)",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}>
              {isCompleted ? <Check style={{ width: 14, height: 14 }} /> : step.num}
            </div>

            {/* Label */}
            <span style={{
              fontSize: "0.78rem",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--foreground)" : isCompleted ? "var(--foreground)" : "var(--muted-foreground)",
              whiteSpace: "nowrap",
            }}>
              {step.label}
            </span>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                background: isCompleted ? "#F7BB2E" : "var(--border)",
                marginLeft: "0.5rem",
                borderRadius: 1,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
