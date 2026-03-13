import { NextResponse } from "next/server";
import { listRevisions } from "@/lib/revisions";

type Ctx = { params: Promise<{ collection: string; slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { collection, slug } = await params;
    const revisions = await listRevisions(collection, slug);
    return NextResponse.json(revisions);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
