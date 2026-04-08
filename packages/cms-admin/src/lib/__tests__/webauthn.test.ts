/**
 * F59 — Passkey/WebAuthn unit tests.
 *
 * These tests mock the @simplewebauthn/server primitives so we can assert
 * the storage + glue logic in `src/lib/webauthn.ts` without needing a real
 * browser ceremony. The goal is to verify:
 *   1. Registration persists the passkey on the user and clears the challenge.
 *   2. Authentication updates counter + lastUsedAt.
 *   3. Remove actually deletes the credential.
 *   4. excludeCredentials is populated on re-registration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Mock @simplewebauthn/server before importing our module
vi.mock("@simplewebauthn/server", () => {
  return {
    generateRegistrationOptions: vi.fn(async (opts: { excludeCredentials?: unknown[] }) => ({
      challenge: "reg-challenge-xyz",
      rp: { name: "test", id: "localhost" },
      user: { id: "uid", name: "test", displayName: "test" },
      excludeCredentials: opts.excludeCredentials ?? [],
    })),
    verifyRegistrationResponse: vi.fn(async () => ({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-1",
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          transports: ["internal"],
        },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    })),
    generateAuthenticationOptions: vi.fn(async () => ({
      challenge: "auth-challenge-abc",
      allowCredentials: [],
    })),
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified: true,
      authenticationInfo: { newCounter: 7 },
    })),
  };
});

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cms-webauthn-test-"));
  // CMS_CONFIG_PATH drives where users.json lives
  const configPath = path.join(tmpDir, "cms.config.ts");
  await fs.writeFile(configPath, "// dummy");
  process.env.CMS_CONFIG_PATH = configPath;
  // Seed a single user
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
  vi.resetModules();
});

async function freshModules() {
  vi.resetModules();
  const auth = await import("../auth");
  const webauthn = await import("../webauthn");
  return { auth, webauthn };
}

describe("webauthn", () => {
  it("stores challenge during registration options", async () => {
    const { auth, webauthn } = await freshModules();
    const user = await auth.getUserById("user-1");
    expect(user).not.toBeNull();
    await webauthn.buildRegistrationOptions(user!, { rpID: "localhost", rpName: "test" });
    const after = await auth.getUserById("user-1");
    expect(after?.webauthnChallenge).toBe("reg-challenge-xyz");
  });

  it("confirmRegistration persists passkey and clears challenge", async () => {
    const { auth, webauthn } = await freshModules();
    const user = await auth.getUserById("user-1");
    await webauthn.buildRegistrationOptions(user!, { rpID: "localhost", rpName: "test" });

    const stored = await webauthn.confirmRegistration(
      "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      { rpID: "localhost", origin: "http://localhost" },
      "MacBook TouchID",
    );

    expect(stored.id).toBe("cred-1");
    expect(stored.name).toBe("MacBook TouchID");

    const after = await auth.getUserById("user-1");
    expect(after?.passkeys).toHaveLength(1);
    expect(after?.passkeys?.[0]?.id).toBe("cred-1");
    expect(after?.webauthnChallenge).toBeUndefined();
  });

  it("rejects confirmation when there is no pending challenge", async () => {
    const { webauthn } = await freshModules();
    await expect(
      webauthn.confirmRegistration(
        "user-1",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {} as any,
        { rpID: "localhost", origin: "http://localhost" },
        "X",
      ),
    ).rejects.toThrow(/challenge/);
  });

  it("confirmAuthentication updates counter and lastUsedAt", async () => {
    const { auth, webauthn } = await freshModules();
    const user = await auth.getUserById("user-1");
    await webauthn.buildRegistrationOptions(user!, { rpID: "localhost", rpName: "test" });
    await webauthn.confirmRegistration(
      "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      { rpID: "localhost", origin: "http://localhost" },
      "Key",
    );

    await webauthn.confirmAuthentication(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cred-1" } as any,
      { rpID: "localhost", origin: "http://localhost" },
      "auth-challenge-abc",
    );

    const after = await auth.getUserById("user-1");
    const pk = after?.passkeys?.[0];
    expect(pk?.counter).toBe(7);
    expect(pk?.lastUsedAt).toBeTruthy();
  });

  it("passes requireUserVerification: false to verifiers (matches 'preferred')", async () => {
    const server = await import("@simplewebauthn/server");
    const { auth, webauthn } = await freshModules();
    const user = await auth.getUserById("user-1");
    await webauthn.buildRegistrationOptions(user!, { rpID: "localhost", rpName: "test" });

    await webauthn.confirmRegistration(
      "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      { rpID: "localhost", origin: "http://localhost" },
      "Key",
    );
    const regCall = (server.verifyRegistrationResponse as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { requireUserVerification?: boolean };
    expect(regCall.requireUserVerification).toBe(false);

    await webauthn.confirmAuthentication(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "cred-1" } as any,
      { rpID: "localhost", origin: "http://localhost" },
      "auth-challenge-abc",
    );
    const authCall = (server.verifyAuthenticationResponse as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)![0] as { requireUserVerification?: boolean };
    expect(authCall.requireUserVerification).toBe(false);
  });

  it("removePasskey deletes the credential", async () => {
    const { auth, webauthn } = await freshModules();
    const user = await auth.getUserById("user-1");
    await webauthn.buildRegistrationOptions(user!, { rpID: "localhost", rpName: "test" });
    await webauthn.confirmRegistration(
      "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
      { rpID: "localhost", origin: "http://localhost" },
      "Key",
    );

    await webauthn.removePasskey("user-1", "cred-1");
    const after = await auth.getUserById("user-1");
    expect(after?.passkeys ?? []).toHaveLength(0);
  });
});
