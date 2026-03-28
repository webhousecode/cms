import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured — add it in Settings → AI" }, { status: 503 });
  }
  const client = new Anthropic({ apiKey });

  try {
    const { text, instruction, locale: bodyLocale } = (await request.json()) as {
      text?: string;
      instruction?: string;
      locale?: string;
    };
    if (!text || !instruction) {
      return NextResponse.json({ error: "text and instruction required" }, { status: 400 });
    }

    const siteConfig = await readSiteConfig();
    const locale = bodyLocale || siteConfig.defaultLocale || "en";

    const contentModel = await getModel("content");
    const message = await client.messages.create({
      model: contentModel,
      max_tokens: 2048,
      system:
        `${buildLocaleInstruction(locale)}\nYou are a professional content editor. Rewrite the provided text according to the instruction. Return ONLY the rewritten text — no explanation, no quotes, no preamble.`,
      messages: [
        {
          role: "user",
          content: `Text to rewrite:\n${text}\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const result = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
