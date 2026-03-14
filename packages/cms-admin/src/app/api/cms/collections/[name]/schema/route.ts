import { NextRequest, NextResponse } from "next/server";
import { getAdminConfig } from "@/lib/cms";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const config = await getAdminConfig();
  const col = config.collections.find((c) => c.name === name);
  if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ name: col.name, fields: col.fields });
}
