// Hooks H4/H5 on a seat's Remote mux carrier, through a real gateway: ported from the 2.6.6 fork's
// gateway-remote-mux-streams / -events / -control and workspace-follow-pinned suites, re-read
// against upstream 2.7.7 (a seat's emits and questions now need the workspace baseline first, as
// upstream's own `$events` filter requires). Every refusal asserts what dsh received, not only the
// error the seat got.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDshRefusal, connectMux, delay, muxWithBaseline, sawFor, startFixture, type Fixture, type Frame,
} from './stream-harness.js';

let fx: Fixture;
before(async () => { fx = await startFixture(); });
after(async () => { await fx.close(); });

const itemsOf = (frames: Frame[], streamId: string) => frames.filter((f) => f.streamId === streamId && f.type === 'item').map((f) => f.value);

// ── H4: open ────────────────────────────────────────────────────────────────

test('J1: job/list of a session the seat does not hold is refused for that stream; the carrier and its other streams live on', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('j1-list-foreign').cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('jobs', 'job/list', { request: { sessionId: 'sess-foreign' } });
    assertDshRefusal(await mux.waitFor('refusal', (f) => f.streamId === 'jobs'), 'jobs');
    mux.open('ctl', 'session/control');
    await mux.waitFor('control baseline', (f) => f.streamId === 'ctl' && f.value?.type === 'baseline');
    assert.deepEqual(sawFor(fx, 'jobs', from), []);
  } finally { await mux.close(); }
});

test('V5: a plugin stream upstream would forward raw is refused for that stream; dsh sees no open and the seat no plugin byte', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('v5-plugin').cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('plug', 'foo/bar');
    assertDshRefusal(await mux.waitFor('refusal', (f) => f.streamId === 'plug'), 'plug', 'foo/bar');
    await delay(50);
    assert.deepEqual(sawFor(fx, 'plug', from), [], '0 open frames reached dsh');
    assert.equal(mux.raw.join('').includes('PLUGIN-BYTES'), false);
  } finally { await mux.close(); }
});

test('C8: userQuestions/attachWait and productAnalytics/watchPolicy are refused per stream, never forwarded', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('c8-endpoints').cookie);
  try {
    const from = fx.muxSaw.length;
    mux.send({ type: 'open', streamId: 'wait', endpoint: 'userQuestions/attachWait', payload: { args: { agentId: 'sess-mine', callId: 'call-1' } } });
    mux.open('policy', 'productAnalytics/watchPolicy');
    mux.open('ev', '$events');
    await mux.waitFor('$events ready', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
    for (const [id, endpoint] of [['wait', 'userQuestions/attachWait'], ['policy', 'productAnalytics/watchPolicy']] as const) {
      const frames = mux.frames.filter((f) => f.streamId === id);
      assert.equal(frames.length, 1, `${endpoint}: exactly one frame`);
      // Upstream refuses the 0.2.0 endpoints it does not know before H4; either code, the shape holds.
      assertDshRefusal(frames[0]!, id);
    }
    assert.deepEqual(fx.muxSaw.slice(from).filter((f) => f.type === 'open').map((f) => f.endpoint), ['$events'], 'only $events reached dsh');
  } finally { await mux.close(); }
});

test('C7/Q13: a subagent follow is checked against its PARENT session', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('c7-subagent').cookie);
  try {
    const sub = (parentSessionId: string) => ({ request: { address: { kind: 'subagent', parentSessionId, childSessionId: 'child-1', mode: 'one-shot' } } });
    mux.open('mine', 'session/follow', sub('sess-mine'));
    mux.open('theirs', 'session/follow', sub('sess-foreign'));
    await mux.waitFor('own subagent snapshot', (f) => f.streamId === 'mine' && f.value?.type === 'snapshot');
    assertDshRefusal(await mux.waitFor('foreign parent refused', (f) => f.streamId === 'theirs'), 'theirs');
  } finally { await mux.close(); }
});

