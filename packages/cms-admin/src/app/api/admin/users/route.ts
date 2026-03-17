import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUsers } from "@/lib/auth";
import { getTeamMembers, getTeamMember, addTeamMember } from "@/lib/team";

export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auto-bootstrap: if team.json is empty, add current user as admin
  let members = await getTeamMembers();
  if (members.length === 0) {
    await addTeamMember(session.sub, "admin");
    members = await getTeamMembers();
  }

  const myMembership = members.find((m) => m.userId === session.sub);
  if (!myMembership) {
    return NextResponse.json({ error: "You don't have access to this site" }, { status: 403 });
  }

  // Only admins see the full team list
  if (myMembership.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  // Join team members with user data
  const users = await getUsers();
  const teamUsers = members.map((member) => {
    const user = users.find((u) => u.id === member.userId);
    return {
      id: member.userId,
      email: user?.email ?? "unknown",
      name: user?.name ?? "Unknown",
      role: member.role,
      createdAt: user?.createdAt ?? member.addedAt,
      addedAt: member.addedAt,
    };
  });

  return NextResponse.json({ users: teamUsers });
}
