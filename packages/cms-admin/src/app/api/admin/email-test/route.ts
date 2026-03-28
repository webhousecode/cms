import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { denyViewers } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const denied = await denyViewers(); if (denied) return denied;
  const cookieStore = await cookies();
  const session = await getSessionUser(cookieStore);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to } = (await request.json()) as { to?: string };
  if (!to) {
    return NextResponse.json({ error: "Recipient email required" }, { status: 400 });
  }

  const result = await sendEmail({
    to,
    subject: "Test email from webhouse.app",
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
    <div style="background:#141414;border:1px solid #262626;border-radius:16px;overflow:hidden;">
      <div style="height:3px;background:linear-gradient(90deg,#F7BB2E,#f59e0b,#F7BB2E);"></div>
      <div style="padding:40px 36px;text-align:center;">
        <img src="https://webhouse.app/webhouse.app-dark-icon.svg" alt="" width="48" height="48" style="display:inline-block;margin-bottom:24px;" />
        <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#fafafa;">Email works!</h1>
        <p style="margin:0;font-size:14px;color:#737373;line-height:1.6;">
          This is a test email from your <strong style="color:#a3a3a3;">webhouse.app</strong> CMS.
          If you're reading this, your Resend integration is configured correctly.
        </p>
      </div>
    </div>
    <p style="text-align:center;margin:20px 0 0;font-size:11px;color:#404040;">
      Sent by <a href="https://webhouse.app" style="text-decoration:none;"><strong style="color:#fafafa;">webhouse</strong><strong style="color:#F7BB2E;">.app</strong></a>
    </p>
  </div>
</body>
</html>`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
