// A seat's own workspace on a lane that mounts no site.
//
// The onboarding lane used to hand every signed-in person the same scratch folder, and the
// session list is filtered by folder — so everyone saw everyone's conversations. This file pins
// what the seat door does instead when a grant names a `home`: one directory per account name,
// registered as a workspace with dsh, titled so the person recognises it as theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import {
  createSiteWorkspaceRegistrar as createSiteWorkspaceRegistrarOf,
  ensurePersonalWorkspace as ensurePersonalWorkspaceOf,
  ensureSiteWorkspace as ensureSiteWorkspaceOf,
  forgetWorkspace as forgetWorkspaceOf,
  isMissingFolderRefusal,
  personalWorkspacePath,
  settleSiteSessions as settleSiteSessionsOf,
  SiteSessionsUnsettled,
  SiteWorkspaceRefusal,
  SITE_WORKSPACE_RETRY_BUDGET_MS,
  SITE_WORKSPACE_RETRY_DELAYS_MS,
  type WorkspaceRpc,
} from '../../src/tracy/seat-home.js';
import { strictDshRpc } from './dsh-rpc-fake.js';

// #591: every fake of dsh below sits behind dsh's own argument check (dsh-rpc-fake.ts), so a call
// the real gateway refuses as `gateway/arguments-invalid` is refused here too, never answered.
const ensurePersonalWorkspace: typeof ensurePersonalWorkspaceOf = (input, rpc) =>
  ensurePersonalWorkspaceOf(input, strictDshRpc(rpc));
const ensureSiteWorkspace: typeof ensureSiteWorkspaceOf = (folder, title, rpc, proceed) =>
  ensureSiteWorkspaceOf(folder, title, strictDshRpc(rpc), proceed);
const forgetWorkspace: typeof forgetWorkspaceOf = (folder, rpc) => forgetWorkspaceOf(folder, strictDshRpc(rpc));
const settleSiteSessions: typeof settleSiteSessionsOf = (cwd, sessionIds, rpc, seen) =>
  settleSiteSessionsOf(cwd, sessionIds, strictDshRpc(rpc), seen);
const createSiteWorkspaceRegistrar: typeof createSiteWorkspaceRegistrarOf = (options) =>
  createSiteWorkspaceRegistrarOf({ ...options, rpc: strictDshRpc(options.rpc) });

interface Call {
  endpoint: string;
  args: Record<string, unknown>;
}

/** A dsh that answers `workspace/create` and `workspace/rename` the way the real one does. */
function fakeDsh(options: { known?: string[]; renameFails?: boolean } = {}): { rpc: WorkspaceRpc; calls: Call[] } {
  const known = new Set(options.known ?? []);
  const calls: Call[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    calls.push({ endpoint, args });
    // dsh's typert gateway takes exactly one argument, `request` — a bare `{ path }` is refused.
    const request = args.request as Record<string, unknown>;
    if (endpoint === 'workspace/create') {
      const p = String(request.path);
      const created = !known.has(p);
      known.add(p);
      return { ok: true, value: { workspace: { workspaceId: `ws-${p}`, path: p, title: path.basename(p) }, created } };
    }
    if (options.renameFails) {
      return { ok: false, error: { code: 'workspace-name-conflict', message: 'taken' } };
    }
    return { ok: true, value: { workspace: { workspaceId: request.workspaceId, title: request.title } } };
  };
  return { rpc, calls };
}

test('S11: the personal path is the account name under the home root, and nothing else', () => {
  assert.equal(personalWorkspacePath('/desk-home/workspace', 's0123abcd'), '/desk-home/workspace/s0123abcd');
  assert.equal(personalWorkspacePath('/desk-home/workspace/', 's0123abcd'), '/desk-home/workspace/s0123abcd');
});

