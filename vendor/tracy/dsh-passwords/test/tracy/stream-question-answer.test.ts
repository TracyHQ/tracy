/**
 * Q16, the answer side: `POST /api/$events/result` of a seat is accepted once, for a question its
 * own open `$events` stream delivered, while the seat still holds that session and has the folders
 * it had at delivery. Ported from the 2.6.6 fork's `gateway-remote-mux-events.test.ts` (questions),
 * through a real gateway: a refused answer never reaches dsh (`fx.http` records every answer dsh got).
 */
import { after, before, test } from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';

import { type Fixture, type MuxClient, delay, gatewayRequest, muxWithBaseline, startFixture } from './stream-harness.js';

let fx: Fixture;
const answers: unknown[] = [];

before(async () => {
  fx = await startFixture();
  fx.http['/api/$events/result'] = (body, res) => {
    answers.push(JSON.parse(body));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ type: 'server-response', rpcId: 'r', result: { ok: true, value: {} } }));
  };
});

after(async () => { await fx.close(); });

const question = (eventId: string, agentId = 'sess-mine') => ({
  type: 'waterfall', event: 'user-questions/request', eventId, agentId,
  request: { questions: [{ id: 'source', prompt: 'HTML or URL?', options: [{ id: 'u', label: 'URL' }] }], wait: { callId: 'c', timed: true } },
});

