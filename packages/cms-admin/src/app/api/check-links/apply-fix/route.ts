import { NextRequest, NextResponse } from "next/server";
import { getAdminCms } from "@/lib/cms";
import { denyViewers } from "@/lib/require-role";

export async function POST(req: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const body = await req.json() as {
    docCollection: string;
    docSlug: string;
    field: string;
    oldUrl: string;
    newUrl: string;
    linkText: string;
  };

  const cms = await getAdminCms();
  const doc = await cms.content.findBySlug(body.docCollection, body.docSlug);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const fieldValue = String(doc.data?.[body.field] ?? "");
  // Replace the markdown link: [text](oldUrl) → [text](newUrl)
  const oldLink = `[${body.linkText}](${body.oldUrl})`;
  const newLink = `[${body.linkText}](${body.newUrl})`;

  if (!fieldValue.includes(oldLink)) {
    return NextResponse.json({ error: "Link not found in document field" }, { status: 400 });
  }

  const updatedValue = fieldValue.replace(oldLink, newLink);
  await cms.content.update(body.docCollection, doc.id, {
    data: { ...doc.data, [body.field]: updatedValue },
  });

  return NextResponse.json({ ok: true, replaced: { from: body.oldUrl, to: body.newUrl } });
}
