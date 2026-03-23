import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createToken, getUsers, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const user = await verifyPassword(email, password);
    if (!user) {
      // Check if the user exists but has no password (GitHub-only account)
      const users = await getUsers();
      const exists = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (exists && !exists.passwordHash) {
        return NextResponse.json({ error: "This account uses GitHub login — click \"Sign in with GitHub\" below" }, { status: 401 });
      }
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createToken(user);

    const response = NextResponse.json({ ok: true, email: user.email, name: user.name });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    // Restore last active site (survives cookie clear / device switch)
    if (user.lastActiveOrg) {
      response.cookies.set("cms-active-org", user.lastActiveOrg, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    if (user.lastActiveSite) {
      response.cookies.set("cms-active-site", user.lastActiveSite, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
