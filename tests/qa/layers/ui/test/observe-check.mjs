#!/usr/bin/env node
// Wraps one check command and records what it did to the worktree.
//
//   QA_UI_ARTIFACT_ROOT=DIR node observe-check.mjs --name NAME [--full-tree] [--timeout-ms N] -- CMD ARGS...
//
// Before and after the command it stores `git status --porcelain` and an inventory of every file under
// tests/qa (or, with --full-tree, the whole worktree except Git metadata): path, type, high-precision
// mtime, size and SHA-256 (symlinks are recorded by target, never followed; FIFOs and devices are
// recorded by type, never read). The delta between the two inventories is written next to the raw
// stdout/stderr logs under DIR/observe/NAME/RUN-ID/ (one directory per run). A command that exits 0 but leaves a delta still fails:
// a check must not write into the tree it checks. Everything is written outside the repository.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, readdir, readlink, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertOutsideRepo } from '../artifacts.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const WORKTREE = path.resolve(HERE, '../../../../..')

const HASH_CONCURRENCY = 16

const hashStream = (file) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })

async function pool(items, worker) {
  let next = 0
  const run = async () => {
    while (next < items.length) await worker(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(HASH_CONCURRENCY, items.length) }, run))
}

/**
 * Inventory of `root` (relative paths). `skip` is a predicate on the relative path of a directory entry;
 * the only default skip is the Git metadata directory at the top. Unreadable entries are an error:
 * an incomplete snapshot is not evidence.
 */
export async function snapshotTree(
  root,
  { subdir = '', skip = (rel) => rel === '.git', previous = null, hasher = hashStream } = {}
) {
  const base = path.join(root, subdir)
  if (!(await lstat(base).catch(() => null))) return { root, subdir, entries: {}, unreadable: [] }
  const entries = new Map()
  const files = []
  const unreadable = []
  const walk = async (dir) => {
    let names
    try {
      names = await readdir(dir)
    } catch (error) {
      unreadable.push(`${path.relative(root, dir)}: ${error.code}`)
      return
    }
    for (const name of names.sort()) {
      const abs = path.join(dir, name)
      const rel = path.relative(root, abs)
      if (skip(rel)) continue
      let info
      try {
        info = await lstat(abs, { bigint: true })
      } catch (error) {
        unreadable.push(`${rel}: ${error.code}`)
        continue
      }
      if (info.isSymbolicLink()) {
        entries.set(rel, { type: 'symlink', target: await readlink(abs) })
      } else if (info.isDirectory()) {
        entries.set(rel, { type: 'dir' })
        await walk(abs)
      } else if (info.isFile()) {
        const entry = {
          type: 'file',
          size: String(info.size),
          mtimeNs: String(info.mtimeNs),
          ctimeNs: String(info.ctimeNs),
          ino: String(info.ino)
        }
        // ctime is kernel-kept and cannot be reset by utimes(), so an entry whose size, mtime, ctime and
        // inode all match the previous snapshot of this same run is the same bytes: reuse its hash.
        // Everything else (and every file of a first snapshot) is hashed from its content.
        const prior = previous?.entries[rel]
        if (
          prior?.sha256 &&
          prior.size === entry.size &&
          prior.mtimeNs === entry.mtimeNs &&
          prior.ctimeNs === entry.ctimeNs &&
          prior.ino === entry.ino
        ) {
          entry.sha256 = prior.sha256
          entries.set(rel, entry)
          continue
        }
        entries.set(rel, entry)
        files.push([abs, entry])
      } else {
        entries.set(rel, { type: 'other', mode: String(info.mode) })
      }
    }
  }
  await walk(base)
  await pool(files, async ([abs, entry]) => {
    const rel = path.relative(root, abs)
    try {
      entry.sha256 = await hasher(abs)
      // A file that changed while it was being hashed gives a hash that matches neither state.
      const again = await lstat(abs, { bigint: true })
      if (
        !again.isFile() ||
        String(again.size) !== entry.size ||
        String(again.mtimeNs) !== entry.mtimeNs ||
        String(again.ctimeNs) !== entry.ctimeNs
      )
        unreadable.push(`${rel}: UNSTABLE (changed while hashed)`)
    } catch (error) {
      unreadable.push(`${rel}: ${error.code}`)
    }
  })
  return {
    root,
    subdir,
    entries: Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1))),
    unreadable
  }
}

/** Differences between two snapshots; mtime-only changes are reported separately from content changes. */
export function diffSnapshots(before, after) {
  const delta = { added: [], removed: [], changed: [], touched: [] }
  for (const [rel, a] of Object.entries(after.entries)) {
    const b = before.entries[rel]
    if (!b) {
      delta.added.push(rel)
      continue
    }
    if (b.type !== a.type || b.target !== a.target || b.sha256 !== a.sha256 || b.mode !== a.mode) {
      delta.changed.push(rel)
    } else if (b.mtimeNs !== a.mtimeNs) {
      delta.touched.push(rel)
    }
  }
  for (const rel of Object.keys(before.entries)) if (!(rel in after.entries)) delta.removed.push(rel)
  return delta
}

export const deltaIsEmpty = (d) =>
  !d.added.length && !d.removed.length && !d.changed.length && !d.touched.length

