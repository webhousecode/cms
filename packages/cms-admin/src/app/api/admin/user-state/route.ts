import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { readUserState, writeUserState, type UserState } from "@/lib/user-state";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = await readUserState(session.sub);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch = (await request.json()) as Partial<UserState>;
  const updated = await writeUserState(session.sub, patch);
  return NextResponse.json(updated);
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const patch = (await request.json()) as Partial<UserState>;
  const updated = await writeUserState(session.sub, patch);
  return NextResponse.json(updated);
}
