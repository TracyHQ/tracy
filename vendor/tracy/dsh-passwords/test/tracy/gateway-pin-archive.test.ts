/**
 * Q12 over HTTP: `workspace/{archive,unarchive,pin,unpin}Session` of a seat act only on a session
 * it holds, and their answers name only ids it may see. Ported from the 2.6.6 fork's
 * `gateway-workspace-follow-pinned.test.ts` ("HTTP pinSession"), through a real gateway; the
 * seat's session snapshot is built by a real `workspace/follow` baseline, as in the browser.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { type Fixture, gatewayRequest, muxWithBaseline, startFixture } from './stream-harness.js';

let fx: Fixture;
let answerValue: unknown = null;
const commands: string[] = [];

before(async () => {
  fx = await startFixture();
  for (const name of ['archiveSession', 'unarchiveSession', 'pinSession', 'unpinSession']) {
    fx.http[`/api/workspace/${name}`] = (_body, res) => {
      commands.push(name);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ type: 'server-response', rpcId: 'r', result: { ok: true, value: answerValue } }));
    };
  }
});

after(async () => { await fx.close(); });

const command = (cookie: string, name: string, sessionId: string) =>
  gatewayRequest(fx, 'POST', `/api/workspace/${name}`, cookie, JSON.stringify({
    type: 'client-request', rpcId: `rpc-${name}`, method: `workspace/${name}`, payload: { args: { request: { sessionId } } },
  }));

test('Q12: pin/unpin/archive/unarchive of a held session go through and the answer names held ids only; another account\'s are refused before dsh', async () => {
  const seat = fx.createSeat('pinner');
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    answerValue = { pinnedSessionIds: ['sess-foreign', 'sess-mine', 'sess-beta'], extra: 'kept' };
    const pinned = await command(seat.cookie, 'pinSession', 'sess-mine');
    assert.equal(pinned.status, 200, pinned.body);
    assert.deepEqual(JSON.parse(pinned.body).result.value, { pinnedSessionIds: ['sess-mine'], extra: 'kept' });

    commands.length = 0;
    for (const name of ['pinSession', 'unpinSession', 'archiveSession', 'unarchiveSession']) {
      for (const sessionId of ['sess-foreign', 'sess-beta', 'sess-off']) {
        const refused = await command(seat.cookie, name, sessionId);
        assert.equal(refused.status, 403, `${name} on ${sessionId}`);
        assert.doesNotMatch(refused.body, /sess-/, 'the refusal names no session');
      }
    }
    assert.deepEqual(commands, [], 'no refused command reached dsh');

    answerValue = { archivedSessionIds: ['sess-foreign', 'sess-mine'] };
    const unarchived = await command(seat.cookie, 'unarchiveSession', 'sess-mine');
    assert.equal(unarchived.status, 200, unarchived.body);
    assert.deepEqual(JSON.parse(unarchived.body).result.value, { archivedSessionIds: ['sess-mine'] });
  } finally {
    await mux.close();
  }
});