test('S11: first arrival: the directory is created, registered with dsh, and titled for its person', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-home-'));
  try {
    const dsh = fakeDsh();
    const result = await ensurePersonalWorkspace({ root, username: 's0123abcd', title: 'person@example.com' }, dsh.rpc);
    const expected = path.join(root, 's0123abcd');
    assert.equal(result.path, expected);
    assert.equal(result.created, true);
    assert.ok(statSync(expected).isDirectory(), 'the folder has to exist before dsh can register it');
    assert.deepEqual(
      dsh.calls.map((c) => c.endpoint),
      ['workspace/create', 'workspace/rename'],
      'register first, then name — dsh titles a new workspace after its directory, which is a hash here',
    );
    assert.deepEqual(dsh.calls[0].args, { request: { path: expected } });
    assert.deepEqual(dsh.calls[1].args, { request: { workspaceId: `ws-${expected}`, title: 'person@example.com' } });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('S11: coming back: the same path is returned and dsh is not asked to rename again', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-home-'));
  try {
    const expected = path.join(root, 's0123abcd');
    const dsh = fakeDsh({ known: [expected] });
    const result = await ensurePersonalWorkspace({ root, username: 's0123abcd', title: 'person@example.com' }, dsh.rpc);
    assert.equal(result.path, expected);
    assert.equal(result.created, false);
    assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('S11: a home root that does not exist is a configuration error, not a folder to invent', async () => {
  const root = path.join(os.tmpdir(), `dshpw-seat-home-missing-${process.pid}`);
  const dsh = fakeDsh();
  await assert.rejects(
    ensurePersonalWorkspace({ root, username: 's0123abcd', title: 'person@example.com' }, dsh.rpc),
    /home root/,
  );
  assert.equal(existsSync(root), false, 'the root is the lane operator’s to create');
  assert.equal(dsh.calls.length, 0);
});

test('S11: dsh refusing the workspace fails the whole thing — a folder nobody can open is not a seat', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-home-'));
  try {
    const rpc: WorkspaceRpc = async () => ({ ok: false, error: { code: 'workspace-invalid-path', message: 'no' } });
    await assert.rejects(ensurePersonalWorkspace({ root, username: 's0123abcd', title: 'x@y.z' }, rpc), /workspace-invalid-path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('S11: a title dsh will not take leaves the workspace usable under its default name', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dshpw-seat-home-'));
  try {
    const dsh = fakeDsh({ renameFails: true });
    const result = await ensurePersonalWorkspace({ root, username: 's0123abcd', title: 'person@example.com' }, dsh.rpc);
    assert.equal(result.created, true);
    assert.equal(result.titled, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Forgetting a deleted site's folder ──────────────────────────────────────────────────────
//
// A site's folder is named after its fleet label, and the label comes from the domain — so a site
// deleted and added again lands in the same folder, and dsh (which indexes sessions by folder)
// handed the new workspace the old conversations (measured 14/09). Deleting a site now archives
// them and drops the registration while the folder still exists.

/** An idle `session/list` row, the shape dsh's `SessionSummary` has. */
const idle = (sessionId: string, extra: Record<string, unknown> = {}) => ({
  sessionId,
  running: false,
  agentAvailable: false,
  updatedAt: 1,
  blank: false,
  ...extra,
});

test('K2: forgetting a folder archives every session dsh accounts to it, stops them, then removes the workspace', async () => {
  const calls: Call[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    calls.push({ endpoint, args });
    if (endpoint === 'workspace/create') {
      return {
        ok: true,
        value: { workspace: { workspaceId: 'ws-site', path: '/site/demo', sessionIds: ['s-1', 's-2'] }, created: false },
      };
    }
    if (endpoint === 'session/cancel') return { ok: false, error: { code: 'session/not-found', message: 'not attached' } };
    return { ok: true, value: {} };
  };
  const result = await forgetWorkspace('/site/demo', rpc);
  assert.deepEqual(result, { archived: ['s-1', 's-2'], deleted: true });
  assert.deepEqual(calls, [
    { endpoint: 'workspace/create', args: { request: { path: '/site/demo' } } },
    { endpoint: 'workspace/archiveSession', args: { request: { sessionId: 's-1', stopActivity: true } } },
    { endpoint: 'workspace/archiveSession', args: { request: { sessionId: 's-2', stopActivity: true } } },
    { endpoint: 'session/cancel', args: { request: { sessionId: 's-1' } } },
    { endpoint: 'session/cancel', args: { request: { sessionId: 's-2' } } },
    { endpoint: 'workspace/delete', args: { request: { workspaceId: 'ws-site' } } },
  ]);
});

test('K2: a session slot with no log behind it is skipped, not a reason to keep the workspace', async () => {
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['gone', 's-2'] }, created: false } };
    }
    if (endpoint !== 'workspace/delete' && (args.request as { sessionId?: string }).sessionId === 'gone') {
      return { ok: false, error: { code: 'session/not-found', message: 'gone' } };
    }
    return { ok: true, value: {} };
  };
  assert.deepEqual(await forgetWorkspace('/site/demo', rpc), { archived: ['s-2'], deleted: true });
});

// #561: a deleted site's turn left waiting on its customer's answer kept its session live, and
// `workspace/archiveSession` refused it as `workspace/session-active` — the forget failed, the
// session folder stayed, and the turn held the next deploy for the whole drain (dev, 29/09).
// The review of #561: dsh skips `stopActivity` for a session it had already archived, so every
// session is also cancelled through the Stop button's door.
test('K2: a session dsh had already archived is still cancelled through session/cancel', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    const id = (args.request as { sessionId?: string }).sessionId;
    calls.push(id === undefined ? endpoint : `${endpoint} ${id}`);
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['s-live'] }, created: false } };
    }
    return { ok: true, value: endpoint === 'session/cancel' ? { accepted: true } : {} };
  };
  assert.deepEqual(await forgetWorkspace('/site/demo', rpc), { archived: ['s-live'], deleted: true });
  assert.deepEqual(calls, [
    'workspace/create',
    'workspace/archiveSession s-live',
    'session/cancel s-live',
    'workspace/delete',
  ]);
});

// The review of #561: a subagent's session inherits the site's cwd, so it can be one of the folder's
// sessions, and dsh's `session/cancel` refuses it with its real code `session/agent-busy`
// (`apiSessionSubagentOwnershipError`, session-controller `agent.ts`). Its parent's archive stops it;
// the archive door proves it ended.
test('K2: a subagent session the Stop door refuses as agent-busy does not fail the forget', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    const id = (args.request as { sessionId?: string }).sessionId;
    calls.push(id === undefined ? endpoint : `${endpoint} ${id}`);
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['s-1', 'sub-1'] }, created: false } };
    }
    if (endpoint === 'session/cancel' && id === 'sub-1') {
      return { ok: false, error: { code: 'session/agent-busy', message: 'session "sub-1" is owned by subagent routing' } };
    }
    return { ok: true, value: {} };
  };
  assert.deepEqual(await forgetWorkspace('/site/demo', rpc), { archived: ['s-1', 'sub-1'], deleted: true });
  assert.equal(calls.at(-1), 'workspace/delete');
});

