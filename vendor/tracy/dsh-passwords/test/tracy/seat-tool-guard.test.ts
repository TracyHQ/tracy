// H19: a running native agent cannot keep a seat permission the database has withdrawn.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installTracySeatToolGuard } from '../../src/tracy/seat-tool-guard.js';

type Ctx = Parameters<typeof installTracySeatToolGuard>[0];
type Agent = Parameters<Parameters<Ctx['tools']['guard']>[0]>[0]['agent'];
function harness() {
  const listeners = new Map<string, (...args: any[]) => any>();
  let guard: Parameters<Ctx['tools']['guard']>[0];
  const agents = new Map<string, NonNullable<Agent>>();
  const owners = new Map<string, NonNullable<Agent>>();
  const users = new Map([['editor', { id: 1, role: 'subuser' }], ['viewer', { id: 2, role: 'subuser' }], ['master', { id: 3, role: 'admin' }]]);
  const permissions = new Map<number, { banned: boolean; sandbox_mode: string | null }>([[1, { banned: false, sandbox_mode: 'workspace-write' }], [2, { banned: false, sandbox_mode: 'read-only' }]]);
  let broken = false;
  let reads = 0;
  const context = {
    on(name: string, listener: (...args: any[]) => any) { listeners.set(name, listener); },
    get() { return { get: (id: string) => agents.get(id), isOwnedBy: (id: string, owner: Agent) => owners.get(id) === owner }; },
    tools: { guard(check: typeof guard) { guard = check; return () => {}; } },
  };
  installTracySeatToolGuard(context as Ctx, {
    getUserByUsername(name) { reads++; if (broken) throw new Error('unavailable'); return users.get(name) ?? null; },
    getPermissions(id) { return permissions.get(id) ?? null; },
  });
  const make = (id: string, parent?: NonNullable<Agent>, runtimeOwned = true, source = 'startup') => {
    const agent = { id, session: { header: parent ? { parentSession: parent.id } : {} } };
    agents.set(id, agent);
    if (parent && runtimeOwned) owners.set(id, parent);
    listeners.get('agent/created')!({ agent, source });
    return agent;
  };
  const step = (agent: Agent, sources: object[], kind = 'enter', during?: () => void) => listeners.get('agent/pre-step')!({ agent, messages: sources.map(source => ({ source })) }, async () => { during?.(); return { kind }; });
  const call = (agent: Agent, name = 'write') => guard!({ agent, name });
  return { make, step, call, permissions, users, get reads() { return reads; }, breakDb() { broken = true; } };
}
const stamped = (user: string) => ({ kind: 'user', prompter: { user } });

test('every code dispatch reads current authority; downgrade, ban and deletion deny before the body', async () => {
  const h = harness(), agent = h.make('root');
  await h.step(agent, [stamped('editor')]);
  for (const tool of ['write', 'edit', 'bash', 'pwsh']) assert.equal(h.call(agent, tool), undefined);
  assert.equal(h.reads, 4);
  h.permissions.get(1)!.sandbox_mode = 'read-only';
  for (const tool of ['write', 'edit', 'bash', 'pwsh']) assert.equal(typeof h.call(agent, tool), 'string');
  h.permissions.get(1)!.sandbox_mode = 'workspace-write';
  h.permissions.get(1)!.banned = true;
  assert.equal(typeof h.call(agent), 'string');
  h.users.delete('editor');
  assert.equal(typeof h.call(agent), 'string');
});

test('only entered input changes the actor; queued or rejected prompts cannot lend authority', async () => {
  const h = harness(), agent = h.make('root');
  await h.step(agent, [stamped('viewer')]);
  await h.step(agent, [stamped('editor')], 'reject');
  assert.equal(typeof h.call(agent), 'string');
  await h.step(agent, [stamped('editor')], 'enter', () => assert.equal(typeof h.call(agent), 'string'));
  assert.equal(h.call(agent), undefined);
  await h.step(agent, [{ kind: 'user', rpcId: 'unstamped-browser' }]);
  assert.equal(typeof h.call(agent), 'string');
});

test('one-shot and continuable startup shape: a proven child retains only its first raw task actor', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  const child = h.make('child', parent);
  await h.step(parent, [stamped('viewer')]);
  await h.step(child, [{ kind: 'user' }]);
  assert.equal(h.call(child), undefined, 'the admitted creator, not the later parent prompt');
  h.permissions.get(1)!.sandbox_mode = 'read-only';
  assert.equal(typeof h.call(child), 'string', 'the child rechecks the live database too');
  h.permissions.get(1)!.sandbox_mode = 'workspace-write';
  await h.step(child, [{ kind: 'user', rpcId: 'later-browser' }]);
  assert.equal(typeof h.call(child), 'string', 'browser input cannot borrow the creator actor');
});

test('fork lineage, resumed agents and extra unstamped input never acquire parent authority', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  for (const agent of [h.make('fork', parent, false), h.make('resume', parent, true, 'resume')]) {
    await h.step(agent, [{ kind: 'user' }]);
    assert.equal(typeof h.call(agent), 'string');
  }
  const child = h.make('child', parent);
  await h.step(child, [{ kind: 'user' }, { kind: 'user' }]);
  assert.equal(typeof h.call(child), 'string');
});

