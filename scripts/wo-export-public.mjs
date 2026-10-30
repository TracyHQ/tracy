#!/usr/bin/env node
// Export packages/wo/website-opportunities as the tree of the public repo (ADR 0036), never with TCH history.
//   Look only:    node scripts/wo-export-public.mjs --out <empty dir> [--ref HEAD]
//   Publish:      node scripts/wo-export-public.mjs --out <empty dir> --sync <url> [--ref HEAD] [--push] [--repo <owner/repo>]
// No path pushes main: the initial publication (--remote --push) and the force-push (--replace) are gone.
// The public repository already has history; a target without a main is refused — create it by hand.
// --sync clones the public main, lays the export over it and adds ONE ordinary commit on top. With --push
// that commit reaches main through a pull request, never a push to main (main is protected): it is pushed
// to `automation/wo/<source-sha>/<export-sha>`, a PR is opened against main and merged through the REST
// API, and the branch is deleted (`packages/fleet/tracy-fleet-operation/scripts/lib/github-pr-publish.mjs`).
// When main moved or the merge conflicts, that PR is closed and the export redone on the current main once.
// The API token is GITHUB_TOKEN, else `gh auth token`; git itself uses whatever credential the shell has.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  apiBase,
  MERGED,
  makePublisher
} from '../packages/fleet/tracy-fleet-operation/scripts/lib/github-pr-publish.mjs'

const PKG = 'packages/wo/website-opportunities'
// Files that only make sense inside TCH.
const TCH_ONLY = ['turbo.json']
const AUTHOR = ['-c', 'user.name=Tracy', '-c', 'user.email=noreply@tracy.ai']
const BRANCH_PREFIX = 'automation/wo/'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i < 0 ? undefined : args[i + 1]
}
const out = opt('--out')
const ref = opt('--ref') ?? 'HEAD'
const sync = opt('--sync')
const push = args.includes('--push')
// api.github.com, or — tests only — a loopback http stub; anything else is refused before any work,
// because the API token goes wherever this points.
const api = apiBase(opt('--api'))
if (args.includes('--replace'))
  throw new Error('--replace (force-push) is gone: main is protected; publish with --sync <url> --push')
if (args.includes('--remote'))
  throw new Error('--remote (initial publication straight to main) is gone: publish with --sync <url> --push')
if (!out) throw new Error('--out <empty dir> is required')
if (existsSync(out) && readdirSync(out).length) throw new Error(`${out} is not empty`)
if (push && !sync) throw new Error('--push needs --sync <url>')

/** `owner/repo` out of a GitHub URL (https or ssh), or undefined. @param {string} url */
const repoOf = (url) =>
  url
    .match(/github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
    ?.slice(1, 3)
    .join('/')

/** The API token, before any work: a sync that cannot merge its PR must not start. */
function apiToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  const gh = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (gh.error)
    throw new Error(
      '--push needs a GitHub API token: set GITHUB_TOKEN (contents + pull requests write), or log in with `gh auth login`; gh is not installed'
    )
  const token = gh.status === 0 ? gh.stdout.trim() : ''
  if (!token)
    throw new Error(
      '--push needs a GitHub API token: set GITHUB_TOKEN, or log in with `gh auth login` (`gh auth token` gave none)'
    )
  return token
}

const repo = sync && push ? (opt('--repo') ?? repoOf(sync)) : undefined
if (sync && push && !repo) throw new Error(`cannot tell owner/repo from ${sync}: pass --repo <owner/repo>`)
const token = sync && push ? apiToken() : undefined

const run = (cmd, argv, cwd) =>
  execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString()
const sha = run('git', ['rev-parse', '--short', ref]).trim()

/** Lay the export of `ref` into `out` and scan it: nothing leaves unless the exported tree is clean. */
function exportTree() {
  const tar = execFileSync('git', ['archive', ref, PKG], { maxBuffer: 512 * 1024 * 1024 })
  execFileSync('tar', ['-x', '-C', out, `--strip-components=${PKG.split('/').length}`], { input: tar })
  for (const f of TCH_ONLY) rmSync(path.join(out, f), { force: true })
  const pkgFile = path.join(out, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  delete pkg.scripts['test:ci']
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  writeFileSync(path.join(out, '.gitignore'), 'node_modules/\n.env\n.env.*\n!.env.example\ndata/\n*.tgz\n')
  rmSync(path.join(out, 'package-lock.json'), { force: true })
  run('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], out)
  run('node', ['scripts/check-public.mjs', '--dir', '.'], out)
}

/**
 * Reset `out` to origin's main and add the one sync commit on top. Returns false when the public
 * main already matches the export.
 */
function syncCommit() {
  run('git', ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main'], out)
  run('git', ['reset', '-q', '--hard', 'refs/remotes/origin/main'], out)
  run('git', ['clean', '-qfdx'], out)
  // Every tracked file goes; the export below brings back what still exists.
  for (const f of run('git', ['ls-files', '-z'], out).split('\0').filter(Boolean))
    rmSync(path.join(out, f), { force: true })
  exportTree()
  run('git', ['add', '-A'], out)
  if (!run('git', ['status', '--porcelain'], out).trim()) return false
  run('git', [...AUTHOR, 'commit', '-q', '-m', `chore: sync from upstream at ${sha}`], out)
  run('node', ['scripts/check-public.mjs', '--history', 'HEAD~1..HEAD'], out)
  return true
}

if (sync) {
  // Before any work: a target without main is not created from here (that would be a push to main).
  if (!run('git', ['ls-remote', '--heads', sync, 'main']).trim())
    throw new Error(`${sync} has no main: create it by hand (with branch protection), then run --sync again`)
  run('git', ['clone', '-q', '--branch', 'main', sync, out])
  const publisher =
    push && repo && token
      ? makePublisher({
          dir: out,
          repo,
          token,
          api,
          log: (l) => console.log(l)
        })
      : undefined
  // A maintainer's run that died between opening its PR and merging it left that PR open: close it
  // (never merge it) and delete its branch, so this run publishes fresh beside nothing stale.
  if (publisher) await publisher.settleLeftovers(BRANCH_PREFIX)
  for (let attempt = 1; ; attempt++) {
    if (!syncCommit()) {
      console.log(`nothing to sync: the public main already matches ${PKG}@${sha}`)
      process.exit(0)
    }
    console.log(`synced ${PKG}@${sha} onto the public main in ${out}`)
    if (!publisher) break
    const exportSha = run('git', ['rev-parse', '--short=12', 'HEAD'], out).trim()
    const base = run('git', ['rev-parse', 'refs/remotes/origin/main'], out).trim()
    const result = await publisher.publish({
      branch: `${BRANCH_PREFIX}${sha}/${exportSha}`,
      base,
      title: `chore: sync from upstream at ${sha}`,
      body: `Export of \`${PKG}\` at ${sha}, published by scripts/wo-export-public.mjs.`,
      last: attempt > 1
    })
    if (result === MERGED) {
      console.log(`merged into main of ${repo}`)
      break
    }
  }
} else {
  // Look only: the export as a fresh local repository, for reading. Nothing is pushed.
  mkdirSync(out, { recursive: true })
  exportTree()
  run('git', ['init', '-q', '-b', 'main'], out)
  run('git', ['add', '-A'], out)
  run('git', [...AUTHOR, 'commit', '-q', '-m', 'feat: initial public tree of website-opportunities'], out)
  run('node', ['scripts/check-public.mjs', '--history', 'HEAD'], out)
  console.log(`exported ${PKG}@${sha} to ${out}`)
}
