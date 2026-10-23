import { NextRequest, NextResponse } from "next/server";
import { getAI, mistralModel } from "@/lib/ai/client";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";
import { requireCapability } from "@/lib/capabilities";
import { buildLocaleInstruction } from "@/lib/ai/locale-prompt";
import { readSiteConfig } from "@/lib/site-config";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers(); if (denied) return denied;
  const capDenied = await requireCapability("agents"); if (capDenied) return capDenied;
  const apiKey = await getApiKey("mistral");
  if (!apiKey) {
    return NextResponse.json(
      { error: t("errCms.shared.aiKeyMissing") },
      { status: 503 }
    );
  }

  try {
    const { role, name, collections } = (await request.json()) as {
      role?: string;
      name?: string;
      collections?: string[];
    };

    if (!role) {
      return NextResponse.json({ error: t("errCms.agents.roleRequired") }, { status: 400 });
    }

    const ai = await getAI();
    const siteConfig = await readSiteConfig();
    const localeInstruction = buildLocaleInstruction(siteConfig.defaultLocale);

    const contentModel = await getModel("content");
    const agentName = name ?? "Unnamed"; // i18n-ignore: model prompt
    const { text } = await ai.chat({
      ...mistralModel(contentModel),
      maxTokens: 1024,
      system:
        `You are a CMS configuration assistant. Generate a concise, professional system prompt for an AI content agent. The prompt should define the agent's role, tone, constraints, and output format. Write the prompt in English but include a language directive so the agent produces content in the site's language. ${localeInstruction} — include this language directive in the generated prompt. Return only the system prompt text — no explanations or markdown.`,
      messages: [
        {
          role: "user",
          // i18n-ignore: model prompt
          content: `Generate a system prompt for an AI agent with these details:
- Agent name: ${agentName}
- Role: ${role}
- Target collections: ${collections?.join(", ") ?? "all"}

The prompt should be specific to the role and suitable for content generation in a CMS.`,
        },
      ],
      purpose: "agent.generate-prompt",
    });

    return NextResponse.json({ prompt: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errCms.shared.aiError");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
