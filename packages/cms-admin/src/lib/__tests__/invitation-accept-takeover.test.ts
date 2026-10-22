/**
 * Security W41 C2 — an invitation token is not proof of owning the account it
 * names (the inviter holds the same token). Accepting used to SET an existing
 * user's password and issue a 7-day session: any site admin could invite the
 * owner's email and take the account.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  users: [] as { id: string; email: string; role?: string; name?: string }[],
  session: null as null | { sub: string },
  bid: true,
  created: [] as unknown[],
  updated: [] as unknown[],
};

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth", () => ({
  getUsers: async () => state.users,
  getSessionUser: async () => state.session,
  createUser: async (email: string, password: string | null, name: string, opts: unknown) => {
    state.created.push({ email, password, name, opts });
    return { id: "new-user", email, name };
  },
  updateUser: async (...a: unknown[]) => { state.updated.push(a); },
  createToken: async () => "jwt",
  COOKIE_NAME: "cms-session",
}));
vi.mock("@/lib/bid-config", () => ({ isBidConfigured: () => state.bid }));
vi.mock("@/lib/invitations", () => ({
  validateToken: async () => ({ email: "owner@x.dk", role: "admin", createdBy: "inviter", siteDataDir: "/tmp/x" }),
  markAccepted: async () => {},
}));
vi.mock("@/lib/team", () => ({ addTeamMember: async () => ({}) }));

async function accept(body: Record<string, unknown>) {
  const { POST } = await import("../../app/api/admin/invitations/accept/route");
  return POST(new Request("http://x/api/admin/invitations/accept", { method: "POST", body: JSON.stringify(body) }) as never);
}

beforeEach(() => {
  state.users = [{ id: "owner", email: "owner@x.dk", role: "admin" }];
  state.session = null;
  state.bid = true;
  state.created = [];
  state.updated = [];
});

describe("invitation accept", () => {
  it("refuses an existing account unless the caller is signed in as it — password untouched, no session", async () => {
    const res = await accept({ token: "t", name: "Evil", password: "attacker-pass-123" });
    expect(res.status).toBe(403);
    expect(state.updated).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("also without BID: still no password overwrite", async () => {
    state.bid = false;
    const res = await accept({ token: "t", name: "Evil", password: "attacker-pass-123" });
    expect(res.status).toBe(403);
    expect(state.updated).toEqual([]);
  });

  it("an existing user signed in as themselves accepts — and gets no new session", async () => {
    state.session = { sub: "owner" };
    const res = await accept({ token: "t", name: "Owner", password: "__existing__" });
    expect(res.status).toBe(200);
    expect(state.updated).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("with BID on, a new account has no password, never the instance role, and signs in through BID", async () => {
    state.users = [];
    const res = await accept({ token: "t", name: "New", password: "whatever-123" });
    expect(res.status).toBe(200);
    expect(state.created).toEqual([{ email: "owner@x.dk", password: null, name: "New", opts: { role: "editor", invitedBy: "inviter" } }]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
