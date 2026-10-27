#!/usr/bin/env node
/**
 * After a pull request is MERGED into `develop` or `main`: did Tracy CI pass on the commit that
 * was merged? If not, say so on the pull request and go red.
 *
 * WHY AFTER, NOT BEFORE. The repository is private on the Free plan, so branch protection and
 * rulesets are unavailable (both APIs return 403) and nothing on GitHub can refuse a merge. What
 * this can do is make a merge without a green run impossible to miss: a comment on the pull
 * request naming the commit and what Tracy CI said about it, and a red job in Actions.
 *
 * WHAT COUNTS AS GREEN. The NEWEST `Tracy CI` run for the pull request's HEAD commit concluded
 * `success`. Since 29/09/2026 each push cancels the previous run of the same pull request
 * (`concurrency` in tracy-ci.yml) and a draft runs nothing, so the usual story of a red verdict
 * here is "merged while still a draft" or "merged before the last push finished".
 *
 * 🔒 THE NEWEST RUN DECIDES, NOT ANY GREEN ONE (05/10/2026). Until then the first `success` in the
 * list was accepted, so a commit whose latest run was red, cancelled or still running passed as
 * long as an older run of the same commit had been green (ready → draft → ready again, or a
 * re-run). "Newest" is the run whose latest attempt started last — `run_started_at`, which a
 * re-run resets, so an older run re-run after a newer green one decides — read by `newestRun()` in
 * `check-pr-merge.mjs`, the same definition the pre-merge check uses; never the order of the list
 * and never the run number alone. Runs it cannot order are reported as red, not guessed at.
 * For the same reason EVERY page of the commit's runs is read (`listAll()`, also shared): the API
 * lists runs by creation, so an old run re-run late sits at the far end of the list, and a first
 * page taken for the whole history would miss exactly the attempt that decides. A list that is cut
 * short or contradicts its own count is red too.
 *
 * WHY THIS STAYS BESIDE THE PRE-MERGE CHECK. `check-pr-merge.mjs` is a command the person merging
 * chooses to run. A merge from the web UI, or by anyone who skips it, reaches only this job.
 *
 *   node scripts/check-merged-ci.mjs                    # in CI: reads $GITHUB_EVENT_PATH
 *   node scripts/check-merged-ci.mjs payload.json runs.json   # locally, no network
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listAll, newestRun, Refusal } from './check-pr-merge.mjs'
import { githubRead } from './ci/github-read.mjs'

/**
 * The decision, kept away from the network so it can be tested.
 * @param {{ id: number, run_number: number, run_attempt: number, created_at: string, run_started_at: string, status: string, conclusion: string | null, html_url?: string }[]} runs
 *   Tracy CI runs whose head_sha is the merged commit, in any order.
 * @returns {{ ok: boolean, reason: string }}
 */
export function mergedCiVerdict(runs) {
  const { run: last, problem } = newestRun(runs)
  if (problem)
    return {
      ok: false,
      reason: `Could not tell which Tracy CI run on this commit is the newest (${problem}), so no run is taken as its verdict.`
    }
  if (!last)
    return {
      ok: false,
      reason:
        'Tracy CI never ran on this commit — the pull request was merged while still a draft, or the run was cancelled before it started.'
    }
  if (last.status !== 'completed')
    return {
      ok: false,
      reason: `Tracy CI was still running on this commit when it was merged (${last.html_url ?? 'run'}).`
    }
  if (last.conclusion === 'success')
    return { ok: true, reason: `Tracy CI passed on this commit (${last.html_url ?? 'run'})` }
  return {
    ok: false,
    reason: `Tracy CI did not pass on this commit: it ended \`${last.conclusion}\` (${last.html_url ?? 'run'}).`
  }
}

/**
 * Every Tracy CI run on the merged commit — all pages, or a `problem`; never the first page alone.
 * @param {(path: string) => Promise<unknown>} get - one GET of a relative REST path.
 * @param {string} repo - `OWNER/REPO`.
 * @param {string} sha
 * @returns {Promise<{ runs: object[] } | { problem: string }>}
 */
export async function readRuns(get, repo, sha) {
  try {
    const path = `repos/${repo}/actions/workflows/tracy-ci.yml/runs?head_sha=${sha}`
    return { runs: await listAll(get, path, 'workflow_runs', 'Tracy CI runs') }
  } catch (e) {
    if (e instanceof Refusal) return { problem: e.message }
    throw e
  }
}

async function api(path, init = {}) {
  const res =
    (init.method ?? 'GET') === 'GET'
      ? await githubRead(path)
      : await fetch(`https://api.github.com${path}`, {
          ...init,
          headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${process.env.GH_TOKEN}`,
            'x-github-api-version': '2022-11-28',
            ...(init.body ? { 'content-type': 'application/json' } : {})
          }
        })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  const [payloadFile, runsFile] = process.argv.slice(2)
  const event = JSON.parse(readFileSync(payloadFile ?? process.env.GITHUB_EVENT_PATH, 'utf8'))
  const pr = event.pull_request
  if (!pr?.merged) {
    console.log('not a merge — nothing to check')
    return
  }
  const sha = pr.head.sha
  const repo = event.repository.full_name
  const read = runsFile
    ? { runs: JSON.parse(readFileSync(runsFile, 'utf8')) }
    : await readRuns((path) => api(`/${path}`), repo, sha)
  const v = read.problem
    ? {
        ok: false,
        reason: `Could not read every Tracy CI run on this commit (${read.problem}), so no run is taken as its verdict.`
      }
    : mergedCiVerdict(read.runs)
  console.log(`#${pr.number} → ${pr.base.ref} at ${sha.slice(0, 9)}: ${v.reason}`)
  if (v.ok) return

  const body = [
    `⚠️ **Merged into \`${pr.base.ref}\` without a green Tracy CI on the final commit** (\`${sha.slice(0, 9)}\`).`,
    '',
    v.reason,
    '',
    'Nothing on GitHub can block a merge on this plan, so this is the check. Run Tracy CI on the merged state (Actions → Tracy CI → Run workflow on the branch) and fix forward if it is red.',
    'Next time: keep the pull request a **draft** while pushing, mark it **Ready for review** when it is final — that starts exactly one Tracy CI run — and merge once it is green.'
  ].join('\n')
  if (!runsFile)
    await api(`/repos/${repo}/issues/${pr.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    })
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body}\n`)
  console.log(`::error::${v.reason}`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