test('K2: a dsh that still refuses a session as active fails loud: the sessions were not all hidden', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['s-live'] }, created: false } };
    }
    return { ok: false, error: { code: 'workspace/session-active', message: 'turn' } };
  };
  await assert.rejects(forgetWorkspace('/site/demo', rpc), /workspace\/session-active/);
  assert.deepEqual(calls, ['workspace/create', 'workspace/archiveSession']);
});

test('K2: a stop dsh refuses for another reason fails loud, before the registration is removed', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['s-1'] }, created: false } };
    }
    if (endpoint === 'session/cancel') return { ok: false, error: { code: 'transport', message: 'down' } };
    return { ok: true, value: {} };
  };
  await assert.rejects(forgetWorkspace('/site/demo', rpc), /transport/);
  assert.deepEqual(calls, ['workspace/create', 'workspace/archiveSession', 'session/cancel']);
});

// The review of #561: a create answer without its session list read as "no sessions", and the
// forget then confirmed a folder whose turns it never stopped.
for (const [name, sessionIds] of [
  ['missing', undefined],
  ['not a list', 's-1'],
  ['holding a non-id', ['s-1', 7]],
  ['holding an empty id', ['']],
] as const) {
  test(`a workspace/create answer whose session list is ${name} fails loud, and nothing is archived`, async () => {
    const calls: string[] = [];
    const rpc: WorkspaceRpc = async (endpoint) => {
      calls.push(endpoint);
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds }, created: false } };
    };
    await assert.rejects(forgetWorkspace('/site/demo', rpc), /session list/);
    assert.deepEqual(calls, ['workspace/create']);
  });
}

// ── Settling a deleted site's folder, right before it moves (#561) ───────────────────────────
//
// The review of #561: the forget read the folder's sessions while the site was still alive, so a
// session opened after it was never stopped, only reported; a subagent the Stop door refuses as
// agent-busy was never stopped at all; and a list read before the move proved nothing about the
// move. The archive door now archives every session of the site (dsh's ArchivedSessionGate then
// runs no model step for it), stops what runs through the Stop button's own doors, and asks again.

/**
 * A dsh whose `session/list` answers `rows` first and `after` from the second call on (the same rows
 * when absent); every other call is logged and answered by `answer`.
 */
function settling(
  rows: unknown[],
  options: {
    after?: unknown[];
    answer?: (endpoint: string, args: Record<string, unknown>) => Awaited<ReturnType<WorkspaceRpc>> | undefined;
  } = {},
): { rpc: WorkspaceRpc; calls: string[] } {
  const calls: string[] = [];
  let lists = 0;
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    if (endpoint === 'session/list') {
      lists += 1;
      calls.push('session/list');
      return { ok: true, value: { items: lists === 1 ? rows : (options.after ?? rows) } };
    }
    const request = args.request as { sessionId?: string } | undefined;
    const id =
      endpoint === 'subagents/interruptByParent'
        ? `${String(args.childSessionId)} under ${String(args.parentSessionId)} ${String(args.mode)}`
        : String(request?.sessionId);
    if (endpoint === 'workspace/archiveSession') {
      assert.equal((args.request as { stopActivity?: unknown }).stopActivity, true);
    }
    calls.push(`${endpoint} ${id}`);
    return options.answer?.(endpoint, args) ?? { ok: true, value: {} };
  };
  return { rpc, calls };
}

test('K2: nothing of the folder running: every session of it is archived, none is stopped, nothing is pending', async () => {
  const { rpc, calls } = settling([
    idle('s-1', { cwd: '/site/demo' }),
    idle('other', { cwd: '/site/else', running: true }),
  ]);
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), []);
  assert.deepEqual(calls, ['session/list', 'workspace/archiveSession s-1', 'session/list']);
});

test('K2: a folder turn still running is archived and stopped through session/cancel; ended, it is not pending', async () => {
  const { rpc, calls } = settling([idle('s-1', { cwd: '/site/demo', running: true })], {
    after: [idle('s-1', { cwd: '/site/demo' })],
  });
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), []);
  assert.deepEqual(calls, [
    'session/list',
    'workspace/archiveSession s-1',
    'session/cancel s-1',
    'session/list',
  ]);
});

test('K2: a turn still winding down after its stop is pending', async () => {
  const { rpc } = settling([idle('s-1', { cwd: '/site/demo', running: true })]);
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), ['s-1']);
});

test('K2: a session opened at the site after the forget, waiting on its question, is archived and stopped too', async () => {
  const { rpc, calls } = settling(
    [idle('s-1', { cwd: '/site/demo' }), idle('s-late', { cwd: '/site/demo', running: true })],
    { after: [idle('s-1', { cwd: '/site/demo' }), idle('s-late', { cwd: '/site/demo' })] },
  );
  // The write fence refuses a held request naming any of them (write-fence.ts): each list says whom.
  const seen: string[][] = [];
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc, (owned) => seen.push([...owned].sort())), []);
  assert.deepEqual(calls, [
    'session/list',
    'workspace/archiveSession s-1',
    'workspace/archiveSession s-late',
    'session/cancel s-late',
    'session/list',
  ]);
  assert.deepEqual(seen, [
    ['s-1', 's-late'],
    ['s-1', 's-late'],
  ]);
});

