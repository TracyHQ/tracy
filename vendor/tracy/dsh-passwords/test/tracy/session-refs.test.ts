// Tracy session references (Q2, Q3, Q5, Q8, Q10): pure functions over request and answer bodies.
// Each case names its invariant id (TRACY-FORK.md §2). Ported from the 2.6.6 fork's
// session-ownership cases (TCH #300).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectQuerySessionRefs, collectSessionRefs, createdSessionIdOf, filterSessionAnswer, scrubForeignPrompterEmails, sessionMentionsIn, UNREADABLE_SESSION_REF } from '../../src/tracy/session-refs.js';

const refs = (value: unknown) => [...collectSessionRefs(value)].sort();

test('Q2: collectSessionRefs reads every wire field that names a session, at any depth', () => {
  const envelope = (args: unknown) => ({ type: 'client-request', rpcId: 'r', method: 'x', payload: { args } });
  assert.deepEqual(refs(envelope({ request: { sessionId: 's-1' } })), ['s-1']);
  assert.deepEqual(refs(envelope({ agentId: 's-2', line: '/help' })), ['s-2'], 'an Agent parameter is a session id on the wire');
  assert.deepEqual(refs(envelope({ workspaceFileScopeId: 's-3', path: 'a' })), ['s-3']);
  assert.deepEqual(refs(envelope({ request: { workspaceId: 'w', sessionId: 's-4', beforeSessionId: 's-5' } })), ['s-4', 's-5']);
  // A subagent is reached through its parent; the parent is what is held.
  assert.deepEqual(refs(envelope({ request: { address: { kind: 'subagent', parentSessionId: 'p', childSessionId: 'c', mode: 'm' } } })), ['p']);
  // A child named alone is a session in its own right.
  assert.deepEqual(refs(envelope({ childSessionId: 'c', parentSessionId: null })), ['c']);
  // A second target anywhere is found, however deep.
  let deep: Record<string, unknown> = { sessionId: 'deep' };
  for (let i = 0; i < 50; i++) deep = { nested: deep };
  assert.deepEqual(refs({ sessionId: 'top', list: [deep] }), ['deep', 'top']);
  // A present, non-string id can never be held.
  assert.deepEqual(refs({ sessionId: 42 }), [UNREADABLE_SESSION_REF]);
  assert.deepEqual(refs({ agentId: { id: 's' } }), [UNREADABLE_SESSION_REF]);
  assert.deepEqual(refs({ sessionId: null, workspaceId: 'w' }), [], 'null reads as absent');
  assert.deepEqual(refs({ workspaceId: 'w', cwd: '/site/a' }), []);
});

test('Q2: a session mentioned in text (dsh-session:) is a session the request names', () => {
  const uri = (id: string) => `dsh-session:${Buffer.from(JSON.stringify(id), 'utf8').toString('base64url')}`;
  assert.deepEqual(sessionMentionsIn(`look at @[Owner chat](${uri('s-owner')}) and ${uri('s-2')}`), ['s-owner', 's-2']);
  assert.deepEqual(sessionMentionsIn('no mention here'), []);
  assert.deepEqual(sessionMentionsIn('dsh-session:!!!'), [UNREADABLE_SESSION_REF], 'undecodable is never held');
  assert.deepEqual(sessionMentionsIn(`dsh-session:${Buffer.from('42').toString('base64url')}`), [UNREADABLE_SESSION_REF]);
  const body = { payload: { args: { request: { sessionId: 's-mine', content: [{ type: 'text', text: `x ${uri('s-owner')}` }] } } } };
  assert.deepEqual(refs(body), ['s-mine', 's-owner']);
  assert.deepEqual(refs(uri('s-top')), ['s-top'], 'a bare string body is read too');
});

test('Q3: a session named in the query is collected by every SESSION_REF_KEYS key; a repeated key is refused', () => {
  const q = (s: string) => collectQuerySessionRefs(new URLSearchParams(s));
  assert.deepEqual(q('sessionId=s1&seq=3'), { kind: 'refs', ids: ['s1'] });
  assert.deepEqual(q('agentId=s2&workspaceFileScopeId=s3'), { kind: 'refs', ids: ['s2', 's3'] });
  assert.deepEqual(q('path=/a'), { kind: 'refs', ids: [] });
  // An empty value is still a session reference, and no grant holds it.
  assert.deepEqual(q('sessionId='), { kind: 'refs', ids: [UNREADABLE_SESSION_REF] });
  // dsh reads the first of a repeated key; a gate reading another would be a bypass.
  for (const query of ['sessionId=mine&sessionId=theirs', 'sessionId=mine&sessionId=mine', 'agentId=a&agentId=b']) {
    const verdict = q(query);
    assert.equal(verdict.kind, 'reject', query);
    assert.equal((verdict as { status: number }).status, 403, query);
  }
});

