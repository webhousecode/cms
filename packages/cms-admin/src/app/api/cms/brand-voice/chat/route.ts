import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";

const SYSTEM = `You are a senior brand strategist conducting a discovery interview to define a website's Brand Voice & Goals document. This document will be the foundation for all future AI-generated content on the site — every agent will read it before writing anything.

Your job is to run a focused, intelligent conversation that extracts exactly what's needed. You are not a chatbot — you are a strategic interviewer.

## Tools
You have access to fetch_url. Use it proactively when the user mentions or shares website URLs — fetch ALL of them before asking your next question so you can reference what you found. If the user shares multiple URLs (homepage, about, services, etc.), call fetch_url for each one. Do not ask the user to describe something you can read yourself.

## Rules
1. Ask exactly ONE question per message. Never list multiple questions.
2. Each question must build on what the user has already told you. Reference their words.
3. Ask in the same language the user writes in — if they write Danish, ask in Danish.
4. Be concise. Max 2 sentences per question. No preamble, no filler.
5. Cover these topics in a natural order (not mechanically):
   - Business/site purpose and what makes it unique
   - Target audience (who exactly, what do they need)
   - Tone and personality (how should content feel)
   - Content goals (what should content achieve)
   - Key topics and content pillars
   - Topics or approaches to avoid
   - Language and SEO keywords
6. After 6–8 exchanges — when you have enough to write confidently — end the interview by outputting ONLY this exact marker followed by a JSON object on the next line:

__SYNTHESIS__
{"name":"...","industry":"...","description":"...","language":"...","targetAudience":"...","primaryTone":"...","brandPersonality":["..."],"contentGoals":["..."],"contentPillars":["..."],"avoidTopics":["..."],"seoKeywords":["..."],"examplePhrases":["..."]}

## JSON field guide
- name: company/site name
- industry: short industry label
- description: 1–2 sentences capturing the business
- language: primary content language (e.g. "Danish", "English")
- targetAudience: specific description of who reads the site
- primaryTone: 1 sentence describing the overall tone
- brandPersonality: 3–5 adjectives
- contentGoals: what content should achieve (leads, trust, SEO, etc.)
- contentPillars: main recurring topic areas
- avoidTopics: things to never write about or tone to avoid
- seoKeywords: 5–10 primary keywords
- examplePhrases: 2–3 short phrases that perfectly capture the brand voice

## Start
Begin the interview with a single, warm opening question about the site's purpose.`;

const FETCH_URL_TOOL: Anthropic.Tool = {
  name: "fetch_url",
  description: "Fetches the text content of a URL. Use this to read a website the user mentions so you can reference what you find in your questions.",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The full URL to fetch (must start with http:// or https://)" },
    },
    required: ["url"],
  },
};

async function fetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; webhouse-cms-brand-voice/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return `HTTP ${res.status} — could not fetch ${url}`;
    const html = await res.text();
    // Strip tags, collapse whitespace, limit length
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 6000);
    return text || "(empty page)";
  } catch (err) {
    return `Could not fetch ${url}: ${(err as Error).message}`;
  }
}

type ConversationMessage =
  | { role: "user"; content: string | Anthropic.ToolResultBlockParam[] }
  | { role: "assistant"; content: string | Anthropic.ContentBlock[] };

/** Runs the agentic tool-use loop, returns final assistant text. */
async function runWithTools(
  client: Anthropic,
  apiMessages: ConversationMessage[]
): Promise<string> {
  let messages = [...apiMessages];

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      tools: [FETCH_URL_TOOL],
      messages: messages as Anthropic.MessageParam[],
    });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }

    if (response.stop_reason === "tool_use") {
      // Add assistant turn with tool calls
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool call
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "fetch_url") {
          const input = block.input as { url: string };
          const content = await fetchUrl(input.url);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Unexpected stop reason — return whatever text we have
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  return "Something went wrong — please try again.";
}

export async function POST(request: NextRequest) {
  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Anthropic API key not configured — add it in Settings → AI" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = (await request.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const apiMessages: ConversationMessage[] = messages.length === 0
    ? [{ role: "user", content: "Start the interview." }]
    : messages.map((m) => ({ role: m.role, content: m.content }));

  const client = new Anthropic({ apiKey });

  // Run tool loop, then stream the final text back
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        const text = await runWithTools(client, apiMessages);

        // Stream the response in chunks for UI feel
        const CHUNK = 4;
        for (let i = 0; i < text.length; i += CHUNK) {
          controller.enqueue(encoder.encode(text.slice(i, i + CHUNK)));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`Error: ${(err as Error).message}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
