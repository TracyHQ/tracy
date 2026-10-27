// Tracy stream policy (src/tracy/streams.ts): pure decisions for a seat's Remote mux streams.
// Every case is named by the invariant it holds (TRACY-FORK.md §2). No gateway, no socket: the
// functions take a seat view, a carrier view and a frame, and answer with data.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import jwt from 'jsonwebtoken';
import { createGatewayServer } from '../../src/gateway.js';
import { AuthService } from '../../src/auth.js';
import { Database } from '../../src/db.js';
import { createFieldCrypto } from '../../src/encrypt.js';
import type { PlatformConfig } from '../../src/config.js';
import {
  archiveSnapshotFromBaseline,
  CANCELLED_IDS_MAX,
  claimQuestionAnswer,
  createCancelLedger,
  createStreamState,
  decideOpen,
  decideUpsertHold,
  FENCED_OUT,
  UPSERT_HOLD_MS,
  fenceStreamIds,
  fenceUnknownFields,
  filterDown,
  noteClientCancel,
  SEAT_STREAM_ENDPOINTS,
  upstreamFrameAfterCancel,
  type CarrierView,
  type SeatView,
} from '../../src/tracy/streams.js';
import { tracyPolicy } from '../../src/tracy/index.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const require = createRequire(import.meta.url);
const { WebSocketServer, WebSocket: NodeWebSocket } = require('ws') as {
  WebSocketServer: new (options?: { noServer?: boolean }) => any;
  WebSocket: new (url: string, options?: { headers?: Record<string, string> }) => any;
};

const seat = (over: Partial<SeatView> = {}): SeatView => ({
  holdsSession: (id) => id === 'sess-mine',
  seesWorkspace: (id) => id === 'w-mine',
  folders: ['/workspaces/mine'],
  grantsSeeded: true,
  banned: false,
  ...over,
});
const carrier = (over: Partial<CarrierView> = {}): CarrierView => ({
  baselineReady: true,
  cancelledIds: new Set<string>(),
  ...over,
});
const open = (endpoint: string, args: Record<string, unknown> = {}, streamId = 's1') =>
  ({ streamId, endpoint, payload: { args } });

test('V5: an endpoint outside the seat table is refused for that stream, in the dsh error shape', () => {
  for (const endpoint of ['foo/bar', 'session/newThing', 'terminal/follow', 'account/watch', 'workspaceFiles/changes']) {
    const decision = decideOpen(open(endpoint), seat(), carrier());
    assert.deepEqual(decision, {
      kind: 'refuse',
      code: 'gateway/method-unavailable',
      message: `Remote stream ${endpoint} is not available through this gateway`,
      details: { endpoint },
    }, endpoint);
  }
});

test('C8: dsh 0.2.0 userQuestions/attachWait and productAnalytics/watchPolicy are refused per stream', () => {
  const wait = decideOpen({ streamId: 'w', endpoint: 'userQuestions/attachWait', payload: { args: { agentId: 'sess-mine', callId: 'c' } } }, seat(), carrier());
  const policy = decideOpen(open('productAnalytics/watchPolicy'), seat(), carrier());
  assert.equal(wait.kind, 'refuse');
  assert.equal(policy.kind, 'refuse');
});

test('J1: the three host streams open only with empty args; anything in the args is refused', () => {
  for (const endpoint of ['$events', 'workspace/follow', 'session/control'] as const) {
    assert.deepEqual(decideOpen(open(endpoint), seat(), carrier()), { kind: 'allow', resource: { kind: 'host', endpoint } }, endpoint);
    assert.equal(decideOpen(open(endpoint, { sessionId: 'sess-mine' }), seat(), carrier()).kind, 'refuse', `${endpoint} with args`);
    assert.equal(decideOpen({ streamId: 's', endpoint, payload: null }, seat(), carrier()).kind, 'refuse', `${endpoint} without payload`);
    assert.equal(decideOpen({ streamId: 's', endpoint, payload: { args: {}, extra: 1 } }, seat(), carrier()).kind, 'refuse', `${endpoint} with a second key`);
  }
});

test('J1: a banned seat opens nothing', () => {
  assert.equal(decideOpen(open('$events'), seat({ banned: true }), carrier()).kind, 'refuse');
});

const follow = (address: Record<string, unknown>, streamId = 'f1') =>
  ({ streamId, endpoint: 'session/follow', payload: { args: { request: { address, maxMessages: 50 } } } });

test('Q13: session/follow opens only for a session the book names for this seat', () => {
  assert.deepEqual(decideOpen(follow({ kind: 'session', sessionId: 'sess-mine' }), seat(), carrier()),
    { kind: 'allow', resource: { kind: 'session', sessionId: 'sess-mine', address: 'session' } });
  assert.equal(decideOpen(follow({ kind: 'session', sessionId: 'sess-foreign' }), seat(), carrier()).kind, 'refuse');
  // Shapes that name no session are refused, never guessed: request.sessionId does not exist on the wire.
  for (const payload of [
    { args: { request: { sessionId: 'sess-mine' } } },
    { args: { request: { address: { kind: 'session', sessionId: '' } } } },
    { args: { request: { address: { kind: 'session', sessionId: 7 } } } },
    { args: {} }, null, { args: { request: { address: { kind: 'session', sessionId: 'sess-mine' } } }, extra: true },
  ]) {
    assert.equal(decideOpen({ streamId: 'f', endpoint: 'session/follow', payload }, seat(), carrier()).kind, 'refuse', JSON.stringify(payload));
  }
});

