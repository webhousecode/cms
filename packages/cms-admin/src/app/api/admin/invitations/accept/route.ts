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

  if (!body.token || !body.name) {
    return NextResponse.json({ error: "Token and name are required" }, { status: 400 });
  }

  const invitation = await validateToken(body.token);
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  try {
    // Check if CMS-wide user already exists
    const users = await getUsers();
    let user = users.find((u) => u.email.toLowerCase() === invitation.email.toLowerCase());

    if (user) {
      // Existing CMS-wide user — add site access. If they provided a new
      // password (they filled in the form), update it so they can log in
      // with the password they just chose. Previously this silently ignored
      // the password, causing "invalid credentials" on login.
      if (body.password && body.password !== "__existing__" && body.password.length >= 8) {
        const { updateUser } = await import("@/lib/auth");
        await updateUser(user.id, { password: body.password, name: body.name?.trim() || user.name });
      }
    } else {
      // New user — requires password
      if (!body.password || body.password === "__existing__") {
        return NextResponse.json({ error: "Password is required for new accounts" }, { status: 400 });
      }
      if (body.password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
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
