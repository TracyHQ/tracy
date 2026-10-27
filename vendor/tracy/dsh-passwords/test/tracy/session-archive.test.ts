// session-archive.ts on a scratch dsh home: which folder a label maps to, and every refusal that
// keeps one site's archive step away from another site's history.
//
// Fixtures are written the way dsh stores a session (`session-persistence-jsonl` README, "Physical
// encoding"): one zstd frame for the header line, then one frame per append batch. One body is
// random bytes, so it does not compress and the 64 KB header read stops in the middle of a frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { zstdCompressSync } from 'node:zlib';
import {
  ARCHIVE_DIR,
  archiveSiteSessions,
  archiveStamp,
  inspectSiteSessions,
  readHeaderLine,
  siteSessionFolderName,
  siteWorkspacePath,
} from '../../src/tracy/session-archive.js';
import { settleSiteSessions as settleSiteSessionsOf, SiteSessionsUnsettled, type WorkspaceRpc } from '../../src/tracy/seat-home.js';
import { strictDshRpc } from './dsh-rpc-fake.js';
import { EventEmitter } from 'node:events';
import http, { type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  FenceLedger,
  FenceNotDrained,
  FenceUnknownOutcome,
  touchesArchivedSite,
  WriteFence,
  type FenceScope,
  type Ticket,
} from '../../src/tracy/write-fence.js';

// `touchesArchivedSite` reads session references through the gate's reader, which moves to
// `src/tracy/session-refs.ts` in another phase 1 module. Until that file is on this branch the two
// cases that need it are skipped; they run as soon as it is.
const sessionRefs = await import('../../src/tracy/session-refs.js' as string)
  .then((m: { collectSessionRefs: (body: unknown) => Set<string>; UNREADABLE_SESSION_REF: string }) => ({
    collect: m.collectSessionRefs,
    unreadable: m.UNREADABLE_SESSION_REF,
  }))
  .catch(() => null);
const SKIP_REFS = sessionRefs === null ? 'waiting for session-refs.ts (phase 1, agent A): collectSessionRefs, UNREADABLE_SESSION_REF' : false;

// #591: every fake of dsh below sits behind dsh's own argument check (dsh-rpc-fake.ts), so a call
// the real gateway refuses as `gateway/arguments-invalid` is refused here too, never answered.
const settleSiteSessions: typeof settleSiteSessionsOf = (cwd, sessionIds, rpc, seen) =>
  settleSiteSessionsOf(cwd, sessionIds, strictDshRpc(rpc), seen);

const NOW = Date.UTC(2026, 8, 28, 10, 15, 30);

interface Tree {
  home: string;
  sites: string;
  cleanup: () => void;
}

function tree(): Tree {
  const base = mkdtempSync(path.join(os.tmpdir(), 'dshpw-session-archive-'));
  const home = path.join(base, 'desk-home');
  const sites = path.join(base, 'site');
  mkdirSync(path.join(home, 'sessions'), { recursive: true });
  mkdirSync(sites, { recursive: true });
  return { home, sites, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

/** One session directory as dsh writes it. `cwd` is what the header says, `folder` where it sits. */
function session(t: Tree, folder: string, id: string, cwd: string, version = 4, big = false): string {
  const dir = path.join(t.home, 'sessions', folder, id);
  mkdirSync(dir, { recursive: true });
  const header = `${JSON.stringify({ type: 'session', version, id, createdAt: 1, cwd, isSeeded: false, delegationDepth: 0 })}\n`;
  const body = `${JSON.stringify({ type: 'message', text: big ? randomBytes(96 * 1024).toString('base64') : 'hi' })}\n`;
  writeFileSync(
    path.join(dir, `session.v${String(version)}.jsonl.zstd`),
    Buffer.concat([zstdCompressSync(Buffer.from(header)), zstdCompressSync(Buffer.from(body))]),
  );
  writeFileSync(path.join(dir, 'session.lock'), '');
  return dir;
}

function lease(t: Tree, sessionId: string, ageMs: number): void {
  const dir = path.join(t.home, 'leases');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `chat-${sessionId}.json`);
  writeFileSync(file, JSON.stringify({ id: `chat-${sessionId}`, kind: 'chat', sessionId, heartbeatAt: new Date(NOW - ageMs).toISOString() }));
  const at = (NOW - ageMs) / 1000;
  utimesSync(file, at, at);
}

test('K3: a label maps to exactly one dsh folder, and the archive name sorts by time', () => {
  assert.equal(siteWorkspacePath('wp-07vce0'), '/site/wp-07vce0');
  assert.equal(siteSessionFolderName('wp-07vce0'), '--site-wp-07vce0--');
  assert.equal(archiveStamp(NOW), '20260928T101530Z');
});

test('K3: the header is read from the first frame even when the read stops inside a later one', async () => {
  const t = tree();
  try {
    const dir = session(t, '--site-gone--', 'session-1', '/site/gone', 4, true);
    const line = await readHeaderLine(path.join(dir, 'session.v4.jsonl.zstd'));
    assert.equal(JSON.parse(line ?? '{}').cwd, '/site/gone');
  } finally {
    t.cleanup();
  }
});

test('K3: a deleted site’s folder moves whole into the archive, byte for byte, and only that folder', async () => {
  const t = tree();
  try {
    const one = session(t, '--site-gone--', 'session-1', '/site/gone', 3);
    session(t, '--site-gone--', 'session-1', '/site/gone', 4, true); // v4 written beside v3, as 0.1.7 does
    session(t, '--site-gone--', 'session-2', '/site/gone');
    session(t, '--site-gone-2--', 'session-3', '/site/gone-2'); // a neighbour whose label starts the same
    session(t, '--site-live--', 'session-4', '/site/live');
    mkdirSync(path.join(t.sites, 'live'));
    const before = readFileSync(path.join(one, 'session.v3.jsonl.zstd'));

    const result = await archiveSiteSessions({ dshHome: t.home, sitesRoot: t.sites, label: 'gone', now: NOW });
    assert.deepEqual(result, { ok: true, archivedTo: 'gone-20260928T101530Z', sessions: 2 });
    assert.deepEqual(readdirSync(path.join(t.home, 'sessions')).sort(), ['--site-gone-2--', '--site-live--']);
    const moved = path.join(t.home, ARCHIVE_DIR, 'gone-20260928T101530Z');
    assert.deepEqual(readdirSync(moved).sort(), ['session-1', 'session-2']);
    assert.deepEqual(readFileSync(path.join(moved, 'session-1', 'session.v3.jsonl.zstd')), before);

    // Idempotent: the second call finds nothing to move and moves nothing.
    const again = await archiveSiteSessions({ dshHome: t.home, sitesRoot: t.sites, label: 'gone', now: NOW });
    assert.equal(again.ok, false);
    assert.equal(!again.ok && again.reason, 'NO_SESSION_FOLDER');
    assert.deepEqual(readdirSync(path.join(t.home, ARCHIVE_DIR)), ['gone-20260928T101530Z']);
  } finally {
    t.cleanup();
  }
});

test('K3: an archive entry of the same name is never overwritten', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    mkdirSync(path.join(t.home, ARCHIVE_DIR, 'gone-20260928T101530Z'), { recursive: true });
    writeFileSync(path.join(t.home, ARCHIVE_DIR, 'gone-20260928T101530Z', 'keep'), 'earlier');
    const result = await archiveSiteSessions({ dshHome: t.home, sitesRoot: t.sites, label: 'gone', now: NOW });
    assert.deepEqual(result, { ok: true, archivedTo: 'gone-20260928T101530Z-1', sessions: 1 });
    assert.equal(readFileSync(path.join(t.home, ARCHIVE_DIR, 'gone-20260928T101530Z', 'keep'), 'utf8'), 'earlier');
  } finally {
    t.cleanup();
  }
});