test('C7/Q13: a subagent follow is checked against its PARENT session, never the child', () => {
  const sub = (parentSessionId: string, childSessionId: string) =>
    follow({ kind: 'subagent', parentSessionId, childSessionId, mode: 'live' });
  assert.deepEqual(decideOpen(sub('sess-mine', 'child-unknown'), seat(), carrier()),
    { kind: 'allow', resource: { kind: 'session', sessionId: 'sess-mine', address: 'subagent' } });
  assert.equal(decideOpen(sub('sess-foreign', 'sess-mine'), seat(), carrier()).kind, 'refuse', 'a held child does not open a foreign parent');
});

test('Q13: an unseeded grant book cannot refuse before the baseline; it waits, then decides', () => {
  const unseeded = seat({ grantsSeeded: false });
  assert.deepEqual(decideOpen(follow({ kind: 'session', sessionId: 'sess-foreign' }), unseeded, carrier({ baselineReady: false })),
    { kind: 'wait-baseline', resource: { kind: 'session', sessionId: 'sess-foreign', address: 'session' } });
  assert.equal(decideOpen(follow({ kind: 'session', sessionId: 'sess-foreign' }), unseeded, carrier({ baselineReady: true })).kind, 'refuse');
  assert.equal(decideOpen(follow({ kind: 'session', sessionId: 'sess-foreign' }), seat(), carrier({ baselineReady: false })).kind, 'refuse',
    'a seeded book refuses at once');
});

const jobOpen = (endpoint: 'job/list' | 'job/follow', request: Record<string, unknown>, streamId = 'j1') =>
  ({ streamId, endpoint, payload: { args: { request } } });

test('J1: job/list opens only for a held session', () => {
  assert.deepEqual(decideOpen(jobOpen('job/list', { sessionId: 'sess-mine' }), seat(), carrier()),
    { kind: 'allow', resource: { kind: 'job-list', sessionId: 'sess-mine' } });
  assert.equal(decideOpen(jobOpen('job/list', { sessionId: 'sess-foreign' }), seat(), carrier()).kind, 'refuse');
  assert.equal(decideOpen(jobOpen('job/list', {}), seat(), carrier()).kind, 'refuse', 'an unowned listing is never a seat\'s');
});

test('J1: job/follow needs a held session AND a jobId; the refusal reads the same whether or not the job exists', () => {
  assert.deepEqual(decideOpen(jobOpen('job/follow', { sessionId: 'sess-mine', jobId: 'job-1', from: 0 }), seat(), carrier()),
    { kind: 'allow', resource: { kind: 'job-follow', sessionId: 'sess-mine', jobId: 'job-1' } });
  const foreign = decideOpen(jobOpen('job/follow', { sessionId: 'sess-foreign', jobId: 'job-1' }), seat(), carrier());
  const noJob = decideOpen(jobOpen('job/follow', { sessionId: 'sess-mine' }), seat(), carrier());
  const emptyJob = decideOpen(jobOpen('job/follow', { sessionId: 'sess-mine', jobId: '' }), seat(), carrier());
  const unknown = decideOpen(open('job/nope'), seat(), carrier());
  for (const refused of [foreign, noJob, emptyJob]) {
    assert.deepEqual(refused, { ...unknown, message: 'Remote stream job/follow is not available through this gateway', details: { endpoint: 'job/follow' } });
  }
  assert.equal(decideOpen({ streamId: 'j', endpoint: 'job/follow', payload: { args: { request: { sessionId: 'sess-mine', jobId: 'j' }, more: 1 } } }, seat(), carrier()).kind,
    'refuse', 'a second args key is malformed');
});

test('V4: a cancelled id is not reusable until dsh ends its old stream; late frames are dropped, not filtered by a new stream', () => {
  const ledger = createCancelLedger();
  noteClientCancel(ledger, 'ctl-1');
  const reopen = decideOpen(follow({ kind: 'session', sessionId: 'sess-mine' }, 'ctl-1'), seat(), carrier({ cancelledIds: ledger.ids }));
  assert.equal(reopen.kind, 'refuse', 'cancel X then open X session/follow in one write is refused');
  assert.equal(decideOpen(follow({ kind: 'session', sessionId: 'sess-mine' }, 'flw-1'), seat(), carrier({ cancelledIds: ledger.ids })).kind,
    'allow', 'a fresh id is served as always');
  assert.equal(upstreamFrameAfterCancel(ledger, { type: 'item', streamId: 'ctl-1' }), 'drop', 'a late item of the old stream');
  assert.equal(upstreamFrameAfterCancel(ledger, { type: 'item', streamId: 'other' }), 'not-cancelled');
  assert.equal(upstreamFrameAfterCancel(ledger, { type: 'end', streamId: 'ctl-1' }), 'drop', 'the terminal frame itself is not forwarded');
  assert.equal(ledger.ids.has('ctl-1'), false, 'end released the id');
  assert.equal(decideOpen(follow({ kind: 'session', sessionId: 'sess-mine' }, 'ctl-1'), seat(), carrier({ cancelledIds: ledger.ids })).kind, 'allow');
  noteClientCancel(ledger, 'x');
  upstreamFrameAfterCancel(ledger, { type: 'error', streamId: 'x' });
  assert.equal(ledger.ids.has('x'), false, 'error releases too');
});

