/**
 * Which agent CLIs are on this machine (`src/agent-detect.js`): a file lookup over the search
 * directories, never a run of the CLI. Driven with a stand-in `stat` over an imaginary disk.
 *
 *   node --test packages/desktop/tracy-desktop/test/agent-detect.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { detectAgents, INSTALL_DIRS } = require('../src/agent-detect.js')
const { AGENT_MANIFEST } = require('../src/agent-manifest.js')

const FILE = 0o100755
const NOT_EXECUTABLE = 0o100644
const DIR = 0o040755

/** A `stat` over `{ path: mode }`; anything else is ENOENT. Records the paths asked. */
function disk(entries) {
  const asked = []
  const stat = async (p) => {
    asked.push(p)
    await new Promise((resolve) => setImmediate(resolve))
    if (!Object.hasOwn(entries, p)) throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' })
    const mode = entries[p]
    return { mode, isFile: () => (mode & 0o170000) === 0o100000 }
  }
  return { stat, asked }
}

const detect = (ids, entries, more = {}) =>
  detectAgents(ids, {
    manifest: AGENT_MANIFEST,
    paths: ['/usr/bin', '/bin'],
    platform: 'darwin',
    home: '/Users/a',
    stat: disk(entries).stat,
    ...more
  })

const statusOf = (answer) => Object.fromEntries(answer.results.map((r) => [r.id, r.status]))

test('a CLI on the search path is found; one that is not there is not', async () => {
  const answer = await detect(['claude', 'codex'], { '/bin/claude': FILE })
  assert.deepEqual(answer, {
    results: [
      { id: 'claude', status: 'found' },
      { id: 'codex', status: 'not-found' }
    ],
    scanComplete: true
  })
})

test('the usual install directories are searched too, ~ meaning the home folder', async () => {
  assert.ok(INSTALL_DIRS.includes('/opt/homebrew/bin'))
  const answer = await detect(['claude', 'codex', 'kimi'], {
    '/Users/a/.local/bin/claude': FILE,
    '/opt/homebrew/bin/codex': FILE,
    '/Users/a/.nix-profile/bin/kimi': FILE
  })
  assert.deepEqual(statusOf(answer), { claude: 'found', codex: 'found', kimi: 'found' })
})

test('a directory or a file that cannot be run, named like the CLI, is not the CLI', async () => {
  const answer = await detect(['claude', 'codex'], { '/bin/claude': DIR, '/bin/codex': NOT_EXECUTABLE })
  assert.deepEqual(statusOf(answer), { claude: 'not-found', codex: 'not-found' })
})

test('any of an id’s commands counts: Antigravity is `agy` or `gemini`', async () => {
  assert.equal(statusOf(await detect(['antigravity'], { '/usr/bin/gemini': FILE })).antigravity, 'found')
})

test('an id the app does not know, or one with no CLI, is unsupported — never looked for', async () => {
  const { stat, asked } = disk({})
  const answer = await detectAgents(['no-such-id', 'glm'], {
    manifest: AGENT_MANIFEST,
    paths: ['/bin'],
    platform: 'darwin',
    home: '/Users/a',
    stat
  })
  assert.deepEqual(statusOf(answer), { 'no-such-id': 'unsupported', glm: 'unsupported' })
  assert.equal(asked.length, 0)
})

test('while the shell PATH is still being read, a CLI not seen yet is unknown, not "not installed"', async () => {
  const answer = await detect(['claude', 'codex', 'nope'], { '/bin/claude': FILE }, { complete: false })
  assert.deepEqual(answer, {
    results: [
      { id: 'claude', status: 'found' },
      { id: 'codex', status: 'unknown' },
      { id: 'nope', status: 'unsupported' }
    ],
    scanComplete: false
  })
})

test('Windows: the CLI is found under its PATHEXT names; no execute bit is asked for', async () => {
  const answer = await detect(
    ['claude', 'codex', 'kiro'],
    { 'C:\\Tools\\claude.cmd': NOT_EXECUTABLE, 'C:\\Bin\\codex.exe': FILE },
    {
      platform: 'win32',
      paths: ['C:\\Tools', 'C:\\Bin'],
      home: 'C:\\Users\\a'
    }
  )
  assert.deepEqual(statusOf(answer), { claude: 'found', codex: 'found', kiro: 'not-found' })
})

test('Windows: no POSIX install directory is searched', async () => {
  const { stat, asked } = disk({})
  await detectAgents(['claude'], {
    manifest: AGENT_MANIFEST,
    paths: ['C:\\Tools'],
    platform: 'win32',
    home: 'C:\\Users\\a',
    stat
  })
  assert.ok(
    asked.every((p) => p.startsWith('C:\\Tools\\')),
    asked.join(' ')
  )
})

test('relative or repeated directories are skipped, and at most 64 directories are searched', async () => {
  const { stat, asked } = disk({})
  const paths = ['bin', '/a', '/a', ...Array.from({ length: 100 }, (_, i) => `/d${i}`)]
  await detectAgents(['claude'], {
    manifest: AGENT_MANIFEST,
    paths,
    platform: 'linux',
    home: '/home/a',
    stat
  })
  const dirs = new Set(asked.map((p) => p.slice(0, p.lastIndexOf('/'))))
  assert.ok(!dirs.has('bin'))
  assert.equal(asked.filter((p) => p === '/a/claude').length, 1)
  assert.ok(dirs.size <= 64, `${dirs.size} directories`)
})

test('no more than 8 lookups run at once', async () => {
  let running = 0
  let peak = 0
  const stat = async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 1))
    running--
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  const ids = Object.keys(AGENT_MANIFEST)
  await detectAgents(ids, {
    manifest: AGENT_MANIFEST,
    paths: ['/a', '/b', '/c'],
    platform: 'linux',
    home: '/h',
    stat
  })
  assert.ok(peak <= 8 && peak > 1, `peak ${peak}`)
})

test('more than 32 ids, or ids that are not names, are refused', async () => {
  await assert.rejects(
    detect(
      Array.from({ length: 33 }, () => 'claude'),
      {}
    ),
    TypeError
  )
  await assert.rejects(detect(['../claude'], {}), TypeError)
  await assert.rejects(detect('claude', {}), TypeError)
})

test('a lookup that fails for another reason (permission) is just "not there"', async () => {
  const stat = async () => {
    throw Object.assign(new Error('EACCES /secret/claude'), { code: 'EACCES' })
  }
  const answer = await detectAgents(['claude'], {
    manifest: AGENT_MANIFEST,
    paths: ['/secret'],
    platform: 'darwin',
    home: '/h',
    stat
  })
  assert.deepEqual(answer, { results: [{ id: 'claude', status: 'not-found' }], scanComplete: true })
})
