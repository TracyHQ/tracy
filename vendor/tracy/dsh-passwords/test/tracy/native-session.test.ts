import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeSessionRequest, ensureNativeSession } from '../../src/tracy/native-session.js';
import type { WorkspaceRpc } from '../../src/tracy/seat-home.js';
const sessionId = 'session-widget-11111111-1111-4111-8111-111111111111';
const grant = { role: 'editor', email: 'verified@example.test', site: '~onboarding', home: '/home/creation', folders: [], toolsets: ['content'], nativeSession: { sessionId, agentPreset: 'designer-wordpress' } };

test('native operation accepts only the signed personal onboarding grant shape', () => {
  assert.equal(nativeSessionRequest({ role: 'guest' }), null);
  assert.deepEqual(nativeSessionRequest(grant), grant.nativeSession);
  for (const change of [{ role: 'guest' }, { email: '' }, { site: 'other.test' }, { home: '' }, { folders: ['/site/other'] }, { toolsets: ['code'] }, { nativeSession: { sessionId, agentPreset: 'unrestricted' } }, { nativeSession: { ...grant.nativeSession, cwd: '/site/other' } }]) {
    assert.throws(() => nativeSessionRequest({ ...grant, ...change }), /INVALID_NATIVE_SESSION/);
  }
});

test('native allocation uses only server workspace and stable ID; retries never submit prompts', async () => {
  const calls: string[] = [], grants: string[] = [];
  const rpc: WorkspaceRpc = async (name, args) => {
    calls.push(name);
    assert.deepEqual(args, { request: { workspaceId: 'own-workspace', ...grant.nativeSession } });
    return { ok: true, value: { sessionId } };
  };
  for (let i = 0; i < 2; i++) assert.deepEqual(await ensureNativeSession(grant.nativeSession, 'own-workspace', rpc, id => { grants.push(id); return true; }), { sessionId, workspaceId: 'own-workspace' });
  assert.deepEqual(calls, ['session/create', 'session/create']);
  assert.deepEqual(grants, [sessionId, sessionId]);
});

test('native refusal or wrong ID never records a grant; grant conflict never returns success', async () => {
  let writes = 0;
  for (const result of [{ ok: false as const, error: { code: 'session/cwd-conflict', message: 'private' } }, { ok: true as const, value: { sessionId: 'foreign' } }]) {
    await assert.rejects(ensureNativeSession(grant.nativeSession, 'own-workspace', async () => result, () => { writes++; return true; }));
  }
  assert.equal(writes, 0);
  await assert.rejects(ensureNativeSession(grant.nativeSession, 'own-workspace', async () => ({ ok: true, value: { sessionId } }), () => false), /GRANT_REFUSED/);
});

// The creation workspace's build chat (TracyHQ/tracy#602): its own session prefix and exactly one preset.
const buildId = 'session-build-33333333-3333-4333-8333-333333333333';
const build = { ...grant, nativeSession: { sessionId: buildId, agentPreset: 'site-builder' } };

test('the build chat is allocated with the build agent preset and the same narrow seat grant', () => {
  assert.deepEqual(nativeSessionRequest(build), build.nativeSession);
});

test('the build chat grants nothing wider than the build: other presets, prefixes and seats are refused', () => {
  const refused: Record<string, unknown>[] = [
    // A build session never runs a site agent, and a widget session never runs the build agent.
    { nativeSession: { sessionId: buildId, agentPreset: 'designer-wordpress' } },
    { nativeSession: { sessionId: buildId, agentPreset: 'developer-joomla' } },
    { nativeSession: { sessionId, agentPreset: 'site-builder' } },
    // No other session prefix, no casing trick, no preset that merely starts like the build one.
    { nativeSession: { sessionId: buildId.replace('build', 'builds'), agentPreset: 'site-builder' } },
    { nativeSession: { sessionId: `${buildId}-x`, agentPreset: 'site-builder' } },
    { nativeSession: { sessionId: buildId, agentPreset: 'site-builder-wide' } },
    { nativeSession: { sessionId: buildId, agentPreset: 'Site-Builder' } },
    // The seat stays the creation seat: content only, no folders, no site, no other role.
    { toolsets: ['content', 'code'] },
    { toolsets: ['content', 'site'] },
    { toolsets: ['lifecycle'] },
    { toolsets: [] },
    { folders: ['/site/other'] },
    { site: 'other.example.test' },
    { role: 'owner' },
    { nativeSession: { ...build.nativeSession, cwd: '/site/other' } },
    { nativeSession: { ...build.nativeSession, toolsets: ['code'] } },
  ];
  for (const change of refused) {
    assert.throws(() => nativeSessionRequest({ ...build, ...change }), /INVALID_NATIVE_SESSION/, JSON.stringify(change));
  }
});
