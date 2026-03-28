import { NextRequest, NextResponse } from "next/server";
import { getAdminCms, getAdminConfig } from "@/lib/cms";
import Anthropic from "@anthropic-ai/sdk";
import { getModel } from "@/lib/ai/model-resolver";
import { denyViewers } from "@/lib/require-role";

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const body = await req.json() as {
    url: string;
    text: string;
    docCollection: string;
    docSlug: string;
    type: "internal" | "external";
    error?: string;
  };

  const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

  // Build list of all available internal URLs
  const availableUrls: Array<{ url: string; title: string; collection: string }> = [];
  for (const col of config.collections) {
    const { documents } = await cms.content.findMany(col.name, {});
    const prefix = (col.urlPrefix ?? "").replace(/\/$/, "");
    for (const doc of documents) {
      const path = prefix ? `${prefix}/${doc.slug}` : `/${doc.slug}`;
      const title = String(doc.data?.title ?? doc.data?.name ?? doc.slug);
      availableUrls.push({ url: path, title, collection: col.name });
    }
  }

  // For internal broken links, try exact matching first (fast path)
  if (body.type === "internal") {
    const brokenPath = body.url.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    const brokenSlug = brokenPath.split("/").pop() ?? "";

    // Try slug-based match
    const slugMatch = availableUrls.find((u) => u.url.endsWith(`/${brokenSlug}`));
    if (slugMatch) {
      return NextResponse.json({
        suggestion: slugMatch.url,
        reason: `Document "${slugMatch.title}" exists at ${slugMatch.url}`,
        confidence: "high",
      });
    }
  }

  // Use AI for fuzzy matching
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: simple string similarity without AI
    const brokenPath = body.url.split(/[?#]/)[0].replace(/\/$/, "").toLowerCase();
    const scored = availableUrls
      .map((u) => ({
        ...u,
        score: similarity(brokenPath, u.url.toLowerCase()) + similarity(body.text.toLowerCase(), u.title.toLowerCase()),
      }))
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0.3) {
      return NextResponse.json({
        suggestion: scored[0].url,
        reason: `Best match: "${scored[0].title}" (similarity)`,
        confidence: "medium",
      });
    }
    return NextResponse.json({ suggestion: null, reason: "No similar document found and no AI key configured" });
  }

  const anthropic = new Anthropic({ apiKey });
  const urlList = availableUrls.map((u) => `${u.url} — ${u.title} (${u.collection})`).join("\n");

  const contentModel = await getModel("content");
  const msg = await anthropic.messages.create({
    model: contentModel,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `A CMS has a broken link. Suggest the correct URL from the available URLs list.

Broken link:
- URL: ${body.url}
- Link text: "${body.text}"
- Found in: ${body.docCollection}/${body.docSlug}
- Error: ${body.error ?? "Not found"}

Available URLs:
${urlList}

Respond in JSON only: {"suggestion": "/correct/url", "reason": "brief explanation"}
If no good match exists, respond: {"suggestion": null, "reason": "why"}`,
      },
    ],
  });

  try {
    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ suggestion: null, reason: "AI returned no suggestion" });
    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ...parsed, confidence: parsed.suggestion ? "high" : undefined });
  } catch {
    return NextResponse.json({ suggestion: null, reason: "Failed to parse AI response" });
  }
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const aSet = new Set(a.split(/[\/-]/));
  const bSet = new Set(b.split(/[\/-]/));
  let matches = 0;
  for (const seg of aSet) if (seg && bSet.has(seg)) matches++;
  return matches / Math.max(aSet.size, bSet.size, 1);
}