test('V4: a late upstream frame for a cancelled stream is dropped; the cancel reaches dsh and the socket survives', async () => {
  fx.scripts['session/control'] = (_frame, send) => {
    setTimeout(() => send({ type: 'baseline', value: { projections: {} } }), 150);
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('v4-late').cookie);
  try {
    mux.open('ctl-1', 'session/control');
    await delay(40);
    mux.send({ type: 'cancel', streamId: 'ctl-1' });
    mux.open('ctl-2', 'session/control');
    await mux.waitFor('replacement baseline', (f) => f.streamId === 'ctl-2' && f.value?.type === 'baseline');
    await delay(200);
    assert.ok(fx.muxSaw.some((f) => f.type === 'cancel' && f.streamId === 'ctl-1'), 'the cancel reached dsh');
    assert.deepEqual(mux.frames.filter((f) => f.streamId === 'ctl-1'), [], 'nothing of the cancelled stream reached the seat');
    assert.equal(mux.ws.readyState, 1);
  } finally { delete fx.scripts['session/control']; await mux.close(); }
});

test('V4: a cancelled id reopened as session/follow is refused, and the old stream\'s frames never arrive', async () => {
  fx.scripts['session/control'] = (_frame, send) => {
    setTimeout(() => send({ type: 'baseline', value: { projections: { 'sess-foreign': { title: 'FOREIGN-TITLE' } } } }), 150);
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('v4-reuse').cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('ctl-1', 'session/control');
    await delay(40);
    // The whole attack in one write: cancel the host-wide stream and claim its id for a session stream.
    mux.send({ type: 'cancel', streamId: 'ctl-1' });
    mux.open('ctl-1', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    await delay(400);
    const mine = mux.frames.filter((f) => f.streamId === 'ctl-1');
    assert.equal(mine.length, 1, `only the refusal, saw ${JSON.stringify(mine)}`);
    assertDshRefusal(mine[0]!, 'ctl-1', 'session/follow');
    assert.equal(mux.raw.join('').includes('FOREIGN-TITLE'), false);
    assert.equal(fx.muxSaw.slice(from).some((f) => f.type === 'open' && f.streamId === 'ctl-1' && f.endpoint === 'session/follow'), false,
      'the refused reopen never reached dsh');
  } finally { delete fx.scripts['session/control']; await mux.close(); }
});

test('V4: a fresh id after a cancel is served as always; only the cancelled id is held back', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('v4-fresh').cookie);
  try {
    mux.open('ctl-1', 'session/control');
    await mux.waitFor('first baseline', (f) => f.streamId === 'ctl-1' && f.value?.type === 'baseline');
    mux.send({ type: 'cancel', streamId: 'ctl-1' });
    mux.open('ctl-2', 'session/control');
    mux.open('flw-1', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    await mux.waitFor('replacement baseline', (f) => f.streamId === 'ctl-2' && f.value?.type === 'baseline');
    await mux.waitFor('granted follow snapshot', (f) => f.streamId === 'flw-1' && f.value?.type === 'snapshot');
  } finally { await mux.close(); }
});

test('V4: once dsh ends the cancelled stream, its id may be opened again', async () => {
  fx.scripts['session/control'] = (frame, send, raw) => {
    send({ type: 'baseline', value: { projections: {} } });
    void raw;
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('v4-released').cookie);
  try {
    mux.open('ctl-1', 'session/control');
    await mux.waitFor('first baseline', (f) => f.streamId === 'ctl-1' && f.value?.type === 'baseline');
    mux.send({ type: 'cancel', streamId: 'ctl-1' });
    await delay(30);
    for (const socket of fx.muxSockets) socket.send(JSON.stringify({ type: 'end', streamId: 'ctl-1' }));
    await delay(30);
    const before = mux.frames.length;
    mux.open('ctl-1', 'session/control');
    await mux.waitFor('baseline on the released id', (f) => mux.frames.indexOf(f) >= before && f.streamId === 'ctl-1' && f.value?.type === 'baseline');
  } finally { delete fx.scripts['session/control']; await mux.close(); }
});

