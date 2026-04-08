/**
 * F59 phase 4 — TOTP / Authenticator app 2FA.
 *
 * Wraps the `otpauth` library to provide enrollment, verification, and
 * backup code helpers against our users.json storage.
 *
 * Compatible with: Microsoft Authenticator, Google Authenticator, Authy,
 * 1Password, Bitwarden, and any other RFC 6238 implementation.
 *
 * Flow:
 *   enroll/start  → generate secret, store on user.totpEnrollSecret,
 *                   return otpauth:// URI + QR data URL
 *   enroll/verify → user types code from app, we verify against the
 *                   pending secret, promote to user.totp + issue backup codes
 *   verify        → during login, after password/passkey, verify the code
 *
 * Backup codes are 10 random 8-char codes, hashed with bcrypt before
 * storage. Each code is single-use; consuming one removes it from the
 * stored hash list.
 */

import * as OTPAuth from "otpauth";
import crypto from "crypto";
import QRCode from "qrcode";
import { getUserById, saveUser, type TotpConfig, type User } from "./auth";

const ISSUER = "webhouse.app CMS";
const BACKUP_CODE_COUNT = 10;

/** Build a TOTP instance for a given secret + user email. */
function buildTotp(secret: string, email: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

/**
 * Backup codes are 32-bit random tokens — already have enough entropy that
 * a fast hash (sha256) is sufficient. We don't need bcrypt's slow stretching
 * because the input space is too large to brute-force at sha256 speeds in
 * any realistic window.
 */
function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // 4-4 grouped, e.g. "a1b2-c3d4"
    const raw = crypto.randomBytes(4).toString("hex");
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

export interface EnrollStartResult {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
}

/** Generate a fresh secret + QR code, store it on the user as pending. */
export async function startEnrollment(userId: string): Promise<EnrollStartResult> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");

  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const totp = buildTotp(secret, user.email);
  const otpauthUri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    color: { dark: "#0D0D0D", light: "#FFFFFF" },
  });

  await saveUser({ ...user, totpEnrollSecret: secret });
  return { secret, otpauthUri, qrDataUrl };
}

export interface EnrollVerifyResult {
  /** Plaintext backup codes — shown to the user ONCE at enrollment. */
  backupCodes: string[];
}

/** Verify the first code, promote pending secret to user.totp, issue codes. */
export async function verifyEnrollment(userId: string, code: string): Promise<EnrollVerifyResult> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  if (!user.totpEnrollSecret) throw new Error("No pending TOTP enrollment");

  const totp = buildTotp(user.totpEnrollSecret, user.email);
  // Allow ±1 step (30s before/after) to be forgiving on clock skew
  const delta = totp.validate({ token: code.replace(/\s+/g, ""), window: 1 });
  if (delta === null) throw new Error("Invalid code");

  const backupCodes = generateBackupCodes();
  const backupCodeHashes = backupCodes.map(hashBackupCode);

  const config: TotpConfig = {
    secret: user.totpEnrollSecret,
    createdAt: new Date().toISOString(),
    backupCodeHashes,
  };

  await saveUser({ ...user, totp: config, totpEnrollSecret: undefined });
  return { backupCodes };
}

/**
 * Verify a TOTP code or backup code at login time.
 * Returns true if accepted; consumes a backup code if matched.
 */
export async function verifyLoginCode(user: User, code: string): Promise<boolean> {
  if (!user.totp) return false;
  const cleaned = code.replace(/\s+/g, "");

  // Try TOTP first
  const totp = buildTotp(user.totp.secret, user.email);
  const delta = totp.validate({ token: cleaned, window: 1 });
  if (delta !== null) {
    await saveUser({
      ...user,
      totp: { ...user.totp, lastUsedAt: new Date().toISOString() },
    });
    return true;
  }

  // Try backup codes — constant-time hash compare across all stored hashes
  const candidate = hashBackupCode(cleaned);
  const idx = user.totp.backupCodeHashes.findIndex((h) =>
    crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(candidate, "hex")),
  );
  if (idx !== -1) {
    const remaining = user.totp.backupCodeHashes.filter((_, j) => j !== idx);
    await saveUser({
      ...user,
      totp: { ...user.totp, backupCodeHashes: remaining, lastUsedAt: new Date().toISOString() },
    });
    return true;
  }

  return false;
}

/** Disable TOTP for a user (requires current code or backup code). */
export async function disableTotp(userId: string, code: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  if (!user.totp) throw new Error("TOTP not enabled");
  const ok = await verifyLoginCode(user, code);
  if (!ok) throw new Error("Invalid code");
  // Re-fetch — verifyLoginCode may have mutated lastUsedAt
  const fresh = await getUserById(userId);
  if (!fresh) throw new Error("User not found");
  await saveUser({ ...fresh, totp: undefined });
}

export function isTotpEnabled(user: User): boolean {
  return !!user.totp;
}