test('K3: each refusal leaves the folder where it is and names its reason', async (s) => {
  const cases: Array<{ name: string; reason: string; build: (t: Tree) => { label: string; sitesRoot?: string; dshHome?: string } }> = [
    {
      name: 'the site folder still exists (teardown not finished)',
      reason: 'SITE_STILL_EXISTS',
      build: (t) => {
        session(t, '--site-live--', 'session-1', '/site/live');
        mkdirSync(path.join(t.sites, 'live'));
        return { label: 'live' };
      },
    },
    {
      name: 'the site mount is missing, so every site would look deleted',
      reason: 'SITE_MOUNT_MISSING',
      build: (t) => {
        session(t, '--site-gone--', 'session-1', '/site/gone');
        return { label: 'gone', sitesRoot: path.join(t.sites, 'not-mounted') };
      },
    },
    {
      name: 'the session store is missing',
      reason: 'STORE_MISSING',
      build: (t) => ({ label: 'gone', dshHome: path.join(t.home, 'elsewhere') }),
    },
    {
      name: 'the site never had a conversation',
      reason: 'NO_SESSION_FOLDER',
      build: () => ({ label: 'quiet' }),
    },
    {
      name: 'a header names another folder that maps to the same name (/site/a/b vs /site/a-b)',
      reason: 'AMBIGUOUS_FOLDER',
      build: (t) => {
        session(t, '--site-a-b--', 'session-1', '/site/a-b');
        session(t, '--site-a-b--', 'session-2', '/site/a/b');
        return { label: 'a-b' };
      },
    },
    {
      name: 'a header cannot be read',
      reason: 'AMBIGUOUS_FOLDER',
      build: (t) => {
        const dir = session(t, '--site-gone--', 'session-1', '/site/gone');
        writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), 'not zstd at all');
        return { label: 'gone' };
      },
    },
    {
      name: 'the folder is a symlink, not the store’s own directory',
      reason: 'AMBIGUOUS_FOLDER',
      build: (t) => {
        session(t, '--site-other--', 'session-1', '/site/other');
        symlinkSync(path.join(t.home, 'sessions', '--site-other--'), path.join(t.home, 'sessions', '--site-gone--'));
        return { label: 'gone' };
      },
    },
    {
      name: 'a fresh lease still holds one of its sessions',
      reason: 'SESSION_ACTIVE',
      build: (t) => {
        session(t, '--site-gone--', 'session-1', '/site/gone');
        lease(t, 'session-1', 20_000);
        return { label: 'gone' };
      },
    },
    {
      // 🔒 28/09/2026: the loop that checks whose session a folder is only runs over its GENERATION
      // files, so a session dsh is creating right now — directory made, header not yet written —
      // passed the whole inspection unseen and travelled with the `rename`. The folder name loses
      // information (`/site/a/b` and `/site/a-b` are both `--site-a-b--`), so the folder being
      // archived can hold a live site's conversations, and dsh then answered ENOENT for a session it
      // had just opened.
      name: 'a session directory with no generation file yet (dsh is creating one)',
      reason: 'AMBIGUOUS_FOLDER',
      build: (t) => {
        session(t, '--site-gone--', 'session-1', '/site/gone');
        mkdirSync(path.join(t.home, 'sessions', '--site-gone--', 'session-being-made'), { recursive: true });
        return { label: 'gone' };
      },
    },
    {
      // 🔒 28/09/2026: every `readdir` error used to read as "no lease", and an unreadable lease folder
      // is not an empty one — a session a Tracy lease was still writing to could then be archived.
      name: 'the lease folder cannot be read at all',
      reason: 'LEASES_UNREADABLE',
      build: (t) => {
        session(t, '--site-gone--', 'session-1', '/site/gone');
        // A FILE where the leases directory belongs: `readdir` answers ENOTDIR, not ENOENT.
        writeFileSync(path.join(t.home, 'leases'), 'not a directory');
        return { label: 'gone' };
      },
    },
  ];
  for (const c of cases) {
    await s.test(c.name, async () => {
      const t = tree();
      try {
        const given = c.build(t);
        const listing = () => readdirSync(path.join(t.home, 'sessions')).sort();
        const before = listing();
        const result = await archiveSiteSessions({
          dshHome: given.dshHome ?? t.home,
          sitesRoot: given.sitesRoot ?? t.sites,
          label: given.label,
          now: NOW,
        });
        assert.equal(result.ok, false);
        assert.equal(!result.ok && result.reason, c.reason, !result.ok ? result.detail : '');
        assert.deepEqual(listing(), before);
        assert.equal(existsSync(path.join(t.home, ARCHIVE_DIR)), false, 'nothing was moved anywhere');
      } finally {
        t.cleanup();
      }
    });
  }
});

