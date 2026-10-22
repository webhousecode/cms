import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUser, getUsers, createToken, getSessionUser, COOKIE_NAME } from "@/lib/auth";
import { isBidConfigured } from "@/lib/bid-config";
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

    const bidOn = isBidConfigured();
    const existed = !!user;
    if (user) {
      // Security W41 C2 — an invitation token is not proof of owning the
      // account it names: the inviter holds the same token. This branch used
      // to SET the existing user's password and issue a 7-day session, so any
      // site admin could invite the owner's email and take the account.
      // An existing user accepts only while signed in as that user, and the
      // password is never touched here.
      const session = await getSessionUser(await cookies());
      if (session?.sub !== user.id) {
        return NextResponse.json(
          { error: `This email already has an account. Sign in as ${invitation.email} and open the link again.` },
          { status: 403 },
        );
      }
    } else if (bidOn) {
      // With Broberg ID the account is created without a password; signing in
      // through BID (which verifies the email) is what proves ownership.
      user = await createUser(invitation.email, null, body.name, {
        role: invitation.role === "admin" ? "editor" : invitation.role,
        invitedBy: invitation.createdBy,
      });
    } else {
      // New user — requires password
      if (!body.password || body.password === "__existing__") {
        return NextResponse.json({ error: "Password is required for new accounts" }, { status: 400 });
      }
      if (body.password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      user = await createUser(invitation.email, body.password, body.name, {
        // Security W41 — the CMS-wide role "admin" makes a user the INSTANCE
        // admin (every org and site). An invitation grants a role on ONE
        // site (team.json below); it must never grant the instance.
        role: invitation.role === "admin" ? "editor" : invitation.role,
        invitedBy: invitation.createdBy,
      });
    }

    // Add as team member on the site where the invitation was created
    // Uses siteDataDir from invitation so it works without cookies
    await addTeamMember(user.id, invitation.role, invitation.createdBy, invitation.siteDataDir);

    // Mark invitation as accepted
    await markAccepted(body.token, invitation.siteDataDir);

    // An existing user is already signed in; with BID on, a new user signs in
    // through BID. Only a self-hosted install without BID issues a session here.
    if (existed || bidOn) {
      return NextResponse.json({ ok: true });
    }

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
