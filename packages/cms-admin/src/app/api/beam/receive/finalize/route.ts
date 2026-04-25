/**
 * POST /api/beam/receive/finalize — Complete a Live Beam transfer.
 *
 * Registers the site in the registry and returns the import summary.
 *
 * Body: { beamId, manifest }
 */
import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import path from "node:path";
import { getBeamSession, completeBeamSession } from "@/lib/beam/session";
import { addSite, loadRegistry, saveRegistry, findOrg, type Registry } from "@/lib/site-registry";
import type { BeamManifest } from "@/lib/beam/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { beamId, manifest } = body as { beamId: string; manifest: BeamManifest };

    if (!beamId) {
      return NextResponse.json({ error: "Missing beamId" }, { status: 400 });
    }

    const session = getBeamSession(beamId);
    if (!session) {
      return NextResponse.json(
        { error: "Invalid or expired beam session" },
        { status: 403 },
      );
    }

    // Register site
    const { getBeamSitesDir } = await import("@/lib/beam/paths");
    const siteDir = path.join(await getBeamSitesDir(), session.siteId);
    const configFile = existsSync(path.join(siteDir, "cms.config.ts"))
      ? path.join(siteDir, "cms.config.ts")
      : path.join(siteDir, "cms.config.json");

    // F138-D: auto-init registry on first receive when none exists.
    // Without this, beaming into a fresh CMS landed files on disk but
    // the site stayed invisible because addSite() throws "No registry".
    let registry = await loadRegistry();
    const targetOrgId = session.targetOrgId ?? "default";
    if (!registry) {
      const orgName = targetOrgId === "default"
        ? "Default"
        : targetOrgId.charAt(0).toUpperCase() + targetOrgId.slice(1);
      const seeded: Registry = {
        orgs: [{ id: targetOrgId, name: orgName, sites: [] }],
        defaultOrgId: targetOrgId,
        defaultSiteId: session.siteId,
      };
      await saveRegistry(seeded);
      registry = seeded;
    } else if (!findOrg(registry, targetOrgId)) {
      // Make sure the target org exists. Beam can name an org that
      // wasn't in the receiver's registry (cross-instance transfer).
      const orgName = targetOrgId.charAt(0).toUpperCase() + targetOrgId.slice(1);
      registry.orgs.push({ id: targetOrgId, name: orgName, sites: [] });
      await saveRegistry(registry);
    }

    await addSite(targetOrgId, {
      id: session.siteId,
      name: session.siteName,
      adapter: "filesystem",
      configPath: configFile,
      contentDir: path.join(siteDir, "content"),
      uploadDir: path.join(siteDir, "public", "uploads"),
    });

    // Update session and mark as complete
    completeBeamSession(beamId);

    return NextResponse.json({
      success: true,
      siteId: session.siteId,
      siteName: session.siteName,
      stats: manifest?.stats ?? {
        contentFiles: session.transferredFiles,
        mediaFiles: 0,
        dataFiles: 0,
        totalSizeBytes: session.transferredBytes,
        collections: {},
      },
      secretsRequired: manifest?.secretsRequired ?? [],
      checksumErrors: session.checksumErrors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finalize failed";
    console.error("[beam/receive/finalize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
