/**
 * Which PRs landed in `develop` between `discoveredThrough` (from) and the SHA `T` (to) pinned right
 * after `git fetch` (plan §4.2). `to` is a SHA, never a ref: nothing here re-reads a ref.
 *
 * - `git merge-base --is-ancestor from to` false -> PrRangeError NOT_ANCESTOR (stop the run).
 * - PRs come from `gh pr list --base develop --state merged --search "merged:>=<day before from>"
 *   --limit 300 --json number,mergeCommit,mergedAt,title,author`; a PR is kept only if it has a
 *   `mergedAt` and its `mergeCommit.oid` is in `git rev-list from..to`. This covers merge commits and
 *   squashes alike, and never attributes a commit to an unmerged PR that happens to contain it.
 * - Exactly `limit` rows back -> PrRangeError LIST_TRUNCATED ("the list may be incomplete").
 * - First-parent commits in the range that are no PR's merge commit are "commits without a PR".
 * - A commit whose message says `This reverts commit <sha>` (git revert) or `Reverts <owner>/<repo>#<n>`
 *   (GitHub's revert PR) and points at a PR found here or passed in `queued` marks that PR reverted.
 * - Kind comes from `git diff --name-only <mergeCommit>^1 <mergeCommit>`, never from `gh` (which cuts
 *   file lists at 100).
 *
 * Exports:
 *   class PrRangeError extends Error { code: 'NOT_ANCESTOR' | 'LIST_TRUNCATED' | 'GH_FAILED' }
 *   classifyFiles(files: string[]): { kind: 'blast'|'apps'|'plugin'|'script'|'theme'|'other'|'docs', priority: number }
 *   discoverPrs({ repoDir, from, to, queued? = [], gh? = 'gh', repo? = null, env? = process.env,
 *                 limit? = 300, base? = 'develop' }): {
 *     from, to, searchSince: 'YYYY-MM-DD',
 *     prs: { number, title, author, authorIsBot, mergedAt, mergeCommit, files, kind, priority }[],  // by merge order
 *     directCommits: { sha, subject, files, kind, priority }[],                                    // oldest first
 *     reverted: { number, revertCommit }[],
 *   }
 */
import { execFileSync, spawnSync } from 'node:child_process'

export class PrRangeError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PrRangeError'
    this.code = code
  }
}

// CLAUDE.md §3 blast map, the paths a stand test can reach. Gate scripts, plugin bundles and
// translation files are left out: those are judged by Tracy CI, not on the stand.
const BLAST = [
  /^packages\/ui\/tracy-ui\/src\/tokens\.css$/,
  /^\.npmrc$/,
  /^vendor\/tracy\/deepseek-harness$/,
  /^packages\/bundle\/tracy-cowork\//,
  /^packages\/fleet\/tracy-fleet-operation\/dsh\/profile\/cordis\.patch\.yml$/,
  /^packages\/tools\/tracy-subprocess-docker\/src\/route\.mjs$/,
  /^tch\/profiles\/[^/]+\/package\.json$/,
  /^vendor\/tracy\/dsh-passwords\//,
  /^apps\/tracy-web\/src\/lib\/session\.js$/,
  /^apps\/tracy-web\/src\/lanes\/route\.js$/,
  /^apps\/tracy-web\/src\/identity\/route\.js$/
]
const THEME = /^vendor\/(emdash|wordpress|joomla)\/|quickstart/i
const DOCS = (f) => /\.md$/i.test(f) || /^(docs|tasks)\//.test(f)

