/**
 * F199.2 — map a Broberg ID identity onto a cms user.
 *
 * BID proves WHO (`sub`). users.json + team.json keep deciding WHAT. This is the
 * only place the two meet, and it is pure so every branch can be pinned by a test.
 *
 * Never creates a user: an unknown BID account gets no cms access (fail-closed),
 * exactly like getSiteRole() for a user without a team row.
 */
import type { User } from "./auth";

export interface BidIdentity {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

export type BidMatch =
  | { user: User; bind: boolean }
  | { error: "unknown_account" | "sub_taken" | "already_linked" };

/**
 * @param linkUserId set when a user who is ALREADY signed in to cms asks to
 *   connect their BID account. The cms session is the proof of who they are, so
 *   the BID address does not have to match — Christian's BID primary is
 *   cb@broberg.ai while cms knows him as cb@webhouse.dk.
 */
export function resolveBidUser(users: User[], id: BidIdentity, linkUserId?: string): BidMatch {
  const bySub = users.find((u) => u.bidSub === id.sub);

  if (linkUserId !== undefined) {
    const target = users.find((u) => u.id === linkUserId);
    if (!target) return { error: "unknown_account" };
    if (bySub && bySub.id !== target.id) return { error: "sub_taken" };
    if (target.bidSub && target.bidSub !== id.sub) return { error: "already_linked" };
    return { user: target, bind: !target.bidSub };
  }

  if (bySub) return { user: bySub, bind: false };

  // First login without a prior link: only an address BID has VERIFIED may
  // bind, and only onto a user nobody has bound yet. An unverified address is
  // something anyone can type into a sign-up form.
  if (id.email && id.email_verified === true) {
    const email = id.email.toLowerCase();
    const matches = users.filter((u) => u.email.toLowerCase() === email);
    if (matches.length === 1 && !matches[0]!.bidSub) return { user: matches[0]!, bind: true };
  }
  return { error: "unknown_account" };
}
