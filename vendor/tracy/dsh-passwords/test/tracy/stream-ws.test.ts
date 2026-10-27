// Hook H6 through a real gateway: a seat's WebSocket upgrades outside the mux (R6, ported from the
// 2.6.6 fork's gateway-sidebar-fs-watch suite) and what ends the connections a seat already holds
// (V1, V2). Upstream 2.7.7 lets a subuser open any socket a plugin manifest declares; a seat gets
// the gateway's own event channels and the two better-sidebar sockets naming one held session.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import jwt from 'jsonwebtoken';
import { delay, muxWithBaseline, startFixture, type Fixture, type MuxClient } from './stream-harness.js';

let fx: Fixture;
let seat: { id: number; cookie: string };
/** Keeps the seat's grant snapshot alive (the baseline gives upstream the sessions' cwd). */
let baseline: MuxClient;

before(async () => {
  fx = await startFixture();
  seat = fx.createSeat('ws-seat');
  baseline = await muxWithBaseline(fx, seat.cookie);
});
after(async () => { await baseline.close(); await fx.close(); });

/** Open an upgrade through the gateway; the socket when it was accepted (caller closes it). */
function upgrade(url: string, cookie: string, extra: Record<string, string> = {}): Promise<{ status: number; socket: Duplex | null }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: fx.port, path: url,
      headers: {
        connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...(cookie === '' ? {} : { cookie }), origin: 'http://127.0.0.1', host: '127.0.0.1', ...extra,
      },
    });
    req.once('upgrade', (res, socket) => { socket.on('error', () => {}); resolve({ status: res.statusCode ?? 0, socket }); });
    req.once('response', (res) => { res.resume(); res.once('end', () => resolve({ status: res.statusCode ?? 0, socket: null })); });
    req.once('error', reject);
    req.end();
  });
}

const SEAT_SOCKETS = ['/sidebar/ws/fs-watch', '/sidebar/ws/agent-opens'];

for (const route of SEAT_SOCKETS) {
  test(`R6: a seat opens ${route} for a session it holds, and the query reaches dsh`, async () => {
    fx.upgradesSaw.length = 0;
    const opened = await upgrade(`${route}?sessionId=sess-mine`, seat.cookie);
    assert.equal(opened.status, 101);
    opened.socket?.destroy();
    assert.deepEqual(fx.upgradesSaw, [`${route}?sessionId=sess-mine`]);
  });

  test(`R6: ${route} with no session, a disabled one, another's, an unknown one, two: refused before dsh sees it`, async () => {
    for (const query of ['', '?sessionId=', '?sessionId=sess-off', '?sessionId=sess-foreign', '?sessionId=sess-beta', '?sessionId=nope',
      '?sessionId=sess-mine&sessionId=sess-foreign', '?path=/work/beta']) {
      fx.upgradesSaw.length = 0;
      const refused = await upgrade(`${route}${query}`, seat.cookie);
      assert.equal(refused.status, 403, `${route}${query} must be refused`);
      assert.deepEqual(fx.upgradesSaw, [], `${route}${query} must never reach dsh`);
    }
  });

  test(`R6: ${route} of a held session whose folder the owner has since taken away is refused`, async () => {
    const narrow = (allowedFolders: string[]): void => fx.db.setPermissions(seat.id, {
      allowedFolders, hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false, allowGitDownload: false,
      allowWorkspaceCreate: false, allowedAgentPresets: null, banned: false, sandboxMode: null, disabledSessions: ['sess-off'],
    } as any);
    narrow(['/work/elsewhere']);
    try {
      fx.upgradesSaw.length = 0;
      assert.equal((await upgrade(`${route}?sessionId=sess-mine`, seat.cookie)).status, 403);
      assert.deepEqual(fx.upgradesSaw, []);
    } finally { narrow(['/work/alpha']); }
    const reopened = await upgrade(`${route}?sessionId=sess-mine`, seat.cookie);
    assert.equal(reopened.status, 101, 'same snapshot, folder given back: the refusal above was the folder check');
    reopened.socket?.destroy();
  });

  test(`R6: ${route} without a cookie, with a forged token or a foreign Origin never upgrades`, async () => {
    const forged = `dsh_gateway_token=${jwt.sign({ sub: String(seat.id), username: 'ws-seat', cv: 0 }, 'not-the-secret', { expiresIn: '1h' })}`;
    for (const [cookie, headers] of [['', {}], [forged, {}], [seat.cookie, { origin: 'http://evil.example' }]] as const) {
      fx.upgradesSaw.length = 0;
      const refused = await upgrade(`${route}?sessionId=sess-mine`, cookie, headers);
      assert.notEqual(refused.status, 101);
      refused.socket?.destroy();
      assert.deepEqual(fx.upgradesSaw, []);
    }
  });
}

