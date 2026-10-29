#!/usr/bin/env node
/**
 * Fails when CodeQL scanning of `develop` or `main` has stopped, not merely when a branch was quiet.
 *
 *   · `develop` — `codeql.yml` analyzes every push, and nothing else: a develop with no new commits
 *     gets no new analysis, and that is fine. What must exist is an analysis OF THE HEAD COMMIT
 *     (`commit_sha`), in every category, at any age. Stale = none exists although the head was
 *     committed more than `DEVELOP_GRACE_HOURS` ago (its committer date: the REST API gives no push
 *     time, and a merge made on GitHub is committed when it is pushed). A younger head may still be
 *     queued or running. Comparing dates instead would stay green forever after scanning stopped on a
 *     commit made shortly before the head.
 *
 *     Every push to `develop` starts `analyze` in all three categories: no `paths` filter on the
 *     trigger, `paths-ignore` only narrows what is scanned, and pushes are never cancelled. Two
 *     things leave a pushed commit unanalyzed, and neither touches the head: a newer push replaces a
 *     push's run while it is still pending (one concurrency group per ref; the newest push always
 *     keeps its run, at worst queued behind one running scan, which the grace covers), and only the
 *     pushed head of a push is analyzed, never the commits under it. A head commit whose message
 *     carries `[skip ci]` (or `[ci skip]`, `[no ci]`, `[skip actions]`, `[actions skip]`) starts no
 *     workflow at all; nothing in this repository writes one, so it turns red and the message says
 *     so: push again without it.
 *   · `main` — the default branch, which also gets the weekly scan. Stale = a category's newest
 *     analysis is more than `MAIN_MAX_AGE_DAYS` old.
 *
 * A broken scan, `codeql.yml` switched off, or its uploads rejected (default setup turned back on does
 * that) turns nothing red by itself. This runs from its own workflow (`codeql-freshness.yml`) so a
 * broken `codeql.yml` cannot hide it.
 *
 *   GH_TOKEN=… node scripts/ci/codeql-freshness.mjs
 *
 * Fails closed: a missing category, an API error, a token without `security-events: read`, or an
 * unreadable answer is a failure with the reason, never a pass.
 */
import { fileURLToPath } from 'node:url'
import { CI_REPOSITORY } from './ci-repository.mjs'
import { githubJson, githubRead } from './github-read.mjs'

/** The `category:` values `codeql.yml` uploads; keep in step with its matrix. */
export const CATEGORIES = ['/language:javascript-typescript', '/language:python', '/language:actions']
/** How long after its commit the develop head may still be waiting for its analysis. */
export const DEVELOP_GRACE_HOURS = 24
/** How old a category's newest main analysis may be; the weekly scan refreshes it every 7 days. */
export const MAIN_MAX_AGE_DAYS = 8
export const DEVELOP = 'refs/heads/develop'
export const MAIN = 'refs/heads/main'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const PER_PAGE = 100
const MAX_PAGES = 10
const MAX_BYTES = 4_000_000

/**
 * The newest analysis date of each category, from analyses in any order.
 * @param {Array<{ category?: string, created_at?: string }>} analyses
 * @returns {Map<string, Date>}
 */
export function latestByCategory(analyses) {
  const latest = new Map()
  for (const analysis of analyses) {
    const created = new Date(analysis?.created_at ?? NaN)
    if (typeof analysis?.category !== 'string' || Number.isNaN(created.getTime()))
      throw new Error('Unreadable code-scanning analysis in the API answer')
    const old = latest.get(analysis.category)
    if (!old || old < created) latest.set(analysis.category, created)
  }
  return latest
}

/**
 * The categories whose newest analysis is missing or older than `cutoff` (ms).
 * @param {Map<string, Date>} latest
 * @returns {Array<{ category: string, last: Date | null }>}
 */
export function staleCategories(latest, cutoff, categories = CATEGORIES) {
  return categories
    .map((category) => ({ category, last: latest.get(category) ?? null }))
    .filter(({ last }) => last === null || last.getTime() < cutoff)
}

/**
 * Reads the CodeQL analyses of `ref`, newest first, until `isComplete(analyses)` holds or a whole page
 * is older than `cutoff` (an older analysis cannot change the verdict).
 * @param {(path: string) => Promise<unknown>} getJson
 * @param {(analyses: unknown[]) => boolean} isComplete
 */
export async function readAnalyses(getJson, ref, cutoff, isComplete) {
  const analyses = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({
      ref,
      tool_name: 'CodeQL',
      sort: 'created',
      direction: 'desc',
      per_page: String(PER_PAGE),
      page: String(page)
    })
    const batch = await getJson(`repos/${CI_REPOSITORY}/code-scanning/analyses?${query}`)
    if (!Array.isArray(batch)) throw new Error('Code-scanning analyses answer is not a list')
    analyses.push(...batch)
    latestByCategory(analyses) // throws on an unreadable analysis before it can decide anything
    if (batch.length < PER_PAGE || isComplete(analyses)) break
    if (batch.every((a) => new Date(a.created_at).getTime() < cutoff)) break
  }
  return analyses
}

