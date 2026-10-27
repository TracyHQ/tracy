// L1 × V6: minting a seat again (a second device, a renewed token) must not take the access
// snapshot away from the seat's tabs that are already open; only a role that moved does (TCH #300).
// Measured on the 2.7.7 stand: every re-mint answered the seat's other tabs 403 `folderDenied`
// until a reload rebuilt the snapshot (e2e-run-bc.md, L1). Real gateway + fake dsh; data synthetic.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';
import { signSeatRequest } from '../../src/tracy/seat.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const SEAT_SECRET = 'remint-seat-secret';
const FOLDER = '/site/alpha';

let h: Harness;

before(async () => {
  h = await startHarness((seen) => {
    if (/^\/api\/workspace[./]list/.test(seen.url)) {
      return workspaceList([{ workspaceId: 'w-alpha', path: FOLDER, sessionIds: ['s-mine'] }]);
    }
    return undefined;
  }, { seatSecret: SEAT_SECRET });
});

after(async () => { await h.close(); });

/** The seat door, signed the way tracy-web signs it. Returns the account and its session cookie. */
async function mint(role: string, email: string): Promise<Person> {
  const route = '/gateway/seat/session';
  const body = JSON.stringify({ role, email, folders: [FOLDER] });
  const sig = signSeatRequest({ secret: SEAT_SECRET, method: 'POST', path: route, body });
  const res = await h.send('POST', route, null, body, {
    'x-seat-timestamp': sig.timestamp, 'x-seat-nonce': sig.nonce, 'x-seat-signature': sig.signature,
  });
  assert.equal(res.status, 200, res.body);
  const { username } = JSON.parse(res.body) as { username: string };
  const cookie = (res.headers['set-cookie'] ?? []).map((line) => line.split(';')[0]).join('; ');
  return { userId: h.db.getUserByUsername(username)!.id, username, cookie };
}

/** One tab of the seat: a Files call on the conversation it holds. */
const filesCall = (tab: Person) =>
  h.send('POST', '/sidebar/api/fs.tree', tab, JSON.stringify({ sessionId: 's-mine', path: FOLDER }));

/** A tab that has loaded the page: the master granted it the session, the workspace list ran. */
async function openTab(role: string, email: string): Promise<Person> {
  const tab = await mint(role, email);
  tracyStoreOf(h.db)!.writeMasterGrants(tab.userId, ['s-mine']);
  assert.equal((await h.send('POST', '/api/workspace.list', tab, '{}')).status, 200);
  assert.equal((await filesCall(tab)).status, 200, 'the open tab reaches its own session');
  return tab;
}

test('L1: minting the same seat again leaves its open tabs working (no 403 folderDenied)', async () => {
  const tab = await openTab('editor', 'same-role@example.test');
  await mint('editor', 'same-role@example.test');
  const before = h.reached('/sidebar/api/fs.tree');
  const res = await filesCall(tab);
  assert.equal(res.status, 200, `a second mint of the same role must not refuse the open tab: ${res.body.slice(0, 120)}`);
  assert.equal(h.reached('/sidebar/api/fs.tree'), before + 1, 'and the call reaches dsh');
});

test('L1/V6: minting the seat with another role still drops its access snapshot at once', async () => {
  const tab = await openTab('editor', 'role-moves@example.test');
  await mint('owner', 'role-moves@example.test');
  const before = h.reached('/sidebar/api/fs.tree');
  assert.equal((await filesCall(tab)).status, 403, 'a moved role must be re-read before the next call');
  assert.equal(h.reached('/sidebar/api/fs.tree'), before, 'and nothing reaches dsh');
});

// The Tracy sign-in door (`grantLaneSession`) mints the same way and keeps the same rule.
test('L1: signing in again through the Tracy door leaves the open tabs working; a moved role does not', async () => {
  const seatBook = { role: 'editor' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const answers: Record<string, unknown> = {
      '/auth/otp/start': { ok: true },
      '/auth/otp/verify': { ok: true, email: 'door@example.test' },
      '/sites/alpha.example/seats': { seats: [{ email: 'door@example.test', role: seatBook.role, status: 'active' }] },
    };
    const body = answers[url.pathname];
    return new Response(JSON.stringify(body ?? { code: 'NOT_FOUND' }), {
      status: body === undefined ? 404 : 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const door = await startHarness((seen) => (/^\/api\/workspace[./]list/.test(seen.url)
    ? workspaceList([{ workspaceId: 'w-alpha', path: FOLDER, sessionIds: ['s-mine'] }])
    : undefined), {
    seatSecret: SEAT_SECRET,
    tracy: { origin: 'https://cowork.example', siteKey: 'alpha.example', actorSecret: 'actor', siteLabel: 'alpha' },
  } as never);
  try {
    const form = { 'content-type': 'application/x-www-form-urlencoded' };
    const signIn = async (): Promise<Person> => {
      const asked = await door.send('POST', '/gateway/tracy/email', null, 'email=door%40example.test&next=%2F', form);
      const ticket = /name="ticket" value="([a-f0-9]{64})"/.exec(asked.body)?.[1] ?? '';
      const coded = await door.send('POST', '/gateway/tracy/code', null, `ticket=${ticket}&code=023058`, form);
      assert.equal(coded.status, 303, coded.body.slice(0, 200));
      const cookie = (coded.headers['set-cookie'] ?? []).map((line) => line.split(';')[0]).join('; ');
      const user = door.db.listUsers().find((row) => row.username !== undefined && tracyStoreOf(door.db)!.emailOf(row.id) === 'door@example.test');
      return { userId: user!.id, username: user!.username, cookie };
    };
    const files = (tab: Person) => door.send('POST', '/sidebar/api/fs.tree', tab, JSON.stringify({ sessionId: 's-mine', path: FOLDER }));

    const tab = await signIn();
    tracyStoreOf(door.db)!.writeMasterGrants(tab.userId, ['s-mine']);
    assert.equal((await door.send('POST', '/api/workspace.list', tab, '{}')).status, 200);
    assert.equal((await files(tab)).status, 200);

    await signIn();
    assert.equal((await files(tab)).status, 200, 'a second sign-in of the same role must not refuse the open tab');

    seatBook.role = 'owner';
    await signIn();
    assert.equal((await files(tab)).status, 403, 'a moved role drops the snapshot (V6)');
  } finally {
    globalThis.fetch = realFetch;
    await door.close();
  }
});
