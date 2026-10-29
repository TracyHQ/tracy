import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CI_REPOSITORY } from './ci/ci-repository.mjs'
import { githubRead } from './ci/github-read.mjs'
import { WORKFLOWS } from './check-pr-merge.mjs'

export const REPO = CI_REPOSITORY
const SHA = /^[0-9a-f]{40}$/

export function eligible(pr) {
  return (
    Number.isSafeInteger(pr?.number) &&
    pr.number > 0 &&
    pr.state === 'open' &&
    pr.draft === false &&
    !pr.merged &&
    pr.base?.ref === 'develop' &&
    pr.base.repo?.full_name === REPO &&
    pr.head?.repo?.full_name === REPO &&
    SHA.test(pr.head.sha) &&
    pr.mergeable === true &&
    pr.mergeable_state === 'clean' &&
    Array.isArray(pr.requested_reviewers) &&
    pr.requested_reviewers.length === 0 &&
    Array.isArray(pr.requested_teams) &&
    pr.requested_teams.length === 0
  )
}

export function changesRequested(reviews) {
  if (!Array.isArray(reviews)) throw new Error('Incomplete review response')
  const latest = new Map()
  for (const review of reviews) {
    if (!Number.isSafeInteger(review.id) || !Number.isSafeInteger(review.user?.id))
      throw new Error('Incomplete review identity')
    if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue
    const old = latest.get(review.user.id)
    if (!old || old.id < review.id) latest.set(review.user.id, review)
  }
  return [...latest.values()].some((review) => review.state === 'CHANGES_REQUESTED')
}

const TRUSTED_REVIEWERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])

/**
 * Only a person of the team is merged automatically: a `User` (never a `Bot` such as Dependabot or a
 * GitHub App agent) whose association is write-level. Returns the refusal status, or null.
 */
export function authorRefusal(pr) {
  if (!pr?.user || typeof pr.user.type !== 'string' || typeof pr.author_association !== 'string')
    return 'author-missing'
  if (pr.user.type !== 'User') return 'author-not-human'
  if (!TRUSTED_REVIEWERS.has(pr.author_association)) return 'author-not-team'
  return null
}

/**
 * Paths whose change must be read by a person. For a `pull_request` run GitHub executes the workflow
 * files of the PR head, and those run the PR's own copy of each gate script, so a PR that rewrites
 * either can turn its own gate green. The set is CODEOWNERS, every repository script a run step of
 * the five gate workflows calls (read from the trusted checkout, so a new gate script is covered
 * without editing a list) and this floor, kept whatever those files say. `scripts/ci/` is what the
 * PR's own CI runs to plan its rows; `turbo.json` decides which tasks and inputs run.
 *
 * Still trusted to the team authors this script requires: test files, app code and the package.json
 * scripts a gate reaches (`pnpm build:check`, `pnpm test`), which are not listed here.
 */
export const ALWAYS_SENSITIVE = [
  '/.github/',
  '/scripts/ci/',
  '/scripts/lib/',
  '/scripts/check-*',
  '/scripts/auto-merge-develop.mjs',
  '/scripts/check-pr-merge.mjs',
  '/turbo.json'
]

/** The bodies of the `run:` steps of a workflow text, block scalars included. */
function runSteps(text) {
  const lines = text.split('\n')
  const steps = []
  for (let i = 0; i < lines.length; i++) {
    const step = /^(\s*)(?:-\s+)?run:\s*(.*)$/.exec(lines[i])
    if (!step) continue
    if (!/^[|>][-+]?\s*$/.test(step[2])) {
      steps.push(step[2])
      continue
    }
    const body = []
    while (i + 1 < lines.length && (!lines[i + 1].trim() || lines[i + 1].search(/\S/) > step[1].length))
      body.push(lines[++i])
    steps.push(body.join('\n'))
  }
  return steps
}

/**
 * A repository path under `scripts/` in a run step, whatever command precedes it (`node`, `tsx`,
 * `bash`, `python3`, a bare `./scripts/x.sh`, an argument such as `--config scripts/x.json`), bare or
 * quoted, optionally behind `./`, `$GITHUB_WORKSPACE/` or `${{ github.workspace }}/`.
 */