// dsh's `session/cancel` refuses a subagent's session as `session/agent-busy`, and an archive of an
// already archived parent (or a cancel of an idle one) does not reach its running child: the child
// is stopped under its direct parent, as the chat's Stop does for a subagent address.
test('K2: a running subagent under an idle, already archived parent is interrupted under that parent, at any depth', async () => {
  const { rpc, calls } = settling(
    [
      idle('s-1', { cwd: '/site/demo' }),
      idle('sub-1', { cwd: '/tmp/work', parentSessionId: 's-1', origin: 'subagent' }),
      idle('sub-2', { cwd: '/tmp/work', parentSessionId: 'sub-1', origin: 'subagent', running: true }),
    ],
    {
      after: [
        idle('s-1', { cwd: '/site/demo' }),
        idle('sub-1', { cwd: '/tmp/work', parentSessionId: 's-1', origin: 'subagent' }),
        idle('sub-2', { cwd: '/tmp/work', parentSessionId: 'sub-1', origin: 'subagent' }),
      ],
    },
  );
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), []);
  assert.deepEqual(calls, [
    'session/list',
    'workspace/archiveSession s-1',
    'workspace/archiveSession sub-1',
    'workspace/archiveSession sub-2',
    'subagents/interruptByParent sub-2 under sub-1 continuable',
    'session/list',
  ]);
});

test('K2: a subagent the interrupt did not end yet is pending', async () => {
  const rows = [
    idle('s-1', { cwd: '/site/demo' }),
    idle('sub-1', { cwd: '/tmp/work', parentSessionId: 's-1', origin: 'subagent', running: true }),
  ];
  const { rpc } = settling(rows);
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), ['sub-1']);
});

// A session that appears between the two lists was never archived, so dsh's gate does not hold it.
test('K2: a session of the site that appears after the archive is pending, even idle', async () => {
  const { rpc } = settling([idle('s-1', { cwd: '/site/demo' })], {
    after: [idle('s-1', { cwd: '/site/demo' }), idle('s-new', { cwd: '/site/demo' })],
  });
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), ['s-new']);
});

test('K2: a folder session the list leaves out is not proven ended', async () => {
  const { rpc, calls } = settling([idle('s-1', { cwd: '/site/demo' })]);
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1', 's-unlisted'], rpc), ['s-unlisted']);
  assert.ok(calls.includes('workspace/archiveSession s-unlisted'));
});

test('K2: a session dsh neither holds nor persisted, at the archive or the stop, is not a refusal', async () => {
  const { rpc } = settling([idle('s-1', { cwd: '/site/demo', running: true })], {
    after: [idle('s-1', { cwd: '/site/demo' })],
    answer: () => ({ ok: false, error: { code: 'session/not-found', message: 'gone' } }),
  });
  assert.deepEqual(await settleSiteSessions('/site/demo', ['s-1'], rpc), []);
});

for (const [name, refused, running] of [
  ['an archive refused as active', 'workspace/archiveSession', false],
  ['a cancel refused by the transport', 'session/cancel', true],
  ['an interrupt refused as not the parent', 'subagents/interruptByParent', true],
  ['a subagent cancel refused as agent-busy', 'none', true],
] as const) {
  test(`${name} throws SESSIONS_NOT_STOPPED: a refused stop is not a stop`, async () => {
    const subagent = refused === 'subagents/interruptByParent';
    const rows = [
      idle('s-1', { cwd: '/site/demo', running: running && !subagent }),
      ...(subagent ? [idle('sub-1', { parentSessionId: 's-1', origin: 'subagent', running: true })] : []),
      // dsh's real code for a subagent's session at `session/cancel`: a row naming no parent is
      // cancelled as a root session, and the refusal is not swallowed.
      ...(refused === 'none' ? [idle('orphan', { cwd: '/site/demo', origin: 'subagent', running: true })] : []),
    ];
    const codes: Record<string, string> = {
      'workspace/archiveSession': 'workspace/session-active',
      'session/cancel': 'transport',
      'subagents/interruptByParent': 'subagent/unauthorized',
    };
    const { rpc } = settling(rows, {
      answer: (endpoint, args) => {
        if (refused === 'none' && endpoint === 'session/cancel' && (args.request as { sessionId: string }).sessionId === 'orphan') {
          return { ok: false, error: { code: 'session/agent-busy', message: 'owned by subagent routing' } };
        }
        return endpoint === refused ? { ok: false, error: { code: codes[endpoint]!, message: 'no' } } : undefined;
      },
    });
    await assert.rejects(settleSiteSessions('/site/demo', ['s-1'], rpc), (error: unknown) => {
      assert.ok(error instanceof SiteSessionsUnsettled);
      assert.equal(error.reason, 'SESSIONS_NOT_STOPPED');
      return true;
    });
  });
}

