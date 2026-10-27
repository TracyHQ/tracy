// Seat context: the pure rules that say which folders, workspaces and sessions a seat holds.
// Each case names the invariant it keeps (tasks/evidence/dsh-passwords-2-7-7/pw-tracy-invariants.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_FOLDERS_HEADER, directoryPickerPathFor, grantFromCreateAnswer, learnWorkspacePath, seatHoldsSession, SEAT_ROLES, seatRoleOf, toolsetsForRole, applyAllowedFoldersHeader, insideBox, permissionsFor, seatFoldersFor, sharedGrantExempt, workspaceCreateExempt, workspaceListed } from '../../src/tracy/seat-context.js';

test('S1: a seat lists a workspace only when its path IS a granted folder, never one inside it', () => {
  assert.equal(workspaceListed('/site/a', ['/site/a']), true);
  assert.equal(workspaceListed('/site/a/', ['/site/a']), true, 'a trailing slash names the same folder');
  assert.equal(workspaceListed('/site/a', ['/site/a/']), true);
  assert.equal(workspaceListed('/site/a/sub', ['/site/a']), false, 'a sub-folder is not listed');
  assert.equal(workspaceListed('/site/b', ['/site/a']), false, 'another site is never listed');
  assert.equal(workspaceListed('/site/a/../b', ['/site/a']), false, 'dot segments resolve before comparing');
});

test('S1: an empty grant denies (`__deny__`), and an unrestricted (master) view lists everything', () => {
  assert.equal(workspaceListed('/site/a', ['__deny__']), false);
  assert.equal(workspaceListed('/site/a', ['__deny__', '/site/a']), false, 'the sentinel wins over any folder');
  assert.equal(workspaceListed('/anything', []), true);
});

test('S3: a write or create lands only inside the seat box — the folder itself or below it', () => {
  const box = ['/site/a'];
  assert.equal(insideBox('/site/a', box), true);
  assert.equal(insideBox('/site/a/TracyWork', box), true);
  assert.equal(insideBox('/site/ab', box), false, 'a sibling sharing a prefix is outside');
  assert.equal(insideBox('/site/a/../b', box), false);
  assert.equal(insideBox('site/a', box), false, 'a relative path is never inside');
  assert.equal(insideBox('/site/a', ['__deny__']), false);
  assert.equal(insideBox('/site/a', []), false, 'no box, nothing inside it (fail-closed)');
});

test('S3: only a seat with no real folder (`__deny__`, upstream bootstrap) is exempt from the create box', () => {
  assert.equal(workspaceCreateExempt({ allowed_folders: ['__deny__'] }), true);
  assert.equal(workspaceCreateExempt({ allowed_folders: ['/site/a'] }), false);
  assert.equal(workspaceCreateExempt({ allowed_folders: ['__deny__', '/site/a'] }), false);
});

test('S2: two seats granted the same site folder share it — another seat registering it blocks nobody', () => {
  assert.equal(sharedGrantExempt(['/site/a'], ['/site/a'], '/site/a'), true);
  assert.equal(sharedGrantExempt(['/site/a'], ['/site/a'], '/site/a/TracyWork'), true, 'a workspace inside the shared folder');
  assert.equal(sharedGrantExempt(['/site/a/'], ['/site/a'], '/site/a'), true, 'trailing slashes do not split a grant');
});

test('S2: the one-folder-one-owner rule still guards folders the two seats do not share', () => {
  assert.equal(sharedGrantExempt(['/site/b'], ['/site/a'], '/site/a'), false, 'another site');
  // A seat granted a PARENT folder does not reach into another seat's sub-folder (upstream 1673).
  assert.equal(sharedGrantExempt(['/site'], ['/site/a'], '/site/a'), false);
  assert.equal(sharedGrantExempt(['/site/a'], ['/site'], '/site/a'), false);
  assert.equal(sharedGrantExempt(['/site/a'], ['/site/a'], '/site/b'), false, 'the owned path lies outside the shared folder');
  assert.equal(sharedGrantExempt(['__deny__'], ['__deny__'], '/site/a'), false, 'the sentinel is not a folder');
  assert.equal(sharedGrantExempt([], [], '/site/a'), false, 'unrestricted rows share nothing (fail-closed)');
});

test('S10: a seat folder is /site/<label> as dsh stores it — after realpath', () => {
  const realpath = (p: string): string => (p === '/site/alpha' ? '/srv/sites/alpha' : p);
  assert.deepEqual(seatFoldersFor('alpha', realpath), ['/srv/sites/alpha']);
  assert.deepEqual(seatFoldersFor('beta', (p) => p), ['/site/beta']);
});

