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
