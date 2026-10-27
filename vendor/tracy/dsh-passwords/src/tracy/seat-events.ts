/**
 * H8, a seat's host and session events (`/api/events.host`, `/api/events.mux`, over SSE or their
 * downlink-only WebSocket), after upstream's own filter and before the frame is written (Q10, Q17).
 *
 * Upstream already keeps only the events of sessions in the seat's snapshot. Tracy adds three things:
 * an event naming a session (`sessionId` at the top) must name one the seat holds by the grant book
 * now (Tracy's origin rule), not only by a snapshot taken earlier; an id list drops the sessions the
 * book holds only by a row that rule refuses (Q1); and no other person's `prompter.email` leaves the
 * gate, the seat's own does (Q10).
 * The frame text (CRLF, UTF-8 across chunks) stays upstream's: this sees one parsed event.
 */
import type { SeatEventContext } from './policy.js';
import { grantHonoured, grantRefused, ownEmailOf } from './persistence.js';
import { scrubForeignPrompterEmails } from './session-refs.js';
import { withoutRefusedIds } from './streams.js';

/** What H8 reads about a seat, fresh for each event: the gateway database's upstream rows and the Tracy store. */
export interface SeatEventSource {
  hasUserSessionGrant(userId: number, sessionId: string): boolean;
  getPermissions(userId: number): { disabled_sessions: readonly string[] } | null;
}

/** The context `filterSeatEvent` is held to for one seat, read from the gateway's database. */
export function seatEventContextOf(db: SeatEventSource, userId: number): SeatEventContext {
  return {
    holdsSession: (id) => grantHonoured(db, userId, id) && !(db.getPermissions(userId)?.disabled_sessions ?? []).includes(id),
    ownEmail: ownEmailOf(db, userId),
    bookRefuses: (id) => grantRefused(db, userId, id),
  };
}

export function filterSeatEvent(ctx: SeatEventContext, envelope: Record<string, unknown>): Record<string, unknown> | null {
  const payload = envelope.payload;
  const event = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  if (event !== null && Object.hasOwn(event, 'sessionId') &&
    (typeof event.sessionId !== 'string' || !ctx.holdsSession(event.sessionId))) return null;
  let out = envelope;
  const refuses = ctx.bookRefuses;
  if (event !== null && refuses !== undefined) {
    // Q1: upstream lists the seat's snapshot; an id the book holds only by a refused row leaves it.
    let kept = withoutRefusedIds(event, refuses);
    const workspace = kept.workspace;
    if (workspace !== null && typeof workspace === 'object' && !Array.isArray(workspace)) {
      const row = withoutRefusedIds(workspace as Record<string, unknown>, refuses);
      if (row !== workspace) kept = { ...kept, workspace: row };
    }
    if (kept !== event) out = { ...envelope, payload: kept };
  }
  scrubForeignPrompterEmails(out, ctx.ownEmail);
  return out;
}
