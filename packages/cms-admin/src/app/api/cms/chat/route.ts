import { NextRequest, NextResponse } from "next/server";
import type { ChatMessage } from "@broberg/chat";
import { getApiKey } from "@/lib/ai-config";
import { gatherSiteContext, buildChatSystemPrompt, getMemoryContext } from "@/lib/chat/system-prompt";
import { measurePromptSize, promptSizeComplaint } from "@/lib/chat/prompt-size";
import { buildAllToolPairs } from "@/lib/chat/tools";
import { toChatTools, createCmsChat, cmsModel } from "@/lib/chat/engine";
import { buildHistoryConfig, resolveProfile } from "@/lib/chat/history-config";
import { frameToEvents } from "@/lib/chat/frames";
import { summariseTurns } from "@/lib/chat/summarise";
import { extractMemories } from "@/lib/chat/memory-extractor";
import { getConversation } from "@/lib/chat/conversation-store";
import { getSessionWithSiteRole } from "@/lib/require-role";
import { readSiteConfig } from "@/lib/site-config";
import { resolvePermissions, hasPermission } from "@/lib/permissions-shared";
import type { UserRole } from "@/lib/auth";
import { getModel } from "@/lib/ai/model-resolver";
import { resolveChatModel } from "@/lib/chat/resolve-chat-model";

export const maxDuration = 300;

interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  const session = await getSessionWithSiteRole();
  if (!session) return NextResponse.json({ error: "No access" }, { status: 403 });
  // F176 — `chat.use` exists as a permission and was never asked for. Being
  // logged in was the whole gate, so a viewer could open the chat and then be
  // handed every tool that declared no permission of its own.
  if (!hasPermission(resolvePermissions(session.siteRole as UserRole), "chat.use")) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const apiKey = await getApiKey("mistral");
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

  // Build system prompt with full site context + memory injection
  let siteContext;
  let systemPrompt: string;
  let toolPairs;
  let callerPerms: string[] = [];
  try {
    siteContext = await gatherSiteContext();
    systemPrompt = buildChatSystemPrompt(siteContext);
    // No role ⇒ NO permissions. This defaulted to "admin", so a session that
    // arrived without a siteRole got the full tool set — a fail-open default in
    // the one line that decides what the model is allowed to reach for.
    const userPerms = session.siteRole
      ? resolvePermissions(session.siteRole as UserRole)
      : [];
    // EVERY tool — `run()` filters per caller via the engine's `can`. The route
    // no longer decides who gets what; passing the caller is now the only way
    // to get a tool at all, so there is no path that forgets to filter.
    toolPairs = await buildAllToolPairs();
    callerPerms = userPerms;

    // Inject relevant memories from past conversations
    const lastUserMsg = messages.filter((m) => m.role === "user").pop();
    if (lastUserMsg) {
      const { section } = await getMemoryContext(lastUserMsg.content);
      if (section) systemPrompt += section;
    }

    // F177.3 — the alarm on the half that does NOT grow with the conversation.
    // A fixture test cannot notice a REAL site's schema doubling; only this can.
    // Measured BEFORE the memory section is counted would understate it, so it
    // runs here, on what is actually sent. Warns, never blocks: at this size
    // nothing breaks, and taking a customer's chat down over a big schema
    // trades a quiet cost for a loud outage.
    const complaint = promptSizeComplaint(measurePromptSize(systemPrompt, siteContext));
    if (complaint) console.warn(`[chat] ${complaint}`);
  } catch (initErr) {
    console.error("[chat] Init error:", initErr instanceof Error ? initErr.stack : initErr);
    return NextResponse.json(
      { error: `Chat init failed: ${initErr instanceof Error ? initErr.message : "unknown"}` },
      { status: 500 }
    );
  }
  // Read configurable limits from site config (inherits from org)
  const siteConfig = await readSiteConfig();
  const chatMaxTokens = Math.min(siteConfig.aiChatMaxTokens || 16384, 32768);
  const chatMaxIterations = Math.min(siteConfig.aiChatMaxToolIterations || 25, 50);

  // Resolve model: request param → site config → code default. The chat is
  // pinned to the Mistral (EU/GDPR) provider, so resolveChatModel guards against
  // a non-Mistral id (e.g. a stale "claude-…" aiChatModel) reaching Mistral and
  // 400-ing — it falls back to the code-tier Mistral model in that case.
  const resolvedModel = resolveChatModel(
    requestedModel,
    siteConfig.aiChatModel,
    await getModel("code"),
  );

  // ── The conversation loop is @broberg/chat's, not ours ──────────────────
  //
  // What was here: our own for-loop over ai.chatStream, executing tool calls,
  // pushing assistant + tool messages, up to N rounds. It worked. It was also
  // the same loop every repo in the fleet had written separately, and the
  // permission filter it fed from was one character from handing a read-only
  // user 30 mutating tools.
  //
  // `run()` yields typed frames; this route's only job now is to translate
  // them into the SSE events the client already speaks. Frames the client has
  // no vocabulary for (history, limit) are turned into something a HUMAN can
  // read rather than dropped — a user must never be answered from half a
  // conversation, or told nothing because a ceiling was reached.
  // How long this site's conversations may get. Per site, because the need is
  // not the same: CMS builds multilingual content over hours, a visitor on a
  // clinic's site asks three questions. Christian's decision, 28 Aug 2026 —
  // summarise the oldest rather than drop it, long by default here.
  const historyProfile = resolveProfile(siteConfig.aiChatHistoryProfile);
  const chat = createCmsChat({
    tools: toChatTools(toolPairs),
    model: cmsModel({ resolvedModel, maxTokens: chatMaxTokens, purpose: "chat.agent" }),
    systemPrompt,
    maxRounds: chatMaxIterations,
    history: buildHistoryConfig({
      profile: historyProfile,
      maxOutputTokens: chatMaxTokens,
      // The summary is a model call, and it is OURS to make — the package
      // deliberately makes none. Cheap tier: condensing what was already said
      // does not need the model that wrote it.
      summarise: (older) => summariseTurns(older, resolvedModel),
    }),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const chatMessages: ChatMessage[] = messages.map((m) => ({
          role: m.role,
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));

        for await (const frame of chat.run({
          messages: chatMessages,
          caller: callerPerms,
          ctx: undefined,
        })) {
          if (frame.type === "history") console.warn(`[chat] history ${frame.action}: ${frame.note}`);
          // The translation is a pure function in chat/frames.ts so every frame
          // the package can emit has an assertion — inside this loop it could
          // only be exercised by running a real conversation against a model.
          for (const ev of frameToEvents(frame)) sendEvent(ev.event, ev.data);
          if (frame.type === "done") break;
        }

        // NOT sent again here: the engine's own `done` frame is translated by
        // frameToEvents, so emitting one more produced TWO `done` events on
        // every turn — seen in the production stream while diagnosing the tool
        // pairing. Harmless to our client, and exactly the kind of thing that
        // becomes load-bearing for the next one.

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
