import { NextRequest, NextResponse } from "next/server";
import { verifyToken, verifyPassword, updateUser, createToken, COOKIE_NAME, getUsers } from "@/lib/auth";
import { isUiLocale } from "@/i18n/locale";
import { getServerTSafe } from "@/i18n/server";

export async function GET(request: NextRequest) {
  const t = await getServerTSafe();
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });
  const payload = await verifyToken(token);
  if (!payload) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });
  const users = await getUsers();
  const user = users.find((u) => u.id === payload.sub);
  if (!user) return NextResponse.json({ error: t("errAdmin.profile.userNotFound") }, { status: 404 });
  return NextResponse.json({
    name: user.name,
    email: user.email,
    showLogoIcon: user.showLogoIcon ?? false,
    showCloseAllTabs: user.showCloseAllTabs ?? false,
    uiLocale: isUiLocale(user.uiLocale) ? user.uiLocale : null,
  });
}

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  try {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: t("errAdmin.common.unauthorized") }, { status: 401 });

    const { name, email, currentPassword, newPassword, zoom, lastActiveOrg, lastActiveSite, showLogoIcon, showCloseAllTabs, uiLocale } = (await request.json()) as {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
      zoom?: number;
      lastActiveOrg?: string;
      lastActiveSite?: string;
      showLogoIcon?: boolean;
      showCloseAllTabs?: boolean;
      uiLocale?: string | null;
    };

    // F211 — only a supported admin language, or null for automatic.
    if (uiLocale !== undefined && uiLocale !== null && !isUiLocale(uiLocale)) {
      return NextResponse.json({ error: t("errAdmin.profile.unsupportedLanguage") }, { status: 400 });
    }

    // Password change requires current password verification
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json({ error: t("errAdmin.profile.currentPasswordRequired") }, { status: 400 });
      }
      if (newPassword.length < 8) {
        return NextResponse.json({ error: t("errAdmin.profile.newPasswordTooShort") }, { status: 400 });
      }
      const valid = await verifyPassword(payload.email, currentPassword);
      if (!valid) {
        return NextResponse.json({ error: t("errAdmin.profile.currentPasswordWrong") }, { status: 400 });
      }
    }

    const updated = await updateUser(payload.sub, {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(newPassword ? { password: newPassword } : {}),
      ...(zoom !== undefined ? { zoom } : {}),
      ...(lastActiveOrg !== undefined ? { lastActiveOrg } : {}),
      ...(lastActiveSite !== undefined ? { lastActiveSite } : {}),
      ...(showLogoIcon !== undefined ? { showLogoIcon } : {}),
      ...(showCloseAllTabs !== undefined ? { showCloseAllTabs } : {}),
      ...(uiLocale !== undefined ? { uiLocale } : {}),
    }, payload.email);

    // Re-issue JWT with updated name/email
    const newToken = await createToken(updated);
    const response = NextResponse.json({ ok: true, name: updated.name, email: updated.email, uiLocale: isUiLocale(updated.uiLocale) ? updated.uiLocale : null });
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
      { error: err instanceof Error ? err.message : t("errAdmin.common.internalError") },
      { status: 500 },
    );
  }
}
