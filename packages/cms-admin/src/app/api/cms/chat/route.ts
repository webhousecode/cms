import { NextRequest, NextResponse } from "next/server";
import type { ChatInput, ContentPart, Message, Tool } from "@broberg/ai-sdk";
import { getApiKey } from "@/lib/ai-config";
import { getAI, anthropicModel } from "@/lib/ai/client";
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

  const ai = await getAI();

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
  const sdkTools: Tool[] = toolPairs.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    parameters: t.definition.input_schema as Record<string, unknown>,
  }));
  const handlers = new Map(toolPairs.map((t) => [t.definition.name, t.handler]));

  // Convert incoming message content (string, or Anthropic-format content
  // blocks for vision images) to the SDK's Message/ContentPart shape.
  function toSdkContent(content: unknown): string | ContentPart[] {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.map((b): ContentPart => {
        const block = b as Record<string, unknown>;
        if (block.type === "image") {
          const source = block.source as { type?: string; media_type?: string; data?: string } | undefined;
          if (source?.type === "base64" && source.data) {
            return { type: "image", image: Buffer.from(source.data, "base64"), mimeType: source.media_type };
          }
        }
        return { type: "text", text: typeof block.text === "string" ? block.text : "" };
      });
    }
    return String(content);
  }

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
        // Convert incoming messages to the SDK Message shape (supports both
        // string content and Anthropic-format content blocks for vision images)
        const chatMessages: Message[] = messages.map((m) => ({
          role: m.role,
          content: toSdkContent(m.content),
        }));

        for (let i = 0; i < chatMaxIterations; i++) {
          const { text, toolCalls } = await ai.chat({
            ...anthropicModel(resolvedModel),
            maxTokens: chatMaxTokens,
            system: systemPrompt,
            // Cast bridges the SDK's hand-written Message type and its stricter
            // zod-inferred ChatInput.messages (Uint8Array<ArrayBuffer>); the
            // runtime values are already correct.
            messages: chatMessages as ChatInput["messages"],
            tools: sdkTools,
            purpose: "chat.agent",
          });

          // If no tool calls, stream the final text and we're done
          if (!toolCalls || toolCalls.length === 0) {
            if (text) sendEvent("text", { text });
            break;
          }

          // Stream intermediate reasoning text so the UI can show it
          if (text) sendEvent("thinking", { text });

          // Execute tool calls; each result becomes its own `tool` message
          const toolResultMessages: Message[] = [];
          for (const tc of toolCalls) {
            sendEvent("tool_call", {
              tool: tc.name,
              input: tc.arguments,
            });

            const handler = handlers.get(tc.name);
            let result: string;
            if (handler) {
              try {
                result = await handler(tc.arguments);
              } catch (err) {
                result = `Error: ${err instanceof Error ? err.message : "unknown error"}`;
              }
            } else {
              result = `Unknown tool: ${tc.name}`;
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
              tool: tc.name,
              result: result.slice(0, 3000),
            });

            toolResultMessages.push({
              role: "tool",
              toolCallId: tc.id,
              content: result,
            });
          }

          // Continue the conversation: assistant turn (with its tool calls) +
          // one tool-result message per call.
          chatMessages.push({ role: "assistant", content: text, toolCalls });
          chatMessages.push(...toolResultMessages);
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
