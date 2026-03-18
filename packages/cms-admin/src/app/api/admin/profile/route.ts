import { NextRequest, NextResponse } from "next/server";
import { verifyToken, verifyPassword, updateUser, createToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { name, email, currentPassword, newPassword, zoom, lastActiveOrg, lastActiveSite } = (await request.json()) as {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
      zoom?: number;
      lastActiveOrg?: string;
      lastActiveSite?: string;
    };

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
      }
      const valid = await verifyPassword(payload.email, currentPassword);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
    }

    const updated = await updateUser(payload.sub, {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(newPassword ? { password: newPassword } : {}),
      ...(zoom !== undefined ? { zoom } : {}),
      ...(lastActiveOrg !== undefined ? { lastActiveOrg } : {}),
      ...(lastActiveSite !== undefined ? { lastActiveSite } : {}),
    }, payload.email);

    // Re-issue JWT with updated name/email
    const newToken = await createToken(updated);
    const response = NextResponse.json({ ok: true, name: updated.name, email: updated.email });
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (err) {
    console.error("[profile] save error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
