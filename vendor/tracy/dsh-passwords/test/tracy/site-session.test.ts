import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteSessionRequest } from '../../src/tracy/site-session.js';

const sessionId = 'wo-demo-11111111-1111-4111-8111-111111111111';
const grant = { role: 'owner', email: 'owner@example.test', site: 'demo.example.test', folders: ['/site/demo'],
  siteSession: { sessionId, agentPreset: 'designer-emdash' } };

test('site allocation accepts only one signed owner folder and the server-held WO identity', () => {
  assert.equal(siteSessionRequest({ role: 'owner' }), null);
  assert.deepEqual(siteSessionRequest(grant), { folder: '/site/demo', session: grant.siteSession });
  for (const change of [
    { role: 'editor' }, { role: 'guest' }, { email: '' }, { site: '~onboarding' }, { site: 'other.example.test' },
    { home: '/home' }, { folders: [] }, { folders: ['/site/demo', '/site/other'] },
    { folders: ['/site/demo/../other'] }, { folders: ['/site/*'] }, { toolsets: ['site'] },
    { nativeSession: { sessionId, agentPreset: 'designer-emdash' } },
    { siteSession: { ...grant.siteSession, workspaceId: 'foreign' } },
    { siteSession: { ...grant.siteSession, cwd: '/site/other' } },
    { siteSession: { ...grant.siteSession, sessionId: 'session-foreign' } },
    { siteSession: { ...grant.siteSession, agentPreset: 'unrestricted' } }
  ]) assert.throws(() => siteSessionRequest({ ...grant, ...change }), /INVALID_SITE_SESSION/);
});
