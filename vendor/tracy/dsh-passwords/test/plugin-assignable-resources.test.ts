import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPermanentGatewayExitCode, listAssignableWorkspaces } from '../src/plugin.js';

test('gateway permanent exit codes do not accept signal strings', () => {
  assert.equal(isPermanentGatewayExitCode(1), true);
  assert.equal(isPermanentGatewayExitCode(37), true);
  assert.equal(isPermanentGatewayExitCode(0), false);
  assert.equal(isPermanentGatewayExitCode('1'), false);
});

type Workspace = {
  path: string;
  title: string;
  sessionIds: readonly string[];
  status(): Promise<'ok' | 'missing-dir'>;
};

function registry(workspace: Workspace, archivedSessionIds: readonly string[] = []) {
  return {
    list: () => [workspace],
    archivedSessionIds,
  };
}

function workspace(sessionIds: readonly string[]): Workspace {
  return {
    path: '/workspaces/project',
    title: 'Project',
    sessionIds,
    status: async () => 'ok',
  };
}

test('Issue #25: live blank sessions remain assignable when registered by DSH', async () => {
  const result = await listAssignableWorkspaces(
    registry(workspace(['blank-live'])),
    { get: (id: string) => id === 'blank-live' ? { deriveMessages: () => [] } : undefined },
    { get: () => ({ title: 'New session' }) },
    undefined,
  );

  assert.deepEqual(result[0]?.sessions, [{ id: 'blank-live', title: 'New session' }]);
});

test('Issue #25: titled persisted blank sessions remain assignable', async () => {
  const result = await listAssignableWorkspaces(
    registry(workspace(['blank-persisted'])),
    { get: () => undefined },
    undefined,
    {
      readSurface: async () => ({ events: [] }),
      readTitle: async () => ({ title: 'Persisted new session' }),
    },
  );

  assert.deepEqual(result[0]?.sessions, [{ id: 'blank-persisted', title: 'Persisted new session' }]);
});

test('untitled persisted initialization slots are hidden from the assignment inventory', async () => {
  const result = await listAssignableWorkspaces(
    registry(workspace(['session-empty', 'session-message'])),
    { get: () => undefined },
    undefined,
    {
      readSurface: async (id: string) => ({ events: id === 'session-empty' ? [] : [{ type: 'user/message' }] }),
      readTitle: async () => undefined,
      listEvents: async (id: string) => id === 'session-empty'
        ? [{ type: 'session' }, { type: 'permission/preset' }, { type: 'sandbox/mode' }, { type: 'approval/policy' }, { type: 'subagent/model-selection-policy' }]
        : [{ type: 'user/message' }],
    },
  );

  assert.deepEqual(result[0]?.sessions, [{ id: 'session-message', title: 'session-message' }]);
});

test('untitled sessions with unknown raw events or empty raw logs are retained', async () => {
  const result = await listAssignableWorkspaces(
    registry(workspace(['unknown', 'no-events'])),
    { get: () => undefined },
    undefined,
    {
      readSurface: async () => ({ events: [] }),
      readTitle: async () => undefined,
      listEvents: async (id: string) => id === 'unknown' ? [{ type: 'turn/start' }] : [],
    },
  );

  assert.deepEqual(result[0]?.sessions, [
    { id: 'unknown', title: 'unknown' },
    { id: 'no-events', title: 'no-events' },
  ]);
});

test('Issue #25: archived sessions are never assignable, including blank sessions', async () => {
  const result = await listAssignableWorkspaces(
    registry(workspace(['blank-archived']), ['blank-archived']),
    { get: () => ({}) },
    { get: () => ({ title: 'Archived' }) },
    undefined,
  );

  assert.deepEqual(result[0]?.sessions, []);
});

test('Issue #25: a definitely missing persisted session is omitted', async () => {
  const missing = Object.assign(new Error('session not found'), { code: 'SESSION_QUERY_SESSION_NOT_FOUND' });
  const result = await listAssignableWorkspaces(
    registry(workspace(['missing'])),
    { get: () => undefined },
    undefined,
    { readSurface: async () => { throw missing; } },
  );

  assert.deepEqual(result[0]?.sessions, []);
});

test('Issue #25: non-missing session storage failures are propagated', async () => {
  const failure = new Error('database unavailable');
  await assert.rejects(
    listAssignableWorkspaces(
      registry(workspace(['unavailable'])),
      { get: () => undefined },
      undefined,
      { readSurface: async () => { throw failure; } },
    ),
    failure,
  );
});
