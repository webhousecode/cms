import { getAdminConfig } from "@/lib/cms";
import { NextResponse } from "next/server";

export async function GET() {
  const config = await getAdminConfig();
  const collections = config.collections.map((c) => ({
    name: c.name,
    label: c.label ?? c.name,
  }));
  return NextResponse.json({ collections });
}
