import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { getSessionUser, getUsers } from "@/lib/auth";
import { getTeamMember } from "@/lib/team";
import { createInvitation, listInvitations } from "@/lib/invitations";
import { sendEmail, renderInviteEmail } from "@/lib/email";
import { readSiteConfig } from "@/lib/site-config";
import type { UserRole } from "@/lib/auth";

async function requireSiteAdmin() {
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) return null;
  // Check team membership on current site
  const member = await getTeamMember(session.sub);
  if (!member || member.role !== "admin") return null;
  return session;
}

export async function GET() {
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }
  const invitations = await listInvitations();
  return NextResponse.json({ invitations });
}

export async function POST(request: NextRequest) {
  const session = await requireSiteAdmin();
  if (!session) {
    return NextResponse.json({ error: "Site admin access required" }, { status: 403 });
  }

  const body = (await request.json()) as { email?: string; role?: UserRole };
  if (!body.email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const role = body.role ?? "editor";
  if (!["admin", "editor", "viewer"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if user already has access to this site
  const users = await getUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === body.email!.toLowerCase());
  if (existingUser) {
    const existingMember = await getTeamMember(existingUser.id);
    if (existingMember) {
      return NextResponse.json({ error: "This user already has access to this site" }, { status: 409 });
    }
  }

  try {
    const invitation = await createInvitation(body.email, role, session.sub);

    // Build invite URL from request origin
    const headerStore = await headers();
    const host = headerStore.get("host") ?? "localhost:3010";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const inviteUrl = `${protocol}://${host}/admin/invite/${invitation.token}`;

    // Try to send email — non-blocking, invite still works via copy-link
    let emailSent = false;
    let emailError: string | undefined;
    try {
      const siteConfig = await readSiteConfig();
      const siteName = siteConfig.emailFromName || "webhouse.app";
      const { subject, html } = renderInviteEmail({
        inviterName: session.name,
        siteName,
        role,
        inviteUrl,
        expiresInDays: 7,
      });
      const result = await sendEmail({ to: body.email, subject, html });
      emailSent = result.ok;
      if (!result.ok) emailError = result.error;
    } catch {
      // Email sending failed — invitation still created
    }

    return NextResponse.json({ invitation, emailSent, emailError });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create invitation";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
