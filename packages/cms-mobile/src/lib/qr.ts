import { isNative } from "./bridge";

/**
 * QR scanner facade — wraps @capacitor-mlkit/barcode-scanning.
 *
 * Supports two paths:
 *  1. Camera scan (real device + simulator workaround via photo lib)
 *  2. Photo library scan (read QR from a saved image)
 *
 * iOS sim has no camera — use photo library or the deep link bypass instead.
 */

export interface QrPayload {
  raw: string;
  /** Parsed `webhouseapp://login?...` query params if it was a pairing URL */
  pairingToken?: string;
  serverUrl?: string;
}

export function parseQrPayload(raw: string): QrPayload {
  try {
    const url = new URL(raw);
    if (url.protocol === "webhouseapp:" && url.hostname === "login") {
      return {
        raw,
        pairingToken: url.searchParams.get("token") ?? undefined,
        serverUrl: url.searchParams.get("server") ?? undefined,
      };
    }
  } catch {
    // Not a URL — just return raw
  }
  return { raw };
}

export async function scanQrFromCamera(): Promise<QrPayload | null> {
  if (!isNative()) {
    console.warn("scanQrFromCamera: not on native platform");
    return null;
  }
  try {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const result = await BarcodeScanner.scan();
    const first = result.barcodes[0];
    if (!first) return null;
    return parseQrPayload(first.rawValue);
  } catch (err) {
    console.error("scanQrFromCamera failed:", err);
    return null;
  }
}

export async function scanQrFromPhotoLibrary(): Promise<QrPayload | null> {
  if (!isNative()) return null;
  try {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    // readBarcodesFromImage opens the photo picker and scans the chosen image.
    // path: "" triggers the picker.
    const result = await BarcodeScanner.readBarcodesFromImage({
      path: "",
      formats: [],
    });
    const first = result.barcodes[0];
    if (!first) return null;
    return parseQrPayload(first.rawValue);
  } catch (err) {
    console.error("scanQrFromPhotoLibrary failed:", err);
    return null;
  }
}
