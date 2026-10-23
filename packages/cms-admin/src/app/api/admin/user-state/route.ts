import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { readUserState, writeUserState, type UserState } from "@/lib/user-state";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  const t = await getServerTSafe();
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

  const state = await readUserState(session.sub);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

  const patch = (await request.json()) as Partial<UserState>;
  const updated = await writeUserState(session.sub, patch);
  return NextResponse.json(updated);
}

export async function PATCH(request: NextRequest) {
  const t = await getServerTSafe();
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

  const patch = (await request.json()) as Partial<UserState>;
  const updated = await writeUserState(session.sub, patch);
  return NextResponse.json(updated);
}