/**
 * The categories with an analysis of commit `sha`.
 * @param {Array<{ category?: string, commit_sha?: string }>} analyses
 * @returns {Set<string>}
 */
export function categoriesAnalyzedAt(analyses, sha) {
  const categories = new Set()
  for (const analysis of analyses) {
    if (typeof analysis?.commit_sha !== 'string')
      throw new Error('Unreadable code-scanning analysis in the API answer')
    if (analysis.commit_sha === sha) categories.add(analysis.category)
  }
  return categories
}

/**
 * The committer date of the develop head commit.
 * @param {(path: string) => Promise<unknown>} getJson
 */
export async function readDevelopHead(getJson) {
  const branch = await getJson(`repos/${CI_REPOSITORY}/branches/develop`)
  const head = branch?.commit
  const date = new Date(head?.commit?.committer?.date ?? NaN)
  if (typeof head?.sha !== 'string' || Number.isNaN(date.getTime()))
    throw new Error('Unreadable develop branch in the API answer')
  const message = typeof head.commit.message === 'string' ? head.commit.message : ''
  return { sha: head.sha, date, skipsCi: SKIP_CI.test(message) }
}

/** The commit-message directives that make GitHub start no push workflow. */
const SKIP_CI = /\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i

const at = (date) => `${date.toISOString().slice(0, 16)}Z`

/**
 * One problem line per stale category of one ref, or the read error of that ref.
 * @returns {Promise<string[]>}
 */
async function checkRef(getJson, ref, now) {
  try {
    if (ref === DEVELOP) {
      const head = await readDevelopHead(getJson)
      const short = head.sha.slice(0, 12)
      const cutoff = head.date.getTime() - DEVELOP_GRACE_HOURS * HOUR_MS
      const analyses = await readAnalyses(getJson, ref, cutoff, (read) => {
        const analyzed = categoriesAnalyzedAt(read, head.sha)
        return CATEGORIES.every((c) => analyzed.has(c))
      })
      const analyzed = categoriesAnalyzedAt(analyses, head.sha)
      const newest = new Map()
      for (const a of analyses)
        if (!newest.has(a.category) || new Date(newest.get(a.category).created_at) < new Date(a.created_at))
          newest.set(a.category, a)
      // A head younger than the grace may still be queued or running; a category never analyzed is not.
      const waited = now - head.date.getTime() > DEVELOP_GRACE_HOURS * HOUR_MS
      const skip = head.skipsCi ? ' (its message asks GitHub to skip CI: push again without it)' : ''
      return CATEGORIES.filter((c) => !analyzed.has(c) && (waited || !newest.has(c))).map((category) => {
        const last = newest.get(category)
        return last === undefined
          ? `  - ${ref} ${category}: no analysis found; head commit ${short} committed ${at(head.date)}${skip}`
          : `  - ${ref} ${category}: head commit ${short} committed ${at(head.date)} has no analysis ` +
              `after ${DEVELOP_GRACE_HOURS} h${skip}; last analysis ${at(new Date(last.created_at))} of ` +
              `${last.commit_sha.slice(0, 12)}`
      })
    }
    const cutoff = now - MAIN_MAX_AGE_DAYS * DAY_MS
    const analyses = await readAnalyses(getJson, ref, cutoff, (read) => {
      const latest = latestByCategory(read)
      return CATEGORIES.every((c) => latest.has(c))
    })
    const stale = staleCategories(latestByCategory(analyses), cutoff)
    return stale.map(
      ({ category, last }) =>
        `  - ${ref} ${category}: ${last === null ? 'no analysis found' : `last analysis ${at(last)}`}; ` +
        `none in the last ${MAIN_MAX_AGE_DAYS} days`
    )
  } catch (error) {
    return [`  - ${ref}: could not read its code-scanning analyses: ${error.message}`]
  }
}

/**
 * @param {{ getJson: (path: string) => Promise<unknown>, now?: number }} input
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function checkFreshness({ getJson, now = Date.now() }) {
  const problems = [...(await checkRef(getJson, DEVELOP, now)), ...(await checkRef(getJson, MAIN, now))]
  if (problems.length === 0)
    return {
      code: 0,
      stdout:
        `CodeQL freshness: the ${DEVELOP} head is analyzed in every category, or committed less than ` +
        `${DEVELOP_GRACE_HOURS} h ago; every category of ${MAIN} is analyzed within the last ` +
        `${MAIN_MAX_AGE_DAYS} days.\n`,
      stderr: ''
    }
  return {
    code: 1,
    stdout: '',
    stderr:
      'CodeQL freshness: scanning looks broken (the check fails closed):\n' +
      `${problems.join('\n')}\n` +
      'Check the CodeQL workflow runs (.github/workflows/codeql.yml), that code scanning default setup ' +
      'is still switched off, and that the job token has `security-events: read`.\n'
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await checkFreshness({ getJson: (path) => githubJson(githubRead, path, MAX_BYTES) })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.code !== 0 && process.env.GITHUB_ACTIONS === 'true')
    process.stdout.write(`::error title=CodeQL freshness::${result.stderr.trim().replaceAll('\n', '%0A')}\n`)
  process.exit(result.code)
}
