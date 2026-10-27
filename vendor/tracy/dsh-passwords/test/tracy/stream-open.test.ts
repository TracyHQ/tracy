// Hook H4 through a real gateway: which Remote mux streams a seat may open, decided by endpoint +
// operation + resource after upstream's own open checks and before the open frame reaches dsh.
// Every refusal asserts the dsh error shape AND that dsh received no open frame for it.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDshRefusal, connectMux, delay, muxWithBaseline, sawFor, startFixture, type Fixture,
} from './stream-harness.js';

let fx: Fixture;
before(async () => { fx = await startFixture(); });
after(async () => { await fx.close(); });

test('Q13: session/follow of a session the seat does not hold is refused for that stream (upstream\'s code kept); dsh sees no open', async () => {
  const seat = fx.createSeat('h4-follow-foreign');
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('f1', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-foreign' } } });
    const refusal = await mux.waitFor('refusal', (f) => f.streamId === 'f1');
    assertDshRefusal(refusal, 'f1');
    await delay(50);
    assert.deepEqual(sawFor(fx, 'f1', from), [], 'dsh received nothing for the refused stream');
    assert.equal(mux.ws.readyState, 1, 'the carrier lives on');
  } finally { await mux.close(); }
});

test('V5: official streams upstream admits for a subuser (account/watch, workspaceFiles/changes) are refused per stream; dsh sees no open', async () => {
  const seat = fx.createSeat('h4-official-extra');
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('acct', 'account/watch');
    const refusal = await mux.waitFor('account refusal', (f) => f.streamId === 'acct');
    assertDshRefusal(refusal, 'acct', 'account/watch');
    mux.open('ev', '$events');
    await mux.waitFor('$events still opens', (f) => f.streamId === 'ev' && f.value?.type === 'ready');
    assert.deepEqual(sawFor(fx, 'acct', from), [], 'dsh received nothing for the refused stream');
  } finally { await mux.close(); }
});

test('Q13: before the baseline a seat\'s session/follow is held, not forwarded; once the baseline is in it is decided again', async () => {
  const held = fx.createSeat('h4-held', { grants: ['sess-mine'], disabled: [] });
  const mux = await connectMux(fx, held.cookie);
  try {
    const from = fx.muxSaw.length;
    mux.open('mine', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    mux.open('theirs', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-foreign' } } });
    await delay(80);
    assert.deepEqual(fx.muxSaw.slice(from).filter((f) => f.type === 'open'), [], 'nothing opened at dsh before the baseline');
    // Taken back while held: the decision at release must see it.
    fx.db.replaceUserSessionGrants(held.id, []);
    mux.open('wf', 'workspace/follow');
    assertDshRefusal(await mux.waitFor('mine refused at release', (f) => f.streamId === 'mine'), 'mine');
    assertDshRefusal(await mux.waitFor('theirs refused', (f) => f.streamId === 'theirs'), 'theirs');
    await delay(50);
    assert.deepEqual(fx.muxSaw.slice(from).filter((f) => f.type === 'open').map((f) => f.endpoint), ['workspace/follow']);
  } finally { await mux.close(); }
});

test('Q13: a held session/follow of a session the seat still holds opens once the baseline is in', async () => {
  const held = fx.createSeat('h4-held-ok', { grants: ['sess-mine'], disabled: [] });
  const mux = await connectMux(fx, held.cookie);
  try {
    mux.open('mine', 'session/follow', { request: { address: { kind: 'session', sessionId: 'sess-mine' } } });
    await delay(50);
    mux.open('wf', 'workspace/follow');
    await mux.waitFor('snapshot after release', (f) => f.streamId === 'mine' && f.value?.type === 'snapshot');
  } finally { await mux.close(); }
});
