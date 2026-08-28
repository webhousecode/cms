/**
 * The chat engine — @broberg/chat, not our own loop.
 *
 * WHAT MOVED AND WHY. The old registry filtered itself:
 *
 *     allTools.filter((t) => !!t.permission && hasPermission(perms, t.permission))
 *
 * That line is correct today, and it was `!t.permission || …` a day ago — a
 * tool that declared nothing PASSED, 60 of 64 declared nothing, and a read-only
 * user was handed 61 tools of which 30 mutated. The fix was one character wide,
 * which is exactly why it should not live in our file: the same line has to be
 * right in every repo that ever builds a chat.
 *
 * @broberg/chat makes it unwritable. `permission` is required by the type AND
 * `defineTool()` throws without one, because a registry assembled at runtime
 * has no compiler. `toolsFor(caller)` returns what the caller may use — a
 * denied tool is ABSENT, never flagged, so nothing downstream can un-deny it.
 *
 * THE MODEL IS INJECTED, AND LAZILY. The package takes a `ModelFn` rather than
 * importing a provider, so the core carries no version pin it can outgrow. Ours
 * resolves `getAI()` only when the model is actually called — so `toolsFor()`
 * (permission listing, and everything the tool-matrix test measures) needs no
 * key, no network and no config.
 */
import { createChat, defineTool, type ChatTool, type ModelFn, type Chat } from "@broberg/chat";
import { hasPermission } from "@/lib/permissions-shared";
import type { ToolDefinition, ToolHandler } from "@/lib/tools";

/** What our own tool builders produce, before the engine takes ownership. */
export interface ToolPair {
  definition: ToolDefinition;
  handler: ToolHandler;
  permission: string;
}

/**
 * A caller is the resolved permission list, not a role.
 *
 * `Can` is async in the package because "a real answer is a lookup, not a list"
 * — fd-sundhed measured an admin whose access had been revoked getting in until
 * a guard checked more than the role. Ours genuinely IS a list by this point:
 * `resolvePermissions(role)` already ran, and the revocation question is
 * answered upstream by `getSiteRole()` returning null. Saying so here rather
 * than leaving it to look like an oversight.
 */
export type Caller = string[];

export const can = (permission: string, caller: Caller) => hasPermission(caller, permission);

/** Our tool shape → theirs. `defineTool` throws if a permission is missing. */
export function toChatTools(pairs: ToolPair[]): ChatTool<void>[] {
  return pairs.map((p) =>
    defineTool<void>({
      name: p.definition.name,
      description: p.definition.description,
      parameters: p.definition.input_schema as Record<string, unknown>,
      permission: p.permission,
      run: (args) => p.handler(args as Record<string, unknown>),
    }),
  );
}

/**
 * The ModelFn: @broberg/ai-sdk's stream, in the shape the core expects.
 *
 * Built lazily on purpose — see the header. `resolvedModel` is passed in rather
 * than resolved here so the route keeps owning the Mistral (EU/GDPR) pin and
 * its stale-`claude-…`-id guard; the engine must not quietly acquire a second
 * opinion about which provider answers.
 */
export function cmsModel(opts: {
  resolvedModel: string;
  maxTokens: number;
  purpose?: string;
}): ModelFn {
  return async function* (req) {
    const { getAI, mistralModel } = await import("@/lib/ai/client");
    const ai = await getAI();
    const stream = ai.chatStream({
      ...mistralModel(opts.resolvedModel),
      maxTokens: opts.maxTokens,
      system: req.system,
      messages: req.messages as never,
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      purpose: opts.purpose ?? "chat.agent",
    });
    for await (const ev of stream) {
      if (ev.type === "text") {
        if (ev.delta) yield { type: "text", text: ev.delta };
      } else if (ev.type === "tool_call") {
        yield { type: "tool-call", id: ev.id, name: ev.name, args: ev.args as Record<string, unknown> };
      } else if (ev.type === "error") {
        // The core has no error frame from the model side other than throwing;
        // a thrown error becomes a `{type:"error",scope:"model"}` frame there,
        // which is what the route already renders. Swallowing it here would
        // end the stream silently, which is the failure this whole day was about.
        throw new Error(ev.message);
      }
    }
  };
}

/**
 * A chat whose ONLY job right now is to answer "who may use which tool".
 *
 * The conversation loop still runs in the route; this is deliberately the first
 * half, because it is the half the tool matrix measures and the half that
 * carries the permission guarantee. A model is still required (and real), so
 * nothing here is a stub that would have to be replaced to make round two work.
 */
export function createCmsChat(opts: {
  tools: ChatTool<void>[];
  model?: ModelFn;
  systemPrompt?: string;
  maxRounds?: number;
}): Chat<void, Caller> {
  return createChat<void, Caller>({
    // Listing tools never calls the model. A chat that RUNS gets a real one
    // from the route; this default fails loudly rather than answering wrongly.
    model:
      opts.model ??
      (async function* () {
        throw new Error(
          "[chat/engine] createCmsChat was built without a model and then asked to run. " +
            "Pass cmsModel({resolvedModel, maxTokens}) — do not let a listing-only chat answer a user.",
        );
      } as ModelFn),
    tools: opts.tools,
    can,
    systemPrompt: opts.systemPrompt,
    maxRounds: opts.maxRounds,
  });
}
