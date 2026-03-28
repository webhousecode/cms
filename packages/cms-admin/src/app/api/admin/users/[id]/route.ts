import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getTeamMember, updateTeamMemberRole, removeTeamMember } from "@/lib/team";
import { denyViewers } from "@/lib/require-role";
import type { UserRole } from "@/lib/auth";

async function requireSiteAdmin() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;
  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") return null;
  return session;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers(); if (denied) return denied;
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json()) as { role?: UserRole };

  if (body.role && !["admin", "editor", "viewer"].includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent demoting yourself
  if (id === session.sub && body.role && body.role !== "admin") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  try {
    const member = await updateTeamMemberRole(id, body.role!);
    return NextResponse.json({ ok: true, role: member.role });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update role";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyViewers(); if (denied) return denied;
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.sub) {
    return NextResponse.json({ error: "Cannot remove yourself from the team" }, { status: 400 });
  }

  try {
    await removeTeamMember(id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to remove member";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
