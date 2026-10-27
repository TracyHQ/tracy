import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CI_REPOSITORY } from './ci/ci-repository.mjs'
import { githubRead } from './ci/github-read.mjs'

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
  wait = pause
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
    if (requireApproval && !approvedOnHead(firstReviews, pr.head.sha)) {
      results.push({ pr: number, status: 'not-approved' })
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
  const pages = async (endpoint) => {
    const rows = []
    for (let page = 1; page <= 10; page++) {
      const values = await get(`${endpoint}&page=${page}`)
      if (!Array.isArray(values)) throw new Error('Incomplete GitHub list')
      rows.push(...values)
      if (values.length < 100) return rows
    }
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
  const paginatedGet = (endpoint) => (endpoint.includes('/reviews?') ? pages(endpoint) : get(endpoint))
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