test('K3: a lease past its two minutes is a process that died, and does not hold the folder', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    lease(t, 'session-1', 5 * 60_000);
    lease(t, 'session-of-another-site', 1_000);
    const result = await inspectSiteSessions({ dshHome: t.home, sitesRoot: t.sites, label: 'gone', now: NOW });
    assert.equal(result.ok, true);
  } finally {
    t.cleanup();
  }
});

test('K3: anything that is not one label is refused before the disk is read', async () => {
  const t = tree();
  try {
    for (const label of ['', '..', '../gone', 'a/b', '.hidden', '-x', 'x'.repeat(101), 'gone\n']) {
      const result = await inspectSiteSessions({ dshHome: t.home, sitesRoot: t.sites, label, now: NOW });
      assert.equal(!result.ok && result.reason, 'INVALID_LABEL', JSON.stringify(label));
    }
  } finally {
    t.cleanup();
  }
});

// ── #561: the site's sessions are settled last, over the sessions found on disk ─────────────────
//
// A turn waiting on its customer's answer holds no lease, so the lease rule alone would move the
// folder under it. The review of #561: the forget door read the folder's sessions while the site was
// still alive, so a session opened after that read was never stopped. `settle` receives the ids read
// from disk at the move; `settleSiteSessions` also takes any session at the path, archives and
// stops each, and lists again.

/**
 * A dsh whose `session/list` answers `lists[n]` on its n-th call (the last one after that), and
 * accepts every archive and stop.
 */
function dshListing(...lists: unknown[][]): { rpc: WorkspaceRpc; calls: string[] } {
  const calls: string[] = [];
  let n = 0;
  const rpc: WorkspaceRpc = async (endpoint, args) => {
    const id = (args.request as { sessionId?: string } | undefined)?.sessionId ?? String(args.childSessionId);
    calls.push(endpoint === 'session/list' ? endpoint : `${endpoint} ${id}`);
    if (endpoint !== 'session/list') return { ok: true, value: {} };
    const items = lists[Math.min(n, lists.length - 1)];
    n += 1;
    return { ok: true, value: { items } };
  };
  return { rpc, calls };
}

test('K3: settle is asked over the sessions on disk, and nothing pending moves the folder', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    session(t, '--site-gone--', 'session-late', '/site/gone'); // opened after any earlier forget read
    const asked: string[][] = [];
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: async (ids) => {
        asked.push([...ids].sort());
        return [];
      },
    });
    assert.deepEqual(asked, [['session-1', 'session-late']]);
    assert.equal(result.ok, true);
  } finally {
    t.cleanup();
  }
});

test('K3: a turn still running after its stop keeps the folder where it is, as SESSION_ACTIVE', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    session(t, '--site-gone--', 'session-late', '/site/gone');
    // The late session waits on its customer, and is still winding down when dsh is asked again.
    const rows = [
      { sessionId: 'session-1', running: false, cwd: '/site/gone' },
      { sessionId: 'session-late', running: true, cwd: '/site/gone' },
    ];
    const { rpc, calls } = dshListing(rows);
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
    });
    assert.equal(!result.ok && result.reason, 'SESSION_ACTIVE');
    assert.match(!result.ok ? result.detail : '', /session-late/);
    assert.ok(calls.includes('session/cancel session-late'));
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-late')));
    assert.ok(!existsSync(path.join(t.home, ARCHIVE_DIR)));
  } finally {
    t.cleanup();
  }
});

test('K3: a late turn the settle stopped, once dsh lists it idle, lets the folder move', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    session(t, '--site-gone--', 'session-late', '/site/gone');
    const { rpc, calls } = dshListing(
      [
        { sessionId: 'session-1', running: false, cwd: '/site/gone' },
        { sessionId: 'session-late', running: true, cwd: '/site/gone' },
      ],
      [
        { sessionId: 'session-1', running: false, cwd: '/site/gone' },
        { sessionId: 'session-late', running: false, cwd: '/site/gone' },
      ],
    );
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, [
      'session/list',
      'workspace/archiveSession session-1',
      'workspace/archiveSession session-late',
      'session/cancel session-late',
      'session/list',
    ]);
  } finally {
    t.cleanup();
  }
});

// The review of #561: a list read before the move proves nothing about activity that starts after
// it. What starts after the first list is either on a session this settle archived (dsh's
// ArchivedSessionGate runs no model step for it) and shows as running in the second list, or on a
// session it never archived and shows as new there: both keep the folder.
for (const [name, second] of [
  ['a turn that started on a session of the site after the first list', [{ sessionId: 'session-1', running: true, cwd: '/site/gone' }]],
  [
    'a session opened at the site after the first list, even idle',
    [
      { sessionId: 'session-1', running: false, cwd: '/site/gone' },
      { sessionId: 'session-new', running: false, cwd: '/site/gone' },
    ],
  ],
] as const) {
  test(`${name} keeps the folder where it is, as SESSION_ACTIVE`, async () => {
    const t = tree();
    try {
      session(t, '--site-gone--', 'session-1', '/site/gone');
      const { rpc } = dshListing([{ sessionId: 'session-1', running: false, cwd: '/site/gone' }], [...second]);
      const result = await archiveSiteSessions({
        dshHome: t.home,
        sitesRoot: t.sites,
        label: 'gone',
        now: NOW,
        settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
      });
      assert.equal(!result.ok && result.reason, 'SESSION_ACTIVE');
      assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
      assert.ok(!existsSync(path.join(t.home, ARCHIVE_DIR)));
    } finally {
      t.cleanup();
    }
  });
}

test('K3: a dsh that cannot say what runs keeps the folder where it is, as SESSIONS_UNREADABLE', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const rpc: WorkspaceRpc = async () => ({ ok: false, error: { code: 'transport', message: 'down' } });
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
    });
    assert.equal(!result.ok && result.reason, 'SESSIONS_UNREADABLE');
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
  } finally {
    t.cleanup();
  }
});

