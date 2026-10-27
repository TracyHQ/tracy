// Shared selftest helpers. All scratch files live under QA_SELFTEST_TMP_ROOT (or the OS tmp dir).
import { createHash } from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { main } from '../cli.mjs'
import { readTextAsync } from '../lib/bounded-reader.mjs'

export const HERE = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURE_LAYERS = path.join(HERE, 'fixtures/layers')
export const SHA = 'a'.repeat(40)

// Every directory this process creates is remembered and removed when the process exits with
// code 0 (all tests of the file passed). After a failure they stay, because they are the evidence.
// Only directories created here are removed; the shared root is removed only when it ends up empty.
const created = new Set()
let scratchRoot = null

process.on('exit', (code) => {
  if (code !== 0 || process.exitCode) return
  for (const dir of created) {
    try {
      fsSync.rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
  try {
    if (scratchRoot) fsSync.rmdirSync(scratchRoot)
  } catch {}
})

export async function tmpDir(label) {
  const root = process.env.QA_SELFTEST_TMP_ROOT
    ? path.join(process.env.QA_SELFTEST_TMP_ROOT, 'qa-selftest')
    : path.join(os.tmpdir(), 'qa-selftest')
  await fs.mkdir(root, { recursive: true })
  scratchRoot = root
  const dir = await fs.mkdtemp(path.join(root, `${label}-`))
  created.add(dir)
  return dir
}

// state: sha (HEAD), dirty (porcelain text), commits (other resolvable commits), changed/untracked
// (NUL-joined paths reported against any older revision), notAncestor (merge-base fails).
export function fakeGit(state = { sha: SHA, dirty: '' }) {
  const git = async (args) => {
    if (args[0] === 'rev-parse' && args.includes('--verify')) {
      const token = args.at(-1).replace('^{commit}', '')
      const known = [state.sha, ...(state.commits ?? [])].find((c) => c.startsWith(token))
      if (!known) throw new Error(`unknown revision ${token}`)
      return `${known}\n`
    }
    if (args[0] === 'rev-parse') return `${state.sha}\n`
    if (args[0] === 'merge-base') {
      if (state.notAncestor) throw new Error('not an ancestor')
      return ''
    }
    if (args[0] === 'diff') return state.changed ?? ''
    if (args[0] === 'ls-files') return state.untracked ?? ''
    if (args[0] === 'status') return state.dirty
    if (args[0] === 'config') return 'https://user:secret@example.test/tch.git\n'
    throw new Error(`fakeGit: unexpected ${args.join(' ')}`)
  }
  git.state = state
  return git
}

// A tree identity that follows the fake state: new HEAD, dirty text or `content` = new fingerprint.
export function fakeFingerprint(state) {
  return async () =>
    createHash('sha256')
      .update(`${state.sha}\0${state.dirty}\0${state.content ?? ''}`)
      .digest('hex')
}

// Runs the CLI in-process with fixture layers and captures its output.
export async function cli(argv, overrides = {}) {
  const out = []
  const err = []
  const resultsRoot = overrides.resultsRoot ?? (await tmpDir('results'))
  const git = overrides.git ?? fakeGit()
  const code = await main(argv, {
    layersDir: FIXTURE_LAYERS,
    resultsRoot,
    git,
    fingerprint: fakeFingerprint(git.state ?? { sha: SHA, dirty: '' }),
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    ...overrides
  })
  return { code, out: out.join(''), err: err.join(''), resultsRoot }
}

export async function readJson(file) {
  return JSON.parse(await readTextAsync(file))
}

export async function latestRunDir(resultsRoot, layer) {
  const names = (await fs.readdir(resultsRoot)).filter((n) => new RegExp(`-${layer}(-\\d+)?$`).test(n)).sort()
  return path.join(resultsRoot, names.at(-1))
}
