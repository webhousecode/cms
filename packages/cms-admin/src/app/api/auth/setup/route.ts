import { NextRequest, NextResponse } from "next/server";
import { getUsers, createUser, createToken, COOKIE_NAME } from "@/lib/auth";

export async function GET() {
  const users = await getUsers();
  return NextResponse.json({ hasUsers: users.length > 0 });
}

export async function POST(request: NextRequest) {
  try {
    const users = await getUsers();
    if (users.length > 0) {
      return NextResponse.json({ error: "Setup already complete" }, { status: 403 });
    }

    const { email, password, name } = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const user = await createUser(email, password, name);
    const token = await createToken(user);

    const response = NextResponse.json({ ok: true, email: user.email, name: user.name });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
