import { NextRequest, NextResponse } from "next/server";
import { readMcpConfig, writeMcpConfig, maskMcpConfig, type McpApiKey } from "@/lib/mcp-config";
import { requirePermission } from "@/lib/permissions";
import { getServerTSafe } from "@/i18n/server";

export async function GET() {
  const t = await getServerTSafe();
  try {
    const config = await readMcpConfig();
    return NextResponse.json(maskMcpConfig(config));
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errAdmin.common.error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await requirePermission("settings.edit"); if (denied) return denied;
  try {
    const body = (await request.json()) as {
      action: "add" | "remove";
      key?: string;
      label?: string;
      scopes?: string[];
      id?: string;   // first 8 chars — used to identify key for removal
    };

    const config = await readMcpConfig();

    if (body.action === "add") {
      if (!body.key || !body.label) {
        return NextResponse.json({ error: t("errAdmin.mcpConfig.keyLabelRequired") }, { status: 400 });
      }
      const trimmedKey = body.key.trim();
      // Deduplicate — ignore if key already exists
      if (!config.keys.some((k) => k.key === trimmedKey)) {
        const scopes = body.scopes ?? ["read", "write", "publish", "deploy", "ai"];
        const newKey: McpApiKey = { key: trimmedKey, label: body.label.trim(), scopes };
        config.keys.push(newKey);
        await writeMcpConfig(config);
      }
      return NextResponse.json(maskMcpConfig(config));
    }

    if (body.action === "remove") {
      if (!body.id) {
        return NextResponse.json({ error: t("errAdmin.mcpConfig.idRequired") }, { status: 400 });
      }
      config.keys = config.keys.filter((k) => !k.key.startsWith(body.id!));
      await writeMcpConfig(config);
      return NextResponse.json(maskMcpConfig(config));
    }

    return NextResponse.json({ error: t("errAdmin.common.unknownAction") }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : t("errAdmin.common.error");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
