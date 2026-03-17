import { NextRequest, NextResponse } from "next/server";
import { createUser, getUsers, createToken, COOKIE_NAME } from "@/lib/auth";
import { validateToken, markAccepted } from "@/lib/invitations";
import { addTeamMember } from "@/lib/team";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    token?: string;
    name?: string;
    password?: string;
  };

  if (!body.token || !body.name || !body.password) {
    return NextResponse.json({ error: "Token, name, and password are required" }, { status: 400 });
  }

  if (body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const invitation = await validateToken(body.token);
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  try {
    // Check if CMS-wide user already exists (invited to another site before)
    const users = await getUsers();
    let user = users.find((u) => u.email.toLowerCase() === invitation.email.toLowerCase());

    if (!user) {
      // Create CMS-wide user account
      user = await createUser(invitation.email, body.password, body.name, {
        role: invitation.role,
        invitedBy: invitation.createdBy,
      });
    }

    // Add as team member on the site where the invitation was created
    // Uses siteDataDir from invitation so it works without cookies
    await addTeamMember(user.id, invitation.role, invitation.createdBy, invitation.siteDataDir);

    // Mark invitation as accepted
    await markAccepted(body.token, invitation.siteDataDir);

    // Create session token and set cookie
    const sessionToken = await createToken(user);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create account";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
