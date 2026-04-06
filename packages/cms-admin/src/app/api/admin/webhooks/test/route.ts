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
import { denyViewers } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  try {
    const body = await request.json() as { url: string; secret?: string; category?: string };
    if (!body.url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    const [sitePaths, siteEntry] = await Promise.all([
      getActiveSitePaths().catch(() => null),
      getActiveSiteEntry().catch(() => null),
    ]);

    const results = await dispatchWebhooks(
      [{ id: "test", url: body.url, secret: body.secret, label: "Test" }],
      {
        event: `${body.category ?? "test"}.test`,
        title: "Webhook Test",
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
    const message = err instanceof Error ? err.message : "Test failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