test('V4: the ledger is bounded; the oldest cancelled id is forgotten first', () => {
  const ledger = createCancelLedger();
  for (let i = 0; i <= CANCELLED_IDS_MAX; i += 1) noteClientCancel(ledger, `id-${i}`);
  assert.equal(ledger.ids.size, CANCELLED_IDS_MAX);
  assert.equal(ledger.ids.has('id-0'), false);
  assert.equal(ledger.ids.has(`id-${CANCELLED_IDS_MAX}`), true);
});

const job = (id: string, owner: string, extra: Record<string, unknown> = {}) => ({
  id, owner, title: `job ${id}`, output: { total: 3, earliest: 0, spillPaths: ['/host/spill/job.log'] }, ...extra,
});
const jobView = (id: string, owner: string) => ({ id, owner, title: `job ${id}`, output: { total: 3, earliest: 0 } });

test('J2: job/list rows keep only jobs owned by the stream\'s session, without host spill paths', () => {
  const state = createStreamState({ kind: 'job-list', sessionId: 'sess-mine' });
  const decision = filterDown(state, { type: 'rows', jobs: [job('a', 'sess-mine'), job('b', 'sess-foreign'), { id: 'c' }, 'junk', job('d', 'sess-mine')] }, seat());
  assert.deepEqual(decision, { kind: 'replace', value: { type: 'rows', jobs: [jobView('a', 'sess-mine'), jobView('d', 'sess-mine')] } });
  assert.deepEqual(filterDown(state, { type: 'rows' }, seat()), { kind: 'drop' }, 'a malformed rows frame');
  assert.deepEqual(filterDown(state, { type: 'mystery', jobs: [] }, seat()), { kind: 'drop' });
});

test('J3: job/follow sends 0 output frames before an opened/status frame for its own job, and none for a foreign job', () => {
  const state = createStreamState({ kind: 'job-follow', sessionId: 'sess-mine', jobId: 'job-1' });
  const output = { type: 'output', chunks: [{ at: 0, text: 'SECRET' }], next: 6 };
  const sequence = [
    output,
    { type: 'opened', job: job('job-1', 'sess-foreign') },
    output,
    { type: 'status', job: job('job-2', 'sess-mine') },
    output,
    { type: 'opened', job: { id: 'job-1', owner: 'sess-mine' } },
    output,
  ];
  const decisions = sequence.map((value) => filterDown(state, value, seat()));
  assert.equal(decisions.filter((d, i) => sequence[i]!.type === 'output' && d.kind !== 'drop').length, 0, 'zero output frames forwarded');
  assert.equal(decisions.filter((d) => d.kind !== 'drop').length, 0, 'zero frames of any kind forwarded');
});

test('J3/J2: once its own job opened, output flows and every job projection loses its spill paths', () => {
  const state = createStreamState({ kind: 'job-follow', sessionId: 'sess-mine', jobId: 'job-1' });
  assert.deepEqual(filterDown(state, { type: 'opened', job: job('job-1', 'sess-mine') }, seat()),
    { kind: 'replace', value: { type: 'opened', job: jobView('job-1', 'sess-mine') } });
  const output = { type: 'output', chunks: [{ at: 0, text: 'abc' }], next: 3 };
  assert.deepEqual(filterDown(state, output, seat()), { kind: 'pass' });
  assert.deepEqual(filterDown(state, { type: 'output', chunks: 'not-an-array', next: 3 }, seat()), { kind: 'drop' });
  assert.deepEqual(filterDown(state, { type: 'status', job: job('job-1', 'sess-mine', { state: 'done' }) }, seat()),
    { kind: 'replace', value: { type: 'status', job: { ...jobView('job-1', 'sess-mine'), state: 'done' } } });
});

test('J4: a job stream whose grant is gone mid-stream cancels upstream and ends the client; no output after', () => {
  let held = true;
  const live = seat({ holdsSession: (id) => held && id === 'sess-mine' });
  const state = createStreamState({ kind: 'job-follow', sessionId: 'sess-mine', jobId: 'job-1' });
  assert.equal(filterDown(state, { type: 'opened', job: job('job-1', 'sess-mine') }, live).kind, 'replace');
  held = false;
  const output = { type: 'output', chunks: [{ at: 0, text: 'after-revoke' }], next: 12 };
  assert.deepEqual(filterDown(state, output, live), { kind: 'cancel-upstream', end: true });
  const list = createStreamState({ kind: 'job-list', sessionId: 'sess-mine' });
  assert.deepEqual(filterDown(list, { type: 'rows', jobs: [job('a', 'sess-mine')] }, live), { kind: 'cancel-upstream', end: true });
});

test('Q13: session/follow re-checks the grant on every frame; a revoked or switched-off session ends the stream', () => {
  let held = true;
  const live = seat({ holdsSession: (id) => held && id === 'sess-mine' });
  const state = createStreamState({ kind: 'session', sessionId: 'sess-mine', address: 'session' });
  const record = { type: 'record', record: { role: 'assistant', text: 'hello' } };
  assert.deepEqual(filterDown(state, record, live), { kind: 'pass' });
  held = false;
  assert.deepEqual(filterDown(state, record, live), { kind: 'cancel-upstream', end: true });
});

const events = () => createStreamState({ kind: 'host', endpoint: '$events' });

