/**
 * TCH #300 on 2.7.7 — a seat reads only the conversations it holds; the request path (H1, H2, H3).
 * Ported from the 2.6.6 fork's `gateway-seat-private-sessions.test.ts` (23 cases), keeping every
 * case whose hook is on the request path. Seats are written straight into the database as the
 * seat door leaves them (a seat role, never seeded: the Tracy store seeds a seat nothing); a seat
 * gains a session the way it does on dsh: its own `session/create`, recorded as `created` (Q5).
 * Not ported here, and why: the Remote mux halves (follow refused with 1008, baselines, the follow
 * snapshot's addresses — H4/H5), the owner's `legacy` rows, the second owner and the seed race
 * (H10), revocation through the seat door closing a stream (H6/H7).
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { startHarness, type FakeAnswer, type Harness, type Person, type Seen } from './gateway-harness.js';
import { tracyStoreOf } from '../../src/tracy/persistence.js';

const SITE_DIR = '/site/alpha';
const WORKSPACE = 'ws-alpha';

/** Every session the fake dsh holds, in creation order. */
const sessions: string[] = [];
/** Who typed in each session, as dsh stored it on the message (`source.prompter.email`). */
const typedBy = new Map<string, string[]>();
let pageDelayMs = 0;
let searchDelayMs = 0;
let searchAnswer: unknown = null;
let candidatesAnswer: unknown = null;
let refuseCreateWith: string | null = null;
/** When set, dsh answers a `session/fork` naming this session as the one it made. */
let forkAnswerWith: string | null = null;
const createdAtOf = (id: string): number => 1_790_000_000_000 + id.length;

const canary = (id: string): string => `CANARY-${id}`;
const title = (id: string): string => `TITLE-${id}`;
/** dsh's session-reference URI (`encodeSessionReferenceUri`). */
const mention = (id: string): string => `dsh-session:${Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')}`;

function records(id: string): unknown[] {
  return (typedBy.get(id) ?? []).map((email, index) => ({
    type: 'event',
    event: {
      type: 'user/message', seq: index + 1, time: '2026-10-05T00:00:00.000Z',
      data: { source: { kind: 'user', rpcId: `r-${index}`, prompter: { user: 'someone', email } }, text: `${canary(id)} #${index}` },
    },
  }));
}

const json = (value: unknown, delayMs?: number): FakeAnswer => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(value), delayMs });
const ok = (value: unknown, delayMs?: number): FakeAnswer => json({ type: 'server-response', rpcId: 'r', result: { ok: true, value } }, delayMs);

function argsOf(seen: Seen): Record<string, any> {
  try {
    const body = JSON.parse(seen.body) as { payload?: { args?: Record<string, any> } };
    return body.payload?.args ?? {};
  } catch {
    return {};
  }
}

