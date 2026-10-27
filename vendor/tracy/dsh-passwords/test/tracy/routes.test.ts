// Tracy seat route table (R1–R11): pure decisions, no gateway. Each case names its invariant id
// (TRACY-FORK.md §2). Ported from the 2.6.6 fork's permissions-pure / extract-path cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeatBody, classifySeatHttp, classifySeatWs, seatRouteSessionOf, fileDoorTarget, seatMayReadFile } from '../../src/tracy/routes.js';

const seatRoute = (sessionFrom: string, write = false) => ({ kind: 'seat-route', sessionFrom, write });

test('R1: a seat reaches the Files read routes, fs.trees included, with the session in the body', () => {
  for (const rpc of ['session.cwd', 'fs.tree', 'fs.trees', 'fs.read', 'fs.search', 'archive.build', 'archive.status', 'changes.ops']) {
    assert.deepEqual(classifySeatHttp('POST', `/sidebar/api/${rpc}`), seatRoute('body'), rpc);
    assert.deepEqual(classifySeatHttp('GET', `/sidebar/api/${rpc}`), { kind: 'owner-only' }, `${rpc} GET`);
  }
  // Prefix tricks do not widen the table.
  for (const p of ['/sidebar/api/fs.tree/', '/sidebar/api/fs.treex', '/sidebar/api', '/sidebar/api/', '/sidebar', '/sidebar/frame']) {
    assert.deepEqual(classifySeatHttp('POST', p), { kind: 'owner-only' }, p);
  }
  // Outside /sidebar the table says nothing: upstream's classification decides.
  assert.deepEqual(classifySeatHttp('POST', '/api/events.mux'), { kind: 'unknown' });
  assert.deepEqual(classifySeatHttp('POST', '/sidebarx/api/fs.tree'), { kind: 'unknown' });
});

test('R2: the Files write routes and /sidebar/upload are seat routes that also need allow_upload', () => {
  for (const rpc of ['fs.write', 'fs.rename', 'fs.remove', 'fs.mkdir']) {
    assert.deepEqual(classifySeatHttp('POST', `/sidebar/api/${rpc}`), seatRoute('body', true), rpc);
  }
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/upload'), seatRoute('query', true));
  assert.deepEqual(classifySeatHttp('GET', '/sidebar/upload'), { kind: 'owner-only' });
  assert.deepEqual(classifySeatHttp('DELETE', '/sidebar/upload'), { kind: 'owner-only' });
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/uploadx'), { kind: 'owner-only' });
  // A zip build and the read routes stay reads.
  for (const rpc of ['fs.read', 'fs.trees', 'archive.build', 'archive.status', 'changes.ops']) {
    assert.equal((classifySeatHttp('POST', `/sidebar/api/${rpc}`) as { write?: boolean }).write, false, rpc);
  }
});

test('R3: /sidebar/file and /sidebar/archive name the session in the query; /sidebar/html/<sid>/… in the path', () => {
  for (const method of ['GET', 'HEAD']) {
    assert.deepEqual(classifySeatHttp(method, '/sidebar/file'), seatRoute('query'), `${method} file`);
    assert.deepEqual(classifySeatHttp(method, '/sidebar/archive'), seatRoute('query'), `${method} archive`);
    assert.deepEqual(classifySeatHttp(method, '/sidebar/html/s1/a/b.html'), seatRoute('path'), `${method} html`);
  }
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/file'), { kind: 'owner-only' });
  assert.deepEqual(classifySeatHttp('GET', '/sidebar/file/x'), { kind: 'owner-only' });
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/html/s1/a.html'), { kind: 'owner-only' });
  // Not a well-formed preview reference: no session, no file segment, bad encoding.
  for (const p of ['/sidebar/html/s1', '/sidebar/html/s1/', '/sidebar/html//a.html', '/sidebar/html/', '/sidebar/html', '/sidebar/htmlx/s1/a', '/sidebar/html/%E0%A4%A/a']) {
    assert.deepEqual(classifySeatHttp('GET', p), { kind: 'owner-only' }, p);
  }
});

