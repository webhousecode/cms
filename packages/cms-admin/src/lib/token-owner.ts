/**
 * Security W41 C7 — an access token's sites + permissions were evaluated on
 * the TOKEN alone. A token created with permissions ["*"] and no site list
 * meant "every site", whatever its owner could reach: any site admin could
 * mint a token that downloaded another tenant's backup.
 *
 * A token now acts only where its OWNER could act: the instance admin
 * anywhere, everyone else only on sites whose team they are on. Checked on
 * every use, so tokens created before this fix are bound too.
 */
import { isInstanceAdminUser } from "./instance-admin";

export function tokenOwnerMayAct(
  ownerId: string,
  users: { id: string; role?: "admin" | "editor" | "viewer" }[],
  teamOfSite: { userId: string }[] | null,
): boolean {
  // Tokens minted through the internal service/dev principal (e.g. the two
  // "broberg.ai site read" tokens on webhouse.app) belong to the instance.
  if (ownerId === "service-token" || ownerId === "dev-token") return true;
  if (!users.some((u) => u.id === ownerId)) return false; // owner deleted
  if (isInstanceAdminUser({ sub: ownerId }, users)) return true;
  return !!teamOfSite?.some((m) => m.userId === ownerId);
}