function fakeDsh(seen: Seen): FakeAnswer | undefined {
  const url = seen.url;
  const query = new URL(url, 'http://dsh').searchParams;
  if (/^\/api\/workspace[./]list/.test(url)) {
    return ok({
      items: [{ workspaceId: WORKSPACE, path: SITE_DIR, title: 'Alpha', sessionIds: [...sessions], createdAt: '2026-10-05T00:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z' }],
      archivedSessionIds: [],
    });
  }
  if (/^\/api\/session[./]create/.test(url)) {
    if (refuseCreateWith !== null) {
      return json({ type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'session/conflict', message: 'conflict', details: { sessionId: refuseCreateWith } } } });
    }
    const id = String(argsOf(seen).request?.sessionId ?? '');
    if (!sessions.includes(id)) sessions.push(id);
    return ok({ sessionId: id, cwd: SITE_DIR });
  }
  if (/^\/api\/sessionReferenceResolver[./]candidates/.test(url)) {
    return json(candidatesAnswer ?? { type: 'server-response', rpcId: 'r', result: { ok: true, value: sessions.map((id) => ({ sessionId: id, label: title(id), displayTitle: title(id), sameWorkspace: true, createdAt: createdAtOf(id), mention: `@[${title(id)}](${mention(id)})` })) } }, searchDelayMs);
  }
  if (/^\/api\/session[./]search/.test(url)) {
    return json(searchAnswer ?? { type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: sessions.map((id) => ({ sessionId: id, snippet: `…${canary(id)}…` })), hasMore: false } } }, searchDelayMs);
  }
  if (/^\/api\/session[./]fork/.test(url) && forkAnswerWith !== null) {
    return ok({ sessionId: forkAnswerWith, cwd: SITE_DIR });
  }
  if (/^\/api\/session[./]list/.test(url)) {
    return ok({ items: sessions.map((id) => ({ sessionId: id, cwd: SITE_DIR, title: title(id) })) });
  }
  if (/^\/api\/session[./]page/.test(url)) {
    const id = String(argsOf(seen).request?.address?.sessionId ?? '');
    return ok({ records: records(id), hasMore: false }, pageDelayMs);
  }
  if (url.startsWith('/api/session.export')) {
    const id = query.get('sessionId') ?? '';
    return { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${title(id)}.zip"` }, body: `PK${canary(id)}` };
  }
  if (url.startsWith('/api/session/uploadFileBinary')) return json({ ok: true, value: { staged: query.get('sessionId') } });
  return ok({ accepted: true });
}

let h: Harness;
type Seat = Person & { email: string; session: string };
const people: Record<string, Seat> = {};

/** The page's opening move (the grant snapshot), then a New Session in the site's workspace. */
async function startOwnSession(person: Seat): Promise<void> {
  assert.equal((await h.send('POST', '/api/workspace.list', person, '{}')).status, 200);
  const created = await h.rpc('session/create', { request: { workspaceId: WORKSPACE } }, person);
  assert.equal(created.status, 200, created.body);
  const id = (JSON.parse(created.body) as { result: { value: { sessionId: string } } }).result.value.sessionId;
  person.session = id;
  typedBy.set(id, [person.email]);
  // The snapshot now holds the new session: list again, as the page does after a create.
  assert.equal((await h.send('POST', '/api/workspace.list', person, '{}')).status, 200);
}

function seat(name: string, allowUpload = true): Seat {
  const email = `${name}@alpha.test`;
  return { ...h.seat(name, { folders: [SITE_DIR], allowUpload, email, role: name.replace(/\d+$/, '') }), email, session: '' };
}

before(async () => {
  h = await startHarness(fakeDsh);
  for (const name of ['owner', 'editor', 'developer', 'editor2']) {
    people[name] = seat(name, name !== 'editor');
    await startOwnSession(people[name]);
  }
  // The owner once typed into the editor's session — its history now names the owner.
  typedBy.set(people.editor.session, [people.editor.email, people.owner.email]);
  // Every seat lists again, so each snapshot knows every session that exists by now.
  for (const person of Object.values(people)) assert.equal((await h.send('POST', '/api/workspace.list', person, '{}')).status, 200);
});

after(async () => { await h.close(); });

const all = (): string[] => Object.values(people).map((p) => p.session);
const foreignTo = (me: Seat): string[] => all().filter((id) => id !== me.session);
const reached = (fragment: string): boolean => h.seen.some((row) => row.url.includes(fragment) || row.body.includes(fragment));
const rpc = (method: string, args: Record<string, unknown>, who: Person) => h.rpc(method, args, who);