test('R4: subagents.live is a read seat route whose session rides in rootSessionId', () => {
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/api/subagents.live'), seatRoute('rootSessionId'));
  assert.deepEqual(classifySeatHttp('GET', '/sidebar/api/subagents.live'), { kind: 'owner-only' });
});

test('R5: jobs.*, browser.probe, sidechat.*, terminals and git are owner-only for a seat', () => {
  const ownerOnly = [
    'jobs.list', 'jobs.output', 'jobs.kill', 'jobs.remove', 'browser.probe', 'browser.report',
    'sidechat.create', 'sidechat.start', 'sidechat.prompt', 'sidechat.events',
    'git.status', 'git.commit', 'shell.get', 'terminal.deps', 'workflows.list', 'fs.watch',
  ];
  for (const rpc of ownerOnly) {
    for (const method of ['POST', 'GET']) {
      assert.deepEqual(classifySeatHttp(method, `/sidebar/api/${rpc}`), { kind: 'owner-only' }, `${method} ${rpc}`);
    }
  }
  for (const p of ['/sidebar/ws/terminal', '/sidebar/ws/agent-terminals', '/sidebar/ws/fs-watch', '/sidebar/ws/agent-opens']) {
    assert.deepEqual(classifySeatHttp('GET', p), { kind: 'owner-only' }, `${p} is never an HTTP seat route`);
  }
});

test('R7: a seat may read the side card prefs (settings.get, no session); settings.update stays owner-only', () => {
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/api/settings.get'), seatRoute('none'));
  assert.deepEqual(classifySeatHttp('GET', '/sidebar/api/settings.get'), { kind: 'owner-only' });
  assert.deepEqual(classifySeatHttp('POST', '/sidebar/api/settings.update'), { kind: 'owner-only' });
});

test('R8: the side card lazy chunks GET/HEAD /sidebar/bundle/<name>.js are open to a seat, one flat segment only', () => {
  for (const chunk of ['editor', 'terminal', 'mermaid', 'locale']) {
    assert.deepEqual(classifySeatHttp('GET', `/sidebar/bundle/${chunk}.js`), seatRoute('none'), chunk);
    assert.deepEqual(classifySeatHttp('HEAD', `/sidebar/bundle/${chunk}.js`), seatRoute('none'), `${chunk} HEAD`);
    assert.deepEqual(classifySeatHttp('POST', `/sidebar/bundle/${chunk}.js`), { kind: 'owner-only' }, `${chunk} POST`);
  }
  for (const p of ['/sidebar/bundle', '/sidebar/bundle/', '/sidebar/bundle/editor', '/sidebar/bundle/editor.js.map', '/sidebar/bundle/../file', '/sidebar/bundle/a/b.js', '/sidebar/bundlex/editor.js', '/sidebar/bundle/Editor.js']) {
    assert.deepEqual(classifySeatHttp('GET', p), { kind: 'owner-only' }, p);
  }
});

test('R9: POST /api/tracy-site-tools/held is a seat route about the one session named in its body', () => {
  for (const p of ['/api/tracy-site-tools/held', '/api/tracy-site-tools/held/', '/api/tracy-site-tools/held//']) {
    assert.deepEqual(classifySeatHttp('POST', p), seatRoute('body'), p);
  }
  for (const p of ['/api/tracy-site-tools/hello', '/api/tracy-site-tools/heldx', '/x/api/tracy-site-tools/held']) {
    assert.deepEqual(classifySeatHttp('POST', p), { kind: 'unknown' }, p);
  }
  assert.deepEqual(classifySeatHttp('GET', '/api/tracy-site-tools/held'), { kind: 'unknown' }, 'upstream decides other verbs');
});