test('Q5: createdSessionIdOf reads only a successful create/fork answer', () => {
  assert.equal(createdSessionIdOf({ type: 'server-response', rpcId: 'r', result: { ok: true, value: { sessionId: 's-new' } } }), 's-new');
  assert.equal(createdSessionIdOf({ result: { value: { sessionId: 's-old-shape', cwd: '/a' } } }), 's-old-shape');
  assert.equal(createdSessionIdOf({ type: 'server-response', value: { sessionId: 's-bare' } }), 's-bare');
  // A refusal whose details name a session is not a creation.
  assert.equal(createdSessionIdOf({ type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'session/conflict', message: 'x', details: { sessionId: 's-owner' } } } }), null);
  assert.equal(createdSessionIdOf({ result: { error: { details: { sessionId: 's-owner' } }, value: { sessionId: 's-owner' } } }), null);
  assert.equal(createdSessionIdOf({ error: 'x', value: { sessionId: 's-owner' } }), null);
  assert.equal(createdSessionIdOf({ ok: false, value: { sessionId: 's-owner' } }), null);
  // Nested or malformed ids are not read.
  assert.equal(createdSessionIdOf({ result: { value: { nested: { sessionId: 's-deep' } } } }), null);
  assert.equal(createdSessionIdOf({ result: { value: { sessionId: 7 } } }), null);
  assert.equal(createdSessionIdOf({ result: { value: { sessionId: '' } } }), null);
  assert.equal(createdSessionIdOf({ result: { value: { sessionId: 'x'.repeat(201) } } }), null);
  assert.equal(createdSessionIdOf({ result: null }), null);
  assert.equal(createdSessionIdOf(null), null);
  assert.equal(createdSessionIdOf([{ sessionId: 's' }]), null);
});

