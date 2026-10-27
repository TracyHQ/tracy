/**
 * H15 — several seats share one site folder (S1, S2, S3). Upstream 2.7.7 assumes "one folder, one
 * owner": a folder another subuser registered is hidden and refused (`workspaceOwnedByAnotherSubuser`,
 * `workspaceSubtreeOverlap`), and a child of a granted folder is listed as a workspace of its own.
 * On Tracy every seat of a site is granted the same `/site/<label>`, so the first one to create the
 * workspace would lock every other seat out of the site (h15-shared-folder.md).
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { rpcAnswer, startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

let h: Harness;
let first: Person;
let second: Person;
let parent: Person;

const items = () => [
  { workspaceId: 'ws-alpha', path: '/site/alpha', sessionIds: [] as string[] },
  { workspaceId: 'ws-sub', path: '/site/alpha/sub', sessionIds: [] as string[] },
];

before(async () => {
  h = await startHarness((seen) => {
    if (/^\/api\/workspace[./]list/.test(seen.url)) return workspaceList(items());
    if (/^\/api\/session[./]create/.test(seen.url)) {
      const requested = (JSON.parse(seen.body) as { payload: { args: { request: { sessionId?: string } } } }).payload.args.request.sessionId;
      return rpcAnswer({ sessionId: requested ?? 'made', cwd: '/site/alpha' });
    }
    return rpcAnswer({ accepted: true });
  });
  first = h.seat('first', { folders: ['/site/alpha'], allowWorkspaceCreate: true });
  second = h.seat('second', { folders: ['/site/alpha'] });
  parent = h.seat('parent', { folders: ['/site'] });
  // The first seat created the site's workspace: upstream records it as that seat's own.
  h.db.addUserWorkspace(first.userId, '/site/alpha');
});

after(async () => { await h.close(); });

const listedPaths = async (who: Person): Promise<string[]> => {
  const res = await h.send('POST', '/api/workspace.list', who, '{}');
  assert.equal(res.status, 200, res.body);
  return (JSON.parse(res.body) as { result: { value: { items: { path: string }[] } } }).result.value.items.map((item) => item.path);
};

test('S2: a second seat granted the same site folder lists the workspace another seat registered', async () => {
  assert.deepEqual(await listedPaths(second), ['/site/alpha']);
  assert.deepEqual(await listedPaths(first), ['/site/alpha']);
});

test('S2: and starts a conversation in it', async () => {
  await listedPaths(second);
  const made = await h.rpc('session/create', { request: { workspaceId: 'ws-alpha' } }, second);
  assert.equal(made.status, 200, made.body);
  const id = (JSON.parse(made.body) as { result: { value: { sessionId: string } } }).result.value.sessionId;
  assert.deepEqual(h.db.listUserSessionGrants(second.userId), [id]);
});

test('S2: a seat granted only the parent folder shares no entry, so the one-owner rule still guards it', async () => {
  const before = h.seen.length;
  const made = await h.rpc('session/create', { request: { cwd: '/site/alpha' } }, parent);
  assert.equal(made.status, 403, made.body);
  assert.equal(h.seen.length, before, 'the refused create reached dsh');
});

test('S1: a folder inside the grant is workable but is not listed as a workspace of its own', async () => {
  const paths = await listedPaths(second);
  assert.ok(!paths.includes('/site/alpha/sub'), JSON.stringify(paths));
  assert.deepEqual(await listedPaths(parent), [], 'the parent seat lists no child of its folder');
});
