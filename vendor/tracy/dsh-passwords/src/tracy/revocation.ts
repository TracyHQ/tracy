/**
 * Revocation (H6, V1, V2, V6): taking a seat back, changing its grants, banning it, logging it out
 * or moving its credential version ends what it already has open, not only its next request.
 *
 * There is ONE registry of live connections: upstream 2.7.7's per-account sets
 * (`registerUserWebSocketClient` / `closeUserWebSocketClients`, `remoteMuxClientsByUser`). Its
 * WebSockets, SSE and raw sockets are registered by upstream; every seat HTTP request joins the
 * same set for its lifetime through the proxy hook adapter (`proxy-hooks.ts` `watchSeat`).
 */

export type RevocationEventType = 'revoke' | 'grant-change' | 'ban' | 'logout' | 'credential';
export interface RevocationEvent {
  type: RevocationEventType;
  userId: number;
}

/** WebSocket 1008, policy violation: what a seat's connection ends with when its access moves. */
export const POLICY_VIOLATION = 1008;

const REASONS: Record<RevocationEventType, string> = {
  revoke: 'seat revoked',
  'grant-change': 'seat access changed',
  ban: 'account banned',
  logout: 'signed out',
  credential: 'credentials changed',
};

/** The account state a frame is checked against, read fresh per frame; null when the account is gone. */
export interface FrameAccount {
  banned: boolean;
  credentialVersion: number;
}

/**
 * V2 — checked on every client frame of a long-lived seat connection, before it is answered: an
 * account banned, deleted or re-credentialed since the connection was admitted ends it with 1008.
 * The registry closes on the event; this is the belt for a change that reached the row another way.
 * @param admittedVersion - the credential version signed into the token the connection was admitted with.
 * @returns null to answer the frame, or how to close.
 */
export function frameVerdict(
  account: FrameAccount | null,
  admittedVersion: number,
): { code: number; reason: string } | null {
  if (account === null) return { code: POLICY_VIOLATION, reason: REASONS.revoke };
  if (account.banned) return { code: POLICY_VIOLATION, reason: REASONS.ban };
  if (account.credentialVersion !== admittedVersion) return { code: POLICY_VIOLATION, reason: REASONS.credential };
  return null;
}

/**
 * Upstream 2.7.7's own per-account connection sets, as the gateway holds them: `userWebSocketClients`
 * (the events WebSockets, SSE responses and every raw piped socket, the seat's sidebar sockets
 * among them) and `remoteMuxClientsByUser` (every mux carrier). Tracy reuses them rather than
 * keeping a second registry next to them.
 */
export interface SeatConnectionClosers {
  /** `closeUserWebSocketClients(userId, code, reason)`. */
  closeWebSockets(userId: number, code: number, reason: string): void;
  /** `closeUserRemoteMuxClients(userId, code, reason)`. */
  closeMux(userId: number, code: number, reason: string): void;
  /** `invalidateUserSessionAccess(userId)`: the cached grant snapshot, rebuilt by the next baseline. */
  invalidate(userId: number): void;
}

/**
 * V1, V6: what the seat door does when it takes a seat back, changes its grants, bans it or moves
 * its credential version: every connection the account holds ends with 1008 (the client reconnects
 * and is admitted afresh, or not at all), and its cached snapshot goes. Closes come first, each on
 * its own, so one failing closer keeps neither the others open nor the snapshot cached. Pending HTTP
 * requests are in the same set (`proxy-hooks.ts` registers them).
 */
export function revokeSeatConnections(closers: SeatConnectionClosers, event: RevocationEvent): void {
  const reason = REASONS[event.type];
  for (const close of [closers.closeWebSockets, closers.closeMux]) {
    try {
      close(event.userId, POLICY_VIOLATION, reason);
    } catch {
      // Already gone; the rest must still close.
    }
  }
  closers.invalidate(event.userId);
}
