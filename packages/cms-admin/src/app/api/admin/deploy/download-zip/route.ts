/**
 * POST /api/admin/deploy/download-zip — Generate a self-host Docker package.
 *
 * Returns a ZIP with Dockerfile, docker-compose.yml, a generated .env, and README.
 * For users who want to self-host without connecting a Fly.io token.
 *
 * Body: { template, appName }
 */
import { NextRequest, NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";
import { getServerTSafe } from "@/i18n/server";

export async function POST(request: NextRequest) {
  const t = await getServerTSafe();
  const denied = await denyViewers();
  if (denied) return denied;

  try {
    const { appName } = (await request.json()) as { template: string; appName: string };
    const name = appName || "my-cms-site";

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Dockerfile
    zip.file(
      "Dockerfile", // i18n-ignore: file name inside the generated zip
      // i18n-ignore: Dockerfile contents written into the zip, not shown in the admin
      `FROM ghcr.io/webhousecode/cms-admin:latest
# Your CMS admin is pre-configured with the demo site.
# Mount a volume at /site to persist your content.
EXPOSE 3010
`,
    );

    // docker-compose.yml
    zip.file(
      "docker-compose.yml",
      // i18n-ignore: docker-compose contents written into the zip, not shown in the admin
      `version: "3.8"
services:
  cms:
    image: ghcr.io/webhousecode/cms-admin:latest
    # Bound to this machine only — put a TLS reverse proxy in front to publish it.
    ports:
      - "127.0.0.1:3010:3010"
    volumes:
      - cms-data:/site
    env_file: .env
    environment:
      - NODE_ENV=production
    restart: unless-stopped

volumes:
  cms-data:
`,
    );

    // .env — Security W43 H9: generated per download. The kit used to start
    // with an empty CMS_JWT_SECRET, a known default admin password and port 3010 open
    // on every interface: following the README gave an open admin.
    const { randomBytes } = await import("node:crypto");
    zip.file(
      ".env",
      `# Generated for this download — keep this file private.
CMS_JWT_SECRET=${randomBytes(32).toString("hex")}

# Admin account (created on first boot if no users exist). Change the password
# after the first login.
ADMIN_EMAIL=admin@webhouse.app
ADMIN_PASSWORD=${randomBytes(12).toString("base64url")}

# Optional: AI keys
# ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
`,
    );

    // README.md
    zip.file(
      "README.md",
      `# ${name} — @webhouse/cms

## Quick Start

\`\`\`bash
# 1. .env already holds a generated JWT secret and admin password — keep it private
# 2. Start the CMS
docker compose up -d

# 3. Open the admin at http://localhost:3010 (sign in with ADMIN_EMAIL / ADMIN_PASSWORD
#    from .env, then change the password). To publish it, put a TLS reverse proxy in front.
\`\`\`

## Deploy to Fly.io

\`\`\`bash
fly launch --image ghcr.io/webhousecode/cms-admin:latest --region arn
fly secrets set CMS_JWT_SECRET=$(openssl rand -hex 32)
fly secrets set ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=your-password
\`\`\`

Built with [@webhouse/cms](https://webhouse.app)
`,
    );

    const buf = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="webhouse-docker-${name}.zip"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : t("errAdmin.deploy.zipFailed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
