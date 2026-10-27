// S16 / H16 (TCH, 09/10/2026): a seat's own Appearance and Language choices live in its browser, never
// in the host-wide settings document. One dsh serves every site of the host (ADR 0014), so dsh's
// `settings.yaml` (`ui-theme`, `locale`, …) is one document for every customer; a seat must not
// write it (SUBUSER_BLOCKED_API_ENDPOINTS keeps `settings/mutate` closed) and must not read
// another person's choice from it either. Upstream's remote-settings patch forces every browser
// into dsh's `host` persistence, so a seat's theme pick became a 403 write and was gone after a
// reload. Under the Tracy policy the patched bundle keeps `host` for the owner and gives a seat's
// page dsh's own `memory` persistence (ui-theme and locale then keep the choice in localStorage).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { applyRemotePatch, patchStatus } from '../../src/patch.js';
import { startHarness, type Harness, type Person } from './gateway-harness.js';

const PAGE = '<!doctype html><html><head><title>dsh</title></head><body><div id="root"></div></body></html>';
const SETTINGS_REL = path.join('node_modules', '@deepseek-ai', 'dsh-client-ui-settings', 'lib', 'client.js');
// The two places dsh 0.2 decides the persistence (ConfigForms and the describe mirror).
const UNPATCHED = [
  'export const formsPersistence = (ctx) => ctx.remote.$host.isLoopback ? "host" : "memory";',
  'export const mirrorPersistence = (ctx) => ctx.remote.$host.isLoopback ? "host" : "memory";',
  '',
].join('\n');

let h: Harness;
let seat: Person;
let master: Person;

before(async () => {
  h = await startHarness((seen) => (seen.method === 'GET' && seen.url.split('?')[0] === '/'
    ? { headers: { 'content-type': 'text/html; charset=utf-8' }, body: PAGE }
    : undefined));
  seat = h.seat('persist-seat');
  master = h.master();
});

after(async () => { await h.close(); });

function dshRoot(content: string): { root: string; file: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-seat-settings-'));
  const file = path.join(root, SETTINGS_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return { root, file, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Run the patched bundle's two decisions on a loopback-less page, with or without a page head. */
function persistenceOn(source: string, pageHead: string): string[] {
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  // The page head's inline scripts run first, as in the browser.
  for (const [, script] of pageHead.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script!, sandbox);
  const body = source.replaceAll('export const ', 'globalThis.');
  vm.runInContext(body, sandbox);
  const ctx = { remote: { $host: { isLoopback: false } } };
  return [(sandbox.formsPersistence as (c: unknown) => string)(ctx), (sandbox.mirrorPersistence as (c: unknown) => string)(ctx)];
}

async function pageHeadFor(who: Person): Promise<string> {
  const reply = await h.send('GET', '/', who, undefined, { accept: 'text/html' });
  assert.equal(reply.status, 200);
  return /<head[^>]*>([\s\S]*?)<\/head>/i.exec(reply.body)?.[1] ?? '';
}

test('S16: the patched settings bundle gives a seat page memory and the owner page host persistence', async () => {
  const { root, file, cleanup } = dshRoot(UNPATCHED);
  try {
    assert.equal(applyRemotePatch(root), 'applied');
    assert.equal(patchStatus(root).settingsHostMode, true);
    const patched = readFileSync(file, 'utf8');
    assert.ok(!patched.includes('isLoopback'), 'the loopback decision is replaced at both places');
    assert.deepEqual(persistenceOn(patched, await pageHeadFor(seat)), ['memory', 'memory']);
    assert.deepEqual(persistenceOn(patched, await pageHeadFor(master)), ['host', 'host']);
    // A page the gateway did not write (no head of ours) keeps upstream's forced host mode.
    assert.deepEqual(persistenceOn(patched, ''), ['host', 'host']);
  } finally {
    cleanup();
  }
});

test('S16: a bundle an older gateway forced to "host" is moved to the seat-aware decision', () => {
  const { root, file, cleanup } = dshRoot(UNPATCHED);
  try {
    // What the previous release left behind: upstream's patch output plus its hashed backup.
    const forced = UNPATCHED.replaceAll('ctx.remote.$host.isLoopback ? "host" : "memory"', '"host"');
    writeFileSync(file + '.bak-dshpw', UNPATCHED);
    writeFileSync(file + '.sha256-dshpw', JSON.stringify({
      originalSha256: sha256(UNPATCHED),
      patchedSha256: sha256(forced),
    }) + '\n');
    writeFileSync(file, forced);
    assert.equal(patchStatus(root).settingsHostMode, false, 'the old forced bundle is not the current patch');
    assert.equal(applyRemotePatch(root), 'applied');
    assert.equal(patchStatus(root).settingsHostMode, true);
    assert.deepEqual(persistenceOn(readFileSync(file, 'utf8'), ''), ['host', 'host']);
    assert.equal(readFileSync(file + '.bak-dshpw', 'utf8'), UNPATCHED, 'the backup still holds dsh\'s own file');
    assert.equal(applyRemotePatch(root), 'unchanged');
  } finally {
    cleanup();
  }
});

test('S16: the seat still cannot write the host-wide settings document', async () => {
  for (const ns of ['ui-theme', 'locale', 'llm']) {
    const before = h.reached('/api/settings/mutate');
    const reply = await h.rpc('settings/mutate', { ns, ops: [{ op: 'set', path: ['preference'], value: 'dark' }] }, seat);
    assert.equal(reply.status, 403, ns);
    assert.equal(h.reached('/api/settings/mutate'), before, `${ns}: nothing reached dsh`);
  }
});

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
