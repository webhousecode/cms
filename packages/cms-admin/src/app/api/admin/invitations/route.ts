import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUsers } from "@/lib/auth";
import { getTeamMember } from "@/lib/team";
import { createInvitation, listInvitations } from "@/lib/invitations";
import type { UserRole } from "@/lib/auth";

async function requireSiteAdmin() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;
  // Check team membership on current site
  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") return null;
  return session;
}

export async function GET() {
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }
  const invitations = await listInvitations();
  return NextResponse.json({ invitations });
}

export async function POST(request: NextRequest) {
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; role?: UserRole };
  if (!body.email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const role = body.role ?? "editor";
  if (!["admin", "editor", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if user already has access to this site
  const users = await getUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === body.email!.toLowerCase());
  if (existingUser) {
    const existingMember = await getTeamMember(existingUser.id);
    if (existingMember) {
      return NextResponse.json({ error: "This user already has access to this site" }, { status: 409 });
    }
  }

  try {
    const invitation = await createInvitation(body.email, role, session.sub);
    return NextResponse.json({ invitation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create invitation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