test('upstream kept: a frame for a stream id nobody opened is dropped and the socket lives (2.7.7); a malformed client frame closes it 1008', async () => {
  fx.scripts['$events'] = (frame, send, raw) => {
    raw({ type: 'item', streamId: 'never-opened', value: { type: 'baseline', secret: 'GHOST-BYTES' } });
    send({ type: 'ready', clientId: `client-${frame.streamId}`, host: { home: '/root' } });
  };
  const ghost = await muxWithBaseline(fx, fx.createSeat('ghost').cookie);
  try {
    ghost.open('ev', '$events');
    await ghost.waitFor('ready after the ghost frame', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
    assert.equal(ghost.raw.join('').includes('GHOST-BYTES'), false);
    assert.equal(ghost.ws.readyState, 1);
  } finally { delete fx.scripts['$events']; await ghost.close(); }
  const bad = await connectMux(fx, fx.createSeat('malformed').cookie);
  bad.send('{"type":"open","streamId":"x"');
  assert.deepEqual(await bad.closed, { code: 1008, reason: 'invalid Remote stream request' });
});

// ── H5: downlink ────────────────────────────────────────────────────────────

test('J2: job/list rows keep only jobs owned by the stream\'s session, without host spill paths', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('j2-list').cookie);
  try {
    mux.open('jobs', 'job/list', { request: { sessionId: 'sess-mine' } });
    const rows = (await mux.waitFor('rows', (f) => f.streamId === 'jobs' && f.value?.type === 'rows')).value;
    assert.deepEqual(rows.jobs.map((job: any) => job.id), ['mine-job']);
    assert.equal(rows.jobs[0].output.spillPaths, undefined);
    assert.equal(mux.raw.join('').includes('/host/private'), false, '0 bytes of a host path');
  } finally { await mux.close(); }
});

test('J2/J3: job/follow of its own job: opened without spill paths, then output, then status', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('j3-own').cookie);
  try {
    mux.open('follow', 'job/follow', { request: { sessionId: 'sess-mine', jobId: 'mine-job', from: 0 } });
    await mux.waitFor('status', (f) => f.streamId === 'follow' && f.value?.type === 'status');
    const values = itemsOf(mux.frames, 'follow');
    assert.deepEqual(values.map((v) => v.type), ['opened', 'output', 'status']);
    assert.equal(values[0].job.output.spillPaths, undefined);
    assert.deepEqual(values[1], { type: 'output', chunks: [{ at: 0, text: 'abc' }], next: 3 });
    assert.equal(mux.raw.join('').includes('/host/private'), false);
  } finally { await mux.close(); }
});

test('J3: job/follow naming another session\'s job gets 0 frames of it: no opened, no output byte, no status', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('j3-foreign').cookie);
  try {
    mux.open('ff', 'job/follow', { request: { sessionId: 'sess-mine', jobId: 'foreign-job' } });
    mux.open('ev', '$events');
    await mux.waitFor('a later stream answered', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
    await delay(50);
    assert.deepEqual(itemsOf(mux.frames, 'ff'), []);
    assert.equal(mux.raw.join('').includes('abc'), false, '0 bytes of the foreign job output');
  } finally { await mux.close(); }
});

test('J3: output sent before the job\'s own opened frame reaches the seat as 0 bytes', async () => {
  fx.scripts['job/follow'] = (frame, send) => {
    send({ type: 'output', chunks: [{ at: 0, text: 'EARLY-LEAK' }], next: 10 });
    send({ type: 'opened', from: 10, job: { id: 'mine-job', owner: 'sess-mine', output: { total: 10, earliest: 0 } } });
    send({ type: 'output', chunks: [{ at: 10, text: 'after-open' }], next: 20 });
    void frame;
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('j3-early').cookie);
  try {
    mux.open('jf', 'job/follow', { request: { sessionId: 'sess-mine', jobId: 'mine-job' } });
    await mux.waitFor('output after opened', (f) => f.streamId === 'jf' && f.value?.type === 'output');
    assert.equal(mux.raw.join('').includes('EARLY-LEAK'), false);
  } finally { delete fx.scripts['job/follow']; await mux.close(); }
});

