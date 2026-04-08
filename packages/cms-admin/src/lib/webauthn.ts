/**
 * F59 — WebAuthn / Passkey helpers
 *
 * Thin wrapper around @simplewebauthn/server that handles the registration and
 * authentication ceremonies against our users.json storage.
 *
 * RP (Relying Party) identity is derived from the incoming request origin, so
 * the same code works for localhost dev and any production hostname without
 * config. Passkeys are scoped to a single hostname (by WebAuthn spec) — if the
 * user accesses the CMS from multiple domains they must register separately.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getUserById, getUserByEmail, saveUser, type StoredPasskey, type User } from "./auth";

/** Derive rpID (hostname) + origin from a request. */
export function getRpFromRequest(req: Request): { rpID: string; origin: string; rpName: string } {
  // Behind a reverse proxy (Fly.io, Vercel, nginx) req.url reflects the
  // internal address — we must trust x-forwarded-host / x-forwarded-proto
  // so the RP ID matches what the browser actually sees, otherwise
  // verifyRegistrationResponse rejects the attestation.
  const h = req.headers;
  const fwdHost = h.get("x-forwarded-host");
  const fwdProto = h.get("x-forwarded-proto");
  const url = new URL(req.url);
  const host = fwdHost ?? url.host;
  const proto = fwdProto ?? url.protocol.replace(":", "");
  const rpID = host.split(":")[0]!; // strip port
  const origin = `${proto}://${host}`;
  const rpName = "webhouse.app CMS";
  return { rpID, origin, rpName };
}

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = Buffer.from(b64, "base64");
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin[i]!;
  return out;
}

function bytesToB64u(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function buildRegistrationOptions(
  user: User,
  rp: { rpID: string; rpName: string },
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = user.passkeys ?? [];
  const opts = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports as never })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await saveUser({ ...user, webauthnChallenge: opts.challenge });
  return opts;
}

export async function confirmRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  rp: { rpID: string; origin: string },
  name: string,
): Promise<StoredPasskey> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  const expectedChallenge = user.webauthnChallenge;
  if (!expectedChallenge) throw new Error("No pending registration challenge");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    // Match the "preferred" UV we requested in options — some authenticators
    // (notably roaming security keys without PIN) return without the UV flag.
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Passkey verification failed");
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const stored: StoredPasskey = {
    id: cred.id,
    publicKey: bytesToB64u(cred.publicKey),
    counter: cred.counter,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    transports: cred.transports as string[] | undefined,
    name: name.trim() || "Passkey",
    createdAt: new Date().toISOString(),
  };

  const next: User = {
    ...user,
    passkeys: [...(user.passkeys ?? []), stored],
    webauthnChallenge: undefined,
  };
  await saveUser(next);
  return stored;
}

export async function buildAuthenticationOptions(
  email: string | undefined,
  rp: { rpID: string },
): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; userId?: string }> {
  let user: User | null = null;
  if (email) {
    user = await getUserByEmail(email);
  }

  const allowCredentials =
    user?.passkeys?.map((p) => ({ id: p.id, transports: p.transports as never })) ?? [];

  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials,
    userVerification: "preferred",
  });

  // Store challenge on user if known; otherwise caller must track it by
  // session (we use a short-lived cookie for usernameless flows).
  if (user) {
    await saveUser({ ...user, webauthnChallenge: options.challenge });
  }

  return { options, userId: user?.id };
}

export async function confirmAuthentication(
  response: AuthenticationResponseJSON,
  rp: { rpID: string; origin: string },
  expectedChallenge: string,
): Promise<User> {
  // Look up the user by credential ID (response.id)
  const { getUsers } = await import("./auth");
  const users = await getUsers();
  const user = users.find((u) => (u.passkeys ?? []).some((p) => p.id === response.id));
  if (!user) throw new Error("Unknown credential");
  const passkey = user.passkeys!.find((p) => p.id === response.id)!;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: {
      id: passkey.id,
      publicKey: b64uToBytes(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports as never,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) throw new Error("Authentication failed");

  // Update counter + lastUsedAt
  const updatedPasskeys = user.passkeys!.map((p) =>
    p.id === passkey.id
      ? { ...p, counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date().toISOString() }
      : p,
  );
  await saveUser({ ...user, passkeys: updatedPasskeys, webauthnChallenge: undefined });
  return { ...user, passkeys: updatedPasskeys };
}

export async function removePasskey(userId: string, credentialId: string): Promise<void> {
  const user = await getUserById(userId);
  if (!user) throw new Error("User not found");
  await saveUser({
    ...user,
    passkeys: (user.passkeys ?? []).filter((p) => p.id !== credentialId),
  });
}
