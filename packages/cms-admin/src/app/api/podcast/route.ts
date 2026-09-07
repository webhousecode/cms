/**
 * F189.5 — GET /api/podcast · listen over afsnit.
 *
 * Hver handling i motoren har et endpoint. Ingen af dem findes KUN i cms-admins
 * UI — det er hele ejerens note: et site skal kunne bygge sit eget panel.
 */
import type { NextRequest } from "next/server";
import { kraevTilladelse, preflight, svar, PODCAST_PERMISSIONS } from "@/lib/podcast/api";
import { listAfsnit } from "@/lib/podcast/store";

export const OPTIONS = preflight;

export async function GET(req: NextRequest) {
  const afvist = await kraevTilladelse(req, PODCAST_PERMISSIONS.read);
  if (afvist) return afvist.svar;

  const liste = await listAfsnit();
  if (!liste.ok) return svar(req, { error: liste.grund }, 409);
  return svar(req, { afsnit: liste.vaerdi });
}
