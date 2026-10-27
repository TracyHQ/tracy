#!/usr/bin/env node
// Push a window of runs to the orphan branch `qa/e2e-dev-runs` (plan §2 D7, §4 S8):
//
//   node tests/e2e-dev/bin/publish.mjs [--since <…>] [--until <…>] [--tmp <dir>] [--dry-run]
//
// For every run started in the window (suite: `runs/<runId>/`, regression dev profile:
// `reg/<runId>/`) it copies the reports — report.md, report.json, deploy.json, deploy-end.json,
// results.jsonl — re-redacted, plus images of at most 1 MB from `evidence/`; writes the window's
// summary to `summaries/`; drops images of runs older than 14 days; then scans EVERY text file of
// the branch for secrets (`findLeaks`). One hit stops the publish before anything is committed.
// Clean: commit and `git push origin HEAD:qa/e2e-dev-runs`. Nothing else is pushed.
//
// The branch is worked on in a temporary worktree under `--tmp` (default: the OS temp dir), never
// in this checkout. No repository hook runs (`core.hooksPath=/dev/null`, `--no-verify`): the
// branch holds no code, so the code gates do not apply to it; the secret scan is this branch's gate.

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ENV } from '../lib/env.mjs'
import { findLeaks, redact, redactText } from '../lib/redact.mjs'
import { buildSummary, collectReports } from '../lib/summary.mjs'

const BRANCH = 'qa/e2e-dev-runs'
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const TEXT_FILES = ['report.md', 'report.json', 'deploy.json', 'deploy-end.json', 'results.jsonl']
const IMAGE = /\.(png|jpe?g|webp)$/i
const MAX_IMAGE_BYTES = 1024 * 1024
const IMAGE_DAYS = 14

const { values } = parseArgs({
  options: {
    since: { type: 'string' },
    until: { type: 'string' },
    tmp: { type: 'string' },
    'dry-run': { type: 'boolean', default: false }
  }
})

