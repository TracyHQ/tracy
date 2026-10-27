// Preload for `npm run test:upstream` ONLY (`node --import ./test/tracy/upstream-policy-preload.ts`).
// Upstream's suite asserts upstream behaviour, including its fail-open stance on plugin routes and
// streams, so it runs with a pass-through policy: every hook answers `pass`, which is exactly the
// core without the Tracy layer. Nothing under src/ may import this file
// (test/tracy/policy-default.test.ts checks), and a fleet gateway refuses to start under any
// default but `tracyPolicy` (src/tracy/fleet-guard.ts).
import { replaceDefaultPolicyForUpstreamTests, type TracyPolicy } from '../../src/tracy/index.js';

const pass = { kind: 'pass' } as const;

export const upstreamPassThroughPolicy: TracyPolicy = Object.freeze<TracyPolicy>({
  name: 'upstream-pass-through',
  decideHttp: () => pass,
  decideStreamOpen: () => pass,
  filterDown: () => pass,
  decideAnonymous: () => pass,
  // --- request path --- upstream reads no request body, rewrites no answer, sends headers as they came,
  // holds no write, and keeps its "one folder, one owner" rule whole.
  decideRequest: () => ({ kind: 'forward', body: null, answer: null }),
  checkRequestBody: () => pass,
  filterAnswer: (_ctx, _door, answer) => ({ kind: 'answer', value: answer }),
  forwardHeaders: (headers) => headers,
  // Upstream adds nothing to a subuser's page and forces every browser behind the gate to host persistence.
  seatPageHead: '',
  settingsPersistence: '"host"',
  holdWrites: false,
  recordsCreatedGrants: false,
  endsPendingRequests: false,
  sharedGrantExempt: () => false,
  workspaceListed: () => true,
  workspaceCreateExempt: () => true,
  ownershipCheck: () => null,
  seatMux: () => null,
  decideWs: () => pass,
  filterEvent: (_ctx, event) => event,
  decideJobKill: () => pass,
  decideQuestionAnswer: () => pass,
});

replaceDefaultPolicyForUpstreamTests(upstreamPassThroughPolicy);