test('S10: a folder not on disk yet keeps its declared path; no label means the single-site webroot', () => {
  const missing = (): string => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  };
  assert.deepEqual(seatFoldersFor('alpha', missing), ['/site/alpha']);
  assert.deepEqual(seatFoldersFor('', (p) => p), ['/var/www/html']);
});

test('S10: a label that is not one path segment names no folder — the seat gets `__deny__`, never an empty list', () => {
  for (const label of ['../etc', 'a/b', '.', '..', 'a\\b']) {
    assert.deepEqual(seatFoldersFor(label, (p) => p), ['__deny__'], label);
  }
});

test('S3: a path with a backslash is never inside a box (upstream reads it as a separator)', () => {
  assert.equal(insideBox('/site/a/x\\..\\..\\..\\etc', ['/site/a']), false);
  assert.equal(workspaceListed('/site/a\\', ['/site/a']), false);
});

const TERMINAL_RULES = ['/sidebar/ws/terminal'];
const grantOf = (role: (typeof SEAT_ROLES)[number], toolsets?: Array<'content' | 'code' | 'site' | 'lifecycle'>) =>
  permissionsFor({ role, folders: ['/site/alpha'], terminalRules: TERMINAL_RULES, toolsets });

test('S6: no seat is ever granted every folder — an empty grant denies', () => {
  for (const role of SEAT_ROLES) {
    assert.deepEqual(permissionsFor({ role, folders: [], terminalRules: TERMINAL_RULES }).allowedFolders, ['__deny__'], role);
    assert.deepEqual(permissionsFor({ role, folders: ['', '  '], terminalRules: [] }).allowedFolders, ['__deny__'], `${role}: blank entries`);
  }
});

test('S8/S14: editors and owners work the whole site (git, terminal, workspaces); a viewer reads only', () => {
  for (const role of ['editor', 'owner'] as const) {
    const perms = grantOf(role);
    assert.deepEqual(perms.allowedFolders, ['/site/alpha'], role);
    assert.equal(perms.allowUpload, true, role);
    assert.equal(perms.allowGitDownload, true, role);
    assert.equal(perms.allowWorkspaceCreate, true, role);
    assert.deepEqual(perms.webSocketPaths, TERMINAL_RULES, role);
    assert.equal(perms.sandboxMode, null, `${role} keeps the harness default`);
  }
  const viewer = grantOf('viewer');
  assert.deepEqual(viewer.allowedFolders, ['/site/alpha'], 'a viewer sees its own site folder');
  assert.equal(viewer.sandboxMode, 'read-only');
  assert.equal(viewer.allowUpload, false);
  assert.equal(viewer.allowGitDownload, false);
  assert.equal(viewer.allowWorkspaceCreate, false);
  assert.deepEqual(viewer.webSocketPaths, []);
  assert.equal(viewer.hourlyTokenLimit, null, 'no visitor cap for a viewer');
});

test('S14: ANY seat holding no content/code/site toolset runs read-only, but keeps no visitor cap', () => {
  for (const role of ['owner', 'editor', 'viewer'] as const) {
    for (const toolsets of [[], ['lifecycle']] as Array<Array<'lifecycle'>>) {
      const perms = grantOf(role, toolsets);
      assert.equal(perms.sandboxMode, 'read-only', `${role} ${JSON.stringify(toolsets)}`);
      assert.equal(perms.allowUpload, false, `${role} ${JSON.stringify(toolsets)}`);
      assert.equal(perms.hourlyTokenLimit, null, `${role} ${JSON.stringify(toolsets)}`);
    }
  }
  // One content toolset is enough to write, as the editor of the four-role era did.
  assert.equal(grantOf('viewer', ['content']).sandboxMode, 'workspace-write');
});

test('S14/ADR 0028: retired roles map to editor; unknown roles map to nothing', () => {
  assert.equal(seatRoleOf('admin'), 'editor');
  assert.equal(seatRoleOf('developer'), 'editor');
  for (const role of SEAT_ROLES) assert.equal(seatRoleOf(role), role);
  for (const raw of ['', 'Owner', 'root', null, undefined, 3]) assert.equal(seatRoleOf(raw), null, String(raw));
  assert.deepEqual(toolsetsForRole('viewer'), []);
  assert.deepEqual(toolsetsForRole('editor'), ['content', 'code', 'site']);
  assert.deepEqual(toolsetsForRole('owner'), ['content', 'code', 'site', 'lifecycle']);
});

