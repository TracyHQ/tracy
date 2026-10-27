/**
 * H6, the WebSocket upgrade of a seat outside `/api/remote.mux` (R6). Upstream lets a subuser open
 * any socket a loaded plugin declares in its manifest; a seat gets exactly the gateway's own event
 * channels (upstream filters them) and the two better-sidebar sockets that name one held session in
 * the query: `/sidebar/ws/fs-watch` (the Files tab's live refresh) and `/sidebar/ws/agent-opens`
 * (host → browser). Those two are piped through unread, so the upgrade is the only point the gate
 * can say no. Everything else, other `/sidebar/ws/*` and plugin sockets included, is refused.
 */
import type { SeatWsContext, WsVerdict } from './policy.js';
import { classifySeatWs, seatRouteSessionOf } from './routes.js';
import { seatViewOf } from './mux-seat.js';

/** Sockets upstream itself serves to subusers, each with its own downlink filter. */
const GATEWAY_WS_PATHS: ReadonlySet<string> = new Set(['/api/remote.mux', '/api/events.host', '/api/events.mux', '/plugins/events']);

const DENY: WsVerdict = Object.freeze({ kind: 'deny', status: 403, reason: 'This socket is not available to this seat' });

export function decideSeatWs(ctx: SeatWsContext): WsVerdict {
  if (GATEWAY_WS_PATHS.has(ctx.path)) return { kind: 'pass' };
  const route = classifySeatWs(ctx.path);
  if (route.kind !== 'seat-route' || route.sessionFrom !== 'query' || route.write) return DENY;
  const sessionId = seatRouteSessionOf('query', { path: ctx.path, query: ctx.query });
  return sessionId !== null && seatViewOf(ctx.source).holdsSession(sessionId) ? { kind: 'forward' } : DENY;
}