for (const [name, answer] of [
  ['refused', { ok: false, error: { code: 'transport', message: 'down' } }],
  ['without items', { ok: true, value: {} }],
  ['a null value', { ok: true, value: null }],
  ['a row without its running flag', { ok: true, value: { items: [{ sessionId: 's-1' }] } }],
  ['a row without its id', { ok: true, value: { items: [{ running: false }] } }],
  ['a parent that is not an id', { ok: true, value: { items: [idle('s-1', { parentSessionId: 3 })] } }],
  ['an empty parent', { ok: true, value: { items: [idle('s-1', { parentSessionId: '' })] } }],
  ['an origin dsh does not write', { ok: true, value: { items: [idle('s-1', { origin: 'fork' })] } }],
  ['a cwd that is not a path', { ok: true, value: { items: [idle('s-1', { cwd: 3 })] } }],
] as const) {
  test(`a session/list answer that is ${name} throws SESSIONS_UNREADABLE, and nothing is archived`, async () => {
    const calls: string[] = [];
    const rpc: WorkspaceRpc = async (endpoint) => {
      calls.push(endpoint);
      return answer as Awaited<ReturnType<WorkspaceRpc>>;
    };
    await assert.rejects(settleSiteSessions('/site/demo', ['s-1'], rpc), (error: unknown) => {
      assert.ok(error instanceof SiteSessionsUnsettled);
      assert.equal(error.reason, 'SESSIONS_UNREADABLE');
      return true;
    });
    assert.deepEqual(calls, ['session/list']);
  });
}

test('K2: a folder dsh cannot resolve fails loud — the caller must know the sessions were not hidden', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint) => {
    calls.push(endpoint);
    return { ok: false, error: { code: 'workspace/invalid-path', message: 'no such directory' } };
  };
  await assert.rejects(forgetWorkspace('/site/demo', rpc), /workspace\/invalid-path/);
  assert.deepEqual(calls, ['workspace/create']);
});

test('K2: an archive dsh refuses stops before the registration is removed', async () => {
  const calls: string[] = [];
  const rpc: WorkspaceRpc = async (endpoint) => {
    calls.push(endpoint);
    if (endpoint === 'workspace/create') {
      return { ok: true, value: { workspace: { workspaceId: 'ws-site', sessionIds: ['s-1'] }, created: false } };
    }
    return { ok: false, error: { code: 'storage', message: 'disk full' } };
  };
  await assert.rejects(forgetWorkspace('/site/demo', rpc), /storage/);
  assert.deepEqual(calls, ['workspace/create', 'workspace/archiveSession']);
});

// One workspace, one site (15/09/2026): the site folder is registered and named after the site.
test('S9: a site folder becomes a workspace titled with the site key, renamed only while the title differs', async () => {
  const dsh = fakeDsh();
  const first = await ensureSiteWorkspace('/site/lantern', 'lantern.tracy.test', dsh.rpc);
  assert.deepEqual(first, { workspaceId: 'ws-/site/lantern', title: 'lantern.tracy.test', titled: true });
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create', 'workspace/rename']);
  assert.deepEqual(dsh.calls[1].args, { request: { workspaceId: 'ws-/site/lantern', title: 'lantern.tracy.test' } });
});

test('S9: a site workspace dsh already titled is not renamed again', async () => {
  const calls: Call[] = [];
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    calls.push({ endpoint, args });
    return { ok: true, value: { workspace: { workspaceId: 'ws-1', title: 'lantern.tracy.test' }, created: false } };
  };
  assert.deepEqual(await ensureSiteWorkspace('/site/lantern', 'lantern.tracy.test', rpc), { workspaceId: 'ws-1', title: 'lantern.tracy.test', titled: true });
  assert.deepEqual(calls.map((c) => c.endpoint), ['workspace/create']);
});

test('S9: a site folder dsh cannot register throws, and a refused title keeps the workspace', async () => {
  const refusing: WorkspaceRpc = async () => ({ ok: false, error: { code: 'workspace/invalid-path', message: 'no such folder' } });
  await assert.rejects(ensureSiteWorkspace('/site/missing', 'missing.tracy.test', refusing), /invalid-path/);
  const dsh = fakeDsh({ renameFails: true });
  assert.deepEqual(await ensureSiteWorkspace('/site/lantern', 'lantern.tracy.test', dsh.rpc), { workspaceId: 'ws-/site/lantern', title: 'lantern.tracy.test', titled: false });
});

test('S9: only a title another workspace holds is refused for good; every other rename failure may be asked again', async () => {
  const renaming = (failure: { code: string; message: string }): WorkspaceRpc => async (endpoint) => {
    if (endpoint === 'workspace/create') return { ok: true, value: { workspace: { workspaceId: 'ws-1', title: 'lantern' }, created: true } };
    return { ok: false, error: failure };
  };
  assert.deepEqual(
    await ensureSiteWorkspace('/site/lantern', 'lantern.tracy.test', renaming({ code: 'workspace/name-conflict', message: 'taken' })),
    { workspaceId: 'ws-1', title: 'lantern.tracy.test', titled: false, titleRefused: true },
  );
  for (const code of ['transport', 'envelope', 'budget', 'workspace/not-found']) {
    assert.deepEqual(
      await ensureSiteWorkspace('/site/lantern', 'lantern.tracy.test', renaming({ code, message: 'passing' })),
      { workspaceId: 'ws-1', title: 'lantern.tracy.test', titled: false },
      code,
    );
  }
  const registrar = createSiteWorkspaceRegistrar({ rpc: renaming({ code: 'workspace/name-conflict', message: 'taken' }), delaysMs: [1, 1, 1, 1], log: () => {}, warn: () => {} });
  assert.deepEqual(
    await registrar.register('/site/lantern', 'lantern.tracy.test', () => true),
    { status: 'registered', workspaceId: 'ws-1', title: 'lantern.tracy.test', titled: false, titleRefused: true, attempts: 1 },
  );
});

test('S9: a site workspace registered without a known site key is not renamed', async () => {
  const dsh = fakeDsh();
  assert.deepEqual(await ensureSiteWorkspace('/site/lantern', null, dsh.rpc), { workspaceId: 'ws-/site/lantern', title: null, titled: false });
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create']);
});