test('S13: the $events ready frame reaches the seat once, with host.home replaced by its first folder', () => {
  const state = events();
  const ready = { type: 'ready', clientId: 'client-1', host: { home: '/root' } };
  assert.deepEqual(filterDown(state, ready, seat({ folders: ['__deny__', '/workspaces/mine', '/workspaces/two'] })),
    { kind: 'replace', value: { type: 'ready', clientId: 'client-1', host: { home: '/workspaces/mine' } } });
  assert.deepEqual(filterDown(state, { ...ready, clientId: 'client-2' }, seat()), { kind: 'drop' }, 'a second ready is not a data-plane event');
  const noFolder = events();
  assert.deepEqual(filterDown(noFolder, ready, seat({ folders: ['__deny__'] })),
    { kind: 'replace', value: { type: 'ready', clientId: 'client-1', host: { home: '' } } }, 'no folder: the Host home never leaks');
  for (const bad of [{ type: 'ready', host: { home: '/root' } }, { type: 'ready', clientId: '', host: {} }, { type: 'ready', clientId: 'x'.repeat(201), host: {} }]) {
    assert.deepEqual(filterDown(events(), bad, seat()), { kind: 'drop' }, JSON.stringify(bad).slice(0, 60));
  }
});

test('Q17: $events delivers only api-session/status of a held session, rebuilt from its checked fields', () => {
  const state = events();
  filterDown(state, { type: 'ready', clientId: 'c', host: { home: '/root' } }, seat());
  const status = (sessionId: unknown, running: unknown) => ({ type: 'emit', event: 'api-session/status', args: [sessionId, running] });
  const sequence = [
    status('sess-mine', true),
    status('sess-foreign', false),
    status('sess-mine', 'no'),
    { type: 'emit', event: 'api-session/status', args: ['sess-mine', false, 'extra'] },
    { type: 'emit', event: 'api-session/status', args: ['sess-mine', false], more: 1 },
    { type: 'emit', event: 'api-session/error', args: ['sess-mine', 'boom'] },
    { type: 'emit', event: 'api-session/added', args: [{ sessionId: 'sess-mine', cwd: '/x' }] },
    { type: 'emit', event: 'anything/at-all', args: [{ secret: 'of-another-seat' }] },
    status('sess-mine', false),
  ];
  const forwarded = sequence.map((value) => filterDown(state, value, seat())).filter((d) => d.kind !== 'drop');
  assert.deepEqual(forwarded, [
    { kind: 'replace', value: status('sess-mine', true) },
    { kind: 'replace', value: status('sess-mine', false) },
  ]);
});

const question = (agentId: string, eventId = `ev-${agentId}`, event = 'user-questions/request') => ({
  type: 'waterfall', event, eventId, agentId,
  request: { questions: [{ id: 'q1', prompt: 'Which colour?' }], wait: { callId: 'call-1', timed: true }, futureField: { kept: true } },
});
const readyEvents = (s: SeatView = seat()) => {
  const state = events();
  filterDown(state, { type: 'ready', clientId: 'client-1', host: { home: '/root' } }, s);
  return state;
};
const answer = (eventId: string, extra: Record<string, unknown> = {}) =>
  ({ clientId: 'client-1', eventId, outcome: { kind: 'result', answers: [] }, ...extra });

test('Q16: a question reaches the seat only for a session it can answer; approvals and foreign questions stay hidden', () => {
  const state = readyEvents();
  const sequence = [
    question('sess-mine'),
    question('sess-foreign'),
    question('sess-mine', 'ev-approval', 'approval/request'),
    { ...question('sess-mine', 'ev-empty'), request: { questions: [] } },
    question('sess-mine'),
  ];
  const forwarded = sequence.map((value) => filterDown(state, value, seat()));
  assert.deepEqual(forwarded.map((d) => d.kind), ['pass', 'drop', 'drop', 'drop', 'drop'], 'one question, delivered once, every field intact');
  assert.deepEqual(filterDown(events(), question('sess-mine'), seat()), { kind: 'drop' }, 'no question before the ready frame');
  assert.deepEqual(filterDown(readyEvents(seat({ folders: ['__deny__'] })), question('sess-mine'), seat({ folders: ['__deny__'] })),
    { kind: 'drop' }, 'a seat with no folder answers nothing');
});

test('Q16: an answer is accepted once, from the seat that received the question, on a live stream, folders unchanged', () => {
  const state = readyEvents();
  filterDown(state, question('sess-mine'), seat());
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine', { outcome: { kind: 'bogus' } }), seat(), true), { kind: 'refuse' });
  assert.deepEqual(claimQuestionAnswer(state, { eventId: 'ev-sess-mine', outcome: { kind: 'result' } }, seat(), true), { kind: 'refuse' },
    'a malformed envelope does not consume the question');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine', { clientId: 'client-2' }), seat(), true), { kind: 'refuse' }, 'another client id');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat(), false), { kind: 'refuse' }, 'the stream is gone');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat({ folders: ['/workspaces/other'] }), true), { kind: 'refuse' }, 'folders changed');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat({ holdsSession: () => false }), true), { kind: 'refuse' }, 'grant revoked');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat(), true), { kind: 'allow', sessionId: 'sess-mine' });
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat(), true), { kind: 'refuse' }, 'only once');
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-foreign'), seat(), true), { kind: 'refuse' }, 'never delivered');
});

test('Q16: a cancel passes only for a question this stream delivered, and withdraws it', () => {
  const state = readyEvents();
  filterDown(state, question('sess-mine'), seat());
  assert.deepEqual(filterDown(state, { type: 'cancel', eventId: 'ev-other' }, seat()), { kind: 'drop' });
  assert.deepEqual(filterDown(state, { type: 'cancel', eventId: 'ev-sess-mine' }, seat()), { kind: 'pass' });
  assert.deepEqual(claimQuestionAnswer(state, answer('ev-sess-mine'), seat(), true), { kind: 'refuse' }, 'a cancelled question takes no answer');
});

