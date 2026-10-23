import { NextRequest, NextResponse } from "next/server";
import { getApiKey } from "@/lib/ai-config";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("ai"); if (capDenied) return capDenied;
  const apiKey = await getApiKey("mistral");
  if (!apiKey) {
    return NextResponse.json({ error: t("errCms.shared.aiKeyMissing") }, { status: 503 });
  }
  const ai = await getAI();

  try {
    const { text, instruction, locale: bodyLocale } = (await request.json()) as {
      text?: string;
      instruction?: string;
      locale?: string;
    };
    if (!text || !instruction) {
      return NextResponse.json({ error: t("errCms.ai.textInstructionRequired") }, { status: 400 });
    }

    const siteConfig = await readSiteConfig();
    const locale = bodyLocale || siteConfig.defaultLocale || "en";

    const contentModel = await getModel("content");
    const { text: result } = await ai.chat({
      ...mistralModel(contentModel),
      maxTokens: 2048,
      system:
        `${buildLocaleInstruction(locale)}\nYou are a professional content editor. Rewrite the provided text according to the instruction. Return ONLY the rewritten text — no explanation, no quotes, no preamble.`,
      messages: [
        {
          role: "user",
          content: `Text to rewrite:\n${text}\n\nInstruction: ${instruction}`, // i18n-ignore: model prompt
        },
      ],
      purpose: "content.rewrite",
    });

    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.shared.aiError");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