for (const role of ['editor', 'developer'] as const) {
  describe(`a ${role} seat on the owner's site`, () => {
    test('Q1/Q8: workspace.list, session/list, search and the @session picker name only its own session', async () => {
      const me = people[role];
      const listed = await h.send('POST', '/api/workspace.list', me, '{}');
      assert.equal(listed.status, 200, listed.body);
      const items = (JSON.parse(listed.body) as { result: { value: { items: { sessionIds: string[] }[] } } }).result.value.items;
      assert.deepEqual(items[0]!.sessionIds, [me.session]);
      const sessionList = await rpc('session/list', { request: {} }, me);
      assert.equal(sessionList.status, 200, sessionList.body);
      for (const id of foreignTo(me)) {
        assert.ok(!sessionList.body.includes(id), `${id} listed to ${role}`);
        assert.ok(!sessionList.body.includes(title(id)), `${title(id)} listed to ${role}`);
      }
      assert.ok(sessionList.body.includes(me.session));
      const search = await rpc('session/search', { request: { query: 'CANARY' } }, me);
      assert.equal(search.status, 200, search.body);
      for (const id of foreignTo(me)) assert.ok(!search.body.includes(canary(id)), `${canary(id)} found by ${role}'s search`);
      assert.ok(search.body.includes(canary(me.session)));
      const picker = await rpc('sessionReferenceResolver/candidates', { agentId: me.session, query: '' }, me);
      assert.equal(picker.status, 200, picker.body);
      for (const id of foreignTo(me)) assert.ok(!picker.body.includes(title(id)) && !picker.body.includes(mention(id)), `${id} offered to ${role}`);
    });

    test('Q2: history page of another person\'s session is refused before dsh; its own is served', async () => {
      const me = people[role];
      const owner = people.owner.session;
      h.seen.length = 0;
      const refused = await rpc('session/page', { request: { address: { kind: 'session', sessionId: owner }, throughSeq: 10 } }, me);
      assert.equal(refused.status, 403);
      assert.ok(!refused.body.includes(canary(owner)) && !refused.body.includes(people.owner.email) && !refused.body.includes(title(owner)));
      assert.ok(!reached('/api/session/page'), 'the refused page reached dsh');
      const own = await rpc('session/page', { request: { address: { kind: 'session', sessionId: me.session }, throughSeq: 10 } }, me);
      assert.equal(own.status, 200, own.body);
      assert.ok(own.body.includes(canary(me.session)));
    });

    test('Q3: export by GET and HEAD of another person\'s session never reaches dsh, nor a doubled sessionId', async () => {
      const me = people[role];
      const owner = people.owner.session;
      h.seen.length = 0;
      for (const method of ['GET', 'HEAD']) {
        const res = await h.send(method, `/api/session.export?sessionId=${owner}&includeDescendants=true`, me);
        assert.equal(res.status, 403, `${method} export to ${role}`);
        assert.ok(!res.body.includes(canary(owner)));
        assert.ok(!String(res.headers['content-disposition'] ?? '').includes(title(owner)));
      }
      // A second `sessionId` cannot smuggle the owner's past a check of the first.
      const doubled = await h.send('GET', `/api/session.export?sessionId=${me.session}&sessionId=${owner}`, me);
      assert.equal(doubled.status, 403);
      assert.ok(!reached('session.export'), 'a refused export reached dsh');
    });

    test('Q3: an upload stages no byte into another person\'s session', async () => {
      const me = people[role];
      const owner = people.owner.session;
      h.seen.length = 0;
      const refused = await h.send('POST', `/api/session/uploadFileBinary?sessionId=${owner}&name=x.txt`, me, Buffer.from('payload'), { 'content-type': 'application/octet-stream' });
      assert.equal(refused.status, 403);
      assert.ok(!reached('uploadFileBinary'), 'the refused upload reached dsh');
      const own = await h.send('POST', `/api/session/uploadFileBinary?sessionId=${me.session}&name=x.txt`, me, Buffer.from('payload'), { 'content-type': 'application/octet-stream' });
      // Its own: allow_upload decides, as upstream does (the editor here has none).
      assert.equal(own.status, role === 'editor' ? 403 : 200, own.body);
      if (role === 'editor') assert.match(own.body, /上传|upload/i);
    });

    test('Q2/Q11: a prompt into another person\'s session or mentioning it is refused; its own is stamped with its own address', async () => {
      const me = people[role];
      const owner = people.owner.session;
      h.seen.length = 0;
      const request = (sessionId: string) => ({ request: { requestId: 'q', sessionId, mode: 'queue', content: [{ type: 'text', text: 'hi' }] } });
      assert.equal((await rpc('session/prompt', request(owner), me)).status, 403);
      // Mentioning a session makes dsh copy its content into the turn: a read by another road.
      for (const text of [`see @[x](${mention(owner)})`, `bare ${mention(owner)} here`, 'broken dsh-session:@@']) {
        const mentioned = { request: { requestId: 'q', sessionId: me.session, mode: 'queue', content: [{ type: 'text', text }] } };
        assert.equal((await rpc('session/prompt', mentioned, me)).status, 403, text);
      }
      assert.ok(!reached(owner) && !reached(mention(owner)), 'the refused prompt reached dsh');
      const mentionsOwn = { request: { requestId: 'q', sessionId: me.session, mode: 'queue', content: [{ type: 'text', text: `again @[mine](${mention(me.session)})` }] } };
      assert.equal((await rpc('session/prompt', mentionsOwn, me)).status, 200, 'its own session may be mentioned');
      const own = await rpc('session/prompt', request(me.session), me);
      assert.equal(own.status, 200, own.body);
      const forwarded = JSON.parse(h.seen.at(-1)!.body) as { payload: { args: { request: { prompter: { email: string } } } } };
      assert.equal(forwarded.payload.args.request.prompter.email, me.email);
    });

    test('Q2: every other door that names a session is held to the same grant', async () => {
      const me = people[role];
      const owner = people.owner.session;
      h.seen.length = 0;
      const doors: [string, Record<string, unknown>][] = [
        ['session/selectModel', { request: { sessionId: owner, provider: 'p', model: 'm' } }],
        ['session/attachment', { request: { sessionId: owner, attachmentId: 'a' } }],
        ['session/updateQueue', { request: { sessionId: owner, itemId: 'i', action: 'remove' } }],
        ['session/cancel', { request: { sessionId: owner } }],
        ['session/projections', { request: { sessionId: owner } }],
        ['session/fork', { request: { sessionId: owner, atSeq: 1 } }],
        ['session/rename', { request: { sessionId: owner, title: 'mine now' } }],
        // dsh ADOPTS an existing id on create: naming one is a claim on that conversation.
        ['session/create', { request: { workspaceId: WORKSPACE, sessionId: owner } }],
        ['commands/list', { agentId: owner }],
        ['commands/execute', { agentId: owner, line: '/help' }],
        ['fileUploads/upload', { agentId: owner, request: { data: 'eA==', name: 'x' } }],
        ['fileReferences/list', { agentId: owner, query: '' }],
        ['skills/list', { request: { sessionId: owner } }],
        ['messageFeedback/list', { request: { sessionId: owner } }],
        ['workspaceFiles/read', { workspaceFileScopeId: owner, path: 'a' }],
        ['workspace/pinSession', { request: { sessionId: owner } }],
        ['workspace/insertSessionBefore', { request: { workspaceId: WORKSPACE, sessionId: me.session, beforeSessionId: owner } }],
        // A subagent is reached through its parent: the parent is the one held.
        ['subagents/prompt', { request: { parentSessionId: owner, childSessionId: 'child-1', content: [] } }],
        ['session/page', { request: { address: { kind: 'subagent', parentSessionId: owner, childSessionId: 'child-1', mode: 'x' }, throughSeq: 1 } }],
        // A child named without its parent is checked as itself.
        ['subagents/interruptByParent', { childSessionId: owner }],
        // A malformed id is never held.
        ['session/cancel', { request: { sessionId: 42 } }],
      ];
      for (const [method, args] of doors) {
        const res = await rpc(method, args, me);
        assert.equal(res.status, 403, `${method} ${JSON.stringify(args)} as ${role}`);
      }
      assert.ok(!reached(owner), 'a refused door reached dsh');
      assert.equal(h.seen.length, 0, 'no refused door reached dsh at all');
      // The same doors on its own session pass.
      for (const method of ['session/cancel', 'session/projections', 'skills/list']) {
        assert.equal((await rpc(method, { request: { sessionId: me.session } }, me)).status, 200, method);
      }
      assert.equal((await rpc('commands/list', { agentId: me.session }, me)).status, 200);
    });
  });
}

