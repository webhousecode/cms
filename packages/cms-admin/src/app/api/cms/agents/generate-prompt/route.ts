import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured — add it in Settings → AI" },
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
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const client = new Anthropic({ apiKey });

    const contentModel = await getModel("content");
    const msg = await client.messages.create({
      model: contentModel,
      max_tokens: 1024,
      system:
        "You are a CMS configuration assistant. Generate a concise, professional system prompt for an AI content agent. The prompt should define the agent's role, tone, constraints, and output format. Write in English. Return only the system prompt text — no explanations or markdown.",
      messages: [
        {
          role: "user",
          content: `Generate a system prompt for an AI agent with these details:
- Agent name: ${name ?? "Unnamed"}
- Role: ${role}
- Target collections: ${collections?.join(", ") ?? "all"}

The prompt should be specific to the role and suitable for content generation in a CMS.`,
        },
      ],
    });

    const text =
      msg.content[0].type === "text" ? msg.content[0].text : "";

    return NextResponse.json({ prompt: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