function git(args, cwd = REPO, { allowFail = false } = {}) {
  // No hook runs for this branch: post-checkout would `pnpm install` into a tree with no code.
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' })
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`)
  return r
}

function filesUnder(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const p = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...filesUnder(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

const today = new Date()
today.setHours(0, 0, 0, 0)
const since = values.since ? new Date(values.since) : today
const until = values.until ? new Date(values.until) : new Date()
if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
  console.error('--since/--until must be a date or a datetime')
  process.exit(2)
}
const runs = collectReports(ENV.resultsRoot, { since, until })
if (runs.length === 0) {
  console.log('no run in this window; nothing to publish')
  process.exit(0)
}

const tmp = mkdtempSync(join(values.tmp ?? tmpdir(), 'e2e-dev-publish-'))
const wt = join(tmp, 'branch')
let localBranch = null
let exit = 0
try {
  // ── 1. The branch, in a temporary worktree ───────────────────────────────────────────────────
  const remote = git(['ls-remote', '--heads', 'origin', BRANCH]).stdout.trim()
  if (remote) {
    git(['fetch', '--quiet', 'origin', BRANCH])
    git(['worktree', 'add', '--detach', wt, 'FETCH_HEAD'])
  } else {
    localBranch = `e2e-dev-runs-publish-${process.pid}`
    git(['worktree', 'add', '--orphan', '-b', localBranch, wt])
  }

  // ── 2. Copy the window's runs, re-redacted ───────────────────────────────────────────────────
  let copied = 0
  let images = 0
  const skippedImages = []
  for (const run of runs) {
    const dest = join(wt, run.kind === 'reg' ? 'reg' : 'runs', run.report.runId)
    mkdirSync(dest, { recursive: true })
    for (const name of TEXT_FILES) {
      const from = join(run.dir, name)
      if (!existsSync(from)) continue
      const text = readFileSync(from, 'utf8')
      const clean = name.endsWith('.json')
        ? `${JSON.stringify(redact(JSON.parse(text)), null, 2)}\n`
        : redactText(text)
      writeFileSync(join(dest, name), clean)
      copied++
    }
    const fresh = Date.now() - new Date(run.report.startedAt).getTime() < IMAGE_DAYS * 86_400_000
    for (const file of filesUnder(join(run.dir, 'evidence')).filter((f) => IMAGE.test(f))) {
      const size = statSync(file).size
      if (!fresh || size > MAX_IMAGE_BYTES) {
        skippedImages.push(
          `${relative(run.dir, file)} (${Math.round(size / 1024)} KB${fresh ? '' : ', older than 14 days'})`
        )
        continue
      }
      mkdirSync(join(dest, 'evidence'), { recursive: true })
      copyFileSync(file, join(dest, 'evidence', basename(file)))
      images++
    }
  }
  const stamp = (d) => d.toISOString().slice(0, 16).replace(/[:]/g, '')
  mkdirSync(join(wt, 'summaries'), { recursive: true })
  const summaryName = `${stamp(since)}_${stamp(until)}.md`
  writeFileSync(join(wt, 'summaries', summaryName), redactText(buildSummary(runs, { since, until })))
  writeFileSync(
    join(wt, 'README.md'),
    [
      '# qa/e2e-dev-runs',
      '',
      "Results of the E2E suite on the develop surface (`tests/e2e-dev/`) and of the regression runner's",
      'dev profile (`tests/regression/run.mjs --profile dev`), pushed by `tests/e2e-dev/bin/publish.mjs`.',
      'Orphan branch: no code, never merged. `summaries/` holds one page per published window; `runs/` and',
      '`reg/` one folder per run. Images are kept 14 days. Every text file is redacted and scanned for',
      'secrets before each push.',
      ''
    ].join('\n')
  )

  // ── 3. Images older than 14 days leave the branch ────────────────────────────────────────────
  let pruned = 0
  for (const base of ['runs', 'reg']) {
    for (const runDir of existsSync(join(wt, base)) ? readdirSync(join(wt, base)) : []) {
      let started = null
      try {
        started = new Date(JSON.parse(readFileSync(join(wt, base, runDir, 'report.json'), 'utf8')).startedAt)
      } catch {
        continue
      }
      if (Date.now() - started.getTime() < IMAGE_DAYS * 86_400_000) continue
      for (const file of filesUnder(join(wt, base, runDir)).filter((f) => IMAGE.test(f))) {
        rmSync(file)
        pruned++
      }
    }
  }

  // ── 4. The secret scan: every text file now on the branch ────────────────────────────────────
  const leaks = []
  for (const file of filesUnder(wt)) {
    if (IMAGE.test(file)) continue
    for (const hit of findLeaks(readFileSync(file, 'utf8')))
      leaks.push(`${relative(wt, file)}:${hit.line} ${hit.kind} (${hit.excerpt})`)
  }
  console.log(
    `${runs.length} run(s): ${copied} report file(s), ${images} image(s), ${pruned} old image(s) pruned, summary summaries/${summaryName}`
  )
  if (skippedImages.length) console.log(`not copied: ${skippedImages.join(', ')}`)
  if (leaks.length) {
    console.error(
      `STOP: ${leaks.length} secret(s) found; nothing committed, nothing pushed:\n  ${leaks.join('\n  ')}`
    )
    exit = 1
  } else {
    console.log('secret scan: 0 hits')
    git(['add', '-A'], wt)
    const staged = git(['diff', '--cached', '--quiet'], wt, { allowFail: true }).status !== 0
    if (!staged) console.log('nothing new on the branch')
    else if (values['dry-run']) console.log(`--dry-run: would commit and push to ${BRANCH}`)
    else {
      git(
        [
          'commit',
          '--quiet',
          '--no-verify',
          '-m',
          `chore(e2e-dev): publish ${runs.length} run(s) ${since.toISOString().slice(0, 16)}Z to ${until.toISOString().slice(0, 16)}Z`
        ],
        wt
      )
      git(['push', '--quiet', '--no-verify', 'origin', `HEAD:refs/heads/${BRANCH}`], wt)
      const sha = git(['rev-parse', '--short', 'HEAD'], wt).stdout.trim()
      const url = git(['remote', 'get-url', 'origin'])
        .stdout.trim()
        .replace(/^git@github\.com:/, 'https://github.com/')
        .replace(/\.git$/, '')
      console.log(`pushed ${sha} → ${url}/tree/${BRANCH}`)
    }
  }
} catch (error) {
  console.error(`publish: ${error instanceof Error ? error.message : String(error)}`)
  exit = 1
} finally {
  git(['worktree', 'remove', '--force', wt], REPO, { allowFail: true })
  if (localBranch) git(['branch', '-D', localBranch], REPO, { allowFail: true })
  rmSync(tmp, { recursive: true, force: true })
}
process.exit(exit)