const KINDS = [
  ['blast', (f) => BLAST.some((r) => r.test(f))],
  ['apps', (f) => f.startsWith('apps/')],
  ['plugin', (f) => f.startsWith('packages/') || (f.startsWith('vendor/tracy/') && !THEME.test(f))],
  ['script', (f) => /^(scripts|deploy|tch)\//.test(f)],
  ['theme', (f) => THEME.test(f)],
  ['other', (f) => !DOCS(f)]
]

export function classifyFiles(files) {
  for (const [i, [kind, match]] of KINDS.entries()) if (files.some(match)) return { kind, priority: i + 1 }
  return { kind: 'docs', priority: KINDS.length + 1 }
}

export function discoverPrs({
  repoDir,
  from,
  to,
  queued = [],
  gh = 'gh',
  repo = null,
  env = process.env,
  limit = 300,
  base = 'develop'
}) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: repoDir, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim()

  const anc = spawnSync('git', ['merge-base', '--is-ancestor', from, to], { cwd: repoDir, env })
  if (anc.status !== 0) throw new PrRangeError('NOT_ANCESTOR', `${from} is not an ancestor of ${to}`)

  const inRange = new Set(git('rev-list', `${from}..${to}`).split('\n').filter(Boolean))
  const firstParent = git('rev-list', '--first-parent', '--reverse', `${from}..${to}`)
    .split('\n')
    .filter(Boolean)

  // One day of slack: GitHub's merged date is UTC, the commit date may not be.
  const fromDate = new Date(git('show', '-s', '--format=%cI', from))
  const searchSince = new Date(fromDate.getTime() - 86_400_000).toISOString().slice(0, 10)
  const ghArgs = ['pr', 'list', '--base', base, '--state', 'merged', '--search', `merged:>=${searchSince}`]
  ghArgs.push('--limit', String(limit), '--json', 'number,mergeCommit,mergedAt,title,author')
  if (repo) ghArgs.push('--repo', repo)
  const res = spawnSync(gh, ghArgs, { cwd: repoDir, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (res.status !== 0) throw new PrRangeError('GH_FAILED', `gh pr list failed: ${(res.stderr || '').trim()}`)
  const rows = JSON.parse(res.stdout || '[]')
  if (rows.length >= limit)
    throw new PrRangeError('LIST_TRUNCATED', `gh returned ${rows.length} PRs: the list may be incomplete`)

  const filesOf = (sha) => {
    const parents = git('show', '-s', '--format=%P', sha).split(' ').filter(Boolean)
    const out = parents.length
      ? git('diff', '--name-only', parents[0], sha)
      : git('show', '--name-only', '--format=', sha)
    return out.split('\n').filter(Boolean)
  }

  const order = new Map(firstParent.map((s, i) => [s, i]))
  const prs = rows
    .filter((r) => r.mergedAt && r.mergeCommit?.oid && inRange.has(r.mergeCommit.oid))
    .map((r) => {
      const files = filesOf(r.mergeCommit.oid)
      return {
        number: r.number,
        title: r.title,
        author: r.author?.login ?? null,
        authorIsBot: Boolean(r.author?.is_bot),
        mergedAt: r.mergedAt,
        mergeCommit: r.mergeCommit.oid,
        files,
        ...classifyFiles(files)
      }
    })
    .sort((a, b) => (order.get(a.mergeCommit) ?? Infinity) - (order.get(b.mergeCommit) ?? Infinity))

  const prCommits = new Set(prs.map((p) => p.mergeCommit))
  const directCommits = firstParent
    .filter((s) => !prCommits.has(s))
    .map((s) => {
      const files = filesOf(s)
      return { sha: s, subject: git('show', '-s', '--format=%s', s), files, ...classifyFiles(files) }
    })

  const candidates = [...prs, ...queued.filter((q) => !prCommits.has(q.mergeCommit))]
  const reverted = []
  const seen = new Set()
  for (const s of git('rev-list', '--reverse', `${from}..${to}`).split('\n').filter(Boolean)) {
    const body = git('show', '-s', '--format=%B', s)
    const hits = []
    for (const m of body.matchAll(/This reverts commit ([0-9a-f]{7,40})/g)) {
      const target = candidates.find((c) => c.mergeCommit?.startsWith(m[1]))
      if (target) hits.push(target.number)
    }
    for (const m of body.matchAll(/^Reverts [\w.-]+\/[\w.-]+#(\d+)/gm)) {
      const target = candidates.find((c) => c.number === Number(m[1]))
      if (target) hits.push(target.number)
    }
    for (const number of hits) {
      if (seen.has(number)) continue
      seen.add(number)
      reverted.push({ number, revertCommit: s })
    }
  }

  return { from, to, searchSince, prs, directCommits, reverted }
}
