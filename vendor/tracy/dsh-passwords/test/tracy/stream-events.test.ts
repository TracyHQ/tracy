// Hook H8 through a real gateway: a seat's `/api/events.host` and `/api/events.mux` (SSE), after
// upstream's own snapshot filter and before the frame is written. Q10: no other person's
// `prompter.email` leaves the gate. Q17: an event naming a session must name one the grant book
// gives the seat now. Upstream's frame text (CRLF, UTF-8 split across chunks) is upstream's own
// business and is covered by its suite run under the Tracy policy (stream-events-upstream.test.ts).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { muxWithBaseline, startFixture, type Fixture, type MuxClient } from './stream-harness.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

let fx: Fixture;
let seat: { id: number; cookie: string };
let baseline: MuxClient;

before(async () => {
  fx = await startFixture();
  // The snapshot holds sess-mine and sess-foreign (both in /work/alpha); the book gives only sess-mine.
  seat = fx.createSeat('sse-seat', { grants: ['sess-mine'], disabled: [] });
  baseline = await muxWithBaseline(fx, seat.cookie);
});
after(async () => { await baseline.close(); await fx.close(); });

const sseFrame = (payload: Record<string, unknown>): string => `data: ${JSON.stringify({ payload })}\n\n`;

function readSse(path: string, cookie: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: fx.port, method: 'GET', path, headers: { cookie, accept: 'text/event-stream' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

const eventsIn = (body: string): Array<Record<string, any>> =>
  body.split('\n\n').filter((frame) => frame.startsWith('data:')).map((frame) => JSON.parse(frame.slice(5)).payload);

test('Q10: a seat\'s session events keep no other person\'s prompter address; its own events still arrive', async () => {
  fx.sse.mux = [
    sseFrame({ type: 'session/event', sessionId: 'sess-mine', event: { prompter: { user: 'x', email: 'someone.else@example.com' }, text: 'hello' } }),
  ];
  const res = await readSse('/api/events.mux', seat.cookie);
  assert.equal(res.status, 200);
  const events = eventsIn(res.body);
  assert.deepEqual(events, [{ type: 'session/event', sessionId: 'sess-mine', event: { prompter: { user: 'x', email: null }, text: 'hello' } }]);
  assert.equal(res.body.includes('someone.else@example.com'), false);
});

test('Q17: an event of a session still in the seat\'s snapshot but no longer in its grant book is not written', async () => {
  // The book moves without the admin path (no snapshot invalidation): only the book can say no now.
  fx.db.replaceUserSessionGrants(seat.id, []);
  fx.sse.mux = [sseFrame({ type: 'session/event', sessionId: 'sess-mine', event: { text: 'REVOKED-TEXT' } })];
  fx.sse.host = [sseFrame({ type: 'host/session-status', sessionId: 'sess-mine', status: 'REVOKED-STATUS' })];
  try {
    const mux = await readSse('/api/events.mux', seat.cookie);
    const host = await readSse('/api/events.host', seat.cookie);
    assert.deepEqual(eventsIn(mux.body), []);
    assert.deepEqual(eventsIn(host.body), []);
    assert.equal(mux.body.includes('REVOKED-TEXT') || host.body.includes('REVOKED-STATUS'), false);
  } finally { tracyStoreOf(fx.db)!.writeMasterGrants(seat.id, ['sess-mine']); }
  fx.sse.host = [sseFrame({ type: 'host/session-status', sessionId: 'sess-mine', status: 'idle' })];
  const back = await readSse('/api/events.host', seat.cookie);
  assert.deepEqual(eventsIn(back.body).map((e) => e.status), ['idle'], 'with the grant back, the same event is written');
});

test('H8: the owner\'s event stream is upstream\'s, untouched', async () => {
  fx.sse.mux = [sseFrame({ type: 'session/event', sessionId: 'sess-foreign', event: { prompter: { email: 'someone.else@example.com' } } })];
  const res = await readSse('/api/events.mux', fx.ownerCookie);
  assert.equal(res.body.includes('someone.else@example.com'), true);
});
