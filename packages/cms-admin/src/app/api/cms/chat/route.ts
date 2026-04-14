import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "@/lib/ai-config";
import { gatherSiteContext, buildChatSystemPrompt, getMemoryContext } from "@/lib/chat/system-prompt";
import { buildChatTools } from "@/lib/chat/tools";
import { extractMemories } from "@/lib/chat/memory-extractor";
import { getConversation } from "@/lib/chat/conversation-store";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { resolvePermissions } from "@/lib/permissions-shared";
import type { UserRole } from "@/lib/auth";
import { getModel } from "@/lib/ai/model-resolver";

export const maxDuration = 300;

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-6",
  "claude-opus-4-20250514",
  "claude-opus-4-6",
] as const;

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });

  const apiKey = await getApiKey("anthropic");
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured — add it in Settings → AI" },
      { status: 503 }
    );
  }

  const { messages, model: requestedModel, conversationId } = (await request.json()) as {
    messages: ChatRequestMessage[];
    model?: string;
    conversationId?: string;
  };

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  // Build system prompt with full site context + memory injection
  let siteContext;
  let systemPrompt: string;
  let toolPairs;
  try {
    siteContext = await gatherSiteContext();
    systemPrompt = buildChatSystemPrompt(siteContext);
    const userPerms = resolvePermissions((session.siteRole ?? "admin") as UserRole);
    toolPairs = await buildChatTools(userPerms);

    // Inject relevant memories from past conversations
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      const { section } = await getMemoryContext(lastUserMsg.content);
      if (section) systemPrompt += section;
    }
  } catch (initErr) {
    console.error("[chat] Init error:", initErr instanceof Error ? initErr.stack : initErr);
    return NextResponse.json(
      { error: `Chat init failed: ${initErr instanceof Error ? initErr.message : "unknown"}` },
      { status: 500 }
    );
  }
  const anthropicTools: Anthropic.Tool[] = toolPairs.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    input_schema: t.definition.input_schema as Anthropic.Tool.InputSchema,
  }));
  const handlers = new Map(toolPairs.map((t) => [t.definition.name, t.handler]));

  // Read configurable limits from site config (inherits from org)
  const siteConfig = await readSiteConfig();
  const chatMaxTokens = Math.min(siteConfig.aiChatMaxTokens || 16384, 32768);
  const chatMaxIterations = Math.min(siteConfig.aiChatMaxToolIterations || 25, 50);

  // Resolve model: request param → site config → code default
  const defaultModel = siteConfig.aiChatModel || await getModel("code");
  const resolvedModel =
    requestedModel && ALLOWED_MODELS.includes(requestedModel as any)
      ? requestedModel
      : defaultModel;

  // SSE stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Convert messages to Anthropic format
        const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          // Support both string content and array content blocks (vision images)
          content: m.content as any,
        }));

        for (let i = 0; i < chatMaxIterations; i++) {
          const response = await client.messages.create({
            model: resolvedModel,
            max_tokens: chatMaxTokens,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: anthropicTools,
          });

          // Process response blocks
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
              b.type === "tool_use"
          );
          const textBlocks = response.content.filter(
            (b): b is Anthropic.TextBlock => b.type === "text"
          );

          // If no tool calls, stream the final text and we're done
          if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
            for (const block of textBlocks) {
              if (block.text) {
                sendEvent("text", { text: block.text });
              }
            }
            break;
          }

          // Stream intermediate reasoning text so the UI can show it
          for (const block of textBlocks) {
            if (block.text) {
              sendEvent("thinking", { text: block.text });
            }
          }

          // Execute tool calls
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of toolUseBlocks) {
            sendEvent("tool_call", {
              tool: block.name,
              input: block.input,
            });

            const handler = handlers.get(block.name);
            let result: string;
            if (handler) {
              try {
                result = await handler(block.input);
              } catch (err) {
                result = `Error: ${err instanceof Error ? err.message : "unknown error"}`;
              }
            } else {
              result = `Unknown tool: ${block.name}`;
            }

            // Check for inline form response
            if (result.startsWith("__INLINE_FORM__")) {
              const formJson = result.slice("__INLINE_FORM__".length);
              sendEvent("form", JSON.parse(formJson));
              result = "Showing edit form for the user.";
            }

            // Check for artifact (interactive HTML)
            if (result.startsWith("__ARTIFACT__")) {
              const artifactJson = result.slice("__ARTIFACT__".length);
              sendEvent("artifact", JSON.parse(artifactJson));
              result = "Interactive generated and displayed.";
            }

            sendEvent("tool_result", {
              tool: block.name,
              result: result.slice(0, 3000),
            });

            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }

          // Continue the conversation with tool results
          anthropicMessages.push({ role: "assistant", content: response.content });
          anthropicMessages.push({ role: "user", content: toolResults });
        }

        sendEvent("done", {});

        // Extract memories in background after conversation ends
        if (conversationId) {
          getConversation(session.userId, conversationId)
            .then((conv) => conv && extractMemories(conv))
            .catch(() => {});
        }
      } catch (err) {
        sendEvent("error", {
          message: err instanceof Error ? err.message : "Chat error",
        });
      }

      controller.close();
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
