// TracyHQ/tracy#602: the creation workspace's build chat calls the build tools and nothing else.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILD_AGENT_TOOLS, buildToolRefusal, hideNonBuildTools } from '../../src/tracy/build-agent.js';
import { installTracySeatToolGuard } from '../../src/tracy/seat-tool-guard.js';

type Ctx = Parameters<typeof installTracySeatToolGuard>[0];
const buildId = 'session-build-66666666-6666-4666-8666-666666666666';
const agentOf = (id: string, header: Record<string, unknown> = {}) => ({ id, session: { header } });

test('a build session may call exactly the build tools; every other tool is refused before its body', () => {
  const agent = agentOf(buildId, { agentPreset: 'site-builder' });
  assert.deepEqual([...BUILD_AGENT_TOOLS].sort(), ['ask_user_question', 'tracy_build', 'web_fetch', 'web_search']);
  for (const name of BUILD_AGENT_TOOLS) assert.equal(buildToolRefusal(agent, name), undefined, name);
  for (const name of ['bash', 'write', 'edit', 'read', 'tracy_site', 'tracy_guide', 'tracy_demo', 'tracy_emdash',
    'tracy_site_build_joomla', 'tracy_design_system', 'subagent', 'run_code', 'skill']) {
    assert.equal(typeof buildToolRefusal(agent, name), 'string', name);
  }
});

test('the fence follows the session, not the chosen preset: a build session switched to a site agent stays fenced', () => {
  assert.equal(typeof buildToolRefusal(agentOf(buildId, { agentPreset: 'developer-wordpress' }), 'bash'), 'string');
  // The build agent preset is fenced wherever it runs.
  assert.equal(typeof buildToolRefusal(agentOf('session-1', { agentPreset: 'site-builder' }), 'bash'), 'string');
  // A child of a build session inherits the fence.
  assert.equal(typeof buildToolRefusal(agentOf('child-1', { parentSession: buildId }), 'tracy_site'), 'string');
});

test('every other session is left exactly as it was, and never reaches the build tool', () => {
  for (const agent of [agentOf('session-widget-77777777-7777-4777-8777-777777777777', { agentPreset: 'designer-wordpress' }),
    agentOf('wo-demo-88888888-8888-4888-8888-888888888888', { agentPreset: 'designer-joomla' }), agentOf('session-2'), undefined]) {
    for (const name of ['bash', 'tracy_site', 'web_fetch']) assert.equal(buildToolRefusal(agent, name), undefined);
    // TracyHQ/tracy#609: the build tool belongs to the build chat only; a site session cannot call it.
    assert.equal(typeof buildToolRefusal(agent, 'tracy_build'), 'string', JSON.stringify(agent));
  }
});

test('the build tool is granted to a build session and to its child (TracyHQ/tracy#609)', () => {
  assert.equal(buildToolRefusal(agentOf(buildId, { agentPreset: 'site-builder' }), 'tracy_build'), undefined);
  assert.equal(buildToolRefusal(agentOf('child-2', { parentSession: buildId }), 'tracy_build'), undefined);
  // Granting it widened nothing else: the site and shell tools stay refused in the build session.
  for (const name of ['bash', 'tracy_site', 'tracy_guide', 'tracy_build_site', 'tracy_builder']) {
    assert.equal(typeof buildToolRefusal(agentOf(buildId, { agentPreset: 'site-builder' }), name), 'string', name);
  }
});

test('the seat tool guard refuses a non build tool in a build session even for a seat that may run code', async () => {
  let guard: Parameters<Ctx['tools']['guard']>[0] | undefined;
  const listeners = new Map<string, (...args: any[]) => any>();
  const ctx = {
    on(name: string, listener: (...args: any[]) => any) { listeners.set(name, listener); },
    get() { return { get: () => undefined, isOwnedBy: () => false }; },
    tools: { guard(check: typeof guard) { guard = check; return () => {}; } },
  };
  installTracySeatToolGuard(ctx as unknown as Ctx, {
    getUserByUsername: () => ({ id: 1, role: 'subuser' }),
    getPermissions: () => ({ banned: false, sandbox_mode: 'workspace-write' }),
  });
  const build = agentOf(buildId, { agentPreset: 'site-builder' });
  const site = agentOf('session-3', { agentPreset: 'designer-wordpress' });
  listeners.get('agent/created')!({ agent: build, source: 'startup' });
  listeners.get('agent/created')!({ agent: site, source: 'startup' });
  for (const agent of [build, site]) await listeners.get('agent/pre-step')!({ agent, messages: [{ source: { kind: 'user', prompter: { user: 'editor' } } }] }, async () => ({ kind: 'enter' }));
  assert.equal(typeof guard!({ agent: build, name: 'bash' }), 'string');
  assert.equal(typeof guard!({ agent: build, name: 'tracy_site' }), 'string');
  assert.equal(guard!({ agent: build, name: 'web_fetch' }), undefined);
  assert.equal(guard!({ agent: build, name: 'tracy_build' }), undefined);
  assert.equal(typeof guard!({ agent: site, name: 'tracy_build' }), 'string', 'a site session never calls the build tool');
  assert.equal(guard!({ agent: site, name: 'bash' }), undefined, 'a site seat keeps its code tools');
  assert.equal(guard!({ agent: site, name: 'tracy_site' }), undefined);
});

test('a build session does not even see the tools it may not call', () => {
  const masks: Record<string, unknown>[] = [];
  const agent = { ...agentOf(buildId, { agentPreset: 'site-builder' }), ctx: { tools: { restrict(filter: Record<string, unknown>) { masks.push(filter); return () => {}; } } } };
  const schemas = () => ['web_fetch', 'web_search', 'ask_user_question', 'tracy_build', 'tracy_site', 'tracy_guide', 'bash'].map((name) => ({ name }));
  hideNonBuildTools(agent, schemas);
  assert.deepEqual(masks, [{ deny: ['tracy_site', 'tracy_guide', 'bash'] }]);
  masks.length = 0;
  hideNonBuildTools(agentOf('session-4', {}) as never, schemas);
  assert.deepEqual(masks, [], 'another session is not masked');
});