// Q14 — ported from the fork's permissions-pure.test.ts (`fenceStreamIds`).
const seesSession = (id: string): boolean => id === 'sess-mine';
const seesWorkspace = (id: string): boolean => id === 'w-mine';
const fence = (value: unknown): unknown => fenceStreamIds(value, seesSession, seesWorkspace);

test('Q14: fenceStreamIds keeps a value that names nothing, as it came, as a copy', () => {
  for (const value of [null, undefined, 7, 'text', true, [], {}, { note: 'from a newer dsh', nested: { n: [1, 'two', null] } }]) {
    assert.deepEqual(fence(value), value, JSON.stringify(value));
  }
  const input = { a: { b: { c: 'deep' } } };
  assert.notEqual(fence(input), input, 'a copy, never the Host object itself');
});

test('Q14: fenceStreamIds filters every plural id field to the seen ids and drops non-strings', () => {
  assert.deepEqual(fence({
    sessionIds: ['sess-mine', 'sess-foreign', 7, null],
    archivedSessionIds: ['sess-foreign'],
    pinnedSessionIds: ['sess-mine'],
    futureSessionIds: ['sess-foreign', 'sess-mine'],
    workspaceIds: ['w-mine', 'w-other'],
    recentWorkspaceIds: ['w-other'],
  }), {
    sessionIds: ['sess-mine'], archivedSessionIds: [], pinnedSessionIds: ['sess-mine'], futureSessionIds: ['sess-mine'],
    workspaceIds: ['w-mine'], recentWorkspaceIds: [],
  });
  assert.deepEqual(fence({ sessionIds: 'sess-foreign' }), { sessionIds: 'sess-foreign' }, 'a plural key that is not an array is not an id list');
});

test('Q14: fenceStreamIds fences out the object that names a session or workspace the seat may not see', () => {
  for (const value of [
    { sessionId: 'sess-foreign' }, { agentId: 'sess-foreign' }, { parentSessionId: 'sess-foreign', childSessionId: 'sess-mine' },
    { childSessionId: 'sess-foreign' }, { beforeSessionId: 'sess-foreign' }, { workspaceFileScopeId: 'sess-foreign' },
    { workspaceId: 'w-other' }, { sessionId: 7 }, { workspaceId: ['w-mine'] },
    { wrapper: { deeper: { sessionId: 'sess-foreign' } } },
  ]) {
    assert.equal(fence(value), FENCED_OUT, JSON.stringify(value));
  }
  for (const value of [{ sessionId: 'sess-mine' }, { workspaceId: 'w-mine' }, { sessionId: null, workspaceId: null }]) {
    assert.deepEqual(fence(value), value, JSON.stringify(value));
  }
});

test('Q14: fenceStreamIds drops a fenced array element and keeps its siblings', () => {
  assert.deepEqual(fence({ rows: [
    { sessionId: 'sess-mine', n: 1 }, { sessionId: 'sess-foreign', n: 2 }, { workspaceId: 'w-other' }, { plain: true }, 'text',
  ] }), { rows: [{ sessionId: 'sess-mine', n: 1 }, { plain: true }, 'text'] });
});

test('Q14: fenceStreamIds fences out a value nested deeper than any dsh frame', () => {
  let deep: unknown = { leaf: true };
  for (let i = 0; i < 70; i += 1) deep = { deep };
  assert.equal(fence(deep), FENCED_OUT);
});

test('Q14: fenceUnknownFields keeps the fields a filter does not know, each fenced with its own name', () => {
  const source = {
    items: ['filtered elsewhere'], futureSessionIds: ['sess-mine', 'sess-foreign'], note: 'kept',
    spotlight: { sessionId: 'sess-foreign' }, mine: { sessionId: 'sess-mine' }, sessionId: 'sess-foreign',
  };
  assert.deepEqual(fenceUnknownFields(source, ['items'], seesSession, seesWorkspace), {
    futureSessionIds: ['sess-mine'], note: 'kept', mine: { sessionId: 'sess-mine' },
  });
});

const workspaceFollow = () => createStreamState({ kind: 'host', endpoint: 'workspace/follow' });

test('Q14: a workspace/follow frame type this gate does not know is passed on fenced, or held back', () => {
  const s = seat();
  assert.deepEqual(filterDown(workspaceFollow(), { type: 'spotlight', sessionIds: ['sess-mine', 'sess-foreign'], label: 'x' }, s),
    { kind: 'replace', value: { type: 'spotlight', sessionIds: ['sess-mine'], label: 'x' } });
  assert.deepEqual(filterDown(workspaceFollow(), { type: 'focus', sessionId: 'sess-foreign' }, s), { kind: 'drop' });
  assert.deepEqual(filterDown(workspaceFollow(), { type: 'focus', workspaceId: 'w-other' }, s), { kind: 'drop' });
  assert.deepEqual(filterDown(workspaceFollow(), { type: 'focus', workspaceId: 'w-mine' }, s),
    { kind: 'replace', value: { type: 'focus', workspaceId: 'w-mine' } });
  assert.deepEqual(filterDown(workspaceFollow(), { kind: 'no-type' }, s), { kind: 'drop' }, 'a frame without a type is malformed');
});

