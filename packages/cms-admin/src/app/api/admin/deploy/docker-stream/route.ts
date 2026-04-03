/**
 * POST /api/admin/deploy/docker-stream — Deploy to Fly.io via Machines API.
 *
 * SSE endpoint that streams deploy progress. Uses the GHCR image
 * (ghcr.io/webhousecode/cms-admin) — no local Docker build needed.
 *
 * Body: { template, appName, region, vmSize, flyToken, flyOrg }
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { FlyMachinesClient, FLY_VM_SIZES } from "@/lib/deploy/fly-machines";
import { denyViewers } from "@/lib/require-role";

export const dynamic = "force-dynamic";

interface DeployRequest {
  template: string;
  appName: string;
  region: string;
  vmSize: string;
  flyToken: string;
  flyOrg: string;
  adminEmail?: string;
}

export async function POST(request: NextRequest) {
  const denied = await denyViewers();
  if (denied) return denied;

  let body: DeployRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { template, appName, region, vmSize, flyToken, flyOrg, adminEmail } = body;

  if (!appName || !flyToken || !flyOrg) {
    return NextResponse.json(
      { error: "Missing required fields: appName, flyToken, flyOrg" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: {
        step: string;
        message: string;
        progress: number;
        status: "running" | "done" | "error";
        url?: string;
        error?: string;
      }) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client disconnected */
        }
      }

      const fly = new FlyMachinesClient(flyToken);
      const adminPassword = randomBytes(16).toString("hex");

      try {
        // ── Step 1: Validate ──
        send({ step: "init", message: "Validating Fly.io token...", progress: 5, status: "running" });
        const orgs = await fly.listOrgs();
        const validOrg = orgs.find((o) => o.slug === flyOrg);
        if (!validOrg) {
          throw new Error(`Organization "${flyOrg}" not found. Available: ${orgs.map((o) => o.slug).join(", ")}`);
        }

        // ── Step 2: Create app ──
        send({ step: "create-app", message: `Creating app "${appName}"...`, progress: 20, status: "running" });
        const existing = await fly.getApp(appName);
        if (existing) {
          send({ step: "create-app", message: `App "${appName}" already exists, reusing...`, progress: 25, status: "running" });
        } else {
          await fly.createApp(appName, flyOrg);
        }

        // ── Step 3: Set secrets ──
        send({ step: "set-secrets", message: "Configuring secrets...", progress: 35, status: "running" });
        const jwtSecret = randomBytes(32).toString("hex");
        await fly.setSecrets(appName, {
          CMS_JWT_SECRET: jwtSecret,
          ADMIN_EMAIL: adminEmail || "admin@webhouse.app",
          ADMIN_PASSWORD: adminPassword,
          NODE_ENV: "production",
        });

        // ── Step 4: Create machine ──
        send({ step: "create-machine", message: "Deploying container...", progress: 50, status: "running" });

        const vmPreset = FLY_VM_SIZES.find((s) => s.value === vmSize) ?? FLY_VM_SIZES[0];

        const machine = await fly.createMachine(appName, region, {
          image: "ghcr.io/webhousecode/cms-admin:latest",
          env: {
            PORT: "3010",
            NODE_ENV: "production",
          },
          services: [
            {
              ports: [
                { port: 80, handlers: ["http"], force_https: true },
                { port: 443, handlers: ["tls", "http"] },
              ],
              protocol: "tcp",
              internal_port: 3010,
            },
          ],
          guest: {
            cpu_kind: vmPreset.cpuKind,
            cpus: vmPreset.cpus,
            memory_mb: vmPreset.memoryMb,
          },
        });

        // ── Step 5: Wait for healthy ──
        send({ step: "wait-healthy", message: "Waiting for container to start...", progress: 70, status: "running" });
        await fly.waitForMachine(appName, machine.id, 60);

        // ── Step 6: Allocate IPs ──
        send({ step: "allocate-ip", message: "Allocating IP addresses...", progress: 85, status: "running" });
        try {
          await fly.allocateSharedIpv4(appName);
        } catch {
          // May already have an IP
        }
        try {
          await fly.allocateIpv6(appName);
        } catch {
          // May already have an IP
        }

        // ── Done ──
        const url = `https://${appName}.fly.dev`;
        send({
          step: "done",
          message: `Live at ${url}`,
          progress: 100,
          status: "done",
          url,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Deploy failed";
        send({
          step: "error",
          message,
          progress: 100,
          status: "error",
          error: message,
        });
      }

      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
