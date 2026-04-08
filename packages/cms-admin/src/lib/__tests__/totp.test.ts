/**
 * F59 phase 4 — TOTP unit tests.
 *
 * Uses real otpauth (no mock) so we test the full RFC 6238 path.
 * The test seeds a user, walks through enrollment with a code generated
 * from the very secret we just received, then verifies login (real code +
 * backup code) and disable.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as OTPAuth from "otpauth";
import fs from "fs/promises";
import os from "os";
import path from "path";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cms-totp-test-"));
  const configPath = path.join(tmpDir, "cms.config.ts");
  await fs.writeFile(configPath, "// dummy");
  process.env.CMS_CONFIG_PATH = configPath;
  const dataDir = path.join(tmpDir, "_data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(
    path.join(dataDir, "users.json"),
    JSON.stringify([
      {
        id: "user-1",
        email: "alice@example.com",
        name: "Alice",
        role: "admin",
        createdAt: "2026-01-01T00:00:00.000Z",
        passwordHash: "$2a$12$dummy",
      },
    ], null, 2),
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.CMS_CONFIG_PATH;
});

function genCode(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: "webhouse.app CMS",
    label: "alice@example.com",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

describe("totp", () => {
  it("startEnrollment returns secret + otpauth uri + qr data url, persists pending", async () => {
    const { startEnrollment } = await import("../totp");
    const { getUserById } = await import("../auth");
    const result = await startEnrollment("user-1");
    expect(result.secret).toMatch(/^[A-Z2-7]+$/); // base32
    expect(result.otpauthUri).toContain("otpauth://totp/");
    expect(result.qrDataUrl.startsWith("data:image/")).toBe(true);

    const user = await getUserById("user-1");
    expect(user?.totpEnrollSecret).toBe(result.secret);
    expect(user?.totp).toBeUndefined();
  });

  it("verifyEnrollment promotes pending → enabled and issues 10 backup codes", async () => {
    const { startEnrollment, verifyEnrollment } = await import("../totp");
    const { getUserById } = await import("../auth");
    const { secret } = await startEnrollment("user-1");

    const code = genCode(secret);
    const { backupCodes } = await verifyEnrollment("user-1", code);
    expect(backupCodes).toHaveLength(10);
    backupCodes.forEach((c) => expect(c).toMatch(/^[a-f0-9]{4}-[a-f0-9]{4}$/));

    const user = await getUserById("user-1");
    expect(user?.totp).toBeTruthy();
    expect(user?.totp?.secret).toBe(secret);
    expect(user?.totp?.backupCodeHashes).toHaveLength(10);
    expect(user?.totpEnrollSecret).toBeUndefined();
  });

  it("verifyEnrollment rejects bad code", async () => {
    const { startEnrollment, verifyEnrollment } = await import("../totp");
    await startEnrollment("user-1");
    await expect(verifyEnrollment("user-1", "000000")).rejects.toThrow(/Invalid/);
  });

  it("verifyLoginCode accepts current TOTP code", async () => {
    const { startEnrollment, verifyEnrollment, verifyLoginCode } = await import("../totp");
    const { getUserById } = await import("../auth");
    const { secret } = await startEnrollment("user-1");
    await verifyEnrollment("user-1", genCode(secret));

    const user = await getUserById("user-1");
    const ok = await verifyLoginCode(user!, genCode(secret));
    expect(ok).toBe(true);

    const after = await getUserById("user-1");
    expect(after?.totp?.lastUsedAt).toBeTruthy();
  });

  it("verifyLoginCode rejects wrong code", async () => {
    const { startEnrollment, verifyEnrollment, verifyLoginCode } = await import("../totp");
    const { getUserById } = await import("../auth");
    const { secret } = await startEnrollment("user-1");
    await verifyEnrollment("user-1", genCode(secret));
    const user = await getUserById("user-1");
    expect(await verifyLoginCode(user!, "000000")).toBe(false);
  });

  it("backup code is single-use — accepted once, then removed", async () => {
    const { startEnrollment, verifyEnrollment, verifyLoginCode } = await import("../totp");
    const { getUserById } = await import("../auth");
    const { secret } = await startEnrollment("user-1");
    const { backupCodes } = await verifyEnrollment("user-1", genCode(secret));

    const u1 = await getUserById("user-1");
    expect(await verifyLoginCode(u1!, backupCodes[0]!)).toBe(true);

    const u2 = await getUserById("user-1");
    expect(u2?.totp?.backupCodeHashes).toHaveLength(9);

    // Same code should now fail
    expect(await verifyLoginCode(u2!, backupCodes[0]!)).toBe(false);
  });

  it("disableTotp removes config when given a valid code", async () => {
    const { startEnrollment, verifyEnrollment, disableTotp } = await import("../totp");
    const { getUserById } = await import("../auth");
    const { secret } = await startEnrollment("user-1");
    await verifyEnrollment("user-1", genCode(secret));

    await disableTotp("user-1", genCode(secret));
    const after = await getUserById("user-1");
    expect(after?.totp).toBeUndefined();
  });

  it("disableTotp rejects invalid code", async () => {
    const { startEnrollment, verifyEnrollment, disableTotp } = await import("../totp");
    const { secret } = await startEnrollment("user-1");
    await verifyEnrollment("user-1", genCode(secret));
    await expect(disableTotp("user-1", "000000")).rejects.toThrow();
  });
});
