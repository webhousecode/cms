import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";

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
- If the agent should produce content in a non-English language, end the systemPrompt with: "Generate all content in [language]."
- Default autonomy to "draft" unless the user explicitly requests autonomous publishing
- Pick the role that best matches: copywriter (articles/pages), seo (meta/keywords), translator (translation), refresher (updating existing content), custom (anything else)
- If the user mentions a schedule (daily, weekly, every Monday, etc.) set schedule.enabled=true and pick the right frequency/time
- active defaults to true`;

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
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

  const client = new Anthropic({ apiKey });

  try {
    const codeModel = await getModel("code");
    const message = await client.messages.create({
      model: codeModel,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: description.trim() }],
    });

    const raw = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")
      .trim();

    const config = JSON.parse(raw);
    return NextResponse.json({ config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
