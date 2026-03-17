import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@/lib/invitations";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const invitation = await validateToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 });
  }

  return NextResponse.json({
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  });
}