test('J4: a job stream whose grant is taken back mid-stream is cancelled upstream and ended for the seat; nothing of it after', async () => {
  let push: ((value: unknown) => void) | null = null;
  fx.scripts['job/follow'] = (_frame, send) => {
    send({ type: 'opened', from: 0, job: { id: 'mine-job', owner: 'sess-mine', output: { total: 0, earliest: 0 } } });
    push = send;
  };
  const seat = fx.createSeat('j4-revoke');
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    mux.open('jf', 'job/follow', { request: { sessionId: 'sess-mine', jobId: 'mine-job' } });
    await mux.waitFor('opened', (f) => f.streamId === 'jf' && f.value?.type === 'opened');
    fx.db.replaceUserSessionGrants(seat.id, []);
    push!({ type: 'output', chunks: [{ at: 0, text: 'AFTER-REVOKE' }], next: 12 });
    await mux.waitFor('end', (f) => f.streamId === 'jf' && f.type === 'end');
    push!({ type: 'output', chunks: [{ at: 12, text: 'LATER' }], next: 17 });
    await delay(60);
    assert.ok(fx.muxSaw.some((f) => f.type === 'cancel' && f.streamId === 'jf'), 'dsh got the cancel');
    assert.equal(mux.raw.join('').includes('AFTER-REVOKE'), false);
    assert.equal(mux.raw.join('').includes('LATER'), false);
    assert.equal(mux.ws.readyState, 1, 'the carrier lives on');
  } finally { delete fx.scripts['job/follow']; await mux.close(); }
});

test('J4/Q13: a session/follow whose grant is taken back mid-stream ends the same way', async () => {
  let push: ((value: unknown) => void) | null = null;
  fx.scripts['session/follow'] = (frame, send) => {
    send({ type: 'snapshot', header: { id: frame.payload.args.request.address.sessionId, origin: 'user' }, records: [] });
    push = send;
  };
  const seat = fx.createSeat('j4-follow-revoke');
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    mux.open('sf', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    await mux.waitFor('snapshot', (f) => f.streamId === 'sf' && f.value?.type === 'snapshot');
    fx.db.replaceUserSessionGrants(seat.id, []);
    push!({ type: 'event', record: { text: 'AFTER-REVOKE' } });
    await mux.waitFor('end', (f) => f.streamId === 'sf' && f.type === 'end');
    assert.equal(mux.raw.join('').includes('AFTER-REVOKE'), false);
  } finally { delete fx.scripts['session/follow']; await mux.close(); }
});

test('S13: the $events ready frame reaches the seat once, with host.home replaced by its first folder', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('s13-ready').cookie);
  try {
    mux.open('ev', '$events');
    const ready = (await mux.waitFor('ready', (f) => f.streamId === 'ev' && f.value?.type === 'ready')).value;
    assert.deepEqual(ready, { type: 'ready', clientId: 'client-ev', host: { home: '/work/alpha' } });
    assert.equal(mux.raw.join('').includes('/root'), false, 'the Host home never reaches a seat');
  } finally { await mux.close(); }
});

test('Q17: $events delivers only api-session/status of a held, enabled session, well formed', async () => {
  const status = (sessionId: unknown, running: unknown) => ({ type: 'emit', event: 'api-session/status', args: [sessionId, running] });
  fx.scripts['$events'] = (frame, send) => {
    send({ type: 'ready', clientId: `client-${frame.streamId}`, host: { home: '/root' } });
    for (const value of [
      status('sess-mine', true), status('sess-foreign', false), status('sess-off', false), status('sess-mine', 'no'),
      { type: 'emit', event: 'api-session/status', args: ['sess-mine', false, 'extra'] },
      { type: 'emit', event: 'api-session/error', args: ['sess-mine', 'boom'] },
      { type: 'emit', event: 'api-session/activity', args: ['sess-mine', { text: 'ACTIVITY' }] },
      status('sess-mine', false),
    ]) send(value);
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('q17-emits').cookie);
  try {
    mux.open('ev', '$events');
    await delay(150);
    assert.deepEqual(itemsOf(mux.frames, 'ev').filter((v) => v.type === 'emit'), [status('sess-mine', true), status('sess-mine', false)]);
  } finally { delete fx.scripts['$events']; await mux.close(); }
});

