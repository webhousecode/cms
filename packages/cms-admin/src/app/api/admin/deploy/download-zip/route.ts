/**
 * POST /api/admin/deploy/download-zip — Generate a self-host Docker package.
 *
 * Returns a ZIP with Dockerfile, docker-compose.yml, .env.example, and README.
 * For users who want to self-host without connecting a Fly.io token.
 *
 * Body: { template, appName }
 */
import { NextRequest, NextResponse } from "next/server";
import { denyViewers } from "@/lib/require-role";

export async function POST(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  try {
    const { appName } = (await request.json()) as { template: string; appName: string };
    const name = appName || "my-cms-site";

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    // Dockerfile
    zip.file(
      "Dockerfile",
      `FROM ghcr.io/webhousecode/cms-admin:latest
# Your CMS admin is pre-configured with the demo site.
# Mount a volume at /site to persist your content.
EXPOSE 3010
`,
    );

    // docker-compose.yml
    zip.file(
      "docker-compose.yml",
      `version: "3.8"
services:
  cms:
    image: ghcr.io/webhousecode/cms-admin:latest
    ports:
      - "3010:3010"
    volumes:
      - cms-data:/site
    environment:
      - NODE_ENV=production
      - ADMIN_EMAIL=\${ADMIN_EMAIL:-admin@webhouse.app}
      - ADMIN_PASSWORD=\${ADMIN_PASSWORD:-changeme}
      - CMS_JWT_SECRET=\${CMS_JWT_SECRET}
    restart: unless-stopped

volumes:
  cms-data:
`,
    );

    // .env.example
    zip.file(
      ".env.example",
      `# Generate a secure JWT secret:
#   openssl rand -hex 32
CMS_JWT_SECRET=

# Admin account (created on first boot if no users exist)
ADMIN_EMAIL=admin@webhouse.app
ADMIN_PASSWORD=changeme

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
# 1. Copy .env.example and fill in values
cp .env.example .env

# 2. Generate a JWT secret
echo "CMS_JWT_SECRET=$(openssl rand -hex 32)" >> .env

# 3. Start the CMS
docker compose up -d

# 4. Open the admin at http://localhost:3010
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
    const message = err instanceof Error ? err.message : "Failed to generate package";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
