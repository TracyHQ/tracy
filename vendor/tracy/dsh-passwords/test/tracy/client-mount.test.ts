// K5 (client half), every call site: a page served under a mount (`<base href="/new/">` on the
// creation workspace, `<base href="/<site>/">` on a site) must send every dsh-passwords and
// gateway request under that mount. 2.6.6-tracy.64 did; the 2.7.7 rebase (2.7.7-tracy.1) kept
// `dshUrl` but dropped every call to it, so `/new/s/<id>` asked `/api/dsh-passwords/state` and
// `/gateway/api/messages` at the host's bare root and got two 404s per load (measured 09/10 on a
// private stand). A site page hid the bug only because tracy-web recovers a site from the Referer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from '../../src/client/api.ts';

function withMountedPage(baseHref: string, href: string): () => void {
  const g = globalThis as Record<string, unknown>;
  g.document = { querySelector: (sel: string) => (sel === 'base[href]' ? { getAttribute: () => baseHref } : null) };
  g.location = { href };
  return () => {
    delete g.document;
    delete g.location;
  };
}

test('K5: api() on the creation workspace sends the request under /new/', async (t) => {
  const restore = withMountedPage('/new/', 'https://host.example/new/s/session-1');
  t.after(restore);
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  await api('/api/dsh-passwords/state');
  assert.equal(fetch.mock.calls[0].arguments[0], 'https://host.example/new/api/dsh-passwords/state');
});

test('K5: api() on a mounted page still recognises the mounted sign-in redirect', async (t) => {
  const restore = withMountedPage('/new/', 'https://host.example/new/s/session-1');
  t.after(restore);
  const response = new Response('<!doctype html><title>Login</title>');
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: 'https://host.example/new/gateway/login?next=%2F' },
  });
  t.mock.method(globalThis, 'fetch', async () => response);
  await assert.rejects(api('/gateway/api/overview'), { code: 'NOT_AUTHENTICATED' });
});

// The guard for the failure that actually happened: a rebase onto upstream silently restoring the
// bare literals. Every root-relative dsh/gateway URL literal in the client must be the argument of
// `dshUrl(…)` or of `api(…)` (which applies it, proven above), or a constant only ever read that way.
const CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../src/client');
const URL_LITERAL = /(['"`])\/(?:api|gateway)\/[^'"`]*\1/g;
const WRAPPED_BEFORE = /(?:\bdshUrl|\bapi(?:<[^()]*>)?)\(\s*$/;

function withoutComments(source: string): string {
  // Blank out comments but keep offsets and line numbers.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (c, lead: string) => lead + ' '.repeat(c.length - lead.length));
}

test('K5: every dsh/gateway URL in the client goes through dshUrl', () => {
  const offenders: string[] = [];
  for (const name of readdirSync(CLIENT_DIR)) {
    if (!/\.tsx?$/.test(name)) continue;
    const code = withoutComments(readFileSync(join(CLIENT_DIR, name), 'utf8'));
    for (const m of code.matchAll(URL_LITERAL)) {
      const before = code.slice(Math.max(0, m.index - 400), m.index);
      const line = code.slice(0, m.index).split('\n').length;
      if (WRAPPED_BEFORE.test(before)) continue;
      const constant = /\bconst\s+([A-Z_]+)\s*=\s*$/.exec(before)?.[1];
      if (constant) {
        // A constant only compared against (`=== CONST`, `.endsWith(CONST)`) matches another
        // plugin's request; it is never fetched, so there is nothing to place under the mount.
        const matches = code.split(new RegExp(`(?:===\\s*|\\.endsWith\\(\\s*)${constant}\\b`)).length - 1;
        const uses = code.split(new RegExp(`\\b${constant}\\b`)).length - 2 - matches;
        if (uses === 0 && matches > 0) continue;
        const wrapped = code.split(new RegExp(`\\bdshUrl\\(\\s*${constant}\\b`)).length - 1;
        if (uses > 0 && uses === wrapped) continue;
        offenders.push(`${name}:${line} ${constant} is read ${uses}x, through dshUrl ${wrapped}x`);
        continue;
      }
      offenders.push(`${name}:${line} ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});
