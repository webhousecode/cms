import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifyToken, getUsers, COOKIE_NAME } from "@/lib/auth";
import { getTeamMembers, addTeamMember } from "@/lib/team";

function gravatarUrl(email: string, size = 80): string {
  const hash = createHash("md5").update(email.toLowerCase().trim()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

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
    : gravatarUrl(payload.email);

  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: user?.role ?? payload.role ?? "admin",
      siteRole: membership?.role ?? null, // null = no access to this site
      gravatarUrl: avatarUrl,
      zoom: user?.zoom ?? 100,
    },
  });
}