export function gitStatus(root) {
  const r = spawnSync('git', ['status', '--porcelain', '--ignored=no'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.error || r.status !== 0)
    return { ok: false, text: `git status failed: ${r.error?.message ?? r.stderr}` }
  return { ok: true, text: r.stdout }
}

async function ensureOutsideRepo(dir) {
  const abs = assertOutsideRepo(dir, 'artifact root')
  await mkdir(abs, { recursive: true })
  return realpath(abs)
}

export function parseObserveArgs(argv) {
  const out = { name: null, fullTree: false, timeoutMs: 600000, command: [] }
  const split = argv.indexOf('--')
  if (split < 0) throw new Error('missing -- before the command')
  const own = argv.slice(0, split)
  out.command = argv.slice(split + 1)
  if (!out.command.length) throw new Error('empty command')
  const seen = new Set()
  for (let i = 0; i < own.length; i++) {
    const flag = own[i]
    if (seen.has(flag)) throw new Error(`${flag} given more than once`)
    seen.add(flag)
    if (flag === '--full-tree') out.fullTree = true
    else if (flag === '--name' || flag === '--timeout-ms') {
      const value = own[++i]
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
      if (flag === '--name') {
        if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error('--name must be a plain slug')
        out.name = value
      } else {
        if (!/^[0-9]+$/.test(value) || Number(value) < 1)
          throw new Error('--timeout-ms must be a positive integer')
        out.timeoutMs = Number(value)
      }
    } else throw new Error(`unknown argument: ${flag}`)
  }
  if (!out.name) throw new Error('--name is required')
  return out
}

export async function observe({ name, fullTree, timeoutMs, command, artifactRoot, cwd = WORKTREE }) {
  const root = await ensureOutsideRepo(artifactRoot)
  // One directory per run: a later run of the same check never overwrites an earlier run's evidence.
  const parent = path.join(root, 'observe', name)
  await mkdir(parent, { recursive: true })
  const dir = await mkdtemp(path.join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}-`))
  const take = async () => ({
    at: new Date().toISOString(),
    git: gitStatus(cwd),
    tree: await snapshotTree(cwd, { ...(fullTree ? {} : { subdir: 'tests/qa' }), previous })
  })
  let previous = null
  const before = await take()
  previous = before.tree
  const startedAt = new Date().toISOString()
  const logOut = createWriteStream(path.join(dir, 'stdout.log'))
  const logErr = createWriteStream(path.join(dir, 'stderr.log'))
  const result = await new Promise((resolve) => {
    let child
    try {
      child = spawn(command[0], command.slice(1), {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
      })
    } catch (error) {
      resolve({ status: null, signal: null, error: error.message })
      return
    }
    child.stdout.on('data', (c) => {
      logOut.write(c)
      process.stdout.write(c)
    })
    child.stderr.on('data', (c) => {
      logErr.write(c)
      process.stderr.write(c)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ status: null, signal: null, error: error.message })
    })
    child.on('close', (status, signal) => {
      clearTimeout(timer)
      resolve({ status, signal, error: null })
    })
  })
  await Promise.all([new Promise((r) => logOut.end(r)), new Promise((r) => logErr.end(r))])
  const after = await take()
  const delta = diffSnapshots(before.tree, after.tree)
  const gitChanged = before.git.text !== after.git.text
  const incomplete = [
    ...before.tree.unreadable,
    ...after.tree.unreadable,
    ...[before.git, after.git].filter((g) => !g.ok).map((g) => g.text)
  ]
  const record = {
    name,
    argv: command,
    cwd,
    scope: fullTree ? 'worktree' : 'tests/qa',
    startedAt,
    exit: result,
    gitStatusChanged: gitChanged,
    delta,
    incomplete
  }
  await writeFile(path.join(dir, 'git-before.txt'), before.git.text)
  await writeFile(path.join(dir, 'git-after.txt'), after.git.text)
  await writeFile(path.join(dir, 'tree-before.json'), JSON.stringify(before.tree))
  await writeFile(path.join(dir, 'tree-after.json'), JSON.stringify(after.tree))
  await writeFile(path.join(dir, 'record.json'), `${JSON.stringify(record, null, 2)}\n`)
  const clean = deltaIsEmpty(delta) && !gitChanged && !incomplete.length
  const ok = result.status === 0 && result.signal === null && !result.error && clean
  return { ok, record, dir }
}

async function main(argv) {
  let args
  try {
    args = parseObserveArgs(argv)
  } catch (error) {
    console.error(`observe-check usage: ${error.message}`)
    return 2
  }
  if (!process.env.QA_UI_ARTIFACT_ROOT) {
    console.error('observe-check: QA_UI_ARTIFACT_ROOT is required')
    return 2
  }
  const { ok, record, dir } = await observe({ ...args, artifactRoot: process.env.QA_UI_ARTIFACT_ROOT })
  const { delta } = record
  console.error(
    `observe-check ${args.name}: exit ${record.exit.status ?? record.exit.signal ?? record.exit.error}; delta +${delta.added.length} -${delta.removed.length} ~${delta.changed.length} touched ${delta.touched.length}; git status ${record.gitStatusChanged ? 'CHANGED' : 'same'}; ${dir}`
  )
  if (ok) return 0
  return record.exit.status && record.exit.status !== 0 ? record.exit.status : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(2)
    }
  )
}
