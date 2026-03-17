import { getAdminCms, getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSiteRole } from "@/lib/require-role";

type Ctx = { params: Promise<{ collection: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  // Viewers can read, but check team membership exists
  const role = await getSiteRole();
  if (!role) return NextResponse.json({ error: "No access to this site" }, { status: 403 });
  try {
    const { collection } = await params;
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);
    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
    const { documents } = await cms.content.findMany(collection, {});
    return NextResponse.json(documents.filter((d: any) => d.status !== "trashed"));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  // Only admins and editors can create documents
  const role = await getSiteRole();
  if (!role || role === "viewer") return NextResponse.json({ error: "Editors only" }, { status: 403 });

  try {
    const { collection } = await params;
    const body = await req.json() as { slug: string; data?: Record<string, unknown>; locale?: string };
    const [cms, config] = await Promise.all([getAdminCms(), getAdminConfig()]);

    const colConfig = config.collections.find((c) => c.name === collection);
    if (!colConfig) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

    const locale = body.locale ?? config.defaultLocale;
    const doc = await cms.content.create(collection, {
      slug: body.slug,
      data: body.data ?? {},
      status: "draft",
      ...(locale ? { locale } : {}),
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