test('Q16: a question reaches the seat only for a session it can answer; approvals and foreign questions stay hidden', async () => {
  const waterfall = (event: string, agentId: string) => ({
    type: 'waterfall', event, eventId: `ev-${event}-${agentId}`, agentId,
    request: { questions: [{ id: 'q1', prompt: 'Which colour?', options: [{ id: 'a', label: 'Red' }] }], wait: { callId: 'c', timed: true } },
  });
  fx.scripts['$events'] = (frame, send) => {
    send({ type: 'ready', clientId: `client-${frame.streamId}`, host: { home: '/root' } });
    send(waterfall('user-questions/request', 'sess-mine'));
    send(waterfall('user-questions/request', 'sess-foreign'));
    send(waterfall('user-questions/request', 'sess-off'));
    send(waterfall('approval/request', 'sess-mine'));
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('q16-questions').cookie);
  try {
    mux.open('ev', '$events');
    await delay(150);
    assert.deepEqual(itemsOf(mux.frames, 'ev').filter((v) => v.type === 'waterfall'), [waterfall('user-questions/request', 'sess-mine')]);
  } finally { delete fx.scripts['$events']; await mux.close(); }
});

test('Q14: a workspace/follow frame type this gate does not know is passed fenced: foreign ids out, own kept', async () => {
  fx.scripts['workspace/follow'] = (_frame, send) => {
    send({ type: 'baseline', value: { items: [{ workspaceId: 'w-alpha', path: '/work/alpha', title: 'alpha', sessionIds: ['sess-mine', 'sess-foreign'] }], archivedSessionIds: [] } });
    send({ type: 'tagged', tags: [{ sessionId: 'sess-mine', tag: 'mine' }, { sessionId: 'sess-foreign', tag: 'FOREIGN-TAG' }], sessionIds: ['sess-mine', 'sess-beta'] });
    send({ type: 'renamedWorkspace', workspaceId: 'w-beta', title: 'BETA-TITLE' });
  };
  const mux = await connectMux(fx, fx.createSeat('q14-unknown').cookie);
  try {
    mux.open('wf', 'workspace/follow');
    await mux.waitFor('fenced unknown frame', (f) => f.streamId === 'wf' && f.value?.type === 'tagged');
    await delay(60);
    const tagged = itemsOf(mux.frames, 'wf').find((v) => v.type === 'tagged');
    assert.deepEqual(tagged, { type: 'tagged', tags: [{ sessionId: 'sess-mine', tag: 'mine' }], sessionIds: ['sess-mine'] });
    assert.equal(mux.raw.join('').includes('FOREIGN-TAG'), false);
    assert.equal(mux.raw.join('').includes('BETA-TITLE'), false, 'a frame naming an unseen workspace is held back');
  } finally { delete fx.scripts['workspace/follow']; await mux.close(); }
});