test('K3: a stop dsh refuses keeps the folder where it is, as SESSIONS_NOT_STOPPED', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const rpc: WorkspaceRpc = async (endpoint) =>
      endpoint === 'session/list'
        ? { ok: true, value: { items: [{ sessionId: 'session-1', running: true, cwd: '/site/gone' }] } }
        : endpoint === 'session/cancel'
          ? { ok: false, error: { code: 'transport', message: 'down' } }
          : { ok: true, value: {} };
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
    });
    assert.equal(!result.ok && result.reason, 'SESSIONS_NOT_STOPPED');
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
  } finally {
    t.cleanup();
  }
});

test('K3: only a thrown SESSIONS_NOT_STOPPED is that refusal; any other throw is SESSIONS_UNREADABLE', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const settle = (error: unknown) => async () => {
      throw error;
    };
    const unsettled = new SiteSessionsUnsettled('SESSIONS_NOT_STOPPED', 'refused');
    const base = { dshHome: t.home, sitesRoot: t.sites, label: 'gone', now: NOW };
    const refused = await archiveSiteSessions({ ...base, settle: settle(unsettled) });
    assert.equal(!refused.ok && refused.reason, 'SESSIONS_NOT_STOPPED');
    const other = await archiveSiteSessions({ ...base, settle: settle(new Error('boom')) });
    assert.equal(!other.ok && other.reason, 'SESSIONS_UNREADABLE');
    const odd = await archiveSiteSessions({ ...base, settle: settle({ reason: 'SESSION_ACTIVE' }) });
    assert.equal(!odd.ok && odd.reason, 'SESSIONS_UNREADABLE');
  } finally {
    t.cleanup();
  }
});

test('K3: a refusal on disk is answered before dsh is asked', async () => {
  const t = tree();
  try {
    session(t, '--site-live--', 'session-1', '/site/live');
    mkdirSync(path.join(t.sites, 'live'));
    let asked = false;
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'live',
      now: NOW,
      settle: async () => {
        asked = true;
        return [];
      },
    });
    assert.equal(!result.ok && result.reason, 'SITE_STILL_EXISTS');
    assert.equal(asked, false);
  } finally {
    t.cleanup();
  }
});

// ── #561: the last check and the rename run under the gateway's write fence ────────────────────
//
// The review of #561: after the last `session/list`, `session/create` at the site's path or
// `session/prompt` into one of its sessions could still reach dsh before the rename — from a guest
// or bot seat the delete could not revoke, or from the master — and `ArchivedSessionGate` stops
// model steps only. The gateway holds every such request while the folder is checked and moved,
// refuses a held one that reaches into the site, and waits for every earlier one to END AT dsh, not
// merely for its client to leave (write-fence.ts); these pin the fence and the archive's use of it.

/** A stand-in for the proxy's upstream request: only its `finish`, `response` and `close` events are read. */
function upstreamRequest(): ClientRequest & EventEmitter {
  return new EventEmitter() as unknown as ClientRequest & EventEmitter;
}

/** The request's connection to dsh opened: from here a byte of it may have reached dsh. */
function opened(request: ClientRequest & EventEmitter): void {
  request.emit('socket', { connecting: false });
}

const scopeOf = (label: string, ...ids: string[]): FenceScope => ({ path: `/site/${label}`, sessionIds: new Set(ids) });