test('S8: visitors are read-only with the guest-lane quota and never upload', () => {
  const guest = grantOf('guest');
  assert.equal(guest.allowUpload, false);
  assert.equal(guest.sandboxMode, 'read-only');
  assert.equal(guest.hourlyTokenLimit, 20000);
  assert.deepEqual(guest.webSocketPaths, []);
  const bot = grantOf('bot');
  assert.equal(bot.allowUpload, false);
  assert.equal(bot.sandboxMode, 'read-only');
  assert.equal(bot.hourlyTokenLimit, 8000);
});

test('S8: a resolved toolset overrides the role default in both directions; an empty list means none', () => {
  assert.equal(grantOf('editor', ['content', 'code']).allowGitDownload, true);
  assert.deepEqual(grantOf('owner', ['content']).webSocketPaths, []);
  const stripped = grantOf('owner', []);
  assert.equal(stripped.allowGitDownload, false);
  assert.equal(stripped.allowWorkspaceCreate, false);
  assert.deepEqual(grantOf('editor', ['content', 'lifecycle']), grantOf('editor', ['content']), '`lifecycle` widens nothing in dsh');
});

test('S8: every seat runs the presets its lane ships, is never banned, and carries no stale state', () => {
  for (const role of SEAT_ROLES) {
    const perms = grantOf(role);
    assert.equal(perms.allowedAgentPresets, null, role);
    assert.equal(perms.banned, false, role);
    assert.deepEqual(perms.disabledSessions, [], role);
    assert.equal(perms.allowSsh, false, `${role}: no SSH host management from a seat`);
  }
});

test('S12: the header is named once, for the plugins that read it', () => {
  assert.equal(ALLOWED_FOLDERS_HEADER, 'x-dsh-allowed-folders');
});

test("S12: a seat's request carries exactly the seat's folders as JSON; the client's own value is replaced", () => {
  const headers = applyAllowedFoldersHeader({ host: 'x', 'x-dsh-allowed-folders': '["/"]' }, { allowed_folders: ['/site/a'] });
  assert.deepEqual(headers, { host: 'x', 'x-dsh-allowed-folders': '["/site/a"]' });
});

test('S12: `__deny__` is not a folder — a seat with none carries an empty list', () => {
  const headers = applyAllowedFoldersHeader({}, { allowed_folders: ['__deny__'] });
  assert.equal(headers['x-dsh-allowed-folders'], '[]');
});

test('S12: the master carries no header, and one it sends is dropped', () => {
  const sent = { host: 'x', 'x-dsh-allowed-folders': '["/etc"]' };
  assert.deepEqual(applyAllowedFoldersHeader(sent, undefined), { host: 'x' });
  assert.equal(sent['x-dsh-allowed-folders'], '["/etc"]', 'the input headers are not mutated');
});

const holder = (booked: string[], cached: Record<string, string>, disabled: string[] = []) => ({
  book: { has: (id: string) => booked.includes(id) },
  cache: new Map(Object.entries(cached)),
  perms: { allowed_folders: ['/site/a'], disabled_sessions: disabled },
});

test('Q4: a seat holds a session in its book, not switched off, whose folder is in its box', () => {
  const ctx = holder(['s1'], { s1: '/site/a/TracyWork' });
  assert.equal(seatHoldsSession(ctx, 's1'), true);
  assert.equal(seatHoldsSession(holder(['s1'], { s1: '/site/a' }, ['s1']), 's1'), false, 'switched off by the master');
  assert.equal(seatHoldsSession(holder(['s1'], { s1: '/site/b' }), 's1'), false, 'folder outside the box');
});

test('Q4: when the cache is wider than the book, the book wins', () => {
  assert.equal(seatHoldsSession(holder([], { s1: '/site/a' }), 's1'), false);
});

test('Q4: a folder the caller learned (request or answer) stands in for a cache miss, still held to the box', () => {
  const ctx = holder(['s1'], {});
  assert.equal(seatHoldsSession(ctx, 's1'), false, 'no folder known, nothing held');
  assert.equal(seatHoldsSession(ctx, 's1', '/site/a'), true);
  assert.equal(seatHoldsSession(ctx, 's1', '/site/b'), false);
});

test('Q4: an id that is not a plausible session id is never held', () => {
  const ctx = holder([''], { '': '/site/a' });
  assert.equal(seatHoldsSession(ctx, ''), false);
  assert.equal(seatHoldsSession(holder(['x'.repeat(201)], { ['x'.repeat(201)]: '/site/a' }), 'x'.repeat(201)), false);
  assert.equal(seatHoldsSession(ctx, 42 as unknown as string), false);
});