test('the initial child exception survives a rejected step but is consumed by the first entered step', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  const child = h.make('child', parent);
  await h.step(child, [{ kind: 'user' }], 'reject');
  await h.step(child, [{ kind: 'user' }]);
  assert.equal(h.call(child), undefined);
  await h.step(child, [{ kind: 'user' }]);
  assert.equal(typeof h.call(child), 'string');
});

test('a new stamped child input changes actor; native master and content-write semantics stay intact', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  const child = h.make('child', parent);
  await h.step(child, [stamped('viewer')]);
  assert.equal(typeof h.call(child), 'string');
  await h.step(parent, [stamped('master')]);
  assert.equal(h.call(parent), undefined);
  await h.step(parent, [stamped('editor')]);
  assert.equal(h.call(parent), undefined, 'workspace-write does not require the code toolset');
  h.permissions.delete(1);
  assert.equal(typeof h.call(parent), 'string');
});

test('unavailable or missing authority refuses code only and never changes read/CMS tool decisions', async () => {
  const h = harness(), agent = h.make('root');
  assert.equal(typeof h.call(undefined), 'string');
  assert.equal(typeof h.call(agent), 'string');
  assert.equal(h.call(agent, 'read'), undefined);
  assert.equal(h.call(agent, 'tracy_site'), undefined);
  await h.step(agent, [stamped('editor')]);
  h.breakDb();
  assert.equal(typeof h.call(agent), 'string');
});


test('a parent continuation cannot lend the old creator authority after another actor entered', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  const child = h.make('child', parent);
  await h.step(child, [{ kind: 'user' }]);
  await h.step(child, [{ kind: 'agent-message', senderSessionId: 'parent' }]);
  assert.equal(h.call(child), undefined);
  await h.step(parent, [stamped('viewer')]);
  await h.step(child, [{ kind: 'agent-message', senderSessionId: 'parent' }]);
  assert.equal(typeof h.call(child), 'string');
});

test('real native tools refuse a downgraded seat after an extensible pre-execute allow and before the body', async () => {
  const { Context } = await import('@deepseek-ai/cordis');
  const { default: SystemPrompt } = await import('../../../deepseek-harness/packages/core/system-prompt/src/index.ts');
  const { default: ToolRuntime } = await import('../../../deepseek-harness/packages/core/tools/src/index.ts');
  const h = harness(), agent = h.make('real-root');
  await h.step(agent, [stamped('editor')]);
  let bodyCalls = 0;
  // Bind the admitted actor through the installed policy's own event seam.
  const installed: any[] = [];
  const authority = { getUserByUsername: () => ({ id: 1, role: 'subuser' }), getPermissions: () => h.permissions.get(1) ?? null };
  const guardCtx = { on: (name: string, f: any) => installed.push([name, f]), get: () => undefined, tools: { guard: (check: any) => ctx.tools.guard(check) } };
  const real = new Context();
  await real.plugin(SystemPrompt, {});
  await real.plugin(ToolRuntime);
  guardCtx.tools.guard = (check: any) => real.tools.guard(check);
  installTracySeatToolGuard(guardCtx as Ctx, authority);
  await installed.find(([name]) => name === 'agent/pre-step')[1]({ agent, messages: [{ source: stamped('editor') }] }, async () => ({ kind: 'enter' }));
  real.tools.register({ name: 'write', description: 'fixture write', parameters: { type: 'object', properties: {} }, output: { schema: { type: 'string' }, render: (_a: any, value: any) => [{ type: 'text', text: value }] }, execute: async () => { bodyCalls++; return 'written'; } });
  real.on('tools/pre-execute', () => Promise.resolve({ kind: 'allow' }), { prepend: true });
  const input = { signal: new AbortController().signal, callId: 'guard-call' as any, name: 'write', arguments: {}, agent: agent as any };
  assert.equal((await real.tools.execute(input)).isError, false);
  assert.equal(bodyCalls, 1);
  h.permissions.get(1)!.sandbox_mode = 'read-only';
  assert.equal((await real.tools.execute({ ...input, callId: 'denied-call' as any })).isError, true);
  assert.equal(bodyCalls, 1, 'the denied dispatch never reached the native tool body');
  h.permissions.get(1)!.sandbox_mode = 'workspace-write';
  let approvals = 0;
  real.provide('approval', { request: async () => { approvals++; h.permissions.get(1)!.sandbox_mode = 'read-only'; return 'allowed-once'; } } as any);
  real.on('tools/pre-execute', () => Promise.resolve({ kind: 'ask' }), { prepend: true });
  assert.equal((await real.tools.execute({ ...input, callId: 'approval-call' as any })).isError, true);
  assert.equal(approvals, 1);
  assert.equal(bodyCalls, 1, 'approval does not retain the grant that existed before it waited');
});


test('a resumed owned child accepts the current parent continuation but never an unstamped browser user', async () => {
  const h = harness(), parent = h.make('parent');
  await h.step(parent, [stamped('editor')]);
  const child = h.make('resumed', parent, true, 'resume');
  await h.step(child, [{ kind: 'agent-message', senderSessionId: 'parent' }]);
  assert.equal(h.call(child), undefined);
  await h.step(child, [{ kind: 'user', rpcId: 'browser' }]);
  assert.equal(typeof h.call(child), 'string');
});