test('Q15: an upsert naming a session not yet granted is held once for 400 ms, then filtered as it stands', () => {
  const upsert = (sessionIds: unknown[]) => ({ type: 'upsert', workspace: { workspaceId: 'w-mine', path: '/workspaces/mine', sessionIds } });
  assert.equal(UPSERT_HOLD_MS, 400);
  assert.deepEqual(decideUpsertHold(upsert(['sess-mine', 'sess-new']), seat(), 0), { kind: 'defer', ms: 400 });
  assert.deepEqual(decideUpsertHold(upsert(['sess-mine', 'sess-new']), seat(), 1), { kind: 'now' }, 'never held twice');
  assert.deepEqual(decideUpsertHold(upsert(['sess-mine']), seat(), 0), { kind: 'now' }, 'every session already held');
  assert.deepEqual(decideUpsertHold(upsert([7]), seat(), 0), { kind: 'now' }, 'a non-string id is the filter\'s to drop');
  assert.deepEqual(decideUpsertHold({ type: 'archived', archivedSessionIds: ['sess-new'] }, seat(), 0), { kind: 'now' });
  assert.deepEqual(decideUpsertHold({ type: 'upsert', workspace: null }, seat(), 0), { kind: 'now' });
  // After the hold the grant either landed (the session passes) or not (it is filtered): the hold
  // decides timing only, never access.
  let granted = false;
  const racing = seat({ holdsSession: (id) => id === 'sess-mine' || (granted && id === 'sess-new') });
  assert.equal(decideUpsertHold(upsert(['sess-new']), racing, 0).kind, 'defer');
  granted = true;
  assert.equal(decideUpsertHold(upsert(['sess-new']), racing, 0).kind, 'now');
});

test('Q18: a workspace/follow baseline yields the seat\'s archive snapshot, so session.list need not wait for HTTP workspace.list', () => {
  const baseline = (value: unknown) => ({ type: 'baseline', value });
  assert.deepEqual(archiveSnapshotFromBaseline(baseline({ items: [], archivedSessionIds: ['sess-mine', 'sess-foreign', 7] }), seat()),
    { archivedSessionIds: ['sess-mine'] });
  assert.deepEqual(archiveSnapshotFromBaseline(baseline({ items: [], archivedSessionIds: [] }), seat()), { archivedSessionIds: [] });
  assert.equal(archiveSnapshotFromBaseline(baseline({ items: [] }), seat()), null, 'no archive set: no snapshot, never an empty guess');
  assert.equal(archiveSnapshotFromBaseline(baseline({ archivedSessionIds: [] }), seat()), null, 'malformed baseline');
  assert.equal(archiveSnapshotFromBaseline({ type: 'upsert', workspace: {} }, seat()), null);
});

test('C1: a session/control baseline without a projections record is dropped; one with it passes as upstream filtered it', () => {
  const control = createStreamState({ kind: 'host', endpoint: 'session/control' });
  assert.deepEqual(filterDown(control, { type: 'baseline', value: { jobs: { 'sess-mine': {} } } }, seat()), { kind: 'drop' });
  assert.deepEqual(filterDown(control, { type: 'baseline', value: { projections: [] } }, seat()), { kind: 'drop' });
  assert.deepEqual(filterDown(control, { type: 'baseline', value: null }, seat()), { kind: 'drop' });
  assert.deepEqual(filterDown(control, { type: 'baseline', value: { projections: { 'sess-mine': {} }, queues: {} } }, seat()), { kind: 'pass' });
  assert.deepEqual(filterDown(control, { type: 'projection', sessionId: 'sess-mine' }, seat()), { kind: 'pass' });
});

test('V5/C8: across every refused open, 0 open frames would reach dsh (decisions counted)', () => {
  const opens = [
    open('foo/bar'), open('account/watch'), open('workspaceFiles/changes', { workspaceFileScopeId: 'sess-mine', path: 'a' }),
    open('terminal/follow'), open('userQuestions/attachWait', { agentId: 'sess-mine', callId: 'c' }), open('productAnalytics/watchPolicy'),
    open('session/control', { x: 1 }), follow({ kind: 'session', sessionId: 'sess-foreign' }),
    jobOpen('job/list', { sessionId: 'sess-foreign' }), jobOpen('job/follow', { sessionId: 'sess-mine' }),
  ];
  const forwarded = opens.map((o) => decideOpen(o, seat(), carrier())).filter((d) => d.kind !== 'refuse');
  assert.equal(forwarded.length, 0);
});

test('V5/C8: the live H4 adapter already refuses official endpoints outside the seat table that upstream admits', () => {
  for (const endpoint of ['account/watch', 'workspaceFiles/changes', 'userQuestions/attachWait', 'productAnalytics/watchPolicy']) {
    const verdict = tracyPolicy.decideStreamOpen({ endpoint, payload: { args: {} }, filteredByGateway: true });
    assert.equal(verdict.kind, 'deny', endpoint);
  }
  for (const endpoint of SEAT_STREAM_ENDPOINTS) {
    assert.equal(tracyPolicy.decideStreamOpen({ endpoint, payload: { args: {} }, filteredByGateway: true }).kind, 'pass', endpoint);
  }
});

test('J1/V1: a seat banned mid-stream gets nothing more on any stream; the stream is cancelled upstream', () => {
  const banned = seat({ banned: true });
  for (const resource of [
    { kind: 'host', endpoint: '$events' }, { kind: 'host', endpoint: 'workspace/follow' }, { kind: 'host', endpoint: 'session/control' },
    { kind: 'session', sessionId: 'sess-mine', address: 'session' }, { kind: 'job-list', sessionId: 'sess-mine' },
  ] as const) {
    assert.deepEqual(filterDown(createStreamState(resource), { type: 'baseline', value: { projections: {} } }, banned),
      { kind: 'cancel-upstream', end: true }, JSON.stringify(resource));
  }
});