test('Q10: a session/follow snapshot keeps no other person\'s prompter address', async () => {
  fx.scripts['session/follow'] = (frame, send) => send({
    type: 'snapshot', header: { id: frame.payload.args.request.address.sessionId, origin: 'user' },
    records: [{ role: 'user', prompter: { user: 'other', email: 'someone.else@example.com' }, text: 'hi' }],
  });
  const mux = await muxWithBaseline(fx, fx.createSeat('q10-follow').cookie);
  try {
    mux.open('sf', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    const snapshot = (await mux.waitFor('snapshot', (f) => f.streamId === 'sf' && f.value?.type === 'snapshot')).value;
    assert.deepEqual(snapshot.records[0].prompter, { user: 'other', email: null });
    assert.equal(mux.raw.join('').includes('someone.else@example.com'), false);
  } finally { delete fx.scripts['session/follow']; await mux.close(); }
});

test('H5: an error frame from dsh is rebuilt for the seat; details naming another session are not passed', async () => {
  fx.scripts['job/follow'] = (frame, _send, raw) => raw({
    type: 'error', streamId: frame.streamId,
    error: { code: 'job/not-found', message: 'job x of /work/beta/SECRET-NAME not found', details: { sessionId: 'sess-foreign', jobId: 'x', path: '/work/beta/SECRET' } },
  });
  const mux = await muxWithBaseline(fx, fx.createSeat('h5-error').cookie);
  try {
    mux.open('jf', 'job/follow', { request: { sessionId: 'sess-mine', jobId: 'x' } });
    const error = await mux.waitFor('error', (f) => f.streamId === 'jf' && f.type === 'error');
    assert.deepEqual(error, { type: 'error', streamId: 'jf', error: { code: 'job/not-found', message: 'Remote stream failed', details: {} } });
    assert.equal(mux.raw.join('').includes('SECRET'), false);
  } finally { delete fx.scripts['job/follow']; await mux.close(); }
});

test('C1: a session/control baseline without a projections record is dropped; with it, it reaches the seat held to its sessions', async () => {
  const mux = await muxWithBaseline(fx, fx.createSeat('c1-control').cookie);
  try {
    mux.open('ctl', 'session/control');
    const baseline = (await mux.waitFor('control baseline', (f) => f.streamId === 'ctl' && f.value?.type === 'baseline')).value;
    assert.deepEqual(baseline, { type: 'baseline', value: { queues: { 'sess-mine': { n: 1 } }, jobs: { 'sess-mine': { n: 1 } }, projections: { 'sess-mine': { n: 1 } } } });
  } finally { await mux.close(); }
  fx.scripts['session/control'] = (_frame, send) => send({ type: 'baseline', value: { jobs: {} } });
  const bare = await muxWithBaseline(fx, fx.createSeat('c1-bare').cookie);
  try {
    bare.open('ctl', 'session/control');
    bare.open('ev', '$events');
    await bare.waitFor('$events ready', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
    await delay(60);
    assert.deepEqual(itemsOf(bare.frames, 'ctl'), [], 'a baseline without projections is not passed');
  } finally { delete fx.scripts['session/control']; await bare.close(); }
});

test('C1: an alpha.2 control baseline without queues reaches the seat with its own jobs/projections only; a malformed one is dropped', async () => {
  fx.scripts['session/control'] = (_frame, send) => {
    send({ type: 'baseline', value: { projections: { 'sess-mine': { n: 1 }, 'sess-foreign': { n: 2 } }, jobs: { 'sess-mine': [], 'sess-beta': [] } } });
    send({ type: 'baseline', value: 'not-a-record' });
  };
  const mux = await muxWithBaseline(fx, fx.createSeat('c1-alpha2').cookie);
  try {
    mux.open('ctl', 'session/control');
    const baseline = (await mux.waitFor('control baseline', (f) => f.streamId === 'ctl' && f.value?.type === 'baseline')).value;
    assert.deepEqual(baseline, { type: 'baseline', value: { projections: { 'sess-mine': { n: 1 } }, jobs: { 'sess-mine': [] } } });
    await delay(60);
    assert.equal(itemsOf(mux.frames, 'ctl').length, 1, 'the malformed baseline is not passed');
    assert.equal(mux.raw.join('').includes('sess-foreign') || mux.raw.join('').includes('sess-beta'), false);
  } finally { delete fx.scripts['session/control']; await mux.close(); }
});

test('C2: a pinned frame is filtered like archived: held ids only; a malformed one is dropped', async () => {
  fx.scripts['workspace/follow'] = (_frame, send) => {
    send({ type: 'baseline', value: { items: [{ workspaceId: 'w-alpha', path: '/work/alpha', title: 'alpha', sessionIds: ['sess-mine', 'sess-foreign'] }], archivedSessionIds: [], pinnedSessionIds: ['sess-mine', 'sess-foreign'] } });
    send({ type: 'pinned', pinnedSessionIds: 'sess-foreign' });
    send({ type: 'pinned', pinnedSessionIds: ['sess-foreign', 'sess-mine'] });
  };
  const mux = await connectMux(fx, fx.createSeat('c2-pinned').cookie);
  try {
    mux.open('wf', 'workspace/follow');
    const baseline = (await mux.waitFor('baseline', (f) => f.streamId === 'wf' && f.value?.type === 'baseline')).value;
    assert.deepEqual(baseline.value.pinnedSessionIds, ['sess-mine']);
    const pinned = await mux.waitFor('pinned', (f) => f.streamId === 'wf' && f.value?.type === 'pinned');
    assert.deepEqual(pinned.value, { type: 'pinned', pinnedSessionIds: ['sess-mine'] });
    await delay(50);
    assert.equal(itemsOf(mux.frames, 'wf').filter((v) => v.type === 'pinned').length, 1);
  } finally { delete fx.scripts['workspace/follow']; await mux.close(); }
});