describe('addresses in history (Q10)', () => {
  test('a seat never receives another person\'s address, even inside its own session', async () => {
    const editor = people.editor;
    const page = await rpc('session/page', { request: { address: { kind: 'session', sessionId: editor.session }, throughSeq: 10 } }, editor);
    assert.equal(page.status, 200, page.body);
    assert.ok(!page.body.includes(people.owner.email), 'owner address in page');
    assert.ok(page.body.includes(editor.email), 'its own address stays');
    assert.ok(page.body.includes('"email":null'), 'the stamp keeps its shape');
  });
});

describe('grants survive what they must, and nothing else restores them', () => {
  test('Q5: a refused create records nothing, even when the refusal names a session', async () => {
    const editor = people.editor2;
    const grantsBefore = h.db.listUserSessionGrants(editor.userId);
    refuseCreateWith = people.owner.session;
    try {
      const res = await rpc('session/create', { request: { workspaceId: WORKSPACE } }, editor);
      assert.equal(res.status, 200);
    } finally {
      refuseCreateWith = null;
    }
    assert.deepEqual(h.db.listUserSessionGrants(editor.userId), grantsBefore);
    assert.equal((await rpc('session/cancel', { request: { sessionId: people.owner.session } }, editor)).status, 403);
  });

  test('Q5: a seat\'s own create is recorded as its own (`created`), the grant a private seat reads', async () => {
    for (const person of Object.values(people)) {
      assert.ok(tracyStoreOf(h.db)!.honouredGrants(person.userId).includes(person.session), person.username);
    }
  });

  test('Q5: a fork whose answer names another account\'s session gives the seat nothing of it', async () => {
    const editor = people.editor2;
    forkAnswerWith = people.owner.session;
    try {
      const res = await rpc('session/fork', { request: { sessionId: editor.session } }, editor);
      assert.equal(res.status, 502, res.body);
      assert.ok(!res.body.includes(people.owner.session), 'the answer named the owner\'s session to the editor');
    } finally {
      forkAnswerWith = null;
    }
    assert.ok(!h.db.listUserSessionGrants(editor.userId).includes(people.owner.session), 'the owner\'s session entered the editor\'s book');
    const page = await rpc('session/page', { request: { address: { kind: 'session', sessionId: people.owner.session }, throughSeq: 10 } }, editor);
    assert.equal(page.status, 403);
    assert.ok(!page.body.includes(canary(people.owner.session)));
  });

  test('TCH #300: a seat never seeded gets no session from its first workspace.list, nor from session/list', async () => {
    const newcomer = seat('newcomer');
    assert.equal((await h.send('POST', '/api/workspace.list', newcomer, '{}')).status, 200);
    assert.equal((await rpc('session/list', { request: {} }, newcomer)).status, 200);
    assert.deepEqual(h.db.listUserSessionGrants(newcomer.userId), []);
    for (const id of all()) {
      const page = await rpc('session/page', { request: { address: { kind: 'session', sessionId: id }, throughSeq: 10 } }, newcomer);
      assert.equal(page.status, 403, id);
    }
  });

  // Q6, the fork's "third path": a create by workspaceId while the gate's id → path map is cold
  // (a gateway restart) must still leave the seat holding the session it made. Upstream 2.7.7
  // places the workspaceId through the seat's own listing, built on demand, so the create carries a
  // request-time cwd and is recorded like any other; the answer's cwd is never what decides.
  test('Q6: a create by workspaceId from a seat that never listed is placed and recorded as its own', async () => {
    const cold = seat('coldstart');
    const res = await rpc('session/create', { request: { workspaceId: WORKSPACE } }, cold);
    assert.equal(res.status, 200, res.body);
    const id = (JSON.parse(res.body) as { result: { value: { sessionId: string } } }).result.value.sessionId;
    assert.deepEqual(tracyStoreOf(h.db)!.honouredGrants(cold.userId), [id]);
    const page = await rpc('session/page', { request: { address: { kind: 'session', sessionId: id }, throughSeq: 10 } }, cold);
    assert.equal(page.status, 200, page.body);
  });

  test('Q9: a grant taken back while dsh reads a page: the page is not delivered', async () => {
    const editor = people.editor2;
    pageDelayMs = 300;
    try {
      const pending = rpc('session/page', { request: { address: { kind: 'session', sessionId: editor.session }, throughSeq: 10 } }, editor);
      await new Promise((resolve) => setTimeout(resolve, 100));
      h.db.replaceUserSessionGrants(editor.userId, []);
      const res = await pending;
      assert.equal(res.status, 403);
      assert.ok(!res.body.includes(canary(editor.session)));
    } finally {
      pageDelayMs = 0;
      tracyStoreOf(h.db)!.recordCreatedSession(editor.userId, editor.session);
    }
  });
});