test('K1: the write fence holds requests while it is up, and they come on carrying the scope they waited behind', async () => {
  const fence = new WriteFence();
  const scope = scopeOf('gone', 'session-1');
  const order: string[] = [];
  let held: Ticket | undefined;
  const done = fence.run(1_000, scope, async () => {
    order.push('work start');
    void fence.admit().then((ticket) => {
      order.push('held request admitted');
      held = ticket;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    order.push('work end');
    return 'moved';
  });
  assert.equal(await done, 'moved');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ['work start', 'work end', 'held request admitted']);
  assert.deepEqual(held?.heldBy, [scope]);
  assert.equal(fence.raised, false);
  assert.equal(fence.inFlight, 1);
  held?.done();
  held?.done(); // a second end is a no-op, not a negative count
  assert.equal(fence.inFlight, 0);
  const free = await fence.admit(); // the fence is down: nothing to carry
  assert.deepEqual(free.heldBy, []);
  free.done();
});

test('K1: the work waits for requests admitted before the fence, and never runs while one is unanswered', async () => {
  const fence = new WriteFence();
  const early = await fence.admit();
  const order: string[] = [];
  const done = fence.run(1_000, scopeOf('gone'), async () => {
    order.push('work');
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  order.push('early answered');
  early.done();
  await done;
  assert.deepEqual(order, ['early answered', 'work']);

  // One that is never answered within the wait: the work does not run, the fence comes down.
  const stuck = await fence.admit();
  let ran = false;
  await assert.rejects(
    fence.run(30, scopeOf('gone'), async () => {
      ran = true;
    }),
    (error: unknown) => error instanceof FenceNotDrained && error.inFlight === 1,
  );
  assert.equal(ran, false);
  assert.equal(fence.raised, false);
  const next = await fence.admit();
  next.done();
  stuck.done();
});

// Review of #561: a client that leaves does not end its request at dsh — dsh runs a command it has
// received to its end whoever waits (`invokePrepared` awaits the method). The request counts until
// dsh answers it, or its connection to dsh closes.
test('K1: a request whose client left still counts until dsh answers it, and the work waits for that', async () => {
  const fence = new WriteFence();
  const ticket = await fence.admit();
  const toDsh = upstreamRequest();
  ticket.upstream(toDsh);
  ticket.done(); // the client is gone; dsh is still creating the session
  assert.equal(fence.inFlight, 1);
  let ran = false;
  await assert.rejects(
    fence.run(30, scopeOf('gone'), async () => {
      ran = true;
    }),
    (error: unknown) => error instanceof FenceNotDrained && error.inFlight === 1,
  );
  assert.equal(ran, false, 'the last check does not run while dsh may still be writing');

  const order: string[] = [];
  const done = fence.run(1_000, scopeOf('gone'), async () => {
    order.push('work');
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  order.push('dsh answered');
  toDsh.emit('response', {});
  toDsh.emit('close'); // the close after the answer counts nothing twice
  await done;
  assert.deepEqual(order, ['dsh answered', 'work']);
  assert.equal(fence.inFlight, 0);

  // A request the gateway cut off because its client never delivered the whole body never ran: it
  // ends at its close, whatever reached the socket.
  const cut = await fence.admit();
  const cutReq = upstreamRequest();
  let cutShort = false;
  cut.upstream(cutReq, () => cutShort);
  opened(cutReq);
  cut.done();
  assert.equal(fence.inFlight, 1);
  cutShort = true;
  cutReq.emit('close');
  assert.equal(fence.inFlight, 0);
  assert.equal(fence.unknown, 0, 'a body dsh never had whole is not in doubt');

  // Answered at dsh but still open here (a response streaming to its client): counted until both.
  const open = await fence.admit();
  const openReq = upstreamRequest();
  open.upstream(openReq);
  openReq.emit('response', {});
  assert.equal(fence.inFlight, 1);
  open.done();
  assert.equal(fence.inFlight, 0);
});

// Review of #561: a connection to dsh that closes AFTER the whole body went out, with no answer (a
// reset, dsh dying), used to count as the request's end, so the last check and the rename could run
// while dsh still wrote. Nothing can show such a request ended: it is an unknown outcome, and from
// then on no fence runs its work; the folder stays.
test('K1: a request sent whole to dsh that closes without an answer is an unknown outcome, and no work runs past it', async () => {
  const fence = new WriteFence();
  const sent = await fence.admit();
  const toDsh = upstreamRequest();
  sent.upstream(toDsh);
  opened(toDsh);
  toDsh.emit('finish'); // the whole body went out
  toDsh.emit('close'); // reset before dsh answered
  toDsh.emit('response', {}); // nothing after the close counts twice
  sent.done();
  assert.equal(fence.inFlight, 0);
  assert.equal(fence.unknown, 1);
  let ran = false;
  const refused = fence.run(1_000, scopeOf('gone'), async () => {
    ran = true;
  });
  // Nothing is held for a move that cannot happen: another site's write goes straight on.
  assert.equal(fence.raised, false);
  const other = await fence.admit();
  assert.deepEqual(other.heldBy, []);
  other.done();
  await assert.rejects(refused, (error: unknown) => error instanceof FenceUnknownOutcome && error.unknown === 1);
  // No later wait clears it.
  await assert.rejects(
    fence.run(1_000, scopeOf('gone'), async () => {
      ran = true;
    }),
    FenceUnknownOutcome,
  );
  assert.equal(ran, false);
});

test('K1: a request that closes unanswered DURING the wait keeps the work from running, though nothing is left in flight', async () => {
  const fence = new WriteFence();
  const sent = await fence.admit();
  const toDsh = upstreamRequest();
  sent.upstream(toDsh);
  sent.done();
  let ran = false;
  const refused = fence.run(1_000, scopeOf('gone'), async () => {
    ran = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fence.raised, true);
  opened(toDsh);
  toDsh.emit('finish');
  toDsh.emit('close');
  await assert.rejects(refused, FenceUnknownOutcome);
  assert.equal(ran, false);
  assert.equal(fence.raised, false);
  assert.equal(fence.inFlight, 0);

  // The siblings still end cleanly: answered after the body went out, and answered before it did.
  const clean = new WriteFence();
  for (const events of [['finish', 'response', 'close'], ['response', 'finish', 'close']] as const) {
    const ticket = await clean.admit();
    const req = upstreamRequest();
    ticket.upstream(req);
    for (const event of events) req.emit(event, {});
    ticket.done();
  }
  assert.equal(clean.unknown, 0);
  assert.equal(await clean.run(100, scopeOf('gone'), async () => 'moved'), 'moved');
});

// Review of #561: `finish` not yet seen does not mean dsh lacks the body — it may have had it whole
// before the connection reset. A close with no answer ends a request only when nothing of it can have
// reached dsh: its socket never opened, its headers were never handed over, or the gateway cut it
// off because its own client never delivered the whole body.
test('K1: a close with no answer is an unknown outcome, finish or not, unless nothing whole can have reached dsh', async () => {
  const cases: { name: string; drive: (request: ClientRequest & EventEmitter) => void; cutShort?: boolean; unknown: number }[] = [
    { name: 'reset before finish, socket open', drive: (r) => opened(r), unknown: 1 },
    { name: 'reset after finish, socket open', drive: (r) => { opened(r); r.emit('finish'); }, unknown: 1 },
    {
      name: 'socket that connected after it was handed over',
      drive: (r) => {
        const socket = new EventEmitter() as EventEmitter & { connecting: boolean };
        socket.connecting = true;
        r.emit('socket', socket);
        socket.connecting = false;
        socket.emit('connect');
      },
      unknown: 1,
    },
    {
      name: 'socket that never connected',
      drive: (r) => {
        const socket = new EventEmitter() as EventEmitter & { connecting: boolean };
        socket.connecting = true;
        r.emit('socket', socket);
      },
      unknown: 0,
    },
    { name: 'no socket at all', drive: () => undefined, unknown: 0 },
    {
      name: 'socket open, headers never handed over',
      drive: (r) => {
        opened(r);
        (r as unknown as { headersSent: boolean }).headersSent = false;
      },
      unknown: 0,
    },
    { name: 'cut short by the gateway, its client never sent the whole body', drive: (r) => opened(r), cutShort: true, unknown: 0 },
  ];
  for (const { name, drive, cutShort, unknown } of cases) {
    const fence = new WriteFence();
    const ticket = await fence.admit();
    const request = upstreamRequest();
    ticket.upstream(request, () => cutShort === true);
    drive(request);
    request.emit('close');
    ticket.done();
    assert.equal(fence.inFlight, 0, name);
    assert.equal(fence.unknown, unknown, name);
  }
});

/** A dsh stand-in: `onBody` runs once a request's whole body has arrived. */
async function fakeDsh(onBody: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => onBody(req, res));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Send `body` to dsh as the proxy does for a held write: a connection of its own. */
function sendWrite(port: number, body: string): ClientRequest {
  const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/session/create', agent: false, headers: { 'content-type': 'application/json' } });
  request.on('error', () => undefined);
  request.end(body);
  return request;
}

const closed = (request: ClientRequest): Promise<void> => new Promise((resolve) => request.once('close', () => resolve()));

test('K1: over a real socket: dsh holding the whole body when the connection resets is unknown; a refused connection is not', async () => {
  const dsh = await fakeDsh((req) => req.socket.destroy()); // had it whole, then the connection reset
  try {
    const fence = new WriteFence();
    const ticket = await fence.admit();
    const request = sendWrite(dsh.port, '{"cwd":"/site/gone"}');
    ticket.upstream(request);
    ticket.done();
    await closed(request);
    assert.equal(fence.inFlight, 0);
    assert.equal(fence.unknown, 1, 'dsh had the body whole; whether it ran it is unknown');
    await assert.rejects(fence.run(100, scopeOf('gone'), async () => 'moved'), FenceUnknownOutcome);
  } finally {
    await dsh.close();
  }

  const gone = await fakeDsh(() => undefined);
  const port = gone.port;
  await gone.close(); // nothing listens: the connection is refused before a byte leaves
  const fence = new WriteFence();
  const ticket = await fence.admit();
  const request = sendWrite(port, '{"cwd":"/site/gone"}');
  ticket.upstream(request);
  ticket.done();
  await closed(request);
  assert.equal(fence.unknown, 0);
  assert.equal(await fence.run(100, scopeOf('gone'), async () => 'moved'), 'moved');
});

// Review of #561: the doubt used to live in memory only. A gateway restarted while dsh still ran a
// request it had sent would start at zero and move the folder under that request. Each gateway
// process now keeps a marker; the next one refuses every move while a marker may belong to a dsh
// that is still running.
test('K1: a gateway restarted while dsh still runs its request keeps the folder in place until that dsh is gone', async () => {
  const t = tree();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-fence-'));
  let held: http.ServerResponse | undefined;
  const dsh = await fakeDsh((_req, res) => {
    held = res; // dsh took the create and is still running it
  });
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const alive = new Set([4242]);
    const isAlive = (pid: number): boolean => alive.has(pid);
    const first = new WriteFence(new FenceLedger(dir, { boot: 'boot-1', pid: 4242 }, isAlive));
    const ticket = await first.admit();
    const request = sendWrite(dsh.port, '{"cwd":"/site/gone"}');
    ticket.upstream(request);
    ticket.done();
    await new Promise<void>((resolve) => {
      const wait = (): void => {
        if (held !== undefined) resolve();
        else setTimeout(wait, 5);
      };
      wait();
    });
    // The first gateway dies here: no release, nothing in memory survives. dsh (4242) runs on.

    const { rpc } = dshListing([{ sessionId: 'session-1', running: false, cwd: '/site/gone' }]);
    const archive = (fence: WriteFence) =>
      archiveSiteSessions({
        dshHome: t.home,
        sitesRoot: t.sites,
        label: 'gone',
        now: NOW,
        settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
        fence: (work) => fence.run(1_000, scopeOf('gone'), work),
      });

    const restarted = new WriteFence(new FenceLedger(dir, { boot: 'boot-1', pid: 4242 }, isAlive));
    assert.equal(restarted.inFlight, 0);
    await assert.rejects(
      restarted.run(1_000, scopeOf('gone'), async () => 'moved'),
      (error: unknown) => error instanceof FenceUnknownOutcome && error.earlier === 1 && error.unknown === 0,
    );
    const kept = await archive(restarted);
    assert.equal(!kept.ok && kept.reason, 'SESSION_ACTIVE');
    assert.match(!kept.ok ? kept.detail : '', /earlier gateway/);
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));

    // Another boot whose old dsh PID is still someone's: not shown gone.
    const unsure = new FenceLedger(dir, { boot: 'boot-2', pid: 5151 }, isAlive);
    assert.equal(unsure.earlierInDoubt(), 2, 'the dead gateway, and the restarted one still running');
    unsure.settledWhen(() => true);
    unsure.release();

    // dsh 4242 exits, and with it every command it ran; the next dsh boot moves the folder.
    held?.destroy();
    alive.delete(4242);
    const nextBoot = new WriteFence(new FenceLedger(dir, { boot: 'boot-2', pid: 5151 }, isAlive));
    const moved = await archive(nextBoot);
    assert.equal(moved.ok, true);
    assert.ok(!existsSync(path.join(t.home, 'sessions', '--site-gone--')));
    assert.equal(readdirSync(dir).length, 1, 'only the live gateway keeps a marker');
  } finally {
    held?.destroy();
    await dsh.close();
    rmSync(dir, { recursive: true, force: true });
    t.cleanup();
  }
});

test('K1: a gateway leaves its marker unless it exits settled; what cannot be read is doubt', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dshpw-fence-'));
  const here = { boot: 'boot-1', pid: 4242 };
  const alive = (): boolean => true;
  try {
    // Settled at exit: the marker goes, and the next process is clear. While it runs, it is doubt.
    const firstLedger = new FenceLedger(dir, here, alive);
    const clean = new WriteFence(firstLedger);
    const answered = await clean.admit();
    const request = upstreamRequest();
    answered.upstream(request);
    opened(request);
    request.emit('response', {});
    request.emit('close');
    answered.done();
    assert.equal(new FenceLedger(dir, here, alive).earlierInDoubt(), 1, 'the first gateway still runs');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const secondLedger = new FenceLedger(dir, here, alive);
    new WriteFence(secondLedger);
    secondLedger.release();
    assert.equal(new FenceLedger(dir, here, alive).earlierInDoubt(), 0, 'a gateway that exits settled leaves nothing');
    rmSync(dir, { recursive: true, force: true });

    // The three unsettled exits: a request unanswered, one unknown, and a ledger nobody settled.
    for (const drive of [
      async (fence: WriteFence) => {
        const ticket = await fence.admit();
        ticket.upstream(upstreamRequest());
        ticket.done();
      },
      async (fence: WriteFence) => {
        const ticket = await fence.admit();
        const r = upstreamRequest();
        ticket.upstream(r);
        opened(r);
        r.emit('close');
        ticket.done();
      },
    ]) {
      mkdirSync(dir, { recursive: true });
      const ledger = new FenceLedger(dir, here, alive);
      const fence = new WriteFence(ledger);
      await drive(fence);
      ledger.release();
      assert.equal(new FenceLedger(dir, here, alive).earlierInDoubt(), 1, 'its marker stays');
      rmSync(dir, { recursive: true, force: true });
    }
    mkdirSync(dir, { recursive: true });
    const unsettled = new FenceLedger(dir, here, alive);
    unsettled.release(); // no fence told it how to know it is settled
    const settledOne = new FenceLedger(dir, here, alive);
    new WriteFence(settledOne);
    settledOne.release();
    assert.equal(readdirSync(dir).length, 1, 'only the settled one removed its marker');
    rmSync(dir, { recursive: true, force: true });

    // Unreadable: a marker that does not parse, one of a shape nobody writes, a stray file; a boot
    // nobody named is never shown gone. A half-written marker (staging) is a process that took no request.
    for (const [name, content, doubt] of [
      ['1-a.json', '{not json', 1],
      ['1-b.json', '{"boot":"boot-0","parentPid":7,"extra":1}', 1],
      ['1-c.json', '{"boot":null,"parentPid":7}', 1],
      ['stray.txt', '', 1],
      ['.staging-1-d', '{"boot', 0],
    ] as const) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, name), content);
      assert.equal(new FenceLedger(dir, here, () => false).earlierInDoubt(), doubt, name);
      rmSync(dir, { recursive: true, force: true });
    }

    // A folder the marker cannot be written in: this process is in doubt for as long as it runs.
    writeFileSync(dir, 'not a folder');
    const blind = new FenceLedger(dir, here, alive);
    assert.ok(blind.earlierInDoubt() >= 1);
    await assert.rejects(new WriteFence(blind).run(100, scopeOf('gone'), async () => 'moved'), FenceUnknownOutcome);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('K1: a work that throws still lowers the fence, and two runs never overlap', async () => {
  const fence = new WriteFence();
  await assert.rejects(
    fence.run(100, scopeOf('gone'), async () => {
      throw new Error('rename failed');
    }),
    /rename failed/,
  );
  assert.equal(fence.raised, false);
  const order: string[] = [];
  const slow = (name: string) => async () => {
    order.push(`${name} start`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push(`${name} end`);
  };
  await Promise.all([fence.run(100, scopeOf('a'), slow('a')), fence.run(100, scopeOf('b'), slow('b'))]);
  assert.deepEqual(order, ['a start', 'a end', 'b start', 'b end']);
});

test('K1: a held request reaches into the archived site by a session, a mention, a path or a workspace it cannot place elsewhere', { skip: SKIP_REFS }, () => {
  const scopes = [scopeOf('gone', 'session-1', 'session-sub')];
  const known = new Map([
    ['ws-other', '/site/other'],
    ['ws-gone', '/site/gone'],
  ]);
  const place = (id: string) => known.get(id);
  const envelope = (method: string, request: Record<string, unknown>) => ({
    type: 'client-request',
    rpcId: 'r1',
    method,
    payload: { args: { request } },
  });
  const mention = `dsh-session:${Buffer.from(JSON.stringify('session-1')).toString('base64url')}`;
  const touches: [string, unknown][] = [
    ['a prompt into a site session', envelope('session/prompt', { sessionId: 'session-1', content: [] })],
    ['a subagent of the site', envelope('subagents/interruptByParent', { parentSessionId: 'x', childSessionId: 'session-sub' })],
    ['a fork of a site session', envelope('session/fork', { sessionId: 'session-1' })],
    ['a prompt mentioning a site session', envelope('session/prompt', { sessionId: 's-other', content: [{ type: 'text', text: `see ${mention}` }] })],
    ['a session reference that is not a string', envelope('session/prompt', { sessionId: 7 })],
    ['a create at the site path', envelope('session/create', { cwd: '/site/gone' })],
    ['a create under the site path', envelope('session/create', { cwd: '/site/gone/wp-content' })],
    ['a create at a spelling of the site path', envelope('session/create', { cwd: '/site//x/../gone/' })],
    ['a workspace registered at the site', envelope('workspace/create', { path: '/site/gone' })],
    ['a create in the site workspace', envelope('session/create', { workspaceId: 'ws-gone' })],
    ['a create in a workspace the gate cannot place', envelope('session/create', { workspaceId: 'ws-unknown' })],
    ['a workspace id that is not a string', envelope('session/create', { workspaceId: 7 })],
  ];
  for (const [what, body] of touches) assert.equal(touchesArchivedSite(body, scopes, place, sessionRefs!), true, what);
  const passes: [string, unknown][] = [
    ['a prompt into another site session', envelope('session/prompt', { sessionId: 's-other', content: [] })],
    ['a create at another site', envelope('session/create', { cwd: '/site/other' })],
    ['a create at a site whose name starts the same', envelope('session/create', { cwd: '/site/gone-2' })],
    ['a create in a workspace placed elsewhere', envelope('session/create', { workspaceId: 'ws-other' })],
    ['a create with no folder (dsh default)', envelope('session/create', {})],
    ['a relative path, read from a session the body names', envelope('fileUploads/upload', { sessionId: 's-other', path: 'gone/a.txt' })],
    ['a settings write', envelope('settings/mutate', { ops: [{ path: ['permission', 'defaultPreset'], value: 'x' }] })],
  ];
  for (const [what, body] of passes) assert.equal(touchesArchivedSite(body, scopes, place, sessionRefs!), false, what);
  assert.equal(touchesArchivedSite(envelope('session/create', { cwd: '/site/gone' }), [], place, sessionRefs!), false, 'never held: nothing to judge');
});

test('K1: a create and a prompt sent after the last list are refused, never reach dsh, and the folder moves', { skip: SKIP_REFS }, async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const folder = path.join(t.home, 'sessions', '--site-gone--');
    const fence = new WriteFence();
    const scope = scopeOf('gone');
    const arrived: string[] = [];
    const refused: string[] = [];
    let lists = 0;
    const injected: Promise<void>[] = [];
    // Stands in for the gateway's proxy: a request passes `admit`, then is judged by what it waited
    // behind, before dsh sees it.
    const send = (what: string, body: unknown) =>
      fence.admit().then((ticket) => {
        if (touchesArchivedSite(body, ticket.heldBy, () => undefined, sessionRefs!)) refused.push(what);
        else arrived.push(`${what} folderThere=${String(existsSync(folder))}`);
        ticket.done();
      });
    const rpc: WorkspaceRpc = async (endpoint) => {
      if (endpoint !== 'session/list') return { ok: true, value: {} };
      lists += 1;
      // The last list of the check under the fence: a customer's create at the site's path, a
      // prompt into its session and another site's prompt are sent now, before the rename.
      if (lists === 4) {
        injected.push(
          send('session/create cwd=/site/gone', { cwd: '/site/gone' }),
          send('session/prompt session-1', { sessionId: 'session-1' }),
          send('session/prompt s-other', { sessionId: 's-other' }),
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.deepEqual(arrived, [], 'nothing reaches dsh while the fence is up');
      }
      return { ok: true, value: { items: [{ sessionId: 'session-1', running: false, cwd: '/site/gone' }] } };
    };
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) =>
        settleSiteSessions(siteWorkspacePath('gone'), ids, rpc, (owned) => {
          for (const id of owned) scope.sessionIds.add(id);
        }),
      fence: (work) => fence.run(1_000, scope, work),
    });
    await Promise.all(injected);
    assert.equal(result.ok, true);
    assert.equal(lists, 4, 'settled once to stop, and once more under the fence');
    assert.deepEqual(refused, ['session/create cwd=/site/gone', 'session/prompt session-1']);
    assert.deepEqual(arrived, ['session/prompt s-other folderThere=false'], 'another site is held, then goes on');
    assert.deepEqual(readdirSync(path.join(t.home, ARCHIVE_DIR, result.ok ? result.archivedTo : '')), ['session-1']);
  } finally {
    t.cleanup();
  }
});

