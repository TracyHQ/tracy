/**
 * Q7 — a session made by `workspaceId` right after `workspace.create` resolves without a list in
 * between, and only for the folder the seat asked for (hook H3 territory; upstream 2.7.7 learns the
 * pair itself in its workspace-management branch). Ported from the 2.6.6 fork's
 * `gateway-workspace-create-cache.test.ts` (3 cases) as regression cases over upstream + Tracy.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { startHarness, type Harness, type Person } from './gateway-harness.js';

let h: Harness;
let seat: Person;

before(async () => {
  h = await startHarness((seen) => {
    const rpcId = (() => { try { return JSON.parse(seen.body).rpcId; } catch { return null; } })();
    const json = (value: unknown) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'server-response', rpcId, result: { ok: true, value } }) });
    if (seen.url === '/api/workspace/create') {
      const asked = JSON.parse(seen.body).payload.args.request.path as string;
      // dsh's real shape, and — to pin the filter — a second pair for a folder nobody asked for.
      return json({
        workspace: { workspaceId: `ws-${path.basename(asked)}`, path: asked, title: asked, sessionIds: [] },
        created: true,
        neighbour: { workspaceId: 'ws-somebody-else', path: '/site/somebody-else' },
      });
    }
    if (seen.url === '/api/session/create') {
      const requested = JSON.parse(seen.body).payload.args.request.sessionId as string | undefined;
      return json({ sessionId: requested ?? 'session-made-1' });
    }
    return json({});
  });
  seat = h.seat('site-owner', { folders: ['/site/granite-works'], allowUpload: true, allowWorkspaceCreate: true, email: 'owner@x.test' });
});

after(async () => { await h.close(); });

test('Q7: a session made by workspaceId right after workspace.create passes — no list in between', async () => {
  const created = await h.rpc('workspace/create', { request: { path: '/site/granite-works' } }, seat);
  assert.equal(created.status, 200, created.body);
  assert.equal(JSON.parse(created.body).result.value.workspace.workspaceId, 'ws-granite-works');
  const made = await h.rpc('session/create', { request: { workspaceId: 'ws-granite-works', agentPreset: 'designer-joomla' } }, seat);
  assert.equal(made.status, 200, made.body);
  const id = JSON.parse(made.body).result.value.sessionId as string;
  assert.ok(h.seen.some((s) => s.url === '/api/session/create'), 'the create reached dsh');
  // And the create wrote the seat's grant for it, as a create by cwd would have.
  assert.deepEqual(h.db.listUserSessionGrants(seat.userId), [id]);
});

test('Q7: a pair the answer names for a folder the seat did not ask for is not learned', async () => {
  const before = h.seen.length;
  const made = await h.rpc('session/create', { request: { workspaceId: 'ws-somebody-else', agentPreset: 'designer-joomla' } }, seat);
  assert.equal(made.status, 403, made.body);
  assert.equal(h.seen.length, before, 'never reached dsh');
});

test('S3: a create outside the seat box is refused at the create itself', async () => {
  const before = h.seen.length;
  const created = await h.rpc('workspace/create', { request: { path: '/site/somebody-else' } }, seat);
  assert.equal(created.status, 403, created.body);
  assert.equal(h.seen.length, before, 'never reached dsh');
});
