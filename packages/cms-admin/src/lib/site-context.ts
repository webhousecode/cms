/**
 * Request-scoped site override for token-based API calls.
 *
 * Session-based admin code resolves the active site via cookies
 * (`cms-active-org`, `cms-active-site`). Token-based API callers don't
 * have cookies — they pass `?site=<siteId>` on the URL. This module lets
 * an API route wrap its body in `withSiteContext(orgId, siteId, ...)` so
 * that deeply-nested helpers like `getActiveSitePaths()` pick up the
 * override instead of falling back to the cookie-resolved default.
 *
 * Implementation: AsyncLocalStorage. Safe across concurrent requests
 * because each async chain gets its own store; no process-wide mutation.
 */
import { AsyncLocalStorage } from "node:async_hooks";

interface SiteContext {
  orgId?: string;
  siteId?: string;
}

const als = new AsyncLocalStorage<SiteContext>();

/** Run `fn` with an explicit site context. Nested calls see the override. */
export function withSiteContext<T>(ctx: SiteContext, fn: () => Promise<T>): Promise<T> {
  return als.run(ctx, fn);
}

/** Read the current override, or undefined if none set. */
export function getSiteContextOverride(): SiteContext | undefined {
  return als.getStore();
}