test('Q8: filterSessionAnswer keeps held items rebuilt from known fields, says hasMore=false, and rejects unknown shapes with 502', () => {
  const held = (id: string) => id === 's-mine';
  const answer = (value: unknown) => ({ kind: 'answer', value });
  const search = filterSessionAnswer(
    { type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: [
      { sessionId: 's-mine', snippet: 'mine', extra: { sessionId: 's-owner', snippet: 'nested' } },
      { sessionId: 's-owner', snippet: 'private text' },
    ], hasMore: false, cursor: 's-owner' } } },
    'search', held,
  );
  assert.deepEqual(search, answer({ type: 'server-response', rpcId: 'r', result: { ok: true, value: { items: [{ sessionId: 's-mine', snippet: 'mine' }], hasMore: false } } }));
  // Older envelopes read the same.
  assert.deepEqual(filterSessionAnswer({ value: { items: [{ sessionId: 's-owner', snippet: 'x' }] } }, 'search', held), answer({ value: { items: [] } }));
  assert.deepEqual(filterSessionAnswer({ result: { value: { items: [] } } }, 'search', held), answer({ result: { value: { items: [] } } }));
  const candidates = filterSessionAnswer(
    { type: 'server-response', rpcId: 'r', result: { ok: true, value: [
      { sessionId: 's-mine', label: 'Mine', displayTitle: 'Mine', cwd: '/a', sameWorkspace: true, createdAt: 1790000000000, mention: '@[Mine](x)', leak: 'owner' },
      { sessionId: 's-owner', label: 'Owner chat', sameWorkspace: true, createdAt: 1, mention: '@[Owner chat](y)' },
      { sessionId: 's-mine', label: 'Mine', sameWorkspace: false, createdAt: 2, mention: '@[Mine](z)' },
    ] } },
    'candidates', held,
  );
  assert.deepEqual(candidates, answer({ type: 'server-response', rpcId: 'r', result: { ok: true, value: [
    { sessionId: 's-mine', label: 'Mine', displayTitle: 'Mine', cwd: '/a', sameWorkspace: true, createdAt: 1790000000000, mention: '@[Mine](x)' },
    { sessionId: 's-mine', label: 'Mine', sameWorkspace: false, createdAt: 2, mention: '@[Mine](z)' },
  ] } }));
  // `hasMore` counts matches Host-wide: a seat is never told more exist, foreign or not.
  for (const items of [[{ sessionId: 's-owner', snippet: 'x' }], [{ sessionId: 's-mine', snippet: 'x' }], []]) {
    assert.deepEqual(
      filterSessionAnswer({ result: { ok: true, value: { items, hasMore: true } } }, 'search', held),
      answer({ result: { ok: true, value: { items: items.filter((i) => i.sessionId === 's-mine'), hasMore: false } } }),
    );
  }
  // A refusal keeps a plain RPC code and a fixed message: dsh's message and `details` may quote a session.
  const refused = { ok: false, error: { code: 'unknown', message: 'The request was refused.' } };
  assert.deepEqual(
    filterSessionAnswer({ type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'gateway/internal', message: 'session search failed: s-owner "private text"', details: { sessionId: 's-owner' } } } }, 'search', held),
    answer({ type: 'server-response', rpcId: 'r', result: { ok: false, error: { code: 'gateway/internal', message: 'The request was refused.' } } }),
  );
  assert.deepEqual(filterSessionAnswer({ ok: false, error: { details: 's-owner' } }, 'candidates', held), answer(refused));
  for (const code of ['s-owner private text', 'gateway/internal: s-owner', 'bad', 7, `a/${'b'.repeat(80)}`]) {
    assert.deepEqual(filterSessionAnswer({ result: { ok: false, error: { code, message: 'm' } } }, 'search', held), answer({ result: refused }), String(code));
  }
  // Every shape the filter cannot attribute to a session is rejected (502), never passed through.
  const unknown: [unknown, 'search' | 'candidates'][] = [
    [{ result: { ok: true, value: { items: [{ id: 's-owner', snippet: 'private text' }] } } }, 'search'],
    [{ result: { ok: true, value: { items: [{ sessionId: '', snippet: 'x' }] } } }, 'search'],
    [{ result: { ok: true, value: { items: [{ sessionId: 7, snippet: 'x' }] } } }, 'search'],
    [{ result: { ok: true, value: { items: [{ sessionId: 'x'.repeat(201), snippet: 'x' }] } } }, 'search'],
    [{ result: { ok: true, value: { items: ['s-mine'] } } }, 'search'],
    [{ result: { ok: true, value: { items: [{ sessionId: 's-mine', snippet: { text: 'x' } }] } } }, 'search'],
    [{ result: { ok: true, value: { items: [], hasMore: 'no' } } }, 'search'],
    [{ result: { ok: true, value: { results: [] } } }, 'search'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', snippet: 'x' }] } }, 'search'],
    [{ result: { ok: 'yes', value: { items: [] } } }, 'search'],
    [{ result: [] }, 'search'],
    [{ type: 'server-response' }, 'search'],
    [{ result: { ok: true, value: { items: [] } } }, 'candidates'],
    [{ result: { ok: true, value: [{ label: 'Owner chat' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', sameWorkspace: 'yes' }] } }, 'candidates'],
    [{ result: { ok: true, value: { items: [{ sessionId: 's-mine' }] } } }, 'search'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', label: 'Mine', sameWorkspace: true, mention: 'm' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', label: 'Mine', sameWorkspace: true, createdAt: '2026-09-28', mention: 'm' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', label: 'Mine', sameWorkspace: true, createdAt: Number.NaN, mention: 'm' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', sameWorkspace: true, createdAt: 1, mention: 'm' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', label: 'Mine', createdAt: 1, mention: 'm' }] } }, 'candidates'],
    [{ result: { ok: true, value: [{ sessionId: 's-mine', label: 'Mine', sameWorkspace: true, createdAt: 1 }] } }, 'candidates'],
    [[{ sessionId: 's-mine' }], 'candidates'],
    [null, 'candidates'],
    ['text', 'search'],
  ];
  for (const [value, door] of unknown) {
    const verdict = filterSessionAnswer(value, door, held);
    assert.equal(verdict.kind, 'reject', JSON.stringify(value));
    assert.equal((verdict as { status: number }).status, 502, JSON.stringify(value));
  }
});

test("Q10: scrubForeignPrompterEmails blanks every other person's prompter address and keeps the seat's own", () => {
  const event = (email: unknown) => ({ type: 'user/message', data: { source: { kind: 'user', rpcId: 'r', prompter: { user: 'u', email } } } });
  const snapshot = {
    type: 'snapshot',
    records: [{ type: 'event', event: event('owner@site.test') }, { type: 'event', event: event('Me@Site.test') }, { type: 'event', event: event(null) }],
  };
  assert.equal(scrubForeignPrompterEmails(snapshot, 'me@site.test'), true);
  assert.deepEqual(snapshot.records.map((r) => r.event.data.source.prompter.email), [null, 'Me@Site.test', null]);
  // Live delta, and a seat with no address of its own (a guest): nothing survives.
  const live = { type: 'event', event: event('owner@site.test') };
  scrubForeignPrompterEmails(live, null);
  assert.equal(live.event.data.source.prompter.email, null);
  // A non-string address is not the seat's.
  const odd = { prompter: { user: 'u', email: ['owner@site.test'] } };
  scrubForeignPrompterEmails(odd, 'owner@site.test');
  assert.equal(odd.prompter.email, null);
  // Depth is no hiding place.
  let deep: Record<string, unknown> = { prompter: { user: 'u', email: 'owner@site.test' } };
  const innermost = deep;
  for (let i = 0; i < 200; i++) deep = { nested: [deep] };
  scrubForeignPrompterEmails(deep, 'me@site.test');
  assert.equal((innermost.prompter as { email: unknown }).email, null);
  // Nothing to change → reported unchanged; the key stays (email: null is the owner's own stamp shape).
  assert.equal(scrubForeignPrompterEmails({ text: 'owner@site.test typed nothing' }, null), false);
  const ownerStamp = { prompter: { user: 'owner', email: null } };
  assert.equal(scrubForeignPrompterEmails(ownerStamp, 'me@site.test'), false);
  assert.deepEqual(ownerStamp, { prompter: { user: 'owner', email: null } });
});