// ── TCH #557: the seat can arrive before its folder ──────────────────────────────────────────

const ENOENT = { code: 'workspace/invalid-path', message: "ENOENT: no such file or directory, realpath '/site/qcwp1715'" };

test('S9: only a missing folder counts as "not there yet"; every other refusal is final', () => {
  assert.equal(isMissingFolderRefusal(new SiteWorkspaceRefusal(ENOENT.code, ENOENT.message)), true);
  for (const [code, message] of [
    ['workspace/invalid-path', "EACCES: permission denied, realpath '/site/x'"],
    ['workspace/invalid-path', "ENOTDIR: not a directory, '/site/x'"],
    ['workspace/invalid-path', 'path escapes the allowed roots'],
    ['transport', 'ENOENT in a proxy message'],
    ['envelope', 'dsh answered outside the connection envelope'],
  ]) {
    assert.equal(isMissingFolderRefusal(new SiteWorkspaceRefusal(code, message)), false, `${code}: ${message}`);
  }
  assert.equal(isMissingFolderRefusal(new Error(ENOENT.message)), false, 'a bare error is not a dsh refusal');
});

test('S9: the errno is read from the cause dsh names, never from a path that happens to spell one', () => {
  // dsh's own wording (workspace-controller commands.ts): the folder is quoted, then Node's error.
  const worded = (folder: string, cause: string) => `cannot create a Workspace at "${folder}": ${cause}`;
  const missing = '/site/qcwp1715';
  assert.equal(isMissingFolderRefusal(new SiteWorkspaceRefusal('workspace/invalid-path', worded(missing, `ENOENT: no such file or directory, realpath '${missing}'`), missing)), true);
  for (const folder of ['/site/ENOENT-demo', '/site/a": ENOENT: b', '/site/x ENOENT']) {
    const refusal = new SiteWorkspaceRefusal('workspace/invalid-path', worded(folder, `EACCES: permission denied, realpath '${folder}'`), folder);
    assert.equal(isMissingFolderRefusal(refusal), false, folder);
  }
  assert.equal(isMissingFolderRefusal(new SiteWorkspaceRefusal('workspace/invalid-path', "EACCES: permission denied, realpath '/site/ENOENT'")), false);
  assert.equal(isMissingFolderRefusal(new SiteWorkspaceRefusal('workspace/invalid-path', 'something ENOENT: happened')), false, 'only the leading token counts');
});

test('S9: an answer without a usable workspace is not a success: empty id fails, a rename without its row is untitled', async () => {
  await assert.rejects(
    ensureSiteWorkspace('/site/x', 'x.tracy.test', async () => ({ ok: true, value: { workspace: { workspaceId: '' }, created: true } })),
    /without a workspace id/,
  );
  await assert.rejects(ensureSiteWorkspace('/site/x', 'x.tracy.test', async () => ({ ok: true, value: null })), /without a workspace id/);
  for (const value of [{}, null, { workspace: { workspaceId: 'ws-other', title: 'x.tracy.test' } }, { workspace: { workspaceId: 'ws-1' } }]) {
    const rpc: WorkspaceRpc = async (endpoint) => endpoint === 'workspace/create'
      ? { ok: true, value: { workspace: { workspaceId: 'ws-1', title: 'x' }, created: true } }
      : { ok: true, value };
    assert.deepEqual(await ensureSiteWorkspace('/site/x', 'x.tracy.test', rpc), { workspaceId: 'ws-1', title: 'x.tracy.test', titled: false }, JSON.stringify(value));
  }
});

test('S9: the retry plan is short and bounded: four waits, under the ten-second budget', () => {
  assert.deepEqual(SITE_WORKSPACE_RETRY_DELAYS_MS, [250, 500, 1000, 2000]);
  assert.ok(SITE_WORKSPACE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) < SITE_WORKSPACE_RETRY_BUDGET_MS);
});

/** A dsh whose folder appears after `refusals` ENOENT answers, or answers `fail` forever. */
function racingDsh(options: { refusals?: number; fail?: { code: string; message: string }; reject?: boolean; value?: unknown } = {}) {
  const calls: string[] = [];
  let left = options.refusals ?? 0;
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    calls.push(endpoint);
    if (options.reject) throw new Error('socket hang up');
    if (endpoint === 'workspace/rename') {
      const request = args.request as Record<string, unknown>;
      return { ok: true, value: { workspace: { workspaceId: request.workspaceId, title: request.title } } };
    }
    if (options.fail) return { ok: false, error: options.fail };
    if (left > 0) {
      left -= 1;
      return { ok: false, error: ENOENT };
    }
    const p = String((args.request as Record<string, unknown>).path);
    return { ok: true, value: options.value ?? { workspace: { workspaceId: `ws-${p}`, title: 'qcwp1715' }, created: true } };
  };
  return { rpc, calls };
}

const quiet = { log: () => {}, warn: () => {} };

// Registrar timers intentionally unref: a live gateway has a server keeping its loop alive.
// Give only these asynchronous fixtures that host lifetime; always release it when the test ends.
function registrarTest(name: string, run: () => Promise<void>) {
  test(name, async (t) => {
    const hostLifetime = setInterval(() => {}, 1000);
    t.after(() => clearInterval(hostLifetime));
    await run();
  });
}

