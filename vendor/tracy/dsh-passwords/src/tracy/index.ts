import type { AnonymousContext, AnonymousVerdict, TracyPolicy } from './policy.js';
import { classifySeatHttp, decideSeatHttp } from './routes.js';
import { decideSeatJobKill, decideSeatStreamOpen, filterSeatDown } from './streams.js';
import { checkSeatRequestBody, decideSeatRequest, filterSeatAnswer } from './request-path.js';
import { applyAllowedFoldersHeader, sharedGrantExempt, workspaceCreateExempt, workspaceListed } from './seat-context.js';
import { createSeatMux, decideSeatQuestionAnswer, type SeatMuxSource } from './mux-seat.js';
import { decideSeatWs } from './seat-ws.js';
import { tracyOwnershipCheck } from './ownership.js';
import { filterSeatEvent } from './seat-events.js';
import { SEAT_PAGE_HEAD, SETTINGS_PERSISTENCE } from './seat-settings.js';

export type * from './policy.js';
export type * from './request-path.js';
export { createJobOwnerBook } from './mux-seat.js';
export { mountOf as tracyMountOf } from './mount.js';
export type { JobOwnerBook, SeatMux, SeatMuxSource } from './mux-seat.js';

/** Tracy's fail-closed seat policy: the production default. */
export const tracyPolicy: TracyPolicy = Object.freeze({
  name: 'tracy',
  decideHttp: decideSeatHttp,
  decideStreamOpen: decideSeatStreamOpen,
  filterDown: filterSeatDown,
  decideAnonymous,
  // --- request path ---
  decideRequest: decideSeatRequest,
  checkRequestBody: checkSeatRequestBody,
  filterAnswer: filterSeatAnswer,
  forwardHeaders: applyAllowedFoldersHeader,
  // --- the seat's page ---
  seatPageHead: SEAT_PAGE_HEAD,
  settingsPersistence: SETTINGS_PERSISTENCE,
  holdWrites: true,
  recordsCreatedGrants: true,
  endsPendingRequests: true,
  sharedGrantExempt,
  workspaceListed,
  workspaceCreateExempt,
  ownershipCheck: tracyOwnershipCheck,
  // --- streams ---
  seatMux: (source: SeatMuxSource) => createSeatMux(tracyPolicy, source),
  decideWs: decideSeatWs,
  filterEvent: filterSeatEvent,
  decideJobKill: decideSeatJobKill,
  decideQuestionAnswer: decideSeatQuestionAnswer,
});

/**
 * H12 (R11, TCH #519): dsh's static web app manifest goes to dsh signed out — browsers fetch it
 * without cookies, so behind the door it only ever met the sign-in redirect. Same table as a seat's
 * signed-in request (`classifySeatHttp` → `public`): exactly that path, GET/HEAD only.
 */
function decideAnonymous(ctx: AnonymousContext): AnonymousVerdict {
  return classifySeatHttp(ctx.method, ctx.path).kind === 'public' ? { kind: 'forward' } : { kind: 'pass' };
}

let defaultPolicy: TracyPolicy = tracyPolicy;

/** The policy a gateway uses: the one it was built with, else the process default. */
export function resolvePolicy(explicit?: TracyPolicy): TracyPolicy {
  return explicit ?? defaultPolicy;
}

/**
 * Replace the process default. Only `test/tracy/upstream-policy-preload.ts` calls this, so that
 * upstream's own suite runs against upstream behaviour. With `MCP_TRACY_FLEET=1` the gateway
 * refuses to start under any default but `tracyPolicy` (fleet-guard.ts).
 */
export function replaceDefaultPolicyForUpstreamTests(policy: TracyPolicy): void {
  defaultPolicy = policy;
}
