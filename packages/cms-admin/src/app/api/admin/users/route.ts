import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUsers } from "@/lib/auth";
import { getTeamMembers, getTeamMember, addTeamMember } from "@/lib/team";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  const t = await getServerTSafe();
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });
  }

  // Auto-bootstrap: if team.json is empty, add the OLDEST CMS user as admin
  let members = await getTeamMembers();
  if (members.length === 0) {
    const allUsers = await getUsers();
    const oldest = [...allUsers].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0];
    if (oldest) {
      await addTeamMember(oldest.id, "admin");
      members = await getTeamMembers();
    }
  }

  const myMembership = members.find((m) => m.userId === session.sub);
  if (!myMembership) {
    return NextResponse.json({ error: t("errAdmin.users.noSiteAccess") }, { status: 403 });
  }

  // Only admins see the full team list
  if (myMembership.role !== "admin") {
    return NextResponse.json({ error: t("errAdmin.users.adminRequired") }, { status: 403 });
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
