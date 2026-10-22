/**
 * F211.2 — the admin language for THIS request, for server components and
 * route handlers. Same chain as the root layout (it imports this): the user's
 * choice → the brand's default → the browser → English. Read per request,
 * never cached at module level.
 */
import { cookies, headers } from "next/headers";
import { getSessionUser, getUserById } from "@/lib/auth";
import { brandForRequest } from "@/lib/brand";
import { getT, resolveUiLocale, type UiLocale } from "./locale";

export async function getRequestLocale(brandDefault?: string): Promise<UiLocale> {
  const h = await headers();
  const brandLocale = brandDefault ?? brandForRequest(h).defaultLocale;
  let user: string | null = null;
  try {
    const session = await getSessionUser(await cookies());
    if (session) user = (await getUserById(session.id))?.uiLocale ?? null;
  } catch { /* signed out or unreadable session → automatic */ }
  return resolveUiLocale({ user, brand: brandLocale, acceptLanguage: h.get("accept-language") });
}

/** const t = await getServerT(); t("pages.trash.title") */
export async function getServerT() {
  return getT(await getRequestLocale());
}
