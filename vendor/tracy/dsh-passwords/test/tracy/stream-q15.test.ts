// Q15 through a real gateway, Tracy policy on: dsh sends a workspace `upsert` the moment a session
// is created, before the gateway has read the `session/create` answer and written the grant.
// Filtered at once, the new session dropped out of `sessionIds` and the client filed it under
// "Ungrouped" (2.6.6 fork, production 31/08); passed unread, two customers creating in one
// workspace would see each other. The 2.6.6 fork held such an upsert 400 ms and asked the book
// again. Upstream 2.7.7 solves the same race without a timer: the gateway pre-assigns the new id
// (`pendingCreatedSessions`, matched by the create's cwd) and, once the grant is written, publishes
// a compensating upsert. These cases hold the INVARIANT against 2.7.7 + Tracy, not the old timer:
// the new session reaches its creator grouped, another person's never reaches it.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  delay, gatewayRequest, muxWithBaseline, startFixture, WORKSPACES, type Fixture,
} from './stream-harness.js';

let fx: Fixture;
/** Sends an item on the latest workspace/follow stream dsh served. */
let pushWorkspace: (value: unknown) => void = () => { throw new Error('no workspace/follow stream yet'); };

before(async () => {
  fx = await startFixture();
  fx.scripts['workspace/follow'] = (_frame, send) => {
    pushWorkspace = send;
    send({ type: 'baseline', value: { items: WORKSPACES, archivedSessionIds: [] } });
  };
});
after(async () => { await fx.close(); });

const upsertOf = (sessionIds: string[]) => ({
  type: 'upsert', workspace: { workspaceId: 'w-alpha', path: '/work/alpha', title: 'alpha', sessionIds },
});

/** dsh's session/create: pushes the workspace upsert (or not), then answers after `answerAfterMs`. */
function scriptCreate(options: { pushUpsert: boolean; answerAfterMs: number }): { created: Promise<string>; answeredAt: () => number } {
  let answeredAt = Infinity;
  let resolveCreated: (id: string) => void = () => {};
  const created = new Promise<string>((resolve) => { resolveCreated = resolve; });
  fx.http['/api/session.create'] = (body, res) => {
    const id = JSON.parse(body).payload.args.request.sessionId as string;
    if (options.pushUpsert) pushWorkspace(upsertOf(['sess-mine', 'sess-foreign', id]));
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      answeredAt = Date.now();
      res.end(JSON.stringify({ result: { value: { sessionId: id, cwd: '/work/alpha' } } }));
      resolveCreated(id);
    }, options.answerAfterMs);
  };
  return { created, answeredAt: () => answeredAt };
}

const createBody = JSON.stringify({
  type: 'client-request', rpcId: 'q15-create', method: 'session/create',
  payload: { args: { request: { workspaceId: 'w-alpha' } } },
});

test('Q15: an upsert dsh sends before the create answer reaches the creator grouped, with the new id and no foreign one', async () => {
  const seat = fx.createSeat('q15-creator', { grants: ['sess-mine'], disabled: [] });
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    const { created, answeredAt } = scriptCreate({ pushUpsert: true, answerAfterMs: 150 });
    const answer = gatewayRequest(fx, 'POST', '/api/session.create', seat.cookie, createBody);
    const upsert = await mux.waitFor('upsert before the answer', (f) => f.streamId === 'wf' && f.value?.type === 'upsert');
    assert.ok(Date.now() < answeredAt(), 'the grouped upsert came while dsh was still making the session, not as the later make-good');
    const newId = await created;
    assert.deepEqual(upsert.value.workspace.sessionIds, ['sess-mine', newId], 'grouped at once; the foreign session is not named');
    assert.equal((await answer).status, 200);
    assert.ok(fx.db.hasUserSessionGrant(seat.id, newId), 'the grant follows the answer');
    assert.equal(mux.raw.join('').includes('sess-foreign'), false);
  } finally { delete fx.http['/api/session.create']; await mux.close(); }
});

test('Q15: an upsert that never came is made good once the grant is written: the creator gets its session grouped', async () => {
  const seat = fx.createSeat('q15-compensated', { grants: ['sess-mine'], disabled: [] });
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    const { created } = scriptCreate({ pushUpsert: false, answerAfterMs: 20 });
    assert.equal((await gatewayRequest(fx, 'POST', '/api/session.create', seat.cookie, createBody)).status, 200);
    const newId = await created;
    const upsert = await mux.waitFor('compensating upsert', (f) => f.streamId === 'wf' && f.value?.type === 'upsert');
    assert.ok(upsert.value.workspace.sessionIds.includes(newId));
    assert.equal(upsert.value.workspace.sessionIds.includes('sess-foreign'), false);
  } finally { delete fx.http['/api/session.create']; await mux.close(); }
});

test('Q15: an upsert naming a session someone else just created never names it to this seat, then or later', async () => {
  const seat = fx.createSeat('q15-bystander', { grants: ['sess-mine'], disabled: [] });
  const mux = await muxWithBaseline(fx, seat.cookie);
  try {
    pushWorkspace(upsertOf(['sess-mine', 'sess-someone-new']));
    const upsert = await mux.waitFor('upsert', (f) => f.streamId === 'wf' && f.value?.type === 'upsert');
    assert.deepEqual(upsert.value.workspace.sessionIds, ['sess-mine']);
    await delay(500);
    assert.equal(mux.raw.join('').includes('sess-someone-new'), false, '0 bytes of the id, after any hold');
  } finally { await mux.close(); }
});
