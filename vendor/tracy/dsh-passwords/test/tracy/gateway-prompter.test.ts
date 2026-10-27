/**
 * Q11 — the gate stamps WHO TYPED onto every prompt it forwards to dsh (hook H2). Ported from the
 * 2.6.6 fork's `gateway-prompter.test.ts` (6 cases). dsh has no notion of a person; the gate,
 * which terminated the login, writes `prompter` into the prompt's own arguments, and dsh keeps it
 * on the message. Every account is stamped (the master too), a `prompter` the client sends is
 * replaced, and only the prompt endpoint changes shape. The seat's address is read from the seat
 * columns beside upstream's row (`SeatBook`; `seat-columns.ts` stands in until H10).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { rpcAnswer, startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

let h: Harness;
let seat: Person;
let master: Person;
let session = '';

const lastUpstream = (prefix: string) => h.seen.filter((s) => s.url.startsWith(prefix)).at(-1);

before(async () => {
  h = await startHarness((seen) => {
    if (/^\/api\/workspace[./]list/.test(seen.url)) return workspaceList([{ workspaceId: 'workspace', path: '/work/allowed', sessionIds: session === '' ? [] : [session] }]);
    if (/^\/api\/session[./]create/.test(seen.url)) {
      const body = JSON.parse(seen.body) as { payload?: { args?: { request?: { sessionId?: string } } } };
      session = body.payload?.args?.request?.sessionId ?? 'existing-session';
      return rpcAnswer({ sessionId: session });
    }
    return rpcAnswer({ accepted: true });
  });
  seat = h.seat('bee', { folders: ['/work/allowed'], allowUpload: true, email: 'Bee@Team.test' });
  master = h.master('root');
  // Prime the seat's grants the way the page does on load, then start the conversation the prompts
  // go into: a seat reads and writes only sessions it holds (TCH #300).
  assert.equal((await h.send('POST', '/api/workspace.list', seat, '{}')).status, 200);
  const created = await h.rpc('session/create', { request: { workspaceId: 'workspace' } }, seat);
  assert.equal(created.status, 200, created.body);
  assert.equal((await h.send('POST', '/api/workspace.list', seat, '{}')).status, 200);
});

after(async () => { await h.close(); });

test('Q11: the seat book keeps the proven email beside the row, normalised to lower case as the 2.6.6 fork did; the master has none', () => {
  assert.equal(h.db.getUserEmail(seat.userId), 'bee@team.test');
  assert.equal(h.db.getUserEmail(master.userId), null);
});

test('Q11: a seat holder\'s prompt reaches dsh carrying who typed it', async () => {
  const sent = JSON.stringify({ requestId: 'req-1', sessionId: session, mode: 'queue', content: [{ type: 'text', text: 'hi' }] });
  const res = await h.send('POST', '/api/session.prompt', seat, sent);
  assert.equal(res.status, 200, res.body);
  const got = lastUpstream('/api/session.prompt');
  assert.ok(got, 'the prompt never reached upstream');
  const body = JSON.parse(got.body);
  assert.equal(body.prompter.email, 'bee@team.test');
  assert.equal(body.prompter.user, 'bee', 'the account name rides along');
  assert.equal(body.content[0].text, 'hi', 'the rest of the body is untouched');
  assert.equal(got.headers['content-length'], String(Buffer.byteLength(got.body)), 'content-length follows the rewritten body');
});

test('Q11: a prompter the client claims for itself is replaced, never trusted', async () => {
  const sent = JSON.stringify({ requestId: 'req-2', sessionId: session, mode: 'queue', content: [{ type: 'text', text: 'hi' }], prompter: { user: 'root', email: 'ceo@team.test' } });
  const res = await h.send('POST', '/api/session.prompt', seat, sent);
  assert.equal(res.status, 200, res.body);
  const body = JSON.parse(lastUpstream('/api/session.prompt')!.body);
  assert.equal(body.prompter.email, 'bee@team.test');
  assert.notEqual(body.prompter.user, 'root');
});

test('Q11: the master account is stamped too, with no email — admins bypass upstream\'s body buffering', async () => {
  const sent = JSON.stringify({ requestId: 'req-3', sessionId: 'any-session', mode: 'queue', content: [{ type: 'text', text: 'hi' }], prompter: { user: 'x', email: 'x@y' } });
  const res = await h.send('POST', '/api/session.prompt', master, sent);
  assert.equal(res.status, 200, res.body);
  const body = JSON.parse(lastUpstream('/api/session.prompt')!.body);
  assert.deepEqual(body.prompter, { user: 'root', email: null });
});

test('Q11: on the real wire the stamp goes INSIDE the envelope, where the Host reads its arguments', async () => {
  const sent = JSON.stringify({
    type: 'client-request', rpcId: 'rpc-1', method: 'session/prompt',
    payload: { args: { request: { requestId: 'req-4', sessionId: session, mode: 'queue', content: [{ type: 'text', text: 'hi' }] } } },
  });
  const res = await h.send('POST', '/api/session/prompt', seat, sent);
  assert.equal(res.status, 200, res.body);
  const body = JSON.parse(lastUpstream('/api/session/prompt')!.body);
  assert.equal(body.type, 'client-request', 'the envelope itself is untouched');
  assert.equal(body.prompter, undefined, 'nothing is written at the envelope level');
  assert.deepEqual(Object.keys(body.payload), ['args'], 'payload keeps its single key, or the Host refuses the call');
  assert.deepEqual(Object.keys(body.payload.args), ['request'], 'args keeps the named parameter, and gains nothing');
  assert.equal(body.payload.args.request.prompter.email, 'bee@team.test');
  assert.equal(body.payload.args.request.content[0].text, 'hi');
});

test('Q11: only the prompt endpoint is touched: another session RPC passes through unchanged', async () => {
  const sent = JSON.stringify({ sessionId: session });
  const res = await h.send('POST', '/api/session.history', seat, sent);
  assert.equal(res.status, 200, res.body);
  assert.equal(lastUpstream('/api/session.history')!.body, sent);
});