/** A seat's mux with its baseline and an `$events` stream that delivered `frames`; returns its dsh client id. */
async function delivered(cookie: string, frames: unknown[]): Promise<{ mux: MuxClient; clientId: string }> {
  fx.scripts['$events'] = (frame, send) => {
    send({ type: 'ready', clientId: `client-${frame.streamId}-${Math.random().toString(36).slice(2)}`, host: { home: '/root' } });
    for (const value of frames) send(value);
  };
  const mux = await muxWithBaseline(fx, cookie);
  mux.open('ev', '$events');
  const ready = await mux.waitFor('ready', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
  await delay(80);
  delete fx.scripts['$events'];
  return { mux, clientId: String(ready.value.clientId) };
}

const envelope = (clientId: string, eventId: string, kind = 'result') => ({
  type: 'client-request', rpcId: 'question-answer-rpc', method: '$events/result',
  payload: { args: { clientId, eventId, outcome: { kind, value: { answers: [{ id: 'source', selected: ['URL'] }] } } } },
});
/** An answer through the gateway; a refusal must carry none of dsh's answer bytes. */
async function reply(cookie: string, body: unknown) {
  const res = await gatewayRequest(fx, 'POST', '/api/$events/result', cookie, JSON.stringify(body));
  if (res.status !== 200) assert.doesNotMatch(res.body, /server-response/, 'a refusal carried dsh\'s answer');
  return res;
}

test('Q16: an answer to a delivered question reaches dsh once, unchanged; another seat\'s, a foreign or an invented one never do', async () => {
  const seat = fx.createSeat('q16-answer');
  const other = fx.createSeat('q16-other');
  const { mux, clientId } = await delivered(seat.cookie, [question('allowed'), question('foreign', 'sess-foreign')]);
  try {
    const before = answers.length;
    assert.equal((await reply(other.cookie, envelope(clientId, 'allowed'))).status, 403, 'another seat');
    assert.equal((await reply(seat.cookie, envelope(clientId, 'foreign'))).status, 403, 'never delivered');
    assert.equal((await reply(seat.cookie, envelope(clientId, 'invented'))).status, 403, 'invented');
    assert.equal(answers.length, before);
    assert.equal((await reply(seat.cookie, envelope(clientId, 'allowed'))).status, 200);
    assert.deepEqual(answers.slice(before), [envelope(clientId, 'allowed')], 'the browser RPC reaches dsh unchanged');
    assert.equal((await reply(seat.cookie, envelope(clientId, 'allowed'))).status, 403, 'no replay');
    assert.equal(answers.length, before + 1);
  } finally { await mux.close(); }
});

test('Q16: a grant taken back after delivery refuses the answer before dsh', async () => {
  const seat = fx.createSeat('q16-revoked');
  const { mux, clientId } = await delivered(seat.cookie, [question('revoked')]);
  try {
    fx.db.replaceUserSessionGrants(seat.id, []);
    const before = answers.length;
    assert.equal((await reply(seat.cookie, envelope(clientId, 'revoked'))).status, 403);
    assert.equal(answers.length, before);
  } finally { await mux.close(); }
});

test('Q16: a cancelled question, and one whose $events stream closed, cannot be answered', async () => {
  const seat = fx.createSeat('q16-cancelled');
  const { mux, clientId } = await delivered(seat.cookie, [question('cancelled'), { type: 'cancel', eventId: 'cancelled' }, question('closed')]);
  const before = answers.length;
  assert.equal((await reply(seat.cookie, envelope(clientId, 'cancelled'))).status, 403, 'cancelled');
  await mux.close();
  await delay(50);
  assert.equal((await reply(seat.cookie, envelope(clientId, 'closed'))).status, 403, 'stream closed');
  assert.equal(answers.length, before);
});

test('Q16: a folder change or a switched-off session after delivery refuses the answer', async () => {
  const seat = fx.createSeat('q16-folders', { disabled: [] });
  const { mux, clientId } = await delivered(seat.cookie, [question('folder-change'), question('disabled')]);
  const set = (folders: string[], disabled: string[]) => fx.db.setPermissions(seat.id, {
    allowedFolders: folders, hourlyTokenLimit: null, dailyMinutesLimit: null,
    allowUpload: false, allowGitDownload: false, allowWorkspaceCreate: false,
    allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: disabled,
  } as never);
  try {
    const before = answers.length;
    // Wider, not narrower: the session's folder is still inside it, only the box moved.
    set(['/work/alpha', '/work/gamma'], []);
    assert.equal((await reply(seat.cookie, envelope(clientId, 'folder-change'))).status, 403, 'folders changed since delivery');
    set(['/work/alpha'], ['sess-mine']);
    assert.equal((await reply(seat.cookie, envelope(clientId, 'disabled'))).status, 403, 'session switched off');
    assert.equal(answers.length, before);
  } finally { await mux.close(); }
});

test('Q16: a malformed envelope is refused without consuming the question', async () => {
  const seat = fx.createSeat('q16-envelope');
  const { mux, clientId } = await delivered(seat.cookie, [question('envelope')]);
  try {
    const before = answers.length;
    const body = envelope(clientId, 'envelope', 'next');
    for (const invalid of [
      { ...body, method: 'approval/decide' },
      { ...body, rpcId: '' },
      { ...body, args: body.payload.args },
      { ...body, payload: { ...body.payload, extra: true } },
      { ...body, payload: { args: { ...body.payload.args, extra: 1 } } },
      { ...body, payload: { args: { ...body.payload.args, outcome: { kind: 'bogus' } } } },
    ]) {
      assert.equal((await reply(seat.cookie, invalid)).status, 403, JSON.stringify(invalid));
    }
    assert.equal(answers.length, before);
    assert.equal((await reply(seat.cookie, body)).status, 200, 'the question is still open');
  } finally { await mux.close(); }
});

test('Q16: an answer that is not a JSON POST, or sent to the dotted path, is judged the same way', async () => {
  const seat = fx.createSeat('q16-raw');
  const { mux, clientId } = await delivered(seat.cookie, [question('raw')]);
  try {
    const before = answers.length;
    const body = JSON.stringify(envelope(clientId, 'raw'));
    for (const [url, type] of [
      ['/api/$events/result?sessionId=sess-mine', 'text/plain'],
      ['/api/$events.result', 'application/json'],
    ] as const) {
      const res = await new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: fx.port, method: 'POST', path: url,
          headers: { cookie: other(seat).cookie, origin: `http://127.0.0.1:${fx.port}`, 'content-type': type, 'content-length': String(Buffer.byteLength(body)) } },
        (r) => { r.resume(); r.on('end', () => resolve(r.statusCode ?? 0)); });
        req.on('error', reject);
        req.end(body);
      });
      assert.ok(res >= 400, `${url} ${type} answered ${String(res)}`);
    }
    assert.equal(answers.length, before, 'an unjudged answer reached dsh');
  } finally { await mux.close(); }
});

/** A second seat on the same folders, so only the gate's own judgement can refuse its answer. */
function other(_seat: { id: number }) {
  return fx.createSeat(`q16-other-${String(Math.random()).slice(2, 8)}`);
}
