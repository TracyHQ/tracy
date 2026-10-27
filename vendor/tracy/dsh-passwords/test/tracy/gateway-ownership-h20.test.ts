/**
 * H20 in the gateway: the one-owner rule still refuses a folder another subuser registered, through
 * the cheaper check (`src/tracy/ownership.ts`), on the doors a seat reaches.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { tracyStoreOf } from '../../src/tracy/persistence.js';
import { rpcAnswer, startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

let h: Harness;
let owner: Person;
let other: Person;
let reads = 0;

before(async () => {
  h = await startHarness((seen) => {
    if (/^\/api\/workspace[./]list/.test(seen.url))
      return workspaceList([{ workspaceId: 'ws-beta', path: '/site/beta', sessionIds: [] as string[] }]);
    if (/^\/api\/session[./]create/.test(seen.url)) return rpcAnswer({ sessionId: 'made', cwd: '/site/beta' });
    return rpcAnswer({ accepted: true });
  });
  // the owner holds the parent folder and registered `/site/beta` as its own workspace; the other
  // seat is granted `/site/beta` itself, so the folder is listed for it (S1) and no grant is shared
  // (S2 waives only the SAME granted folder): upstream's one-owner rule decides, through H20
  owner = h.seat('owner', { folders: ['/site'], allowWorkspaceCreate: true });
  other = h.seat('other', { folders: ['/site/beta'] });
  h.db.addUserWorkspace(owner.userId, '/site/beta');
  // count the H20 reads: the gateway asks the Tracy store, not upstream's per-row lookups
  const store = tracyStoreOf(h.db);
  assert.ok(store, 'the harness database carries the Tracy store');
  const read = store.workspaceOwnerRows.bind(store);
  store.workspaceOwnerRows = () => {
    reads += 1;
    return read();
  };
});

after(async () => { await h.close(); });

const listed = async (who: Person): Promise<string[]> => {
  const res = await h.send('POST', '/api/workspace.list', who, '{}');
  assert.equal(res.status, 200, res.body);
  return (JSON.parse(res.body) as { result: { value: { items: { path: string }[] } } }).result.value.items.map((item) => item.path);
};

test('🔒 H20: another seat granted that folder does not see a folder a subuser owns — decided through H20', async () => {
  reads = 0;
  assert.deepEqual(await listed(other), []);
  assert.ok(reads > 0, 'the ownership rows were read through H20');
});

test('🔒 H20: and the other seat is refused a conversation there, nothing sent to dsh', async () => {
  const before = h.seen.length;
  const made = await h.rpc('session/create', { request: { cwd: '/site/beta' } }, other);
  assert.equal(made.status, 403, made.body);
  assert.equal(h.seen.length, before, 'the refused create reached dsh');
});
