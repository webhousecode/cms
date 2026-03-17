import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, getUsers } from "@/lib/auth";
import { getTeamMembers, getTeamMember } from "@/lib/team";

/**
 * GET /api/admin/users/available
 * Returns CMS-wide users who are NOT already team members on the active site.
 * Used for autocomplete in the invite form.
 */
export async function GET() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return NextResponse.json({ users: [] });

  // Only admins can see available users
  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") {
    return NextResponse.json({ users: [] });
  }

  const [allUsers, teamMembers] = await Promise.all([
    getUsers(),
    getTeamMembers(),
  ]);

  const teamUserIds = new Set(teamMembers.map((m) => m.userId));

  // Return users not already on this site's team
  const available = allUsers
    .filter((u) => !teamUserIds.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
    }));

  return NextResponse.json({ users: available });
}
