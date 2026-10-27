/**
 * The Tracy cases of the 2.6.6 fork's `gateway-proxy-headers.test.ts` (R1–R5, R9, R10), ported
 * through the real gateway: better-sidebar's routes for a seat (H1 at the gate, finished in the
 * proxy) and the bodies they carry (H2). Every refusal also asserts the plugin never heard of it.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, workspaceList, type Harness, type Person } from './gateway-harness.js';

let h: Harness;
let lastUpstreamUrl = '';

before(async () => {
  h = await startHarness((seen) => {
    lastUpstreamUrl = seen.url;
    if (/^\/api\/workspace[./]list/.test(seen.url)) {
      return workspaceList([
        { workspaceId: 'w-a', path: '/workspaces/a', sessionIds: ['s-active', 's-disabled'] },
        { workspaceId: 'w-b', path: '/workspaces/b', sessionIds: ['s-other-user'] },
      ]);
    }
    return { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, path: seen.url }) };
  });
});

after(async () => { await h.close(); });

async function seat(name: string, allowUpload: boolean, folders: string[] = ['/workspaces/a']): Promise<Person> {
  const who = h.seat(name, { folders, allowUpload, sessions: ['s-active', 's-disabled'], disabledSessions: ['s-disabled'] });
  assert.equal((await h.send('POST', '/api/workspace.list', who, '{}')).status, 200);
  return who;
}

test('R5: better-sidebar host routes are refused to a seat with no folder at the gate', async () => {
  const denied = h.seat('sidebar-denied', { folders: [], allowUpload: true });
  for (const path of ['/sidebar/api/fs.tree', '/sidebar/upload', '/sidebar/file/x', '/sidebar/html/x']) {
    lastUpstreamUrl = '';
    const response = await h.send('POST', path, denied, '{}');
    assert.equal(response.status, 403, `${path} must be denied before upstream`);
    assert.equal(lastUpstreamUrl, '');
  }
});

test('R1–R5, R10: a seat reaches better-sidebar Files routes only through a session it is granted', async () => {
  const who = await seat('sidebar-seat', true);
  const rpc = (method: string, body: unknown) => h.send('POST', `/sidebar/api/${method}`, who, JSON.stringify(body));
  for (const method of ['session.cwd', 'fs.tree', 'fs.read', 'fs.search', 'fs.write', 'fs.rename', 'fs.remove', 'changes.ops']) {
    lastUpstreamUrl = '';
    const ok = await rpc(method, { sessionId: 's-active', path: 'README.md', content: '', query: 'x' });
    assert.equal(ok.status, 200, `${method} with a granted session must reach the plugin`);
    assert.equal(lastUpstreamUrl, `/sidebar/api/${method}`);
  }
  for (const body of [{}, { sessionId: 's-disabled' }, { sessionId: 's-other-user' }, { sessionId: 'nope' }]) {
    lastUpstreamUrl = '';
    assert.equal((await rpc('fs.tree', body)).status, 403, `fs.tree ${JSON.stringify(body)} must be denied`);
    assert.equal(lastUpstreamUrl, '', 'and never reach the plugin');
  }
  lastUpstreamUrl = '';
  assert.equal((await rpc('subagents.live', { rootSessionId: 's-active' })).status, 200, 'own root session');
  assert.equal(lastUpstreamUrl, '/sidebar/api/subagents.live');
  for (const body of [{}, { rootSessionId: 's-other-user' }, { rootSessionId: 's-disabled' }, { rootSessionId: 7 }, { rootSessionId: 's-other-user', sessionId: 's-active' }]) {
    lastUpstreamUrl = '';
    assert.equal((await rpc('subagents.live', body)).status, 403, `subagents.live ${JSON.stringify(body)}`);
    assert.equal(lastUpstreamUrl, '');
  }
  for (const method of ['fs.rename', 'fs.remove', 'changes.ops']) {
    lastUpstreamUrl = '';
    assert.equal((await rpc(method, { sessionId: 's-other-user', path: 'x', name: 'y' })).status, 403, `${method} on another seat's session`);
    assert.equal(lastUpstreamUrl, '');
  }
  assert.equal((await rpc('fs.tree', { sessionId: 's-active', extra: { sessionId: 's-other-user' } })).status, 403);
  assert.equal((await rpc('settings.get', {})).status, 200, 'settings.get is how a seat learns the deployment prefs');
  assert.equal((await rpc('settings.update', { value: {} })).status, 403, 'settings.update must stay owner-only');
  for (const method of ['git.status', 'shell.get', 'browser.probe', 'sidechat.start']) {
    lastUpstreamUrl = '';
    assert.equal((await rpc(method, { sessionId: 's-active', url: 'http://x' })).status, 403, `${method} must stay owner-only`);
    assert.equal(lastUpstreamUrl, '');
  }
  lastUpstreamUrl = '';
  assert.equal((await h.send('GET', '/sidebar/file?sessionId=s-active&path=README.md', who)).status, 200);
  assert.equal(lastUpstreamUrl, '/sidebar/file?sessionId=s-active&path=README.md');
  for (const q of ['path=README.md', 'sessionId=s-other-user&path=x', 'sessionId=s-disabled&path=x']) {
    lastUpstreamUrl = '';
    assert.equal((await h.send('GET', `/sidebar/file?${q}`, who)).status, 403, q);
    assert.equal(lastUpstreamUrl, '');
  }
  lastUpstreamUrl = '';
  assert.equal((await h.send('GET', '/sidebar/html/s-active/workspaces/a/out/email.html', who)).status, 200, 'a seat previews an HTML file of its own session');
  assert.equal(lastUpstreamUrl, '/sidebar/html/s-active/workspaces/a/out/email.html');
  for (const path of [
    '/sidebar/html/s-other-user/workspaces/a/x.html',
    '/sidebar/html/s-disabled/workspaces/a/x.html',
    '/sidebar/html/nope/workspaces/a/x.html',
    '/sidebar/html/s-active',
    '/sidebar/html/s-active/',
    '/sidebar/html//workspaces/a/x.html',
    '/sidebar/html/%E0%A4%A/x.html',
  ]) {
    lastUpstreamUrl = '';
    assert.equal((await h.send('GET', path, who)).status, 403, path);
    assert.equal(lastUpstreamUrl, '', `${path} never reaches the plugin`);
  }
  lastUpstreamUrl = '';
  assert.equal((await h.send('POST', '/sidebar/html/s-active/workspaces/a/x.html', who, '{}')).status, 403, 'preview is read-only');
  assert.equal(lastUpstreamUrl, '');
  for (const path of ['/workspaces/a/img.png', '/workspaces/a/docs/a.pdf']) {
    lastUpstreamUrl = '';
    assert.equal((await h.send('GET', `/api/file?path=${encodeURIComponent(path)}`, who)).status, 200, `${path} is a file of the seat's session`);
    assert.ok(lastUpstreamUrl.startsWith('/api/file?'));
  }
  for (const q of [
    'path=%2Fdesk-home%2Fdsh-passwords.env',
    'path=%2Fetc%2Fpasswd',
    'path=%2Fworkspaces%2Fb%2Fsecret.txt',
    'path=%2Fworkspaces%2Fa%2F..%2Fb%2Fsecret.txt',
    'path=%2Fworkspaces%2Fab%2Fx',
    'path=workspaces%2Fa%2Fimg.png',
    'path=%2Fworkspaces%2Fa%2Fimg.png&path=%2Fetc%2Fpasswd',
    '',
  ]) {
    lastUpstreamUrl = '';
    assert.equal((await h.send('GET', `/api/file?${q}`, who)).status, 403, q);
    assert.equal((await h.send('HEAD', `/api/file/?${q}`, who)).status, 403, `HEAD ${q}`);
    assert.equal(lastUpstreamUrl, '', `${q} never reaches dsh`);
  }
  lastUpstreamUrl = '';
  const up = await h.send('POST', '/sidebar/upload?sessionId=s-active&dir=.&relativePath=a.txt', who, 'hello', { 'content-type': 'application/octet-stream' });
  assert.equal(up.status, 200, up.body);
  assert.equal(lastUpstreamUrl, '/sidebar/upload?sessionId=s-active&dir=.&relativePath=a.txt');
  lastUpstreamUrl = '';
  assert.equal((await h.send('POST', '/sidebar/upload?dir=.&relativePath=a.txt', who, 'hello', { 'content-type': 'application/octet-stream' })).status, 403);
  assert.equal(lastUpstreamUrl, '');
});

test('R9: a seat asks tracy-site-tools /held only about a session it is granted (TCH #517)', async () => {
  const who = await seat('held-seat', false);
  lastUpstreamUrl = '';
  assert.equal((await h.send('POST', '/api/tracy-site-tools/held', who, JSON.stringify({ sessionId: 's-active' }))).status, 200, 'a granted session reaches the plugin');
  assert.equal(lastUpstreamUrl, '/api/tracy-site-tools/held');
  for (const [path, body] of [
    ['/api/tracy-site-tools/held', '{}'],
    ['/api/tracy-site-tools/held', JSON.stringify({ sessionId: 's-other-user' })],
    ['/api/tracy-site-tools/held', JSON.stringify({ sessionId: 's-disabled' })],
    ['/api/tracy-site-tools/held', JSON.stringify({ sessionId: 's-active', also: { sessionId: 's-other-user' } })],
    ['/api/tracy-site-tools/held', 'not json'],
    // The plugin strips trailing slashes before it routes; the gate must not be passed that way.
    ['/api/tracy-site-tools/held/', JSON.stringify({ sessionId: 's-other-user' })],
  ] as const) {
    lastUpstreamUrl = '';
    assert.equal((await h.send('POST', path, who, body)).status, 403, `${path} ${body} must be denied`);
    assert.equal(lastUpstreamUrl, '', 'and never reach the plugin');
  }
});

test('R2: a seat without allow_upload can read through the sidebar but not write', async () => {
  const who = await seat('sidebar-seat-ro', false);
  lastUpstreamUrl = '';
  assert.equal((await h.send('POST', '/sidebar/api/fs.read', who, JSON.stringify({ sessionId: 's-active', path: 'x' }))).status, 200);
  assert.equal(lastUpstreamUrl, '/sidebar/api/fs.read');
  for (const [path, body] of [
    ['/sidebar/api/fs.write', JSON.stringify({ sessionId: 's-active', path: 'x', content: '' })],
    ['/sidebar/api/fs.rename', JSON.stringify({ sessionId: 's-active', path: 'x', name: 'y' })],
    ['/sidebar/api/fs.remove', JSON.stringify({ sessionId: 's-active', path: 'x' })],
    ['/sidebar/upload?sessionId=s-active&dir=.&relativePath=a.txt', 'hello'],
  ] as const) {
    lastUpstreamUrl = '';
    const denied = await h.send('POST', path, who, body, { 'content-type': path.startsWith('/sidebar/upload') ? 'application/octet-stream' : 'application/json' });
    assert.equal(denied.status, 403, `${path} must need allow_upload`);
    assert.equal(lastUpstreamUrl, '');
  }
});
