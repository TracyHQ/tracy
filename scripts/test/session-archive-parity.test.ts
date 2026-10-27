// Two copies of one rule set, held to one verdict per folder.
//
// Moving a deleted site's session folder into the archive is decided in two places that cannot
// import each other: the seat door inside `tracy-dsh` (`vendor/tracy/dsh-passwords/src/
// session-archive.ts`, built by npm in its own image stage) and the operator's sweep
// (`packages/fleet/tracy-fleet-operation/scripts/tools/archive-orphan-sessions.mjs`, a bare Node
// script an operator copies into a container that may still run an older image). Each tests
// itself; this file builds one scratch store and asks both about every label on it, so a rule
// changed in one copy and not the other turns red here instead of moving a different set of
// folders on a host.
//
//   node --import tsx --test scripts/test/session-archive-parity.test.ts
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'

import * as door from '../../vendor/tracy/dsh-passwords/src/tracy/session-archive.js'
import * as sweep from '../../packages/fleet/tracy-fleet-operation/scripts/tools/archive-orphan-sessions.mjs'

const NOW = Date.UTC(2026, 8, 28, 10, 15, 30)

test('both copies name the same folders, archive and lease rules', () => {
  assert.equal(sweep.SESSIONS_DIR, door.SESSIONS_DIR)
  assert.equal(sweep.ARCHIVE_DIR, door.ARCHIVE_DIR)
  assert.equal(sweep.LEASES_DIR, door.LEASES_DIR)
  assert.equal(sweep.SITE_MOUNT, door.SITE_MOUNT)
  assert.equal(sweep.LEASE_FRESH_MS, door.LEASE_FRESH_MS)
  for (const label of ['gone', 'wp-07vce0', 'a--b', 'x.y_z']) {
    assert.equal(sweep.siteSessionFolderName(label), door.siteSessionFolderName(label))
    assert.equal(sweep.siteWorkspacePath(label), door.siteWorkspacePath(label))
  }
  assert.equal(sweep.archiveStamp(NOW), door.archiveStamp(NOW))
})

test('both copies reach the same verdict on every folder of one store', async () => {
  const base = mkdtempSync(path.join(tmpdir(), 'session-archive-parity-'))
  try {
    const home = path.join(base, 'desk-home')
    const sites = path.join(base, 'site')
    mkdirSync(path.join(home, 'sessions'), { recursive: true })
    mkdirSync(sites, { recursive: true })
    const session = (folder: string, id: string, cwd: string, version = 4) => {
      const dir = path.join(home, 'sessions', folder, id)
      mkdirSync(dir, { recursive: true })
      const header = `${JSON.stringify({ type: 'session', version, id, createdAt: 1, cwd })}\n`
      writeFileSync(path.join(dir, `session.v${version}.jsonl.zstd`), zstdCompressSync(Buffer.from(header)))
      return dir
    }
    session('--site-gone--', 'session-1', '/site/gone', 3)
    session('--site-gone--', 'session-1', '/site/gone', 4)
    session('--site-gone--', 'session-2', '/site/gone')
    session('--site-live--', 'session-3', '/site/live')
    mkdirSync(path.join(sites, 'live'))
    session('--site-a-b--', 'session-4', '/site/a/b')
    writeFileSync(
      path.join(session('--site-broken--', 'session-5', '/site/broken'), 'session.v4.jsonl.zstd'),
      'x'
    )
    session('--site-busy--', 'session-6', '/site/busy')
    mkdirSync(path.join(home, 'leases'))
    const lease = path.join(home, 'leases', 'chat-session-6.json')
    writeFileSync(lease, JSON.stringify({ id: 'chat-session-6', kind: 'chat', sessionId: 'session-6' }))
    utimesSync(lease, (NOW - 10_000) / 1000, (NOW - 10_000) / 1000)
    session('--site-other--', 'session-7', '/site/other')
    symlinkSync(path.join(home, 'sessions', '--site-other--'), path.join(home, 'sessions', '--site-linked--'))

    const labels = ['gone', 'live', 'a-b', 'broken', 'busy', 'linked', 'never', '../gone', '']
    const verdicts: Record<string, unknown> = {}
    for (const label of labels) {
      const given = { dshHome: home, sitesRoot: sites, label, now: NOW }
      const a = await door.inspectSiteSessions(given)
      const b = await sweep.inspectSiteSessions(given)
      const shape = (r: { ok: boolean; reason?: string; sessionIds?: string[] }) =>
        r.ok ? { ok: true, sessionIds: [...(r.sessionIds ?? [])].sort() } : { ok: false, reason: r.reason }
      assert.deepEqual(shape(b), shape(a), `label ${JSON.stringify(label)}`)
      verdicts[label] = shape(a)
    }
    // And the verdicts are the intended ones, so two copies cannot agree on a wrong answer.
    assert.deepEqual(verdicts, {
      gone: { ok: true, sessionIds: ['session-1', 'session-2'] },
      live: { ok: false, reason: 'SITE_STILL_EXISTS' },
      'a-b': { ok: false, reason: 'AMBIGUOUS_FOLDER' },
      broken: { ok: false, reason: 'AMBIGUOUS_FOLDER' },
      busy: { ok: false, reason: 'SESSION_ACTIVE' },
      linked: { ok: false, reason: 'AMBIGUOUS_FOLDER' },
      never: { ok: false, reason: 'NO_SESSION_FOLDER' },
      '../gone': { ok: false, reason: 'INVALID_LABEL' },
      '': { ok: false, reason: 'INVALID_LABEL' }
    })
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
