// `POST /api/job/kill` of a seat (J1): dsh fences the lookup by session but lets any session kill an
// unowned job, so the gate admits a kill only for a job it showed this seat, under that session, on
// the seat's own FILTERED job streams. The book is learned by the carrier (`mux-seat.ts`); the HTTP
// refusal runs in the proxy handler on the parsed body, before any byte is forwarded (proxy-hooks.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobOwnerBook, createSeatMux, type SeatMuxSource } from '../../src/tracy/mux-seat.js';
import { decideSeatJobKill } from '../../src/tracy/streams.js';
import http from 'node:http';
import { tracyPolicy } from '../../src/tracy/index.js';
import { gatewayRequest, muxWithBaseline, startFixture } from './stream-harness.js';

const SEAT = 7;

function source(grants: Set<string>, jobs = createJobOwnerBook()): SeatMuxSource {
  return {
    userId: SEAT,
    db: {
      hasUserSessionGrant: (_u, id) => grants.has(id),
      isSessionGrantsSeeded: () => true,
      getUserById: () => ({ credential_version: 0 }),
    },
    effectivePermissions: () => ({ banned: false, allowed_folders: ['/work/alpha'], disabled_sessions: [] }),
    authorizedSubuserSessionRoot: (_u, id) => (typeof id === 'string' && grants.has(id) ? '/work/alpha' : null),
    userSessionAccess: new Map([[SEAT, new Map([...grants].map((id) => [id, '/work/alpha']))]]),
    userWorkspaceIds: new Map([[SEAT, new Set(['w-alpha'])]]),
    jobs,
  };
}

const output = { total: 3, earliest: 0 };
const rows = {
  type: 'rows',
  jobs: [
    { id: 'mine-job', owner: 'sess-mine', output },
    { id: 'unowned-job', output },
    { id: 'foreign-job', owner: 'sess-foreign', output },
  ],
};

/** Open `job/list` for sess-mine on a fresh carrier and pass it `value` as upstream filtered it. */
function showRows(src: SeatMuxSource, filtered: unknown): void {
  const mux = createSeatMux(tracyPolicy, src);
  const open = mux.clientFrame({ type: 'open', streamId: 'jobs', endpoint: 'job/list', payload: { args: { request: { sessionId: 'sess-mine' } } } }, true, false);
  assert.equal(open.kind, 'pass');
  mux.item('jobs', rows, filtered);
}

const kill = (src: SeatMuxSource, request: Record<string, unknown> | null) =>
  decideSeatJobKill({ jobs: src.jobs, userId: SEAT, request, holdsSession: (id) => src.db.hasUserSessionGrant(SEAT, id) });

test('J1: a seat kills a job its own job/list showed it, under that session', () => {
  const src = source(new Set(['sess-mine']));
  showRows(src, rows);
  assert.deepEqual(kill(src, { sessionId: 'sess-mine', jobId: 'mine-job' }), { kind: 'pass' });
});

test('J1: a job never shown, one dsh lists unowned, and another session\'s are refused alike', () => {
  const src = source(new Set(['sess-mine']));
  showRows(src, rows);
  for (const jobId of ['unowned-job', 'foreign-job', 'never-seen']) {
    assert.equal(kill(src, { sessionId: 'sess-mine', jobId }).kind, 'deny', jobId);
  }
  assert.equal(src.jobs.ownerOf(SEAT, 'foreign-job'), undefined, 'only what reached the seat is learned');
});

test('J1: a job shown under one session cannot be killed under another, nor once the session is taken back', () => {
  const grants = new Set(['sess-mine', 'sess-other']);
  const src = source(grants);
  showRows(src, rows);
  assert.equal(kill(src, { sessionId: 'sess-other', jobId: 'mine-job' }).kind, 'deny');
  grants.delete('sess-mine');
  assert.equal(kill(src, { sessionId: 'sess-mine', jobId: 'mine-job' }).kind, 'deny');
});

test('J1: a malformed kill is refused; and another seat is never answered from this seat\'s book', () => {
  const src = source(new Set(['sess-mine']));
  showRows(src, rows);
  for (const request of [null, {}, { sessionId: 'sess-mine' }, { jobId: 'mine-job' }, { sessionId: '', jobId: 'mine-job' }, { sessionId: 'sess-mine', jobId: 7 }]) {
    assert.equal(kill(src, request as Record<string, unknown> | null).kind, 'deny', JSON.stringify(request));
  }
  assert.equal(decideSeatJobKill({ jobs: src.jobs, userId: SEAT + 1, request: { sessionId: 'sess-mine', jobId: 'mine-job' }, holdsSession: () => true }).kind, 'deny');
});

