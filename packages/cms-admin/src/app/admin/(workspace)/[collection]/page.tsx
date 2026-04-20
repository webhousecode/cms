/**
 * Backwards-compat redirect — collections moved to /admin/content/[collection].
 *
 * Next.js checks static routes before dynamic, so this only matches when the
 * slug isn't a built-in admin route (settings, media, forms, etc). For any
 * remaining dynamic segment we 307-redirect to the namespaced location so
 * existing bookmarks, Discord/Slack webhook links, emails, and goto shortcuts
 * keep working indefinitely.
 */
import { redirect } from "next/navigation";

export default async function LegacyCollectionRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { collection } = await params;
  const search = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v !== undefined) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/admin/content/${collection}${suffix}`);
}