test('Q7: the workspaceId → path pair is learned from the workspace.create answer, so a session by id passes next', () => {
  const answer = { type: 'server-response', result: { ok: true, value: { workspaceId: 'w1', path: '/site/a/', title: 'a' } } };
  assert.deepEqual([...learnWorkspacePath(answer, '/site/a')], [['w1', '/site/a/']]);
  assert.deepEqual([...learnWorkspacePath({ id: 'w2', path: '/site/a' }, '/site/a')], [['w2', '/site/a']], 'older `id` shape');
});

test('Q7: a pair the answer names for a folder the seat did not ask for is not learned', () => {
  const answer = { result: { value: [{ workspaceId: 'w1', path: '/site/a' }, { workspaceId: 'w9', path: '/site/other' }] } };
  assert.deepEqual([...learnWorkspacePath(answer, '/site/a')], [['w1', '/site/a']]);
  assert.deepEqual([...learnWorkspacePath(answer, '/site/b')], []);
  assert.deepEqual([...learnWorkspacePath('not json', '/site/a')], []);
});

const box = { allowed_folders: ['/site/a'], disabled_sessions: [] as string[] };
const created = (sessionId: string | null, extra: Record<string, unknown> = {}) => ({
  status: 200,
  sessionId,
  answer: { type: 'server-response', result: { ok: true, value: { sessionId, cwd: '/site/a/TracyWork' } } },
  ...extra,
});

test('Q5: only a successful create/fork yields a grant, with the folder the request verified', () => {
  assert.deepEqual(grantFromCreateAnswer(created('s1', { requestCwd: '/site/a' }), box), { sessionId: 's1', cwd: '/site/a' });
  assert.equal(grantFromCreateAnswer(created(null), box), null, 'a refusal names no created session');
  assert.equal(grantFromCreateAnswer(created('s1', { status: 500 }), box), null);
  assert.equal(grantFromCreateAnswer(created('s1', { status: 302 }), box), null);
  assert.equal(grantFromCreateAnswer(created('s1'), { ...box, disabled_sessions: ['s1'] }), null, 'switched off by the master');
});

test('Q6: the third path — a create by workspaceId with a cold cache takes the folder from the answer, inside the box', () => {
  assert.deepEqual(grantFromCreateAnswer(created('s1'), box), { sessionId: 's1', cwd: '/site/a/TracyWork' });
  const elsewhere = { status: 200, sessionId: 's2', answer: { result: { value: { sessionId: 's2', cwd: '/site/b' } } } };
  assert.equal(grantFromCreateAnswer(elsewhere, box), null, 'dsh naming a folder outside the box grants nothing');
  const otherSession = { status: 200, sessionId: 's3', answer: { result: { value: [{ sessionId: 's9', cwd: '/site/a' }] } } };
  assert.equal(grantFromCreateAnswer(otherSession, box), null, 'a cwd for a different session is not this one');
});

test('Q5: a verified request folder is still held to the box when the answer lands', () => {
  assert.equal(grantFromCreateAnswer(created('s1', { requestCwd: '/site/b' }), box), null);
});

test("S4: the picker opens at the seat's box, not at the container's home", () => {
  const seatBox = ['/site/alpha'];
  assert.equal(directoryPickerPathFor(undefined, seatBox), '/site/alpha');
  assert.equal(directoryPickerPathFor(null, seatBox), '/site/alpha');
  assert.equal(directoryPickerPathFor('', seatBox), '/site/alpha');
});

test('S4: the picker never lists a folder outside the box', () => {
  const seatBox = ['/site/alpha'];
  assert.equal(directoryPickerPathFor('/site/alpha', seatBox), '/site/alpha');
  assert.equal(directoryPickerPathFor('/site/alpha/sub', seatBox), '/site/alpha/sub');
  for (const outside of ['/site', '/desk-home', '/', '/etc', '/site/alpha/../beta']) {
    assert.equal(directoryPickerPathFor(outside, seatBox), null, outside);
  }
});

test('S4: the master is unrestricted, and a seat granted nothing sees nothing', () => {
  assert.equal(directoryPickerPathFor('/any/where', []), '/any/where');
  assert.equal(directoryPickerPathFor(undefined, []), undefined);
  assert.equal(directoryPickerPathFor('/site/alpha', ['__deny__']), null);
  assert.equal(directoryPickerPathFor(undefined, ['__deny__']), null);
});
