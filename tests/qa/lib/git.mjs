// Bounded, argument-array git calls. No shell, no string interpolation.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export function makeGit(repoRoot, { timeoutMs = 20_000 } = {}) {
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        'git',
        ['-C', repoRoot, ...args],
        {
          timeout: timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
          encoding: 'utf8',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        },
        (error, stdout, stderr) => {
          if (error)
            reject(new Error(`git ${args[0]} failed: ${(stderr || error.message).trim().slice(0, 500)}`))
          else resolve(stdout)
        }
      )
    })
}

export class ProvenanceError extends Error {}

// The tree identity of a run. Fails closed: a run or a coverage claim without a verified commit
// and a known dirty state would not say which code was tested.
export async function gitProvenance(git) {
  let sha
  let dirty
  try {
    sha = (await git(['rev-parse', 'HEAD'])).trim()
  } catch (error) {
    throw new ProvenanceError(`cannot establish the git revision: ${error.message}`)
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new ProvenanceError(`git rev-parse HEAD returned "${sha}"`)
  try {
    dirty = (await git(['status', '--porcelain=v1', '-z', '--untracked-files=normal'])).length > 0
  } catch (error) {
    throw new ProvenanceError(`cannot establish whether the tree is dirty: ${error.message}`)
  }
  let repository = 'tch'
  try {
    const url = (await git(['config', '--get', 'remote.origin.url'])).trim()
    if (url) repository = url.replace(/\/\/[^/@]*@/, '//')
  } catch {}
  return { sha, dirty, repository }
}

async function fileDigest(file) {
  let info
  try {
    info = await fs.lstat(file)
  } catch (error) {
    if (error.code === 'ENOENT') return 'gone'
    throw error
  }
  if (info.isSymbolicLink()) return `l:${await fs.readlink(file)}`
  if (info.isDirectory()) return 'dir'
  if (!info.isFile()) return 'special'
  return `f:${createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex')}`
}

// Content identity of the working tree: every tracked or untracked-but-not-ignored path with a
// digest of what is on disk. It does not depend on the commit, so committing the tested content
// keeps a run valid while any edit (committed or not) to a file makes it stale.
export async function treeFingerprint(git, repoRoot) {
  let paths
  try {
    const listed = (await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).split('\0')
    const deleted = new Set((await git(['ls-files', '-z', '--deleted'])).split('\0'))
    paths = [...new Set(listed)].filter((p) => p && !deleted.has(p)).sort()
  } catch (error) {
    throw new ProvenanceError(`cannot list the tree: ${error.message}`)
  }
  const sums = Array.from({ length: paths.length })
  let next = 0
  const worker = async () => {
    for (;;) {
      const i = next++
      if (i >= paths.length) return
      sums[i] = await fileDigest(path.join(repoRoot, paths[i]))
    }
  }
  try {
    await Promise.all(Array.from({ length: 16 }, worker))
  } catch (error) {
    throw new ProvenanceError(`cannot fingerprint the tree: ${error.message}`)
  }
  const hash = createHash('sha256')
  for (const [i, p] of paths.entries()) hash.update(`${p}\0${sums[i]}\n`)
  return hash.digest('hex')
}