describe('search and the @session picker are judged when dsh answers (Q8)', () => {
  const search = (who: Person) => rpc('session/search', { request: { query: 'CANARY' } }, who);
  const picker = (who: Seat) => rpc('sessionReferenceResolver/candidates', { agentId: who.session, query: '' }, who);

  test('a seat whose grants are taken back while dsh searches receives no snippet and no title', async () => {
    const late = seat('late-search');
    await startOwnSession(late);
    assert.ok((await search(late)).body.includes(canary(late.session)), 'its own snippet before the revoke');
    searchDelayMs = 300;
    try {
      const pendingSearch = search(late);
      const pendingPicker = picker(late);
      await new Promise((resolve) => setTimeout(resolve, 100));
      h.db.replaceUserSessionGrants(late.userId, []);
      for (const res of [await pendingSearch, await pendingPicker]) {
        assert.ok(!res.body.includes(canary(late.session)) && !res.body.includes(title(late.session)), res.body);
      }
    } finally {
      searchDelayMs = 0;
    }
  });

  test('a folder taken away while dsh searches drops the session it no longer reaches', async () => {
    const moved = seat('moved-search');
    await startOwnSession(moved);
    searchDelayMs = 300;
    try {
      const pendingSearch = search(moved);
      const pendingPicker = picker(moved);
      await new Promise((resolve) => setTimeout(resolve, 100));
      h.db.setPermissions(moved.userId, {
        allowedFolders: ['/site/elsewhere'], hourlyTokenLimit: null, dailyMinutesLimit: null,
        allowUpload: true, allowGitDownload: false, allowWorkspaceCreate: false, banned: false,
      });
      assert.equal(h.db.hasUserSessionGrant(moved.userId, moved.session), true);
      for (const res of [await pendingSearch, await pendingPicker]) {
        assert.equal(res.status, 200, res.body);
        assert.ok(!res.body.includes(canary(moved.session)) && !res.body.includes(title(moved.session)), res.body);
      }
    } finally {
      searchDelayMs = 0;
    }
  });

  test('an item the gate cannot attribute to a session is refused, never passed through', async () => {
    const editor = people.editor;
    const owner = people.owner.session;
    const emptyPage = { type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: [], hasMore: false } } };
    try {
      // An item without a string sessionId: upstream 2.7.7 drops it before Tracy reads the answer
      // (`filterSessionSearchItems`), so the seat gets an empty page, not the fork's 502.
      for (const items of [[{ id: owner, snippet: canary(owner) }], [{ sessionId: 42, snippet: canary(owner) }]]) {
        searchAnswer = { type: 'server-response', rpcId: 'r', result: { ok: true, value: { items, hasMore: false } } };
        const res = await search(editor);
        assert.equal(res.status, 200, JSON.stringify(items));
        assert.deepEqual(JSON.parse(res.body), emptyPage);
      }
      // A value of an unknown shape is refused whole.
      for (const shape of [
        { type: 'server-response', rpcId: 'r', result: { ok: true, value: { results: [{ sessionId: owner, snippet: canary(owner) }] } } },
        { type: 'server-response', rpcId: 'r', result: { ok: true, value: [{ label: title(owner), mention: mention(owner) }] } },
      ]) {
        searchAnswer = shape;
        const res = await search(editor);
        assert.equal(res.status, 502, JSON.stringify(shape));
        assert.ok(!res.body.includes(canary(owner)) && !res.body.includes(title(owner)), res.body);
      }
    } finally {
      searchAnswer = null;
    }
    assert.ok((await search(editor)).body.includes(canary(editor.session)));
  });

  test('known limitation (#566): search and the picker are filtered after dsh caps them; foreign sessions and hasMore never leak', async () => {
    const editor = people.editor;
    const searchPage = (items: string[], hasMore: boolean) => ({ type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: items.map((id) => ({ sessionId: id, snippet: canary(id) })), hasMore } } });
    const emptyPage = { type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: [], hasMore: false } } };
    try {
      const foreign25 = Array.from({ length: 25 }, (_, i) => `sess-foreign-${i}`);
      searchAnswer = searchPage([...foreign25, editor.session].slice(0, 20), true);
      const missed = await search(editor);
      assert.equal(missed.status, 200, missed.body);
      assert.deepEqual(JSON.parse(missed.body), emptyPage);
      for (const id of foreign25) assert.ok(!missed.body.includes(id) && !missed.body.includes(canary(id)), id);
      searchAnswer = searchPage([editor.session], true);
      const own = JSON.parse((await search(editor)).body) as { result: { value: { items: { sessionId: string }[]; hasMore: boolean } } };
      assert.deepEqual(own.result.value.items.map((item) => item.sessionId), [editor.session]);
      assert.equal(own.result.value.hasMore, false);
      const foreign50 = Array.from({ length: 50 }, (_, i) => `sess-foreign-${i}`);
      candidatesAnswer = { type: 'server-response', rpcId: 'r', result: { ok: true, value: foreign50.map((id) => ({ sessionId: id, label: title(id), sameWorkspace: true, createdAt: 1, mention: mention(id) })) } };
      const picked = await picker(editor);
      assert.equal(picked.status, 200, picked.body);
      assert.deepEqual(JSON.parse(picked.body), { type: 'server-response', rpcId: 'r', result: { ok: true, value: [] } });
    } finally {
      searchAnswer = null;
      candidatesAnswer = null;
    }
  });

  test('nothing Host-wide survives: no quoted refusal, the picker keeps createdAt', async () => {
    const editor = people.editor;
    const owner = people.owner.session;
    try {
      const quoted = `session search failed: Error: bad record in ${owner} near "${canary(owner)}" ${title(owner)}`;
      searchAnswer = { type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'gateway/internal', message: quoted, details: { sessionId: owner } } } };
      const refused = await search(editor);
      assert.equal(refused.status, 200, refused.body);
      assert.deepEqual(JSON.parse(refused.body), { type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'gateway/internal', message: 'The request was refused.' } } });
      candidatesAnswer = { type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: `x ${title(owner)}`, message: quoted } } };
      const pickerRefused = await picker(editor);
      assert.ok(!pickerRefused.body.includes(owner) && !pickerRefused.body.includes(title(owner)), pickerRefused.body);
      assert.match(pickerRefused.body, /"code":"unknown"/);
      candidatesAnswer = { type: 'server-response', rpcId: 'r', result: { ok: true, value: [{ sessionId: editor.session, label: 'x', sameWorkspace: true, mention: 'm' }] } };
      assert.equal((await picker(editor)).status, 502);
    } finally {
      searchAnswer = null;
      candidatesAnswer = null;
    }
    const own = JSON.parse((await picker(editor)).body) as { result: { value: { sessionId: string; createdAt: number }[] } };
    const mine = own.result.value.find((c) => c.sessionId === editor.session);
    assert.equal(mine?.createdAt, createdAtOf(editor.session));
  });
});
