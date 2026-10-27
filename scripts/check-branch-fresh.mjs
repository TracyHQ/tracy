#!/usr/bin/env node
/**
 * Branch freshness: how far a branch has fallen behind the shared branch it will merge into.
 *
 *   node scripts/check-branch-fresh.mjs                 # this checkout's HEAD against origin/develop; warns only
 *   node scripts/check-branch-fresh.mjs --ci [payload]  # a pull_request payload; exits 1 when too far behind
 *
 * WHY IT EXISTS. Many agent sessions work on this repo at once, and `develop` takes roughly 40–70
 * first-parent commits a day (measured 20/09–03/10/2026). A branch cut a day ago is coded against a
 * tree that no longer exists: it collides at merge time, or it rebuilds something another session
 * already shipped — grep only searches the tree you stand in. Measured 03/10/2026: the Add site
 * popup grew a second hard-coded questionnaire beside the Site questions sets.
 *
 * WHY "FIRST-PARENT" COMMITS. Plain commit counts jump with every merged PR (111 to 756 a day, same
 * fortnight), because a merge drags its whole branch in. Counting along the first parent counts
 * each merge or direct push once, which is the unit that actually moves `develop`.
 *
 * WHY WARN ON PUSH AND FAIL ON READY. A push to a personal branch is how unfinished work is saved;
 * refusing it teaches `--no-verify`, which then skips every other pre-push check too. Ready for
 * review is the moment the code is about to reach `develop` and a deploy, so that is where it goes
 * red. CI cannot block a merge here (free plan, no branch protection — `gates-ci-runners.md`),
 * so the red job is the signal and `pr-merge` §3 is the rule that makes people listen to it.
 *
 * WHY THE WARNING NAMES FILES. "80 commits behind" is a number people scroll past. "#780 already
 * changed `apps/tracy-web/src/sites/route.js`, which you are also changing" is a reason to stop.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** First-parent commits behind before a branch counts as stale: about one working day of `develop`. */
export const FRESHNESS_LIMIT = 50

/** Overlapping commits listed in a message; the rest are summed up in one line. */
const MAX_LISTED = 10

/**
 * 🔒 Staging is switched OFF for the beta (12/10/2026): `main` takes a pull request from
 * any branch of this repository again (`develop` → `main`), and the `staging` branch and host stay as
 * they are, unused. Set back to `true` to require `develop` → `staging` → `main`; the rule below and
 * its tests are kept whole for that day.
 */
export const STAGING_IN_RELEASE_PATH = false

/** Head branches of a release PR that stand in for `staging` (see `releasePathProblem`). */
export const RELEASE_BRANCH = /^release\/staging-to-main-[0-9a-z][0-9a-z-]*$/

/**
 * The release path (06/10/2026): `develop` → `staging` → `main`. A pull request into `main` comes
 * from `staging` of this repository and from nothing else, hotfixes included — they land on
 * `staging` first, are tested there, and reach `main` with the rest. That is also what lets `main`
 * reuse the images staging ran: a `main` whose tree equals the tested `staging` has the same image
 * context fingerprints, so its build is skipped and prod1 gets the bytes staging was tested on.
 * Checked here because this job already reads every ready pull request into a shared branch, and
 * the free plan has no branch protection to say it instead.
 *
 * 🔒 `release/staging-to-main-*` MAY STAND IN FOR `staging` AS THE HEAD, because the repository
 * deletes the head branch of every merged PR (`delete_branch_on_merge`, a repo-wide setting the free
 * plan cannot exempt a branch from) and a deleted `staging` blocks every release after it (measured
 * 06/10/2026, #982). The name alone would be a way round the rule, so such a head must carry exactly
 * the tree of `staging` (`sameTreeAsStaging`): the bytes that were tested, nothing added.
 * @param {{base: string, head: string, sameRepo: boolean, sameTreeAsStaging?: boolean | null, staging?: boolean}} pr
 * @returns {string | null} why the pull request is on the wrong path, or null.
 */
