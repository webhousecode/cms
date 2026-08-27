/**
 * What a chat tool is handed — and the only way it reaches this site's data.
 *
 * THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE. Measured 27 Aug 2026: the 64 chat
 * tools called `getAdminCms()` / `getAdminConfig()` directly, so every
 * `requirePermission` gate on `/api/cms/*` sat OUTSIDE the chat's path. The
 * only thing standing between a viewer and 30 mutating tools was the registry
 * filter — and that filter read `!t.permission || hasPermission(…)`, so a tool
 * that declared nothing passed to everyone (F176).
 *
 * F176 fixed the filter. This fixes the shape: a tool no longer decides whether
 * it may act. It asks for an operation, and the operation refuses.
 *
 * WHY NOT ROUTE TOOLS THROUGH OUR OWN HTTP ROUTES — the other obvious design,
 * and components' answer when asked (28 Aug): that would be 58 network calls in
 * the same process to reach code that lives in it. Ceremony, not security, paid
 * for on every turn. What actually removes the defect is not HOW a tool reaches
 * data but THAT IT DOES NOT DECIDE FOR ITSELF. So the gate moves into one
 * wrapper, built from the same `hasPermission` the routes use — one gate
 * implementation for HTTP and chat rather than two that drift.
 *
 * The test that proves the shape (components' own, and sharper than the advice):
 * call a tool with a READ caller's ctx and have it attempt a write. It must
 * fail IN THE CTX, not in the tool. If it fails in the tool, the gate moved
 * back inside the tool and nothing was gained.
 */

import { hasPermission } from "@/lib/permissions-shared";

/** Refusal from the ctx — never an HTTP Response; the chat is not a route. */
export class ToolPermissionError extends Error {
  constructor(
    readonly permission: string,
    readonly operation: string,
  ) {
    super(
      `Denne handling kræver rettigheden "${permission}", som du ikke har. ` +
      `(${operation})`,
    );
    this.name = "ToolPermissionError";
  }
}

/** The engine surface the ctx needs. Kept structural so tests can pass a fake. */
export interface ToolEngine {
  findOne(collection: string, slug: string): Promise<unknown>;
  findMany(collection: string, opts?: Record<string, unknown>): Promise<unknown>;
  create(collection: string, input: Record<string, unknown>): Promise<unknown>;
  update(collection: string, id: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface ToolCtx {
  readDoc(collection: string, slug: string): Promise<unknown>;
  listDocs(collection: string, opts?: Record<string, unknown>): Promise<unknown>;
  createDoc(collection: string, input: Record<string, unknown>): Promise<unknown>;
  updateDoc(collection: string, id: string, input: Record<string, unknown>): Promise<unknown>;
  /** What the caller holds — readable so a tool can shape its ANSWER, never its access. */
  readonly granted: readonly string[];
}

/**
 * Build the ctx for one caller.
 *
 * `granted` is resolved ONCE per request in the chat route and passed in, so
 * this cannot drift from the permission the registry filtered on. The engine is
 * injected rather than imported so a test can prove refusal WITHOUT a database:
 * a gate that only works when the engine is reachable is a gate nobody can test.
 */
export function buildToolCtx(engine: ToolEngine, granted: readonly string[]): ToolCtx {
  // A PRIVATE COPY is what the gate reads, and the tool never holds a reference
  // to it. Caught by this module's own test: the first version handed the SAME
  // array out as `granted`, and `readonly` is a compile-time promise only — at
  // runtime a tool could `push("content.edit")` onto the list the gate consults
  // and then write. A wrapper whose permissions the wrapped code can widen is
  // not a gate; it is a suggestion.
  const own = [...granted];
  const exposed = Object.freeze([...granted]);

  function gate(permission: string, operation: string): void {
    if (!hasPermission(own, permission)) {
      throw new ToolPermissionError(permission, operation);
    }
  }

  return {
    granted: exposed,
    async readDoc(collection, slug) {
      gate("content.read", `læs ${collection}/${slug}`);
      return engine.findOne(collection, slug);
    },
    async listDocs(collection, opts) {
      gate("content.read", `list ${collection}`);
      return engine.findMany(collection, opts);
    },
    async createDoc(collection, input) {
      gate("content.create", `opret i ${collection}`);
      return engine.create(collection, input);
    },
    async updateDoc(collection, id, input) {
      gate("content.edit", `ret ${collection}/${id}`);
      return engine.update(collection, id, input);
    },
  };
}