test('S13: the ready frame carries no Host field beyond home, and unknown top-level fields are fenced', () => {
  const ready = { type: 'ready', clientId: 'c', host: { home: '/root', hostname: 'prod1', user: 'root' }, note: 'x', sessionId: 'sess-foreign' };
  assert.deepEqual(filterDown(events(), ready, seat()), { kind: 'drop' }, 'a ready naming a foreign session is held back whole');
  const { sessionId: _s, ...plain } = ready;
  assert.deepEqual(filterDown(events(), plain, seat()),
    { kind: 'replace', value: { note: 'x', type: 'ready', clientId: 'c', host: { home: '/workspaces/mine' } } });
});

test('J2: a rows frame keeps its other fields, fenced, beside the filtered jobs', () => {
  const state = createStreamState({ kind: 'job-list', sessionId: 'sess-mine' });
  assert.deepEqual(filterDown(state, { type: 'rows', jobs: [], cursor: 7, sessionIds: ['sess-mine', 'sess-foreign'] }, seat()),
    { kind: 'replace', value: { cursor: 7, sessionIds: ['sess-mine'], type: 'rows', jobs: [] } });
});

test('Q13: a session/follow whose args carry anything beside the request is refused', () => {
  assert.equal(decideOpen({ streamId: 'f', endpoint: 'session/follow',
    payload: { args: { request: { address: { kind: 'session', sessionId: 'sess-mine' } }, extra: 1 } } }, seat(), carrier()).kind, 'refuse');
});