registrarTest('a folder missing at the first attempt is registered once it appears, and titled', async () => {
  const dsh = racingDsh({ refusals: 2 });
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [5, 5, 5, 5], ...quiet });
  const outcome = await registrar.register('/site/qcwp1715', 'qcwp1715.tracy.test', () => true);
  assert.deepEqual(outcome, { status: 'registered', workspaceId: 'ws-/site/qcwp1715', title: 'qcwp1715.tracy.test', titled: true, attempts: 3 });
  assert.deepEqual(dsh.calls, ['workspace/create', 'workspace/create', 'workspace/create', 'workspace/rename']);
  assert.equal(registrar.inFlight(), 0);
});

registrarTest('a folder that never appears stops after five attempts, and says the next visit retries', async () => {
  const dsh = racingDsh({ refusals: Infinity });
  const warnings: string[] = [];
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [1, 1, 1, 1], log: () => {}, warn: (l) => warnings.push(l) });
  const outcome = await registrar.register('/site/never', null, () => true);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.attempts, 5);
  assert.equal(dsh.calls.length, 5);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /not registered: .*ENOENT.*next visit retries/);
  // Nothing is remembered: the next call (the next visit) starts a fresh chain.
  const again = await registrar.register('/site/never', null, () => true);
  assert.equal(again.attempts, 5);
});

registrarTest('the time budget ends a chain before its attempts run out', async () => {
  const dsh = racingDsh({ refusals: Infinity });
  let clock = 0;
  const registrar = createSiteWorkspaceRegistrar({
    rpc: async (endpoint, args) => {
      clock += 4_000; // a dsh that takes four seconds per answer
      return dsh.rpc(endpoint, args);
    },
    delaysMs: [1, 1, 1, 1], budgetMs: 10_000, now: () => clock, ...quiet,
  });
  const outcome = await registrar.register('/site/slow', null, () => true);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.attempts, 3, 'the fourth attempt would start past the budget');
});

registrarTest('every refusal that is not a missing folder is tried once and logged, never looped', async () => {
  const cases: Array<{ name: string; dsh: ReturnType<typeof racingDsh> }> = [
    { name: 'permission', dsh: racingDsh({ fail: { code: 'workspace/invalid-path', message: "EACCES: permission denied, realpath '/site/x'" } }) },
    { name: 'regular file', dsh: racingDsh({ fail: { code: 'workspace/invalid-path', message: "ENOTDIR: not a directory, '/site/x'" } }) },
    { name: 'transport', dsh: racingDsh({ fail: { code: 'transport', message: 'dsh answered HTTP 502 to workspace/create' } }) },
    { name: 'envelope', dsh: racingDsh({ fail: { code: 'envelope', message: 'Unexpected end of JSON input' } }) },
    { name: 'rejected request', dsh: racingDsh({ reject: true }) },
    { name: 'no workspace id', dsh: racingDsh({ value: { workspace: {}, created: true } }) },
  ];
  for (const { name, dsh } of cases) {
    const warnings: string[] = [];
    const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [1, 1, 1, 1], log: () => {}, warn: (l) => warnings.push(l) });
    const outcome = await registrar.register('/site/x', 'x.tracy.test', () => true);
    assert.equal(outcome.status, 'failed', name);
    assert.equal(dsh.calls.length, 1, `${name}: one attempt`);
    assert.equal(warnings.length, 1, `${name}: logged once`);
    assert.match(warnings[0], /\[dsh-passwords\] site workspace \/site\/x not registered: /, name);
  }
});

registrarTest('a refused title leaves the workspace registered, and is not a reason to retry', async () => {
  const dsh = fakeDsh({ renameFails: true });
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [1, 1, 1, 1], ...quiet });
  const outcome = await registrar.register('/site/lantern', 'lantern.tracy.test', () => true);
  assert.deepEqual(outcome, { status: 'registered', workspaceId: 'ws-/site/lantern', title: 'lantern.tracy.test', titled: false, attempts: 1 });
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create', 'workspace/rename']);
});

registrarTest('two callers for one folder share one chain, and the later site key is used', async () => {
  const dsh = racingDsh({ refusals: 1 });
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [20, 20, 20, 20], ...quiet });
  const first = registrar.register('/site/qcwp1715', null, () => true);
  const second = registrar.register('/site/qcwp1715', 'qcwp1715.tracy.test', () => true);
  assert.equal(first, second);
  assert.equal(registrar.inFlight(), 1);
  const outcome = await first;
  assert.equal(outcome.status, 'registered');
  assert.deepEqual(dsh.calls, ['workspace/create', 'workspace/create', 'workspace/rename']);
});

/** A dsh whose `workspace/create` answers only when released; renames answer at once. */
function heldDsh() {
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  let entered: () => void = () => {};
  const inCreate = new Promise<void>((resolve) => { entered = resolve; });
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    calls.push({ endpoint, args });
    const request = args.request as Record<string, unknown>;
    if (endpoint === 'workspace/create') {
      entered();
      await held;
      return { ok: true, value: { workspace: { workspaceId: 'ws-1', title: 'qcwp1715' }, created: true } };
    }
    return { ok: true, value: { workspace: { workspaceId: request.workspaceId, title: request.title } } };
  };
  return { rpc, calls, release, inCreate };
}