test('K1: a session opened before the fence went up is read again under it, and moves stopped with the rest', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    let lists = 0;
    const calls: string[] = [];
    const rpc: WorkspaceRpc = async (endpoint, args) => {
      const id = (args.request as { sessionId?: string } | undefined)?.sessionId;
      calls.push(endpoint === 'session/list' ? endpoint : `${endpoint} ${String(id)}`);
      if (endpoint !== 'session/list') return { ok: true, value: {} };
      lists += 1;
      // Right after the first settle's last list, before the fence: a new session is opened.
      if (lists === 2) session(t, '--site-gone--', 'session-new', '/site/gone');
      const rows = [{ sessionId: 'session-1', running: false, cwd: '/site/gone' }];
      if (lists >= 3) rows.push({ sessionId: 'session-new', running: false, cwd: '/site/gone' });
      return { ok: true, value: { items: rows } };
    };
    const fence = new WriteFence();
    const scope = scopeOf('gone');
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) =>
        settleSiteSessions(siteWorkspacePath('gone'), ids, rpc, (owned) => {
          for (const id of owned) scope.sessionIds.add(id);
        }),
      fence: (work) => fence.run(1_000, scope, work),
    });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.sessions, 2);
    assert.ok(calls.includes('workspace/archiveSession session-new'), 'the late session is archived before it moves');
    assert.deepEqual([...scope.sessionIds].sort(), ['session-1', 'session-new'], 'a held prompt into either is refused');
  } finally {
    t.cleanup();
  }
});

