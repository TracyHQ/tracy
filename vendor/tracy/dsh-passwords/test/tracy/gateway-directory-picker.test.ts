/**
 * S4 — the directory picker (`directoryPicker/*`) is held to the seat's box at the gateway (hook
 * H2). Ported from the 2.6.6 fork's `gateway-directory-picker.test.ts` (6 cases). Measured on
 * production 31/08: a guest seat listed `/etc`, the picker opened at `/root`, and a seat allowed
 * to create workspaces still got 403 creating a folder inside its own box. Upstream 2.7.7 lists
 * an outside folder through dsh and filters the entries; Tracy refuses it before dsh reads it.
 * Wire shape measured on production: `{type:'client-request', rpcId, method, payload:{args:{path?}}}`.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, rpcAnswer, type Harness, type Person } from './gateway-harness.js';

const BOX = '/work/site-alpha';
let h: Harness;
let guest: Person;
let owner: Person;

/** dsh 0.2's ClientConnection envelope: upstream reads `payload.args` only when `method` is `namespace/name`. */
const rpcBody = (args: Record<string, unknown>, method = 'directoryPicker/list'): string => JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload: { args } });
const pickerCalls = () => h.seen.filter((s) => s.url.startsWith('/api/directoryPicker/'));

before(async () => {
  h = await startHarness(() => rpcAnswer({ entries: [] }));
  guest = h.seat('picker-guest', { folders: [BOX], allowUpload: false, allowWorkspaceCreate: false });
  owner = h.seat('picker-owner', { folders: [BOX], allowUpload: true, allowWorkspaceCreate: true });
});

after(async () => { await h.close(); });

test('S4: listing outside the box is refused BEFORE dsh — /etc is never read', async () => {
  h.seen.length = 0;
  for (const outside of ['/etc', '/root', '/work', '/desk-home']) {
    const res = await h.send('POST', '/api/directoryPicker/list', guest, rpcBody({ path: outside }));
    assert.equal(res.status, 403, `list ${outside}`);
  }
  assert.equal(pickerCalls().length, 0, 'not one list reached dsh');
});

test('S4: a list naming no path is rewritten to open at the granted folder, not at home', async () => {
  h.seen.length = 0;
  const res = await h.send('POST', '/api/directoryPicker/list', guest, rpcBody({}));
  assert.equal(res.status, 200, res.body);
  assert.equal(pickerCalls().length, 1);
  const forwarded = JSON.parse(pickerCalls()[0]!.body) as { payload: { args: { path?: string } } };
  assert.equal(forwarded.payload.args.path, BOX);
  assert.equal(pickerCalls()[0]!.headers['content-length'], String(Buffer.byteLength(pickerCalls()[0]!.body)));
});

test('S4: a list inside the box goes through untouched — subfolders included', async () => {
  h.seen.length = 0;
  const res = await h.send('POST', '/api/directoryPicker/list', guest, rpcBody({ path: `${BOX}/wp-content` }));
  assert.equal(res.status, 200, res.body);
  const forwarded = JSON.parse(pickerCalls()[0]!.body) as { payload: { args: { path?: string } } };
  assert.equal(forwarded.payload.args.path, `${BOX}/wp-content`);
});

test('S4: createDirectory inside the box reaches dsh for a seat allowed to create workspaces', async () => {
  h.seen.length = 0;
  const inside = await h.send('POST', '/api/directoryPicker/createDirectory', owner, rpcBody({ path: BOX, name: 'x' }, 'directoryPicker/createDirectory'));
  assert.equal(inside.status, 200, inside.body);
  assert.equal(pickerCalls().length, 1);
});

test('S4: createDirectory outside the box never reaches dsh — whatever the seat', async () => {
  h.seen.length = 0;
  for (const who of [guest, owner]) {
    for (const outside of ['/root', '/work', '/etc', `${BOX}-other`]) {
      const res = await h.send('POST', '/api/directoryPicker/createDirectory', who, rpcBody({ path: outside, name: 'x' }, 'directoryPicker/createDirectory'));
      assert.equal(res.status, 403, `create at ${outside}`);
    }
  }
  assert.equal(pickerCalls().length, 0, 'not one create reached dsh');
});

test('S4: a body that is not the measured shape is refused, never passed quietly', async () => {
  h.seen.length = 0;
  for (const weird of ['{}', JSON.stringify({ payload: { args: ['/etc'] } }), JSON.stringify({ payload: null }), JSON.stringify({ type: 'client-request', payload: { args: { path: 7 } } })]) {
    const res = await h.send('POST', '/api/directoryPicker/list', guest, weird);
    assert.equal(res.status, 403, `body ${weird}`);
  }
  assert.equal(pickerCalls().length, 0);
});