export function releasePathProblem({
  base,
  head,
  sameRepo,
  sameTreeAsStaging = null,
  staging = STAGING_IN_RELEASE_PATH
}) {
  if (base !== 'main') return null
  if (!staging) {
    if (sameRepo) return null
    return `a pull request into main comes from a branch of this repository, not from a fork ("${head}").`
  }
  if (head === 'staging' && sameRepo) return null
  if (RELEASE_BRANCH.test(head) && sameRepo) {
    if (sameTreeAsStaging === true) return null
    return `"${head}" does not carry the tree of staging${sameTreeAsStaging === false ? '' : ' (staging could not be read)'}. A release branch must point at the commit of staging that was tested; recreate it with: git push origin origin/staging:refs/heads/${head}`
  }
  return `a pull request into main comes from staging only, not from "${head}". Open it into staging, test it on the staging host, then open staging → main (from a release/staging-to-main-<date> branch pointing at staging).`
}

/**
 * Which of the base's new commits touch files this branch also changes.
 * @param {{ subject: string, files: string[] }[]} baseCommits - first-parent commits on the base since the fork point.
 * @param {string[]} branchFiles - paths this branch changes since the fork point.
 * @returns {{ subject: string, files: string[] }[]} each overlapping commit, with only the shared paths.
 */
export function overlapsOf(baseCommits, branchFiles) {
  const mine = new Set(branchFiles)
  return baseCommits
    .map(({ subject, files }) => ({ subject, files: files.filter((file) => mine.has(file)) }))
    .filter(({ files }) => files.length > 0)
}

/**
 * What a distance from the base means.
 * @param {{ behind: number, base: string, overlaps: { subject: string, files: string[] }[],
 *   mode: 'push' | 'ci', limit?: number }} facts - measured distance, base name, overlaps, where it runs.
 * @returns {{ level: 'ok' | 'warn' | 'fail', message: string | null }} the verdict.
 */
export function freshnessVerdict({ behind, base, overlaps, mode, limit = FRESHNESS_LIMIT }) {
  if (behind <= limit && overlaps.length === 0) return { level: 'ok', message: null }
  const lines = []
  if (behind > limit) {
    lines.push(
      `This branch is ${behind} merges behind ${base} (limit ${limit}, about one working day).`,
      `Merge it in and re-run the tests: git fetch origin && git merge ${base}`
    )
  } else {
    lines.push(`This branch is ${behind} merges behind ${base}; some of them touch your files.`)
  }
  if (overlaps.length > 0) {
    lines.push('Already on the base, changing files this branch also changes:')
    for (const { subject, files } of overlaps.slice(0, MAX_LISTED)) {
      lines.push(`  - ${subject}`, ...files.slice(0, 3).map((file) => `      ${file}`))
    }
    if (overlaps.length > MAX_LISTED) lines.push(`  … and ${overlaps.length - MAX_LISTED} more`)
    lines.push('Read them before going on: someone may have done part of this work already.')
  }
  const level = mode === 'ci' && behind > limit ? 'fail' : 'warn'
  return { level, message: lines.join('\n') }
}

/** @param {string[]} args @returns {string} stdout, trimmed. */
function git(args) {
  // A release pull request lists tens of thousands of files; the default 1 MiB buffer died with
  // ENOBUFS on #1113 (staging → main, 10/10/2026) before the gate judged anything.
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

/**
 * Parse `git log --first-parent --name-only --format=%x00%s` into commits.
 * @param {string} raw - the log output.
 * @returns {{ subject: string, files: string[] }[]} one entry per commit.
 */
export function parseLog(raw) {
  return raw
    .split('\0')
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const [subject, ...files] = chunk.split('\n').filter((line) => line.trim() !== '')
      return { subject: subject.trim(), files: files.map((file) => file.trim()) }
    })
}

/**
 * Measure a head against a base, from git alone.
 * @param {string} head - commit-ish of the branch.
 * @param {string} base - commit-ish of the shared branch, e.g. `origin/develop`.
 * @returns {{ behind: number, overlaps: { subject: string, files: string[] }[] }} the facts.
 */
export function measure(head, base) {
  const behind = Number(git(['rev-list', '--first-parent', '--count', `${head}..${base}`]))
  if (behind === 0) return { behind, overlaps: [] }
  const forkPoint = git(['merge-base', head, base])
  const branchFiles = git(['diff', '--name-only', forkPoint, head]).split('\n').filter(Boolean)
  // `--first-parent` makes git diff each merge against its first parent, so a merged PR lists the
  // files it brought in, once.
  const baseCommits = parseLog(
    git(['log', '--first-parent', '--name-only', '--format=%x00%s', `${forkPoint}..${base}`])
  )
  return { behind, overlaps: overlapsOf(baseCommits, branchFiles) }
}