test('R6: every other sidebar socket stays owner-only for a seat, even naming a held session', async () => {
  for (const route of ['/sidebar/ws/terminal', '/sidebar/ws/agent-terminals', '/sidebar/ws/fs-watch/extra', '/sidebar/ws/fs-watch-all',
    '/sidebar/ws/agent-opens/extra', '/sidebar/ws/agent-open', '/sidebar/ws/', '/sidebar']) {
    fx.upgradesSaw.length = 0;
    assert.equal((await upgrade(`${route}?sessionId=sess-mine`, seat.cookie)).status, 403, route);
    assert.deepEqual(fx.upgradesSaw, [], route);
  }
});

test('R6: a socket outside the seat table is refused for a seat (plugin sockets included); dsh sees no upgrade', async () => {
  for (const route of ['/plugins/some-plugin/ws', '/api/terminal.ws', '/anything']) {
    fx.upgradesSaw.length = 0;
    assert.equal((await upgrade(route, seat.cookie)).status, 403, route);
    assert.deepEqual(fx.upgradesSaw, [], route);
  }
});

test('R6: the owner keeps upstream\'s behaviour (an unknown socket is still 404 for nobody but subusers)', async () => {
  fx.upgradesSaw.length = 0;
  const opened = await upgrade('/sidebar/ws/terminal?sessionId=anything', fx.ownerCookie);
  assert.equal(opened.status, 101);
  opened.socket?.destroy();
  assert.deepEqual(fx.upgradesSaw, ['/sidebar/ws/terminal?sessionId=anything']);
});

test('V1: a credential change ends the seat\'s mux carrier with 1008 and its sidebar sockets, and nobody else\'s', async () => {
  const target = fx.createSeat('v1-target');
  const bystander = fx.createSeat('v1-bystander');
  const mux = await muxWithBaseline(fx, target.cookie);
  const otherMux = await muxWithBaseline(fx, bystander.cookie);
  const watch = await upgrade('/sidebar/ws/fs-watch?sessionId=sess-mine', target.cookie);
  assert.equal(watch.status, 101);
  const watchClosed = new Promise<void>((resolve) => watch.socket!.once('close', () => resolve()));
  const res = await new Promise<number>((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: fx.port, method: 'POST', path: '/gateway/internal/session-invalidate',
      headers: { 'content-type': 'application/json', 'x-internal-secret': 'internal' },
    }, (r) => { r.resume(); resolve(r.statusCode ?? 0); });
    req.on('error', reject);
    req.end(JSON.stringify({ userId: target.id }));
  });
  assert.equal(res, 200);
  assert.equal((await mux.closed).code, 1008);
  await Promise.race([watchClosed, delay(2000).then(() => { throw new Error('the sidebar socket stayed open'); })]);
  assert.equal(otherMux.ws.readyState, 1, 'another seat keeps its carrier');
  await otherMux.close();
});

test('V2: a seat banned after the upgrade has its next mux frame close the carrier 1008, not answered', async () => {
  const banned = fx.createSeat('v2-banned');
  const mux = await muxWithBaseline(fx, banned.cookie);
  const from = fx.muxSaw.length;
  fx.db.setPermissions(banned.id, {
    allowedFolders: ['/work/alpha'], hourlyTokenLimit: null, dailyMinutesLimit: null, allowUpload: false, allowGitDownload: false,
    allowWorkspaceCreate: false, allowedAgentPresets: null, banned: true, sandboxMode: null, disabledSessions: [],
  } as any);
  mux.open('ev', '$events');
  assert.equal((await mux.closed).code, 1008);
  assert.deepEqual(fx.muxSaw.slice(from).filter((f) => f.streamId === 'ev'), [], 'the frame was never forwarded');
});

test('V2: a seat whose credential version moved after the upgrade has its next mux frame close the carrier 1008', async () => {
  const moved = fx.createSeat('v2-moved');
  const mux = await muxWithBaseline(fx, moved.cookie);
  const from = fx.muxSaw.length;
  // A password change moves the credential version (upstream `updatePasswordHash`).
  fx.db.updatePasswordHash(moved.id, '$2a$10$otherhashotherhashotherhashoth');
  mux.open('ev', '$events');
  assert.equal((await mux.closed).code, 1008);
  assert.deepEqual(fx.muxSaw.slice(from).filter((f) => f.streamId === 'ev'), []);
});

