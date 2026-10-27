// S17 / H16 (TCH, 09/10/2026): a seat's page tells better-sidebar not to ask for git status.
// The gate keeps every `/sidebar/api/git.*` route owner-only (R5): better-sidebar spawns `git` in
// the host's one dsh process (not in the site's web container, ADR 0014), and `git status` runs
// commands a repository's own `.git/config` names (`core.fsmonitor`) — a file a seat with
// `fs.write` can author. So the seat's Files tab must not call it: before this flag it asked and
// printed `403 /sidebar/api/git.status` once per tree slot. The owner's page carries no flag.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { startHarness, type Harness, type Person } from './gateway-harness.js';

const PAGE = '<!doctype html><html><head><title>dsh</title></head><body><div id="root"></div></body></html>';

let h: Harness;
let seat: Person;
let master: Person;

before(async () => {
  h = await startHarness((seen) => (seen.method === 'GET' && seen.url.split('?')[0] === '/'
    ? { headers: { 'content-type': 'text/html; charset=utf-8' }, body: PAGE }
    : undefined));
  seat = h.seat('git-seat');
  master = h.master();
});

after(async () => { await h.close(); });

/** The page globals the `<head>` scripts of the page served to `who` leave behind. */
async function pageGlobalsFor(who: Person): Promise<Record<string, unknown>> {
  const reply = await h.send('GET', '/', who, undefined, { accept: 'text/html' });
  assert.equal(reply.status, 200);
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(reply.body)?.[1] ?? '';
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  for (const [, script] of head.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { vm.runInContext(script!, sandbox); } catch { /* the gateway's own client script needs a DOM */ }
  }
  return sandbox;
}

test('S17: a seat page turns the sidebar git status off; the owner page does not', async () => {
  assert.equal((await pageGlobalsFor(seat)).__TRACY_SIDEBAR_GIT__, 'off');
  assert.equal((await pageGlobalsFor(master)).__TRACY_SIDEBAR_GIT__, undefined);
});

test('S17: the gate still refuses git.status to a seat, and nothing reaches dsh', async () => {
  const before = h.reached('/sidebar/api/git.status');
  const reply = await h.send('POST', '/sidebar/api/git.status', seat, JSON.stringify({ sessionId: 'session-visible' }), { 'content-type': 'application/json' });
  assert.equal(reply.status, 403);
  assert.equal(h.reached('/sidebar/api/git.status'), before);
});