// ── Regression through a real gateway: what upstream 2.7.7 already does for C1, C2 and Q18 ──
// No Tracy code is copied for these; the cases pin upstream's behaviour under the Tracy default
// policy, so an upstream bump that loses it fails here. A dsh mock answers the streams and
// `session.list`; the seat holds `sess-mine` and `sess-arch` (archived) in `/workspaces/mine`.
describe('regression through the gateway (upstream behaviour, Tracy policy on)', () => {
  const SECRET = 'streams-secret';
  let tempDir = '';
  let db: Database;
  let gateway: http.Server;
  let dsh: http.Server;
  let port = 0;
  let omitPinned = false;
  const ids = (list: string[]) => list;
  const tokenFor = (seatId: number, name: string) =>
    `dsh_gateway_token=${jwt.sign({ sub: String(seatId), username: name, cv: 0 }, SECRET, { expiresIn: '1h' })}`;

  function startDsh(): Promise<http.Server> {
    const mux = new WebSocketServer({ noServer: true });
    mux.on('connection', (client: any) => {
      client.on('message', (data: Buffer) => {
        const frame = JSON.parse(data.toString()) as { type?: string; streamId?: string; endpoint?: string };
        if (frame.type !== 'open') return;
        const send = (value: unknown): void => client.send(JSON.stringify({ type: 'item', streamId: frame.streamId, value }));
        if (frame.endpoint === 'workspace/follow') {
          send({ type: 'baseline', value: {
            items: [
              { workspaceId: 'w-mine', path: '/workspaces/mine', title: 'mine', sessionIds: ids(['sess-mine', 'sess-arch', 'sess-foreign']) },
              { workspaceId: 'w-hidden', path: '/workspaces/hidden', title: 'hidden', sessionIds: ids(['sess-hidden']) },
            ],
            archivedSessionIds: ['sess-arch', 'sess-foreign', 'sess-hidden'],
            ...(omitPinned ? {} : { pinnedSessionIds: ['sess-mine', 'sess-foreign', 'sess-hidden'] }),
          } });
          send({ type: 'pinned', pinnedSessionIds: ['sess-arch', 'sess-hidden'] });
        } else if (frame.endpoint === 'session/control') {
          const table = { 'sess-mine': { n: 1 }, 'sess-foreign': { n: 2 }, 'sess-hidden': { n: 3 } };
          send({ type: 'baseline', value: { projections: table, jobs: table, queues: table } });
        }
      });
    });
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify((req.url ?? '').startsWith('/api/session') ? { items: [
          { sessionId: 'sess-mine', cwd: '/workspaces/mine', title: 'mine' },
          { sessionId: 'sess-arch', cwd: '/workspaces/mine', title: 'archived' },
          { sessionId: 'sess-foreign', cwd: '/workspaces/mine', title: 'foreign' },
          { sessionId: 'sess-hidden', cwd: '/workspaces/hidden', title: 'hidden' },
        ] } : { ok: true }));
      });
    });
    server.on('upgrade', (req, socket, head) => {
      if ((req.url ?? '').startsWith('/api/remote.mux')) mux.handleUpgrade(req, socket, head, (c: any) => mux.emit('connection', c, req));
      else socket.destroy();
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
  }

  function createSeat(name: string): string {
    const user = db.createUser(name, '$2a$10$dummyhashdummyhashdummyhashdu', 'user');
    db.setPermissions(user.id, {
      allowedFolders: ['/workspaces/mine'], hourlyTokenLimit: null, dailyMinutesLimit: null,
      allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
      allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: [], allowedSessionIds: ['sess-mine', 'sess-arch'],
    } as any);
    tracyStoreOf(db)!.setSeatRole(user.id, 'editor');
    tracyStoreOf(db)!.writeMasterGrants(user.id, ['sess-mine', 'sess-arch']);
    return tokenFor(user.id, name);
  }

  function openMux(cookie: string): Promise<{ client: any; next: (label: string) => Promise<Record<string, any>> }> {
    return new Promise((resolve, reject) => {
      const client = new NodeWebSocket(`ws://127.0.0.1:${port}/api/remote.mux`, { headers: { cookie, origin: 'http://127.0.0.1', host: '127.0.0.1' } });
      const frames: Array<Record<string, any>> = [];
      const waiters: Array<(f: Record<string, any>) => void> = [];
      client.on('message', (data: Buffer) => {
        const f = JSON.parse(data.toString());
        const w = waiters.shift();
        if (w) w(f); else frames.push(f);
      });
      client.once('error', reject);
      client.once('open', () => resolve({
        client,
        next: (label) => new Promise((res, rej) => {
          const f = frames.shift();
          if (f) { res(f); return; }
          const timer = setTimeout(() => rej(new Error(`${label}: frame timeout`)), 3000);
          waiters.push((frame) => { clearTimeout(timer); res(frame); });
        }),
      }));
    });
  }

  function sessionList(cookie: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port, method: 'POST', path: '/api/session.list',
        headers: { cookie, origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json' },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end('{}');
    });
  }

  const openStream = (client: any, streamId: string, endpoint: string) =>
    client.send(JSON.stringify({ type: 'open', streamId, endpoint, payload: { args: {} } }));

  before(async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'tracy-streams-'));
    db = new Database(path.join(tempDir, 't.db'), createFieldCrypto('k', 'k'));
    db.init();
    db.createUser('owner', '$2a$10$dummyhashdummyhashdummyhashdu', 'admin');
    dsh = await startDsh();
    const config: PlatformConfig = {
      setupKey: 'x', dbPath: path.join(tempDir, 't.db'), dbEncKey: 'k',
      gateway: {
        host: '127.0.0.1', port: 0, upstream: `http://127.0.0.1:${(dsh.address() as any).port}`,
        tls: null, redirectPort: null, publicHost: '', domain: 'localhost', autoTls: false, acmeEmail: '', acmeStaging: false,
      },
      jwtSecret: SECRET, internalSecret: 'internal', patch: { dshRoot: '', restartService: '' }, endpointRules: [],
    };
    gateway = createGatewayServer(config, new AuthService(config, db), db);
    await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', () => r()));
    port = (gateway.address() as any).port;
  });

  after(() => {
    gateway?.close();
    dsh?.close();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('C2: the workspace/follow baseline carries pinnedSessionIds of held sessions only, and the pinned frame is filtered alike', async () => {
    omitPinned = false;
    const { client, next } = await openMux(createSeat('c2-seat'));
    try {
      openStream(client, 'wf', 'workspace/follow');
      const baseline = (await next('baseline')).value;
      assert.equal(baseline.type, 'baseline');
      assert.deepEqual(baseline.value.items.map((w: any) => w.workspaceId), ['w-mine']);
      assert.deepEqual(baseline.value.items[0].sessionIds, ['sess-mine', 'sess-arch']);
      assert.deepEqual(baseline.value.pinnedSessionIds, ['sess-mine']);
      assert.deepEqual(baseline.value.archivedSessionIds, ['sess-arch']);
      assert.deepEqual((await next('pinned')).value, { type: 'pinned', pinnedSessionIds: ['sess-arch'] });
    } finally { client.close(); }
  });

  test('C2: a baseline without pinnedSessionIds (older dsh) reaches the seat without one; none is invented', async () => {
    omitPinned = true;
    const { client, next } = await openMux(createSeat('c2-old-seat'));
    try {
      openStream(client, 'wf', 'workspace/follow');
      const baseline = (await next('baseline')).value;
      assert.equal(Object.hasOwn(baseline.value, 'pinnedSessionIds'), false);
    } finally { client.close(); omitPinned = false; }
  });

  test('C1: the session/control baseline reaches the seat with projections, jobs and queues held to its sessions', async () => {
    const { client, next } = await openMux(createSeat('c1-seat'));
    try {
      openStream(client, 'wf', 'workspace/follow');
      await next('baseline');
      await next('pinned');
      openStream(client, 'ctl', 'session/control');
      const baseline = (await next('control baseline')).value;
      assert.deepEqual(baseline, { type: 'baseline', value: {
        queues: { 'sess-mine': { n: 1 } }, jobs: { 'sess-mine': { n: 1 } }, projections: { 'sess-mine': { n: 1 } },
      } });
    } finally { client.close(); }
  });

  test('Q18: after the workspace/follow baseline, session.list answers 200 with held, unarchived sessions only', async () => {
    const cookie = createSeat('q18-seat');
    const { client, next } = await openMux(cookie);
    try {
      openStream(client, 'wf', 'workspace/follow');
      await next('baseline');
      const res = await sessionList(cookie);
      assert.equal(res.status, 200, res.body.slice(0, 300));
      assert.deepEqual(JSON.parse(res.body).items.map((s: any) => s.sessionId), ['sess-mine']);
    } finally { client.close(); }
  });

  test('Q18: before any baseline, session.list answers 503 BASELINE_PENDING, never the unfiltered list', async () => {
    const res = await sessionList(createSeat('q18-early-seat'));
    assert.equal(res.status, 503);
    assert.equal(JSON.parse(res.body).code, 'BASELINE_PENDING');
    assert.ok(!res.body.includes('sess-'), 'no session id in the answer');
  });
});