test('K1: a request still unanswered when the fence goes up keeps the folder where it is, as SESSION_ACTIVE', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const fence = new WriteFence();
    const stuck = await fence.admit(); // a prompt dsh has not answered yet, its client gone
    const toDsh = upstreamRequest();
    stuck.upstream(toDsh);
    stuck.done();
    const { rpc } = dshListing([{ sessionId: 'session-1', running: false, cwd: '/site/gone' }]);
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
      fence: (work) => fence.run(30, scopeOf('gone'), work),
    });
    toDsh.emit('close');
    assert.equal(!result.ok && result.reason, 'SESSION_ACTIVE');
    assert.match(!result.ok ? result.detail : '', /still being answered/);
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
    assert.ok(!existsSync(path.join(t.home, ARCHIVE_DIR)));
  } finally {
    t.cleanup();
  }
});

test('K1: a request whose outcome at dsh is unknown keeps the folder where it is, as SESSION_ACTIVE', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    const fence = new WriteFence();
    const sent = await fence.admit(); // a create dsh had whole, whose connection reset before the answer
    const toDsh = upstreamRequest();
    sent.upstream(toDsh);
    opened(toDsh);
    toDsh.emit('finish');
    toDsh.emit('close');
    sent.done();
    const { rpc } = dshListing([{ sessionId: 'session-1', running: false, cwd: '/site/gone' }]);
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
      fence: (work) => fence.run(1_000, scopeOf('gone'), work),
    });
    assert.equal(!result.ok && result.reason, 'SESSION_ACTIVE');
    assert.match(!result.ok ? result.detail : '', /unknown/);
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
    assert.ok(!existsSync(path.join(t.home, ARCHIVE_DIR)));
  } finally {
    t.cleanup();
  }
});

test('K1: a refusal found under the fence is returned, and the fence comes down', async () => {
  const t = tree();
  try {
    session(t, '--site-gone--', 'session-1', '/site/gone');
    let lists = 0;
    const rpc: WorkspaceRpc = async (endpoint) => {
      if (endpoint !== 'session/list') return { ok: true, value: {} };
      lists += 1;
      // Under the fence dsh reports the session running again (a turn woken before the fence).
      return { ok: true, value: { items: [{ sessionId: 'session-1', running: lists >= 4, cwd: '/site/gone' }] } };
    };
    const fence = new WriteFence();
    const result = await archiveSiteSessions({
      dshHome: t.home,
      sitesRoot: t.sites,
      label: 'gone',
      now: NOW,
      settle: (ids) => settleSiteSessions(siteWorkspacePath('gone'), ids, rpc),
      fence: (work) => fence.run(1_000, scopeOf('gone'), work),
    });
    assert.equal(!result.ok && result.reason, 'SESSION_ACTIVE');
    assert.equal(fence.raised, false);
    assert.ok(existsSync(path.join(t.home, 'sessions', '--site-gone--', 'session-1')));
  } finally {
    t.cleanup();
  }
});
