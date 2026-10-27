/**
 * `scripts/tools/archive-orphan-sessions.mjs` on a scratch dsh home and site mount.
 *
 * What is pinned: a run moves nothing unless `--apply` is given; `--apply` moves exactly the folders
 * of sites that no longer exist and leaves every other folder (a live site, a folder whose sessions
 * belong to another path, a folder that is not a site's) where it was; and an empty site mount —
 * what a missing bind mount looks like — refuses the whole run instead of calling every site deleted.
 * The per-folder rules themselves are the delete door's, held to it by
 * `scripts/test/session-archive-parity.test.ts`.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'

import { main, planOrphans } from '../scripts/tools/archive-orphan-sessions.mjs'

const NOW = Date.UTC(2026, 8, 28, 10, 15, 30)

function stand() {
  const base = mkdtempSync(path.join(tmpdir(), 'archive-orphan-sessions-'))
  const home = path.join(base, 'dsh-home')
  const sites = path.join(base, 'sites')
  mkdirSync(path.join(home, 'sessions'), { recursive: true })
  mkdirSync(sites, { recursive: true })
  const session = (folder, id, cwd) => {
    const dir = path.join(home, 'sessions', folder, id)
    mkdirSync(dir, { recursive: true })
    const header = `${JSON.stringify({ type: 'session', version: 4, id, createdAt: 1, cwd })}\n`
    const body = `${JSON.stringify({ type: 'message', text: 'hello' })}\n`
    writeFileSync(
      path.join(dir, 'session.v4.jsonl.zstd'),
      Buffer.concat([zstdCompressSync(Buffer.from(header)), zstdCompressSync(Buffer.from(body))])
    )
  }
  session('--site-gone--', 'session-1', '/site/gone')
  session('--site-gone--', 'session-2', '/site/gone')
  session('--site-old-wp--', 'session-3', '/site/old-wp')
  session('--site-live--', 'session-4', '/site/live')
  session('--site-a-b--', 'session-5', '/site/a/b')
  session('--desk-home-onboarding-x--', 'session-6', '/desk-home/onboarding/x')
  mkdirSync(path.join(sites, 'live'))
  return {
    home,
    sites,
    listing: () => readdirSync(path.join(home, 'sessions')).sort(),
    cleanup: () => rmSync(base, { recursive: true, force: true })
  }
}

const quiet = () => {
  const lines = []
  return { out: (line) => lines.push(line), lines }
}

test('without --apply the run lists what it would move and moves nothing', async () => {
  const s = stand()
  try {
    const before = s.listing()
    const io = quiet()
    const code = await main(['--dsh-home', s.home, '--sites-root', s.sites], { ...io, now: NOW })
    assert.equal(code, 0)
    assert.deepEqual(s.listing(), before)
    assert.equal(existsSync(path.join(s.home, 'sessions-archive')), false)
    assert.ok(io.lines.some((l) => l.startsWith('would archive  --site-gone--  2 session(s)')))
    assert.ok(io.lines.some((l) => l.startsWith('kept           --site-a-b--  AMBIGUOUS_FOLDER')))
    assert.ok(io.lines.includes('Dry run: nothing moved. Run again with --apply to move them.'))
  } finally {
    s.cleanup()
  }
})

test('--apply moves exactly the folders of deleted sites, whole, into the archive', async () => {
  const s = stand()
  try {
    const code = await main(['--dsh-home', s.home, '--sites-root', s.sites, '--apply'], {
      ...quiet(),
      now: NOW
    })
    assert.equal(code, 0)
    assert.deepEqual(s.listing(), ['--desk-home-onboarding-x--', '--site-a-b--', '--site-live--'])
    const archive = path.join(s.home, 'sessions-archive')
    assert.deepEqual(readdirSync(archive).sort(), ['gone-20260928T101530Z', 'old-wp-20260928T101530Z'])
    assert.deepEqual(readdirSync(path.join(archive, 'gone-20260928T101530Z')).sort(), [
      'session-1',
      'session-2'
    ])

    // A second run finds nothing left to move.
    const plan = await planOrphans({ dshHome: s.home, sitesRoot: s.sites, now: NOW })
    assert.deepEqual(
      plan.rows.filter((r) => r.verdict === 'archive'),
      []
    )
  } finally {
    s.cleanup()
  }
})

test('an empty site mount refuses the whole run — a missing mount looks exactly like that', async () => {
  const s = stand()
  try {
    rmSync(path.join(s.sites, 'live'), { recursive: true })
    const before = s.listing()
    const io = quiet()
    const code = await main(['--dsh-home', s.home, '--sites-root', s.sites, '--apply'], {
      ...io,
      now: NOW
    })
    assert.equal(code, 2)
    assert.match(io.lines.join('\n'), /SITE_MOUNT_EMPTY/)
    assert.deepEqual(s.listing(), before)

    const missing = await main(
      ['--dsh-home', s.home, '--sites-root', path.join(s.sites, 'nope'), '--apply'],
      { ...quiet(), now: NOW }
    )
    assert.equal(missing, 2)
    assert.deepEqual(s.listing(), before)

    // Said on purpose, it runs: the live folder then counts as deleted too.
    const allowed = await planOrphans({
      dshHome: s.home,
      sitesRoot: s.sites,
      now: NOW,
      allowEmptySitesRoot: true
    })
    assert.equal(allowed.refused, null)
    assert.deepEqual(
      allowed.rows
        .filter((r) => r.verdict === 'archive')
        .map((r) => r.label)
        .sort(),
      ['gone', 'live', 'old-wp']
    )
  } finally {
    s.cleanup()
  }
})

test('a store that is not there, or a relative path, is refused before anything is read', async () => {
  const s = stand()
  try {
    assert.equal(
      await main(['--dsh-home', path.join(s.home, 'nope'), '--sites-root', s.sites], {
        ...quiet(),
        now: NOW
      }),
      2
    )
    assert.equal(await main(['--dsh-home', 'dsh-home', '--sites-root', s.sites], { ...quiet(), now: NOW }), 2)
    assert.equal(await main(['--frobnicate'], { ...quiet(), now: NOW }), 2)
  } finally {
    s.cleanup()
  }
})
