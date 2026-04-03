"use client";

import { useState } from "react";
import { StepTemplate } from "./step-template";
import { StepConfigure } from "./step-configure";
import { StepConnect } from "./step-connect";
import { StepDeploy } from "./step-deploy";
import { WizardProgress } from "./wizard-progress";

export interface WizardState {
  step: 1 | 2 | 3 | 4;
  template: string | null;
  appName: string;
  region: string;
  vmSize: string;
  flyToken: string;
  flyOrg: string;
  adminEmail: string;
}

const STEPS = [
  { num: 1, label: "Template" },
  { num: 2, label: "Configure" },
  { num: 3, label: "Connect" },
  { num: 4, label: "Deploy" },
] as const;

export function DeployWizard() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    template: null,
    appName: "",
    region: "arn",
    vmSize: "shared-cpu-1x-256",
    flyToken: "",
    flyOrg: "",
    adminEmail: "",
  });

  const update = (partial: Partial<WizardState>) =>
    setState((s) => ({ ...s, ...partial }));

  const canNext = (() => {
    switch (state.step) {
      case 1: return !!state.template;
      case 2: return !!state.appName && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(state.appName);
      case 3: return !!state.flyToken && !!state.flyOrg;
      case 4: return false;
    }
  })();

  return (
    <div style={{ maxWidth: "48rem" }}>
      <WizardProgress steps={STEPS} current={state.step} />

      <div style={{ marginTop: "2rem" }}>
        {state.step === 1 && (
          <StepTemplate
            selected={state.template}
            onSelect={(id) => {
              const base = id.startsWith("site:") ? id.slice(5) : id;
              const appName = base.replace(/\//g, "-").replace(/[^a-z0-9-]/g, "");
              update({ template: id, appName: appName.endsWith("-site") ? appName : appName + "-site" });
            }}
          />
        )}

        {state.step === 2 && (
          <StepConfigure
            appName={state.appName}
            region={state.region}
            vmSize={state.vmSize}
            adminEmail={state.adminEmail}
            onUpdate={update}
          />
        )}

        {state.step === 3 && (
          <StepConnect
            flyToken={state.flyToken}
            flyOrg={state.flyOrg}
            onUpdate={update}
          />
        )}

        {state.step === 4 && (
          <StepDeploy state={state} />
        )}
      </div>

      {/* Navigation */}
      {state.step < 4 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => update({ step: Math.max(1, state.step - 1) as WizardState["step"] })}
            disabled={state.step === 1}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: state.step === 1 ? "var(--muted-foreground)" : "var(--foreground)",
              fontSize: "0.85rem",
              cursor: state.step === 1 ? "not-allowed" : "pointer",
              opacity: state.step === 1 ? 0.5 : 1,
            }}
          >
            Back
          </button>

          <button
            onClick={() => update({ step: Math.min(4, state.step + 1) as WizardState["step"] })}
            disabled={!canNext}
            style={{
              padding: "0.5rem 1.5rem",
              borderRadius: 8,
              border: "none",
              background: canNext ? "#F7BB2E" : "var(--muted)",
              color: canNext ? "#0D0D0D" : "var(--muted-foreground)",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: canNext ? "pointer" : "not-allowed",
            }}
          >
            {state.step === 3 ? "Deploy" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