/**
 * The pre-push half: fetch the base, measure HEAD-to-be-pushed, print a warning. Never throws and
 * never blocks: a fetch that fails (offline, slow network) measures against what is already here.
 * @param {string} localSha - the commit being pushed.
 * @param {string} [baseBranch] - the shared branch to measure against.
 * @returns {string | null} the warning printed, if any.
 */
export function warnOnPush(localSha, baseBranch = 'develop') {
  try {
    try {
      execFileSync('git', ['fetch', '--quiet', 'origin', baseBranch], {
        cwd: ROOT,
        stdio: 'ignore',
        timeout: 15_000
      })
    } catch {
      process.stderr.write(
        `\n⚠ pre-push: could not fetch origin/${baseBranch}; measuring against the copy already here.\n`
      )
    }
    const base = `origin/${baseBranch}`
    const verdict = freshnessVerdict({ ...measure(localSha, base), base, mode: 'push' })
    if (verdict.message !== null) process.stderr.write(`\n⚠ ${verdict.message}\n`)
    return verdict.message
  } catch {
    return null
  }
}

/**
 * Do two commits carry the same tree? null when either cannot be read (a missing ref is an unknown,
 * never a pass).
 * @param {string} a
 * @param {string} b
 * @returns {boolean | null}
 */
function treeEquals(a, b) {
  try {
    const tree = (ref) =>
      execFileSync('git', ['rev-parse', `${ref}^{tree}`], { cwd: ROOT, encoding: 'utf8' }).trim()
    return tree(a) === tree(b)
  } catch {
    return null
  }
}

/**
 * The CI half: read a pull_request payload, measure its head against its base.
 * @param {string | undefined} payloadPath - path to the event payload.
 * @returns {number} exit code.
 */
function mainCi(payloadPath) {
  if (payloadPath === undefined) {
    process.stderr.write('check-branch-fresh: no payload — pass a path, or set GITHUB_EVENT_PATH\n')
    return 1
  }
  const pr = JSON.parse(readFileSync(payloadPath, 'utf8')).pull_request
  if (pr === undefined) {
    process.stdout.write('check-branch-fresh: not a pull_request event; nothing to measure.\n')
    return 0
  }
  if (pr.draft === true) {
    process.stdout.write('check-branch-fresh: draft pull request; measured only once it is ready.\n')
    return 0
  }
  const path = releasePathProblem({
    base: pr.base.ref,
    head: pr.head.ref,
    sameRepo: pr.head.repo?.full_name === pr.base.repo?.full_name,
    sameTreeAsStaging: RELEASE_BRANCH.test(pr.head.ref) ? treeEquals(pr.head.sha, 'origin/staging') : null
  })
  if (path !== null) {
    process.stderr.write(`check-branch-fresh: ${path}\n`)
    return 1
  }
  const base = `origin/${pr.base.ref}`
  const facts = measure(pr.head.sha, base)
  const verdict = freshnessVerdict({ ...facts, base, mode: 'ci' })
  process.stdout.write(
    `check-branch-fresh: ${facts.behind} merges behind ${base} (limit ${FRESHNESS_LIMIT}).\n`
  )
  if (verdict.message !== null) {
    const out = verdict.level === 'fail' ? process.stderr : process.stdout
    out.write(`\n${verdict.message}\n`)
  }
  return verdict.level === 'fail' ? 1 : 0
}

/** @returns {number} exit code. */
function mainLocal() {
  const base = 'origin/develop'
  const verdict = freshnessVerdict({ ...measure('HEAD', base), base, mode: 'push' })
  process.stdout.write(verdict.message ?? `Up to date enough with ${base}.\n`)
  process.stdout.write('\n')
  return 0
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const ci = process.argv.includes('--ci')
  const rest = process.argv.slice(2).filter((arg) => arg !== '--ci')
  process.exit(ci ? mainCi(rest[0] ?? process.env.GITHUB_EVENT_PATH) : mainLocal())
}
