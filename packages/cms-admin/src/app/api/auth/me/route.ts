import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifyToken, getUsers, COOKIE_NAME } from "@/lib/auth";

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
  return NextResponse.json({
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      gravatarUrl: gravatarUrl(payload.email),
      zoom: user?.zoom ?? 100,
    },
  });
}
