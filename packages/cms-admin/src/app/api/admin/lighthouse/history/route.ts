import { NextResponse } from "next/server";
import { getHistory } from "@/lib/lighthouse/history";
import { getSiteRole } from "@/lib/require-role";

export async function GET() {
  const role = await getSiteRole();
  if (!role) return NextResponse.json([], { status: 401 });
  const history = await getHistory();
  return NextResponse.json(history);
}
