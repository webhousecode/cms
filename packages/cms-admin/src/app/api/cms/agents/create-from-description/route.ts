import { NextRequest, NextResponse } from "next/server";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
import { readSiteConfig } from "@/lib/site-config";
import { LOCALE_LABELS } from "@/lib/locale";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";

const SYSTEM = `You are an AI agent configurator for a headless CMS. Given a natural language description of a desired content agent, return a single valid JSON object — no markdown, no explanation, no code fences.

The JSON must have exactly these fields:
{
  "name": string,
  "role": "copywriter" | "seo" | "translator" | "refresher" | "custom",
  "systemPrompt": string,
  "behavior": {
    "temperature": number,
    "formality": number,
    "verbosity": number
  },
  "tools": {
    "webSearch": boolean,
    "internalDatabase": boolean
  },
  "autonomy": "draft" | "full",
  "schedule": {
    "enabled": boolean,
    "frequency": "daily" | "weekly" | "manual",
    "time": "HH:MM",
    "maxPerRun": number
  },
  "active": boolean
}

Rules:
- behavior values are 0–100 integers (temperature: 0=factual/100=creative, formality: 0=casual/100=academic, verbosity: 0=concise/100=detailed)
- schedule.maxPerRun is 1–10
- systemPrompt must always be written in English regardless of the output language
- The site's default language is {{SITE_LOCALE}}. Unless the user explicitly requests a different language, end the systemPrompt with: "Generate all content in {{SITE_LANG}}."
- If the agent should produce content in a non-English language, end the systemPrompt with: "Generate all content in [language]."
- Default autonomy to "draft" unless the user explicitly requests autonomous publishing
- Pick the role that best matches: copywriter (articles/pages), seo (meta/keywords), translator (translation), refresher (updating existing content), custom (anything else)
- If the user mentions a schedule (daily, weekly, every Monday, etc.) set schedule.enabled=true and pick the right frequency/time
- active defaults to true`;

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("agents"); if (capDenied) return capDenied;
  const apiKey = await getApiKey("mistral");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured — add it in Settings → AI" },
      { status: 503 }
    );
  }

  const { description } = (await request.json()) as { description?: string };
  if (!description?.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const ai = await getAI();
  const siteConfig = await readSiteConfig();
  const langName = LOCALE_LABELS[siteConfig.defaultLocale] ?? siteConfig.defaultLocale;
  const localeInstr = buildLocaleInstruction(siteConfig.defaultLocale || "en");
  const systemPrompt = `${localeInstr}\n\n${SYSTEM
    .replace("{{SITE_LOCALE}}", `${langName} (${siteConfig.defaultLocale})`)
    .replace("{{SITE_LANG}}", langName)}`;

  try {
    const codeModel = await getModel("code");
    const { text: raw } = await ai.chat({
      ...mistralModel(codeModel),
      maxTokens: 1024,
      responseFormat: "json",
      system: systemPrompt,
      messages: [{ role: "user", content: description.trim() }],
      purpose: "agent.create-from-description",
    });

    const config = JSON.parse(raw.trim());
    return NextResponse.json({ config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
