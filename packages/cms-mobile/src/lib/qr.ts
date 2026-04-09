import { isNative } from "./bridge";

/**
 * QR scanner — uses @capacitor/camera (SPM-compatible) + jsQR (pure JS).
 *
 * Previous approach (@capacitor-mlkit/barcode-scanning) failed because
 * the plugin isn't SPM-compatible and its native code was never compiled
 * into the Capacitor 8 iOS build.
 *
 * New approach:
 *   1. Camera.getPhoto() opens the native camera/picker
 *   2. The returned base64 image is decoded to ImageData via canvas
 *   3. jsQR scans the pixels for QR codes
 *
 * UX: user takes a photo of the QR → instant decode. Not live preview,
 * but it WORKS on every device without native plugin compatibility issues.
 * Can upgrade to a live scanner when a SPM-compatible plugin exists.
 */

export interface QrPayload {
  raw: string;
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

/**
 * Decode a base64 image to ImageData using an offscreen canvas,
 * then run jsQR on the pixels.
 */
async function decodeQrFromBase64(base64: string): Promise<string | null> {
  const jsQR = (await import("jsqr")).default;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      resolve(result?.data ?? null);
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

/**
 * Open the camera, take a photo of a QR code, decode it.
 */
export async function scanQrFromCamera(): Promise<QrPayload | null> {
  if (!isNative()) {
    throw new Error("QR camera scan is only available on a real device");
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      correctOrientation: true,
    });

    if (!photo.base64String) {
      return null; // user cancelled
    }

    const decoded = await decodeQrFromBase64(photo.base64String);
    if (!decoded) {
      throw new Error("No QR code found in the photo. Try again — hold the camera steady and make sure the entire QR code is visible.");
    }
    return parseQrPayload(decoded);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes("cancelled") || msg.includes("canceled") || msg.includes("User cancelled")) {
      return null;
    }
    throw new Error(msg);
  }
}

/**
 * Pick a photo from the library, decode QR from it.
 */
export async function scanQrFromPhotoLibrary(): Promise<QrPayload | null> {
  if (!isNative()) {
    throw new Error("QR photo scan is only available on a real device");
  }

  try {
    const { Camera, CameraResultType, CameraSource } = await import(
      "@capacitor/camera"
    );

    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
      correctOrientation: true,
    });

    if (!photo.base64String) {
      return null;
    }

    const decoded = await decodeQrFromBase64(photo.base64String);
    if (!decoded) {
      throw new Error("No QR code found in the selected image.");
    }
    return parseQrPayload(decoded);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes("cancelled") || msg.includes("canceled") || msg.includes("User cancelled")) {
      return null;
    }
    throw new Error(msg);
  }
}
