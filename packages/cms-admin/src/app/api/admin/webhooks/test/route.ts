/**
 * POST /api/admin/webhooks/test — Send a test event to a webhook URL.
 *
 * Body: { url: string, secret?: string, category?: WebhookCategory }
 *
 * Fires a synthetic test event so users can verify their webhook
 * configuration without performing a real action.
 */
import { NextRequest, NextResponse } from "next/server";
import { dispatchWebhooks } from "@/lib/webhook-dispatch";
import { getActiveSitePaths, getActiveSiteEntry } from "@/lib/site-paths";
import { requirePermission } from "@/lib/permissions";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requirePermission("webhooks.manage");
  if (denied) return denied;

  try {
    const body = await request.json() as { url: string; secret?: string; category?: string };
    if (!body.url) {
      return NextResponse.json({ error: t("errAdmin.webhooks.urlRequired") }, { status: 400 });
    }

    const [sitePaths, siteEntry] = await Promise.all([
      getActiveSitePaths().catch(() => null),
      getActiveSiteEntry().catch(() => null),
    ]);

    const results = await dispatchWebhooks(
      [{ id: "test", url: body.url, secret: body.secret, label: "Test" }], // i18n-ignore: outgoing webhook payload (F210.4)
      {
        event: `${body.category ?? "test"}.test`,
        title: "Webhook Test", // i18n-ignore: outgoing webhook payload (F210.4)
        // i18n-ignore: outgoing webhook payload (F210.4)
        message: "This is a test event from your webhouse.app CMS admin. If you see this in your webhook receiver, your configuration is working correctly.",
        color: 0xF7BB2E,
        siteName: siteEntry?.name,
        actor: "system:test",
        fields: [
          { name: "Type", value: "test" },
          { name: "Site", value: siteEntry?.name ?? "—" },
        ],
      },
      sitePaths?.dataDir,
    );

    const result = results[0];
    return NextResponse.json({
      success: result.success,
      statusCode: result.statusCode,
      attempts: result.attempts,
      error: result.error,
      deliveryId: result.deliveryId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.webhooks.testFailed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
