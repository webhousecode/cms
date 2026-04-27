import os from "os";

/**
 * Returns the best LAN IPv4 address for mobile QR pairing.
 * Prefers en0 (primary Wi-Fi on macOS) over other interfaces
 * to avoid accidentally encoding a USB/Thunderbolt/VPN address.
 * Overrideable via CMS_LAN_HOST env var.
 */
export function findLanHost(): string | null {
  if (process.env.CMS_LAN_HOST) return process.env.CMS_LAN_HOST;
  const ifaces = os.networkInterfaces();
  // Preferred interface order: en0, en1, then everything else
  const preferred = ["en0", "en1"];
  for (const name of preferred) {
    for (const i of ifaces[name] ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  // Fallback: first non-internal IPv4
  for (const list of Object.values(ifaces)) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return null;
}