registrarTest('a site key that arrives while create is in flight is the title the workspace gets', async () => {
  const dsh = heldDsh();
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, ...quiet });
  const heal = registrar.register('/site/qcwp1715', null, () => true);
  await dsh.inCreate;
  const door = registrar.register('/site/qcwp1715', 'qcwp1715.tracy.test', () => true);
  assert.equal(heal, door);
  assert.equal(registrar.register('/site/qcwp1715', null, () => true), door, 'a later caller without a key keeps the chain');
  dsh.release();
  assert.deepEqual(await door, { status: 'registered', workspaceId: 'ws-1', title: 'qcwp1715.tracy.test', titled: true, attempts: 1 });
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create', 'workspace/rename']);
  assert.deepEqual(dsh.calls[1].args, { request: { workspaceId: 'ws-1', title: 'qcwp1715.tracy.test' } });
});

registrarTest('a grant that changes the site key while a rename is in flight: the old title\'s failure is not the new one\'s', async () => {
  // Every way a rename can fail — the one final refusal, a passing fault, an unusable answer —
  // is about the title that rename carried. The site key that arrived meanwhile is asked for.
  const failures: Array<{ name: string; answer: Awaited<ReturnType<WorkspaceRpc>> }> = [
    { name: 'name-conflict', answer: { ok: false, error: { code: 'workspace/name-conflict', message: 'taken' } } },
    { name: 'transport', answer: { ok: false, error: { code: 'transport', message: 'dsh answered HTTP 502 to workspace/rename' } } },
    { name: 'unusable answer', answer: { ok: true, value: {} } },
  ];
  for (const { name, answer } of failures) {
    const calls: Array<Record<string, unknown>> = [];
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    let entered: () => void = () => {};
    const inRename = new Promise<void>((resolve) => { entered = resolve; });
    const rpc: WorkspaceRpc = async (endpoint, args) => {
      const request = args.request as Record<string, unknown>;
      calls.push({ endpoint, ...request });
      if (endpoint === 'workspace/create') return { ok: true, value: { workspace: { workspaceId: 'ws-1', title: 'lantern' }, created: true } };
      if (request.title === 'old.tracy.test') {
        entered();
        await held;
        return answer;
      }
      return { ok: true, value: { workspace: { workspaceId: request.workspaceId, title: request.title } } };
    };
    const registrar = createSiteWorkspaceRegistrar({ rpc, ...quiet });
    const first = registrar.register('/site/lantern', 'old.tracy.test', () => true);
    await inRename;
    const regrant = registrar.register('/site/lantern', 'new.tracy.test', () => true);
    assert.equal(first, regrant, name);
    release();
    assert.deepEqual(await regrant, { status: 'registered', workspaceId: 'ws-1', title: 'new.tracy.test', titled: true, attempts: 1 }, name);
    assert.deepEqual(calls.map((c) => c.title ?? c.endpoint), ['workspace/create', 'old.tracy.test', 'new.tracy.test'], name);
  }
});

registrarTest('a seat revoked while create is in flight gets no title and no success', async () => {
  const dsh = heldDsh();
  let granted = true;
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, ...quiet });
  const pending = registrar.register('/site/revoked', 'revoked.tracy.test', () => granted);
  await dsh.inCreate;
  granted = false;
  dsh.release();
  assert.deepEqual(await pending, { status: 'cancelled', attempts: 1 });
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create'], 'no rename on behalf of someone who lost the site');
});

registrarTest('close() while create is in flight cancels at once; the late answer is ignored', async () => {
  const dsh = heldDsh();
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, ...quiet });
  const pending = registrar.register('/site/closing', 'closing.tracy.test', () => true);
  await dsh.inCreate;
  registrar.close();
  assert.deepEqual(await pending, { status: 'cancelled', attempts: 1 });
  dsh.release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create']);
});

registrarTest('an RPC still pending at the budget is abandoned: the chain fails, a late success is not reported', async () => {
  const dsh = heldDsh();
  const warnings: string[] = [];
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, budgetMs: 30, log: () => {}, warn: (l) => warnings.push(l) });
  const outcome = await registrar.register('/site/slow', 'slow.tracy.test', () => true);
  assert.equal(outcome.status, 'failed');
  assert.match(outcome.status === 'failed' ? outcome.reason : '', /budget/);
  assert.equal(registrar.inFlight(), 0);
  dsh.release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(dsh.calls.map((c) => c.endpoint), ['workspace/create'], 'no rename after the chain gave up');
  assert.equal(warnings.length, 1);
});

registrarTest('a seat that lost the folder ends the chain before the next attempt', async () => {
  const dsh = racingDsh({ refusals: Infinity });
  let granted = true;
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [20, 20, 20, 20], ...quiet });
  const pending = registrar.register('/site/revoked', null, () => granted);
  granted = false;
  const outcome = await pending;
  assert.equal(outcome.status, 'cancelled');
  assert.equal(dsh.calls.length, 1);
});

registrarTest('close() clears a waiting chain at once; later calls do nothing', async () => {
  const dsh = racingDsh({ refusals: Infinity });
  const registrar = createSiteWorkspaceRegistrar({ rpc: dsh.rpc, delaysMs: [60_000], budgetMs: 120_000, ...quiet });
  const pending = registrar.register('/site/closing', null, () => true);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const started = Date.now();
  registrar.close();
  const outcome = await pending;
  assert.equal(outcome.status, 'cancelled');
  assert.ok(Date.now() - started < 1000, 'the 60 s timer did not have to run out');
  assert.equal(dsh.calls.length, 1);
  assert.deepEqual(await registrar.register('/site/closing', null, () => true), { status: 'cancelled', attempts: 0 });
  assert.equal(dsh.calls.length, 1);
});