test('J1: a job/follow opened/status of its own job teaches the book; a foreign projection does not', () => {
  const src = source(new Set(['sess-mine']));
  const mux = createSeatMux(tracyPolicy, src);
  mux.clientFrame({ type: 'open', streamId: 'f1', endpoint: 'job/follow', payload: { args: { request: { sessionId: 'sess-mine', jobId: 'mine-job' } } } }, true, false);
  mux.clientFrame({ type: 'open', streamId: 'f2', endpoint: 'job/follow', payload: { args: { request: { sessionId: 'sess-mine', jobId: 'foreign-job' } } } }, true, false);
  const opened = (id: string, owner: string) => ({ type: 'opened', from: 0, job: { id, owner, output } });
  assert.equal(mux.item('f1', opened('mine-job', 'sess-mine'), opened('mine-job', 'sess-mine')).kind, 'send');
  assert.equal(mux.item('f2', opened('foreign-job', 'sess-foreign'), opened('foreign-job', 'sess-foreign')).kind, 'drop');
  assert.equal(src.jobs.ownerOf(SEAT, 'mine-job'), 'sess-mine');
  assert.equal(src.jobs.ownerOf(SEAT, 'foreign-job'), undefined);
});

test('J1: the book is bounded per seat; the oldest job is forgotten first', async () => {
  const { JOBS_PER_SEAT_MAX } = await import('../../src/tracy/mux-seat.js');
  const book = createJobOwnerBook();
  for (let i = 0; i <= JOBS_PER_SEAT_MAX; i += 1) book.learn(SEAT, `job-${i}`, 'sess-mine');
  assert.equal(book.ownerOf(SEAT, 'job-0'), undefined);
  assert.equal(book.ownerOf(SEAT, `job-${JOBS_PER_SEAT_MAX}`), 'sess-mine');
});

// Through a real gateway: the book the seat's own job/list taught is what `POST /api/job/kill` reads.
const killBody = (request: Record<string, unknown>) =>
  JSON.stringify({ type: 'client-request', rpcId: 'kill', method: 'job/kill', payload: { args: { request } } });

test('J1 (gateway): a seat\'s kill of another session\'s job, or of a job never shown, is 403 and never reaches dsh; its own job does', async () => {
  const fx = await startFixture();
  try {
    const seat = fx.createSeat('killer');
    const mux = await muxWithBaseline(fx, seat.cookie);
    mux.open('jobs', 'job/list', { request: { sessionId: 'sess-mine' } });
    await mux.waitFor('rows', (f) => f.streamId === 'jobs' && f.value?.type === 'rows');
    const kills = () => fx.httpSaw.filter((url) => /^\/api\/job[./]kill/.test(url)).length;
    for (const request of [
      { sessionId: 'sess-foreign', jobId: 'foreign-job' },
      { sessionId: 'sess-mine', jobId: 'foreign-job' },
      { sessionId: 'sess-mine', jobId: 'never-seen' },
      { sessionId: 'sess-mine', jobId: 'unowned-job' },
    ]) {
      const refused = await gatewayRequest(fx, 'POST', '/api/job/kill', seat.cookie, killBody(request));
      assert.equal(refused.status, 403, JSON.stringify(request));
      assert.doesNotMatch(refused.body, /foreign-job|never-seen|unowned-job/, 'the refusal names no job');
      assert.equal(kills(), 0, `${JSON.stringify(request)} reached dsh`);
    }
    const own = await gatewayRequest(fx, 'POST', '/api/job/kill', seat.cookie, killBody({ sessionId: 'sess-mine', jobId: 'mine-job' }));
    assert.equal(own.status, 200, own.body);
    assert.equal(kills(), 1);
    // The master is not a seat: its kill is upstream's to judge.
    const master = await gatewayRequest(fx, 'POST', '/api/job/kill', fx.ownerCookie, killBody({ sessionId: 'sess-foreign', jobId: 'foreign-job' }));
    assert.equal(master.status, 200, master.body);
    await mux.close();
  } finally {
    await fx.close();
  }
});

test('J1 (gateway): a kill that is not a JSON POST is refused before dsh, even when its query names a held session', async () => {
  const fx = await startFixture();
  try {
    const seat = fx.createSeat('killer-raw');
    const mux = await muxWithBaseline(fx, seat.cookie);
    const kills = () => fx.httpSaw.filter((url) => /^\/api\/job[./]kill/.test(url)).length;
    const raw = (method: string, url: string, contentType: string) => new Promise<number>((resolve, reject) => {
      const body = killBody({ sessionId: 'sess-mine', jobId: 'foreign-job' });
      const req = http.request({ host: '127.0.0.1', port: fx.port, method, path: url,
        headers: { cookie: seat.cookie, origin: `http://127.0.0.1:${fx.port}`, 'content-type': contentType, 'content-length': String(Buffer.byteLength(body)) } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
      req.on('error', reject);
      req.end(body);
    });
    for (const [method, url, type] of [
      ['POST', '/api/job/kill?sessionId=sess-mine', 'text/plain'],
      ['POST', '/api/job.kill?sessionId=sess-mine', 'application/octet-stream'],
      ['PUT', '/api/job/kill?sessionId=sess-mine', 'application/json'],
    ] as const) {
      const status = await raw(method, url, type);
      assert.ok(status >= 400, `${method} ${url} ${type} answered ${String(status)}`);
    }
    assert.equal(kills(), 0, 'a kill reached dsh unjudged');
    await mux.close();
  } finally {
    await fx.close();
  }
});