const SCRIPT_TOKEN =
  /(?:^|[\s;&|()=<>"'`])(?:\.\/|\$GITHUB_WORKSPACE\/|\$\{GITHUB_WORKSPACE\}\/|\$\{\{\s*github\.workspace\s*\}\}\/)?(scripts\/[\w./-]*[\w-])/g

/**
 * Every repository path under `scripts/` the run steps of these workflow texts name. Shell comment
 * lines are skipped. None at all means the reading is broken: fail closed.
 */
export function gateScripts(workflowTexts) {
  const scripts = new Set()
  for (const text of workflowTexts)
    for (const step of runSteps(text))
      for (const line of step.split('\n')) {
        if (line.trim().startsWith('#')) continue
        for (const token of line.matchAll(SCRIPT_TOKEN)) {
          const path = posix.normalize(token[1])
          if (path.startsWith('scripts/')) scripts.add(path)
        }
      }
  if (scripts.size === 0) throw new Error('No gate script found in the gate workflows')
  return [...scripts].sort()
}

/** The path patterns of a CODEOWNERS text (gitignore-like), the gate scripts, plus ALWAYS_SENSITIVE. */
export function sensitivePatterns(codeowners = '', scripts = []) {
  const patterns = codeowners
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim().split(/\s+/)[0])
    .filter(Boolean)
  return [...new Set([...ALWAYS_SENSITIVE, ...patterns, ...scripts.map((path) => `/${path}`)])]
}

/** The sensitive set from the trusted default-branch checkout at `root`. */
export function trustedSensitivePatterns(root = new URL('../', import.meta.url)) {
  const codeowners = new URL('.github/CODEOWNERS', root)
  const workflows = WORKFLOWS.map(({ file }) =>
    readFileSync(new URL(`.github/workflows/${file}`, root), 'utf8')
  )
  return sensitivePatterns(
    existsSync(codeowners) ? readFileSync(codeowners, 'utf8') : '',
    gateScripts(workflows)
  )
}

function patternRegExp(pattern) {
  const anchored = pattern.startsWith('/') || pattern.replace(/\/$/, '').includes('/')
  const body = pattern
    .replace(/^\//, '')
    .replace(/\/$/, '/**')
    .split(/(\*\*\/?|\*|\?)/)
    .map((part) =>
      part === '**/'
        ? '(?:.*/)?'
        : part === '**'
          ? '.*'
          : part === '*'
            ? '[^/]*'
            : part === '?'
              ? '[^/]'
              : part.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    )
    .join('')
  // A pattern naming a directory also covers everything below it.
  return new RegExp(`${anchored ? '^' : '(?:^|/)'}${body}(?:/.*)?$`)
}

/** The first changed path (new or old name) that matches a sensitive pattern, or null. */
export function sensitiveFile(files, patterns) {
  const tests = patterns.map(patternRegExp)
  for (const file of files)
    for (const path of [file.filename, file.previous_filename])
      if (typeof path === 'string' && tests.some((re) => re.test(path))) return path
  return null
}

/** The files API lists at most 3000 files; a listing that reaches it may be cut short. */
export const FILES_LIMIT = 3000

/**
 * The PR's changed files, bracketed by a read of the PR on `sha` so the listing belongs to that head.
 * Returns `{ files }` or `{ status }`; anything incomplete fails closed.
 */
export async function listFiles(get, number, sha) {
  const files = await get(`repos/${REPO}/pulls/${number}/files?per_page=100`)
  const after = await get(`repos/${REPO}/pulls/${number}`)
  if (after?.head?.sha !== sha) return { status: 'changed-after-check' }
  if (
    !Array.isArray(files) ||
    files.length >= FILES_LIMIT ||
    !Number.isSafeInteger(after.changed_files) ||
    after.changed_files !== files.length ||
    files.some((file) => typeof file?.filename !== 'string')
  )
    return { status: 'files-incomplete' }
  return { files }
}

const fileKey = (files) =>
  JSON.stringify(files.map((file) => [file.filename, file.previous_filename ?? null]).sort())

/**
 * A valid approval of exactly this head: some reviewer with write-level association whose latest
 * decision is APPROVED on `sha`, and nobody's latest decision is CHANGES_REQUESTED. An approval of an
 * older head does not count, so a push after the approval needs a new one.
 */
export function approvedOnHead(reviews, sha) {
  if (!Array.isArray(reviews)) throw new Error('Incomplete review response')
  const latest = new Map()
  for (const review of reviews) {
    if (!Number.isSafeInteger(review.id) || !Number.isSafeInteger(review.user?.id))
      throw new Error('Incomplete review identity')
    if (!['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) continue
    const old = latest.get(review.user.id)
    if (!old || old.id < review.id) latest.set(review.user.id, review)
  }
  const decisions = [...latest.values()]
  if (decisions.some((review) => review.state === 'CHANGES_REQUESTED')) return false
  return decisions.some(
    (review) =>
      review.state === 'APPROVED' &&
      review.commit_id === sha &&
      TRUSTED_REVIEWERS.has(review.author_association)
  )
}

export function recoveryCandidates(pulls, now = Date.now()) {
  const numbers = [
    ...new Set(
      pulls
        .filter(
          (pr) =>
            pr.state === 'open' &&
            pr.draft === false &&
            pr.base?.ref === 'develop' &&
            pr.head?.repo?.full_name === REPO &&
            Number.isSafeInteger(pr.number) &&
            pr.number > 0
        )
        .map((pr) => pr.number)
    )
  ].sort((a, b) => a - b)
  if (numbers.length <= 20) return numbers
  const offset = (Math.floor(now / 600_000) * 20) % numbers.length
  return Array.from({ length: 20 }, (_, index) => numbers[(offset + index) % numbers.length])
}

const MERGEABILITY_READS = 4
const MERGEABILITY_WAIT_MS = 3_000
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GitHub answers `mergeable: null` while it computes mergeability in the background, and the first
 * read after the base branch moves is what starts that job. Judging that first answer turned a green
 * PR away until the next CI event or the (sparse) scheduled run, so read again a few times first.
 */
export async function readPull(get, number, wait = pause) {
  let pr = await get(`repos/${REPO}/pulls/${number}`)
  for (let read = 1; read < MERGEABILITY_READS && pr?.state === 'open' && pr.mergeable === null; read++) {
    await wait(MERGEABILITY_WAIT_MS)
    pr = await get(`repos/${REPO}/pulls/${number}`)
  }
  return pr
}

export async function mergeCandidates({
  numbers,
  get,
  run,
  dryRun = true,
  readToken,
  mergeToken,
  requireApproval = false,
  wait = pause,
  sensitive = trustedSensitivePatterns()
}) {
  if (!dryRun && (!mergeToken || mergeToken === readToken))
    throw new Error('A separate GitHub App merge token is required')
  const results = []
  for (const number of numbers) {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid pull request number')
    const pr = await readPull(get, number, wait)
    if (pr?.state === 'open' && pr.mergeable === null) {
      results.push({ pr: number, status: 'mergeability-unknown' })
      continue
    }
    const firstReviews = await get(`repos/${REPO}/pulls/${number}/reviews?per_page=100`)
    if (!eligible(pr) || changesRequested(firstReviews)) {
      results.push({ pr: number, status: 'not-eligible' })
      continue
    }
    const author = authorRefusal(pr)
    if (author) {
      results.push({ pr: number, status: author })
      continue
    }
    if (requireApproval && !approvedOnHead(firstReviews, pr.head.sha)) {
      results.push({ pr: number, status: 'not-approved' })
      continue
    }
    const listed = await listFiles(get, number, pr.head.sha)
    if (listed.status) {
      results.push({ pr: number, status: listed.status })
      continue
    }
    const touched = sensitiveFile(listed.files, sensitive)
    if (touched) {
      results.push({ pr: number, status: 'sensitive-files', file: touched })
      continue
    }
    const args = ['scripts/check-pr-merge.mjs', '--repo', REPO, '--pr', String(number), '--base', 'develop']
    const verdict = await run('node', args, readToken)
    if (verdict.code !== 0) {
      results.push({ pr: number, status: 'checks-not-confirmed' })
      continue
    }
    const expected = await run('node', [...args, '--expected-head', verdict.out.trim()], readToken)
    const sha = expected.out.trim()
    if (expected.code !== 0 || !SHA.test(sha) || sha !== pr.head.sha) {
      results.push({ pr: number, status: 'head-not-confirmed' })
      continue
    }
    // Recheck review requests and mergeability after the gate; never use the list snapshot to merge.
    const current = await readPull(get, number, wait)
    const reviews = await get(`repos/${REPO}/pulls/${number}/reviews?per_page=100`)
    if (
      !eligible(current) ||
      current.head.sha !== sha ||
      changesRequested(reviews) ||
      (requireApproval && !approvedOnHead(reviews, sha))
    ) {
      results.push({ pr: number, status: 'changed-after-check' })
      continue
    }
    const authorNow = authorRefusal(current)
    if (authorNow) {
      results.push({ pr: number, status: authorNow })
      continue
    }
    // A push between the reads must not slip a CI file through: list again, for this exact head.
    const relisted = await listFiles(get, number, sha)
    if (relisted.status) {
      results.push({ pr: number, status: relisted.status })
      continue
    }
    const late = sensitiveFile(relisted.files, sensitive)
    if (late) {
      results.push({ pr: number, status: 'sensitive-files', file: late })
      continue
    }
    if (fileKey(relisted.files) !== fileKey(listed.files)) {
      results.push({ pr: number, status: 'changed-after-check' })
      continue
    }
    // Reviews may require several pages. Refresh all CI evidence after those reads too.
    const latestVerdict = await run('node', args, readToken)
    if (latestVerdict.code !== 0) {
      results.push({ pr: number, status: 'checks-not-confirmed' })
      continue
    }
    const fresh = await run('node', [...args, '--expected-head', latestVerdict.out.trim()], readToken)
    if (fresh.code !== 0 || fresh.out.trim() !== sha) {
      results.push({ pr: number, status: 'verdict-expired' })
      continue
    }
    if (dryRun) {
      results.push({ pr: number, status: 'would-merge', head: sha })
      continue
    }
    const merged = await run(
      'gh',
      ['pr', 'merge', String(number), '--repo', REPO, '--merge', '--match-head-commit', sha],
      mergeToken
    )
    if (merged.code !== 0)
      throw new Error(`GitHub refused merge of PR #${number}; no retry without a fresh gate`)
    results.push({ pr: number, status: 'merged', head: sha })
  }
  return results
}

function command(bin, args, token) {
  const env = { ...process.env, GH_TOKEN: token }
  delete env.AUTO_MERGE_APP_TOKEN
  try {
    return {
      code: 0,
      out: execFileSync(bin, args, {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 2_000_000,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    }
  } catch (error) {
    return { code: typeof error.status === 'number' ? error.status : 3, out: '' }
  }
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== REPO) throw new Error('Unexpected repository')
  const readToken = process.env.GH_TOKEN
  if (!readToken) throw new Error('Missing read token')
  const get = async (endpoint) => (await githubRead(endpoint)).json()
  const pages = async (endpoint, limit = 10, capped = false) => {
    const rows = []
    for (let page = 1; page <= limit; page++) {
      const values = await get(`${endpoint}&page=${page}`)
      if (!Array.isArray(values)) throw new Error('Incomplete GitHub list')
      rows.push(...values)
      if (values.length < 100) return rows
    }
    if (capped) return rows
    throw new Error('GitHub list exceeded the pagination limit')
  }
  const requested = process.env.AUTO_MERGE_PR ?? ''
  if (requested && !/^[1-9]\d*$/.test(requested)) throw new Error('Invalid requested PR')
  const dryRun = process.env.AUTO_MERGE_DRY_RUN !== 'false'
  let numbers
  if (requested) numbers = [Number(requested)]
  else if (process.env.GITHUB_EVENT_NAME === 'workflow_run') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const run = event.workflow_run
    if (
      run?.event !== 'pull_request' ||
      run.head_repository?.full_name !== REPO ||
      !Array.isArray(run.pull_requests)
    )
      return
    numbers = run.pull_requests
      .filter((pr) => pr.base?.ref === 'develop' && pr.head?.sha === run.head_sha)
      .map((pr) => pr.number)
  } else numbers = recoveryCandidates(await pages(`repos/${REPO}/pulls?state=open&base=develop&per_page=100`))
  // The files API stops at 3000 files (30 pages); `listFiles` refuses a listing that reaches that.
  const paginatedGet = (endpoint) =>
    endpoint.includes('/reviews?')
      ? pages(endpoint)
      : endpoint.includes('/files?')
        ? pages(endpoint, FILES_LIMIT / 100, true)
        : get(endpoint)
  const results = await mergeCandidates({
    numbers: [...new Set(numbers)],
    get: paginatedGet,
    run: command,
    dryRun,
    readToken,
    mergeToken: process.env.AUTO_MERGE_APP_TOKEN,
    // Repository variable REQUIRE_APPROVAL_FOR_AUTO_MERGE; off by default (docs/references/public-repo-ci.md).
    requireApproval: process.env.REQUIRE_APPROVAL_FOR_AUTO_MERGE === 'true'
  })
  for (const result of results) console.log(JSON.stringify(result))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`auto-merge-develop: ${error.message}`)
    process.exitCode = 1
  })
}
