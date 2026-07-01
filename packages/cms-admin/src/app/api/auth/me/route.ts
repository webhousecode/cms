import { NextRequest, NextResponse } from "next/server";
import { gravatarUrl } from "@broberg/gravatar";
import { verifyToken, getUsers, COOKIE_NAME, type UserRole } from "@/lib/auth";
import { getTeamMembers, addTeamMember } from "@/lib/team";
import { resolvePermissions } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ user: null });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ user: null });
  // Read full user record to get preferences (zoom etc.)
  const users = await getUsers();
  const user = users.find((u) => u.id === payload.sub);

  // Get site-specific role from team membership
  let members = await getTeamMembers();
  // Auto-bootstrap: if team.json is empty, add the OLDEST CMS user as admin
  // (the one who ran setup). Never auto-add a random user.
  if (members.length === 0 && users.length > 0) {
    const oldest = [...users].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0];
    if (oldest) {
      await addTeamMember(oldest.id, "admin");
      members = await getTeamMembers();
    }
  }
  const membership = members.find((m) => m.userId === payload.sub);

  // Prefer GitHub avatar for linked users, fall back to Gravatar
  const avatarUrl = user?.githubUsername
    ? `https://github.com/${user.githubUsername}.png?size=64`
    : await gravatarUrl(payload.email);

  const siteRole = (membership?.role ?? null) as UserRole | null;
  return NextResponse.json({
    user: {
      id: payload.sub,
      email: user?.email ?? payload.email,
      name: user?.name ?? payload.name,
      role: user?.role ?? payload.role ?? "admin",
      siteRole,
      permissions: siteRole ? resolvePermissions(siteRole) : [],
      gravatarUrl: avatarUrl,
      zoom: user?.zoom ?? 100,
    },
  });
}
