/**
 * Backwards-compat redirect for document URLs — see ../page.tsx for context.
 */
import { redirect } from "next/navigation";

export default async function LegacyDocumentRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string; slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { collection, slug } = await params;
  const search = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(search)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v !== undefined) qs.set(k, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`/admin/content/${collection}/${slug}${suffix}`);
}