test('R11: GET/HEAD of the root /manifest.webmanifest is public; nothing next to it is', () => {
  assert.deepEqual(classifySeatHttp('GET', '/manifest.webmanifest'), { kind: 'public' });
  assert.deepEqual(classifySeatHttp('HEAD', '/manifest.webmanifest'), { kind: 'public' });
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    assert.deepEqual(classifySeatHttp(method, '/manifest.webmanifest'), { kind: 'unknown' }, method);
  }
  for (const p of ['/manifest.webmanifest/', '/manifest.webmanifest/x', '/manifest.webmanifestx', '/x/manifest.webmanifest', '/manifest.json', '/favicon.svg', '/', '']) {
    assert.deepEqual(classifySeatHttp('GET', p), { kind: 'unknown' }, p);
  }
});

test('R10: dsh /api/file is a seat file door; a seat reads only inside the folders of sessions it holds, realpath included', () => {
  for (const p of ['/api/file', '/api/file/']) {
    assert.deepEqual(classifySeatHttp('GET', p), { kind: 'seat-file' }, p);
    assert.deepEqual(classifySeatHttp('HEAD', p), { kind: 'seat-file' }, `${p} HEAD`);
  }
  assert.deepEqual(classifySeatHttp('POST', '/api/file'), { kind: 'unknown' });
  assert.deepEqual(classifySeatHttp('GET', '/api/files'), { kind: 'unknown' });
  // The target is the one `path` query value; missing or repeated reads as null.
  assert.equal(fileDoorTarget(new URLSearchParams('path=/srv/site-a/x.png')), '/srv/site-a/x.png');
  assert.equal(fileDoorTarget(new URLSearchParams('path=/srv/site-a/x&path=/etc/passwd')), null);
  assert.equal(fileDoorTarget(new URLSearchParams('p=/srv/site-a/x')), null);
  const folders = ['/srv/site-a'];
  assert.equal(seatMayReadFile('/srv/site-a/img.png', folders), true);
  assert.equal(seatMayReadFile('/srv/site-a', folders), true);
  for (const target of ['/srv/site-ab/x', '/srv/site-a/../site-b/x', '/desk-home/dsh-passwords.env', 'srv/site-a/x', '', null, '/srv/site-a/\0x']) {
    assert.equal(seatMayReadFile(target, folders), false, String(target));
  }
  assert.equal(seatMayReadFile('/etc/passwd', []), false, 'no session, no file');
  assert.equal(seatMayReadFile('/etc/passwd', ['/']), false, 'a root folder never opens the disk');
  for (const root of ['C:\\', 'c:/', 'C:']) {
    assert.equal(seatMayReadFile('C:\\Windows\\win.ini', [root]), false, `drive root ${root} never opens the drive`);
  }
  assert.equal(seatMayReadFile('/srv/site-a/x', ['.']), false, 'a relative folder opens nothing');
  // The caller resolves symlinks (I/O); the decision needs both paths inside.
  assert.equal(seatMayReadFile('/srv/site-a/link', folders, '/desk-home/dsh-passwords.env'), false, 'a symlink out is refused');
  assert.equal(seatMayReadFile('/srv/site-a/link', folders, '/srv/site-a/real.png'), true);
});

test('R6: a seat opens exactly two sidebar WebSockets, fs-watch and agent-opens, with the session in the query', () => {
  for (const p of ['/sidebar/ws/fs-watch', '/sidebar/ws/agent-opens']) {
    assert.deepEqual(classifySeatWs(p), seatRoute('query'), p);
  }
  for (const p of [
    '/sidebar/ws/terminal', '/sidebar/ws/agent-terminals', '/sidebar/ws/fs-watch/x', '/sidebar/ws/fs-watchx',
    '/sidebar/ws/agent-opens/x', '/sidebar/ws/agent-opensx', '/sidebar/ws/agent-open', '/sidebar/ws/',
    '/sidebar/api/fs.tree', '/sidebar/file', '/sidebar/upload', '/sidebar/bundle/editor.js', '/sidebar',
  ]) {
    assert.deepEqual(classifySeatWs(p), { kind: 'owner-only' }, `${p} stays owner-only on the upgrade path`);
  }
  assert.deepEqual(classifySeatWs('/api/events.mux'), { kind: 'unknown' }, 'upstream decides its own sockets');
});

