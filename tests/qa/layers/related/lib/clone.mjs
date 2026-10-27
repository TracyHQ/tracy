// Locating the sibling repositories and recording what was run against which commit.
// No machine path lives in committed code: the root comes from QA_RELATED_ROOT, or from a JSON config the person
// owns (QA_RELATED_CONFIG, or tests/qa/layers/related/related.config.local.json, never committed): {"root": "..."}.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnBounded } from '../../cms/lib/kit.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const LOCAL_CONFIG = path.resolve(HERE, '../related.config.local.json')

/** @returns {{ root: string | null, from: string, problem?: string }} */
export function resolveRoot(env = process.env) {
  if (env.QA_RELATED_ROOT) return { root: path.resolve(env.QA_RELATED_ROOT), from: 'QA_RELATED_ROOT' }
  const candidates = [env.QA_RELATED_CONFIG, LOCAL_CONFIG].filter(Boolean)
  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const doc = JSON.parse(readTextSync(file))
      if (typeof doc?.root !== 'string' || doc.root === '')
        return { root: null, from: file, problem: 'config has no "root" string' }
      return { root: path.resolve(doc.root), from: file }
    } catch (error) {
      return { root: null, from: file, problem: `config is not readable JSON: ${error.message}` }
    }
  }
  return {
    root: null,
    from: 'none',
    problem: 'no QA_RELATED_ROOT, no QA_RELATED_CONFIG and no related.config.local.json'
  }
}

const git = (cwd, args) => spawnBounded({ argv: ['git', ...args], cwd, timeoutMs: 30_000 })

/** A clone's identity and cleanliness: HEAD, branch, and every untracked/ignored/modified path. */
export async function snapshotClone(dir) {
  const head = await git(dir, ['rev-parse', 'HEAD'])
  if (head.spawnError || head.timedOut || head.truncated || head.signal || !Number.isInteger(head.exit))
    return {
      ok: false,
      invalid: true,
      reason: `git rev-parse did not complete (${head.spawnError ?? (head.timedOut ? 'timeout' : (head.signal ?? 'cut off'))})`
    }
  if (head.exit !== 0)
    return { ok: false, reason: `not a git clone: ${head.stderr.trim() || head.spawnError}` }
  const status = await git(dir, ['status', '--porcelain=v1', '--ignored', '-uall'])
  // A status that failed, timed out or was cut off says nothing about cleanliness: the snapshot is invalid, not clean.
  if (status.exit !== 0 || status.timedOut || status.truncated || status.signal || head.truncated)
    return {
      ok: false,
      invalid: true,
      reason: `git status did not complete (exit ${status.exit}, timedOut ${status.timedOut}, truncated ${Boolean(status.truncated)}): ${status.stderr.trim().slice(0, 200)}`
    }
  return {
    ok: true,
    head: head.stdout.trim(),
    short: head.stdout.trim().slice(0, 10),
    status: status.stdout,
    dirtyLines: status.stdout.split('\n').filter((l) => l && !l.startsWith('!!')).length
  }
}

export async function cloneHas(dir, sha) {
  const r = await git(dir, ['cat-file', '-e', `${sha}^{commit}`])
  return r.exit === 0
}

export async function isAncestor(dir, sha) {
  const r = await git(dir, ['merge-base', '--is-ancestor', sha, 'HEAD'])
  return r.exit === 0
}

/** `argv` must already be wrapped by the execution fence: a version query runs the tool, so it is fenced like the suite. */
export async function toolVersion(argv, env, cwd) {
  const r = await spawnBounded({ argv, env, cwd, timeoutMs: 15_000, maxBytes: 100_000 })
  if (r.exit !== 0 || r.truncated || r.timedOut || r.signal) return null
  return (r.stdout || r.stderr).split('\n')[0].trim()
}

export const isDirectory = (p) => {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}
