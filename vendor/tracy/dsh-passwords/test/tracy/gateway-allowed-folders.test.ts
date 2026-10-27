/**
 * S12 — `x-dsh-allowed-folders`: the folders the gate vouches for, sent to dsh on every request of
 * a seat, so a plugin (tracy-brand-engine, the file tools) can fence itself without trusting the
 * browser (hook H13, fixed before the upstream request is created). Ported from the 2.6.6 fork's
 * `gateway-allowed-folders.test.ts` (5 cases).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, type Harness, type Person } from './gateway-harness.js';
import { ALLOWED_FOLDERS_HEADER } from '../../src/tracy/seat-context.js';

let h: Harness;
let seat: Person;
let denied: Person;
let master: Person;
const DOOR = '/api/tracy-brand-engine/extract/acme.example';
const lastUpstream = () => h.seen.filter((s) => s.url.startsWith(DOOR)).at(-1)!;

before(async () => {
  h = await startHarness();
  seat = h.seat('guest-one', { folders: ['/site/tracy-site-ff8257f0'] });
  // A seat with no folder at all is written as the `__deny__` sentinel (seat.ts) — not a path.
  denied = h.seat('guest-none', { folders: ['__deny__'] });
  master = h.master('root');
});

after(async () => { await h.close(); });

test('S12: the header is named once, for the plugins that read it', () => {
  assert.equal(ALLOWED_FOLDERS_HEADER, 'x-dsh-allowed-folders');
});

test("S12: a seat holder's request reaches dsh carrying exactly the seat's folders, as JSON", async () => {
  const res = await h.send('GET', DOOR, seat);
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(String(lastUpstream().headers[ALLOWED_FOLDERS_HEADER])), ['/site/tracy-site-ff8257f0']);
});

test('S12: a header the client claims for itself is replaced, never trusted — in any casing', async () => {
  for (const name of [ALLOWED_FOLDERS_HEADER, 'X-DSH-Allowed-Folders']) {
    const res = await h.send('GET', DOOR, seat, undefined, { [name]: JSON.stringify(['/site/somebody-else']) });
    assert.equal(res.status, 200, res.body);
    assert.deepEqual(JSON.parse(String(lastUpstream().headers[ALLOWED_FOLDERS_HEADER])), ['/site/tracy-site-ff8257f0']);
  }
});

test('S12: the `__deny__` sentinel is not a folder: a seat with none carries an empty list', async () => {
  const res = await h.send('GET', DOOR, denied);
  assert.equal(res.status, 200, res.body);
  assert.deepEqual(JSON.parse(String(lastUpstream().headers[ALLOWED_FOLDERS_HEADER])), []);
});

test('S12: the master account carries no header, and one it sends is dropped', async () => {
  const res = await h.send('GET', DOOR, master, undefined, { [ALLOWED_FOLDERS_HEADER]: JSON.stringify(['/site/anything']) });
  assert.equal(res.status, 200, res.body);
  assert.equal(lastUpstream().headers[ALLOWED_FOLDERS_HEADER], undefined);
});