test('R3/R4/R6: the one session a seat route names, read where the table says, else null', () => {
  const q = (s: string) => new URLSearchParams(s);
  // R3, R6: exactly one `sessionId` in the query; a repeated key names no session.
  assert.equal(seatRouteSessionOf('query', { path: '/sidebar/file', query: q('sessionId=s1&path=a') }), 's1');
  assert.equal(seatRouteSessionOf('query', { path: '/sidebar/file', query: q('sessionId=s1&sessionId=s2') }), null);
  assert.equal(seatRouteSessionOf('query', { path: '/sidebar/file', query: q('sessionId=') }), null);
  assert.equal(seatRouteSessionOf('query', { path: '/sidebar/file', query: q('') }), null);
  // R3: the HTML preview names it in the path, decoded once.
  assert.equal(seatRouteSessionOf('path', { path: '/sidebar/html/s%201/a.html', query: q('sessionId=other') }), 's 1');
  assert.equal(seatRouteSessionOf('path', { path: '/sidebar/html/s1', query: q('') }), null);
  // R1, R9: a top-level string `sessionId` in the body.
  assert.equal(seatRouteSessionOf('body', { path: '/sidebar/api/fs.read', query: q(''), body: { sessionId: 's1', path: 'a' } }), 's1');
  for (const body of [{ sessionId: 7 }, { sessionId: '' }, { request: { sessionId: 's1' } }, null, ['s1'], 's1', undefined]) {
    assert.equal(seatRouteSessionOf('body', { path: '/sidebar/api/fs.read', query: q(''), body }), null, JSON.stringify(body));
  }
  // R4: subagents.live names it as `rootSessionId`; a `sessionId` beside it is not the route's key.
  assert.equal(seatRouteSessionOf('rootSessionId', { path: '/sidebar/api/subagents.live', query: q(''), body: { rootSessionId: 'r1' } }), 'r1');
  assert.equal(seatRouteSessionOf('rootSessionId', { path: '/sidebar/api/subagents.live', query: q(''), body: { sessionId: 'r1' } }), null);
});

test('R1/R4: the sidebar body check refuses any other session the body names, as the 2.6.6 fork did (agentId, parent/child)', () => {
  const holds = (id: unknown) => id === 'mine';
  const check = (route: string, body: unknown) => checkSeatBody({ route, body, holdsSession: holds }).kind;
  assert.equal(check('fs.read', { sessionId: 'mine', path: 'a' }), 'pass');
  assert.equal(check('subagents.live', { rootSessionId: 'mine' }), 'pass');
  for (const extra of [{ agentId: 'theirs' }, { parentSessionId: 'theirs' }, { childSessionId: 'theirs' }, { nested: { sessionId: 'theirs' } }, { rootSessionId: 'theirs' }]) {
    assert.equal(check('fs.read', { sessionId: 'mine', ...extra }), 'deny', JSON.stringify(extra));
  }
  assert.equal(check('subagents.live', { rootSessionId: 'mine', agentId: 'theirs' }), 'deny');
  // The route's own key must be there; rows without a body session are not body-checked.
  assert.equal(check('fs.read', { agentId: 'mine' }), 'deny');
  assert.equal(check('subagents.live', { sessionId: 'mine' }), 'deny');
  for (const route of ['settings.get', 'jobs.list']) assert.equal(check(route, { sessionId: 'mine' }), 'deny', route);
  // Phase 2: a write route's body is held to the same rule (allow_upload is checked before, in
  // decideSeatRequest), so a foreign session cannot ride along in an fs.write either.
  assert.equal(check('fs.write', { sessionId: 'mine', path: 'a' }), 'pass');
  assert.equal(check('fs.write', { sessionId: 'mine', nested: { sessionId: 'theirs' } }), 'deny');
});
