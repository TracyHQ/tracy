// From a red test to a GitHub issue (plan §7.2), outside the fence, at P8 after the tests are pushed.
//
// Exports:
//   LABELS: { base, confirmed, falsePositive, needsOwner, paused }
//   createGh({ dryRun?, bin?, env?, print? }) -> { dryRun, run(args: string[], { input? }) -> { ok, code, stdout, stderr } }
//     The only door to `gh`. Dry run prints the exact command (and its stdin) and calls nothing.
//   fileLedger(path) -> { append(entry), read() -> entry[] }
//     Default writer of `issues.jsonl`, on journal.mjs (appendLine: one fsync'd JSON line; readLines
//     skips a torn line). Injected as `deps.ledger`, so tests and callers may pass their own.
//     Lines: { t: 'intent'|'result'|'effect', op: 'create'|'comment'|'assign', key: 'pr<N>', nonce, ... };
//     the nonce is also the hidden marker on GitHub, which is what reconcile() matches.
//   ledgerState(entries) -> { byKey: Map<key, { issue, cases: Set<caseId> }>, hanging: intent[] }
//   scanSecrets(text, secrets?: string[]) -> string[]            reasons; empty = clean
//   eligibility(input) -> { candidates: Map<pr, case[]>, rejected: { caseId, pr, reason }[] }
//   brakeReason(input) -> string | null
//   reconcile({ repo, ledger, gh }) -> { found: { key, issue }[], notFound: string[], unreadable: boolean }
//   publishIssues(input, deps) -> summary (see the JSDoc on the function)
//   readResponses(view, caseIds) -> Map<caseId, { verdict: 'confirmed'|'false-positive', source }>
//   passesComment({ repo, issue, key, caseId, sha, runId }, deps) -> { ok, issue }
//
// Issues are English (every recent issue in the repo is); the text lives in ../templates/*.en.md.
// Every untrusted string goes through literal().

import { existsSync, readFileSync } from 'node:fs'
import { appendLine, readLines } from './journal.mjs'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { literal } from './literal.mjs'
import { fill } from './report.mjs'
import { CI_REPOSITORY } from '../../ci/ci-repository.mjs'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

export const LABELS = Object.freeze({
  base: 'daily-qa',
  confirmed: 'daily-qa:confirmed',
  falsePositive: 'daily-qa:false-positive',
  needsOwner: 'daily-qa:needs-owner',
  paused: 'daily-qa:paused'
})

const DEFAULT_REPO = CI_REPOSITORY
const DEFAULT_MAX_NEW = 20
const WRITERS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR'])
const LANES = ['sonnet', 'sol']
const OTHER_LANE_TEXT = {
  red: 'also red',
  green: 'has a test, passes',
  'no-test': 'could not write a test',
  'not-checkable': 'not checkable inside the test fence',
  timeout: 'timed out'
}

// ---------------------------------------------------------------------------------------------
// gh

function shellQuote(arg) {
  return /^[A-Za-z0-9_\-.,:/=@%+]+$/.test(arg) ? arg : `'${String(arg).replace(/'/g, `'\\''`)}'`
}

/**
 * @param {{ dryRun?: boolean, bin?: string, env?: NodeJS.ProcessEnv, print?: (line: string) => void }} [opts]
 */
export function createGh(opts = {}) {
  const dryRun = Boolean(opts.dryRun)
  const bin = opts.bin ?? 'gh'
  const env = opts.env ?? process.env
  const print = opts.print ?? ((line) => process.stdout.write(`${line}\n`))
  return {
    dryRun,
    /** @param {string[]} args @param {{ input?: string }} [o] */
    run(args, o = {}) {
      if (dryRun) {
        print(`$ gh ${args.map(shellQuote).join(' ')}`)
        if (o.input !== undefined) print(`--- stdin ---\n${o.input}\n--- end stdin ---`)
        return { ok: true, code: 0, stdout: '', stderr: '', dry: true }
      }
      const r = spawnSync(bin, args, { env, input: o.input ?? '', encoding: 'utf8', timeout: 120_000 })
      return {
        ok: r.status === 0,
        code: r.status ?? -1,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? String(r.error ?? '')
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// ledger (issues.jsonl): intent before every write to GitHub, result after it

/** @param {string} path */
export function fileLedger(path) {
  return {
    append: (entry) => appendLine(path, entry),
    // A torn last line (crash mid-write) is skipped by readLines; its intent stays hanging.
    read: () => readLines(path).lines
  }
}

/** @param {object[]} entries */
export function ledgerState(entries) {
  const results = new Map()
  for (const e of entries) if (e.t === 'result') results.set(e.nonce, e)
  /** @type {Map<string, { issue: number, cases: Set<string> }>} */
  const byKey = new Map()
  const hanging = []
  for (const e of entries) {
    if (e.t !== 'intent') continue
    const r = results.get(e.nonce)
    if (!r) {
      hanging.push(e)
      continue
    }
    if (r.outcome !== 'created' && r.outcome !== 'found') continue
    const issue = r.issue ?? e.issue
    const cur = byKey.get(e.key) ?? { issue, cases: new Set() }
    if (e.op === 'create') cur.issue = issue
    for (const c of e.cases ?? []) cur.cases.add(c)
    byKey.set(e.key, cur)
  }
  return { byKey, hanging }
}

// ---------------------------------------------------------------------------------------------
// secret scan (the last net of §4.10; G4's intake scanner should replace this default)

/** @param {string} text @param {string[]} [secrets] */
export function scanSecrets(text, secrets = []) {
  const reasons = []
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue
    const buf = Buffer.from(secret)
    const forms = {
      plain: secret,
      base64: buf.toString('base64').replace(/=+$/, ''),
      base64url: buf.toString('base64url'),
      hex: buf.toString('hex')
    }
    for (const [form, value] of Object.entries(forms)) {
      const hit = form === 'hex' ? text.toLowerCase().includes(value) : text.includes(value)
      if (hit) reasons.push(`known secret (${form})`)
    }
  }
  if (/\bv1\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(text)) reasons.push('product session shape v1.x.y')
  if (/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/.test(text)) reasons.push('JWT shape')
  if (/\bsk-[A-Za-z0-9_-]{16,}/.test(text)) reasons.push('sk- key shape')
  return [...new Set(reasons)]
}

// ---------------------------------------------------------------------------------------------
// which cases may become an issue

const keyOf = (pr) => `pr${pr}`

/** A lane's result for one case: { status: 'red' (red twice at T) | 'flaky' | 'green' | 'no-test' | 'timeout' | 'stand-error' | 'not-checkable' (fence refused a repo command; neither ran nor red), testPath? } */
function redLanes(c) {
  return LANES.filter((l) => c.lanes?.[l]?.status === 'red')
}

/**
 * @param {{ prs: object[], cases: object[], standMatches: boolean }} input
 */
export function eligibility(input) {
  const prs = new Map(input.prs.map((p) => [p.number, p]))
  /** @type {Map<number, object[]>} */
  const candidates = new Map()
  const rejected = []
  for (const c of input.cases) {
    const pr = prs.get(c.pr)
    let reason = null
    if (!pr) reason = 'unknown PR'
    else if (pr.calibration || c.calibration) reason = 'calibration case'
    else if (pr.state === 'reverted' || pr.state === 'superseded') reason = pr.state
    else if (!input.standMatches) reason = 'stand does not match desired(T)'
    else if (redLanes(c).length === 0) reason = 'not red twice at T in any lane'
    else if (c.verdict?.conclusion !== 'differs') reason = `verify: ${c.verdict?.conclusion ?? 'none'}`
    else if (!String(c.verdict?.observed ?? '').trim()) reason = 'verify has no observation of its own'
    else if (!c.quote || !String(pr.body ?? '').includes(c.quote))
      reason = 'quote is not verbatim in the PR description'
    if (reason) {
      rejected.push({ caseId: c.id, pr: c.pr, reason })
      continue
    }
    const list = candidates.get(c.pr) ?? []
    list.push(c)
    candidates.set(c.pr, list)
  }
  return { candidates, rejected }
}

/**
 * The brakes of §7.2: any one means nothing is written to any issue tonight, comments included.
 * @param {{ prs: object[], cases: object[], brakes?: { coreRed?: boolean, healthRed?: boolean } }} input
 */
export function brakeReason(input) {
  if (input.brakes?.coreRed) return 'brake: core suite red'
  if (input.brakes?.healthRed) return 'brake: health check red after P4'
  const calib = new Set(input.prs.filter((p) => p.calibration).map((p) => p.number))
  const real = input.cases.filter((c) => !calib.has(c.pr) && !c.calibration)
  const byKind = new Map()
  for (const c of real) {
    if (!redLanes(c).length || !c.kind) continue
    const set = byKind.get(c.kind) ?? new Set()
    set.add(c.pr)
    byKind.set(c.kind, set)
  }
  for (const [kind, set] of byKind) {
    if (set.size >= 3) return `brake: ${set.size} PRs red the same way (${kind})`
  }
  const ran = new Set()
  const red = new Set()
  for (const c of real) {
    for (const l of LANES) {
      const s = c.lanes?.[l]?.status
      if (s === 'red' || s === 'flaky' || s === 'green') ran.add(c.pr)
      if (s === 'red') red.add(c.pr)
    }
  }
  if (ran.size > 0 && red.size * 2 > ran.size)
    return `brake: ${red.size} of ${ran.size} PRs with tests are red at T`
  return null
}

// ---------------------------------------------------------------------------------------------
// rendering

const template = (name) => readFileSync(join(TEMPLATES, name), 'utf8')
const marker = (key, nonce, extra = '') => `<!-- daily-qa key=${key}${extra} nonce=${nonce} -->`
const safePath = (p) => String(p ?? '').replace(/[^A-Za-z0-9._/-]/g, '_')
const sha7 = (sha) => String(sha ?? '').slice(0, 7)

function renderCase(c, ctx) {
  const found = redLanes(c)
  const others = LANES.filter((l) => !found.includes(l))
    .map((l) => `; ${l}: ${OTHER_LANE_TEXT[c.lanes?.[l]?.status] ?? 'not run'}`)
    .join('')
  const lane = found[0]
  const testPath = safePath(c.lanes?.[lane]?.testPath ?? `tests/pr${c.pr}/${lane}/${c.id}.test.mjs`)
  return fill(template('case.en.md'), {
    caseId: safePath(c.id),
    foundBy: found.join(' and '),
    otherLanes: others,
    quote: literal(c.quote, { indent: '  ', maxLines: 20 }),
    expected: literal(c.expected, { indent: '  ', maxLines: 20 }),
    observed: literal(c.verdict?.observed, { indent: '  ', maxLines: 20 }),
    sha: sha7(ctx.sha),
    testLink: `[${testPath}](https://github.com/${ctx.repo}/blob/qa/daily-tests/${testPath})`,
    rerun: `qa-tool/scripts/qa/rerun ${lane} ${Number(c.pr)} ${safePath(c.id)}`
  }).trimEnd()
}

function loginText(login) {
  // No '@': the assignment notifies the author; the body must not ping anyone else.
  return login ? `\`${String(login).replace(/[^A-Za-z0-9_[\]-]/g, '')}\`` : 'unknown'
}

function isBot(author) {
  return Boolean(author?.isBot) || String(author?.login ?? '').endsWith('[bot]')
}

// ---------------------------------------------------------------------------------------------
// reconcile hanging intents against GitHub (list API, every page; never search)

function listJson(gh, path) {
  const r = gh.run(['api', '--paginate', '--slurp', path])
  if (!r.ok || r.dry) return null
  try {
    return JSON.parse(r.stdout).flat()
  } catch {
    return null
  }
}

/**
 * @param {{ repo?: string, ledger: { append: Function, read: Function }, gh: ReturnType<typeof createGh>, now?: () => string }} o
 */
export function reconcile({ repo = DEFAULT_REPO, ledger, gh, now = () => new Date().toISOString() }) {
  const { hanging } = ledgerState(ledger.read())
  const found = []
  const notFound = []
  if (hanging.length === 0) return { found, notFound, unreadable: false }
  const issues = listJson(gh, `repos/${repo}/issues?labels=${LABELS.base}&state=all&per_page=100`)
  if (!issues) return { found, notFound, unreadable: true }
  const commentsOf = new Map()
  for (const intent of hanging) {
    const needle = `nonce=${intent.nonce} -->`
    let hit = null
    if (intent.op === 'create') {
      hit = issues.find((i) => !i.pull_request && String(i.body ?? '').includes(needle))?.number ?? null
    } else if (intent.op === 'comment') {
      if (!commentsOf.has(intent.issue)) {
        commentsOf.set(
          intent.issue,
          listJson(gh, `repos/${repo}/issues/${intent.issue}/comments?per_page=100`)
        )
      }
      const comments = commentsOf.get(intent.issue)
      if (!comments) return { found, notFound, unreadable: true }
      hit = comments.some((c) => String(c.body ?? '').includes(needle)) ? intent.issue : null
    }
    if (hit) {
      ledger.append({
        t: 'result',
        op: intent.op,
        nonce: intent.nonce,
        key: intent.key,
        issue: hit,
        outcome: 'found',
        at: now()
      })
      found.push({ key: intent.key, issue: hit })
    } else {
      ledger.append({
        t: 'result',
        op: intent.op,
        nonce: intent.nonce,
        key: intent.key,
        issue: null,
        outcome: 'not-found',
        at: now()
      })
      notFound.push(intent.key)
    }
  }
  return { found, notFound, unreadable: false }
}

// ---------------------------------------------------------------------------------------------
// publish

const issueNumberFrom = (stdout) => {
  const m = /\/issues\/(\d+)\s*$/.exec(String(stdout).trim())
  return m ? Number(m[1]) : null
}

/**
 * Turns tonight's eligible cases into GitHub writes.
 *
 * input: {
 *   runId, repo?, sha (stand SHA per actual()), standMatches, qaHome, dailyIssue?: number,
 *   brakes?: { coreRed?, healthRed? }, maxNew? (default 20), secrets?: string[],
 *   prs: { number, title, body, author: { login, isBot? }, mergedBy?, state: 'merged'|'reverted'|'superseded', calibration? }[],
 *   cases: { id, pr, quote, expected, kind?, calibration?, lanes: { sonnet?: { status, testPath? }, sol?: {...} },
 *            verdict?: { conclusion: 'differs'|'test-wrong'|'inconclusive', observed } }[]
 * }
 * deps: { gh, ledger, scan?: (text) => string[], nonce?: () => string, now?: () => string }
 *
 * Returns { blocked: string|null, created, commented, notOpened, rejected, unassigned, unknown, reconciled }:
 * blocked = why nothing was written; notOpened[].reason in 'cap' | 'scanner: …' | the blocked reason.
 */
export function publishIssues(input, deps) {
  const repo = input.repo ?? DEFAULT_REPO
  const { gh, ledger } = deps
  const now = deps.now ?? (() => new Date().toISOString())
  const nonce = deps.nonce ?? (() => randomBytes(8).toString('hex'))
  const scan = deps.scan ?? ((text) => scanSecrets(text, input.secrets ?? []))
  const summary = {
    blocked: null,
    created: [],
    commented: [],
    notOpened: [],
    rejected: [],
    unassigned: [],
    unknown: [],
    reconciled: null
  }
  const { candidates, rejected } = eligibility(input)
  summary.rejected = rejected
  const notOpenAll = (reason) => {
    for (const [pr, cases] of candidates)
      summary.notOpened.push({ pr, cases: cases.map((c) => c.id), reason })
  }

  if (input.qaHome && existsSync(join(input.qaHome, 'issues.off'))) {
    summary.blocked = 'switch: issues.off'
  } else if (input.dailyIssue) {
    const r = gh.run(['issue', 'view', String(input.dailyIssue), '--repo', repo, '--json', 'labels'])
    if (r.ok && !r.dry) {
      let labels = []
      try {
        labels = (JSON.parse(r.stdout).labels ?? []).map((l) => l.name)
      } catch {
        summary.blocked = 'switch: Daily QA issue unreadable'
      }
      if (labels.includes(LABELS.paused)) summary.blocked = `switch: ${LABELS.paused}`
    } else if (!r.ok) {
      summary.blocked = 'switch: Daily QA issue unreadable'
    }
  }
  if (!summary.blocked) summary.blocked = brakeReason(input)
  if (summary.blocked) {
    notOpenAll(summary.blocked)
    return summary
  }

  // In a dry run the ledger is neither read for writes nor written: the next real night must not see
  // intents that never happened.
  const write = gh.dryRun ? () => {} : (e) => ledger.append(e)
  if (!gh.dryRun) {
    summary.reconciled = reconcile({ repo, ledger, gh, now })
    if (summary.reconciled.unreadable) {
      summary.blocked = 'hanging intents and the issue list is unreadable'
      notOpenAll(summary.blocked)
      return summary
    }
  }
  const state = ledgerState(ledger.read())
  const prs = new Map(input.prs.map((p) => [p.number, p]))
  const ctx = { repo, sha: input.sha }

  const toCreate = []
  const toComment = []
  for (const [pr, cases] of candidates) {
    const existing = state.byKey.get(keyOf(pr))
    if (existing?.issue) {
      const fresh = cases.filter((c) => !existing.cases.has(c.id))
      if (fresh.length) toComment.push({ pr, issue: existing.issue, cases: fresh })
    } else {
      toCreate.push({ pr, cases })
    }
  }
  const maxNew = input.maxNew ?? DEFAULT_MAX_NEW
  if (toCreate.length > maxNew) {
    for (const t of toCreate)
      summary.notOpened.push({ pr: t.pr, cases: t.cases.map((c) => c.id), reason: 'cap' })
    toCreate.length = 0
  }

  for (const t of toCreate) {
    const pr = prs.get(t.pr)
    const n = nonce()
    const key = keyOf(t.pr)
    const bot = isBot(pr.author)
    const body = fill(template('issue.en.md'), {
      marker: marker(key, n),
      runId: safePath(input.runId),
      pr: Number(t.pr),
      sha: sha7(input.sha),
      author: loginText(pr.author?.login),
      mergedBy: loginText(pr.mergedBy),
      ownerNote: bot
        ? `- The author is a bot; the person who merged it is listed above. Label \`${LABELS.needsOwner}\`.\n`
        : '',
      cases: t.cases.map((c) => renderCase(c, ctx)).join('\n\n')
    })
    const hits = scan(body)
    if (hits.length) {
      summary.notOpened.push({
        pr: t.pr,
        cases: t.cases.map((c) => c.id),
        reason: `scanner: ${hits.join(', ')}`
      })
      continue
    }
    const title = `Daily QA: PR #${Number(t.pr)} differs from its description at ${sha7(input.sha)} (${t.cases.length} case${t.cases.length > 1 ? 's' : ''})`
    const cases = t.cases.map((c) => c.id)
    write({ t: 'intent', op: 'create', key, pr: t.pr, nonce: n, cases, runId: input.runId, at: now() })
    const r = gh.run(
      ['issue', 'create', '--repo', repo, '--title', title, '--label', LABELS.base, '--body-file', '-'],
      {
        input: body
      }
    )
    const issue = r.dry ? null : issueNumberFrom(r.stdout)
    if (!r.dry && (!r.ok || !issue)) {
      // Outcome unknown: the intent stays hanging and the next P0 reconciles it by nonce.
      summary.unknown.push({ pr: t.pr, cases, error: r.stderr.trim().slice(0, 200) })
      continue
    }
    write({ t: 'result', op: 'create', key, nonce: n, issue, outcome: 'created', at: now() })
    summary.created.push({ pr: t.pr, issue, cases, assignee: bot ? null : (pr.author?.login ?? null) })
    const assign = bot
      ? gh.run(['issue', 'edit', String(issue ?? '<new>'), '--repo', repo, '--add-label', LABELS.needsOwner])
      : gh.run([
          'issue',
          'edit',
          String(issue ?? '<new>'),
          '--repo',
          repo,
          '--add-assignee',
          String(pr.author?.login)
        ])
    const outcome = bot ? (assign.ok ? 'needs-owner' : 'failed') : assign.ok ? 'assigned' : 'failed'
    write({ t: 'effect', op: 'assign', key, issue, login: pr.author?.login ?? null, outcome, at: now() })
    if (outcome === 'failed' || bot)
      summary.unassigned.push({ pr: t.pr, issue, reason: bot ? 'bot author' : 'assign failed' })
  }

  for (const t of toComment) {
    const key = keyOf(t.pr)
    const n = nonce()
    const body = fill(template('comment.en.md'), {
      marker: marker(key, n),
      pr: Number(t.pr),
      runId: safePath(input.runId),
      sha: sha7(input.sha),
      cases: t.cases.map((c) => renderCase(c, ctx)).join('\n\n')
    })
    const hits = scan(body)
    if (hits.length) {
      summary.notOpened.push({
        pr: t.pr,
        cases: t.cases.map((c) => c.id),
        reason: `scanner: ${hits.join(', ')}`
      })
      continue
    }
    const cases = t.cases.map((c) => c.id)
    write({
      t: 'intent',
      op: 'comment',
      key,
      pr: t.pr,
      issue: t.issue,
      nonce: n,
      cases,
      runId: input.runId,
      at: now()
    })
    const r = gh.run(['issue', 'comment', String(t.issue), '--repo', repo, '--body-file', '-'], {
      input: body
    })
    if (!r.dry && !r.ok) {
      summary.unknown.push({ pr: t.pr, issue: t.issue, cases, error: r.stderr.trim().slice(0, 200) })
      continue
    }
    write({ t: 'result', op: 'comment', key, nonce: n, issue: t.issue, outcome: 'created', at: now() })
    summary.commented.push({ pr: t.pr, issue: t.issue, cases })
  }
  return summary
}

/**
 * The one comment a follow-up makes when a case passes two nights in a row (§7.4). The caller has
 * already applied the night's brakes and switches.
 * @param {{ repo?: string, issue: number, key: string, caseId: string, sha: string, runId: string }} o
 * @param {{ gh: ReturnType<typeof createGh>, ledger: { append: Function }, nonce?: () => string, now?: () => string }} deps
 */
export function passesComment(o, deps) {
  const repo = o.repo ?? DEFAULT_REPO
  const n = (deps.nonce ?? (() => randomBytes(8).toString('hex')))()
  const now = deps.now ?? (() => new Date().toISOString())
  const body = fill(template('passes.en.md'), {
    marker: marker(o.key, n, ` case=${safePath(o.caseId)}`),
    caseId: safePath(o.caseId),
    sha: sha7(o.sha),
    runId: safePath(o.runId)
  })
  const write = deps.gh.dryRun ? () => {} : (e) => deps.ledger.append(e)
  write({
    t: 'intent',
    op: 'comment',
    key: o.key,
    issue: o.issue,
    nonce: n,
    cases: [],
    passes: o.caseId,
    at: now()
  })
  const r = deps.gh.run(['issue', 'comment', String(o.issue), '--repo', repo, '--body-file', '-'], {
    input: body
  })
  if (r.ok && !r.dry)
    write({ t: 'result', op: 'comment', key: o.key, nonce: n, issue: o.issue, outcome: 'created', at: now() })
  return { ok: r.ok, issue: o.issue }
}

// ---------------------------------------------------------------------------------------------
// what people answered

const CASE_ID = /\bpr\d+-k\d+\b/

/**
 * Priority (§7.2): a `daily-qa: confirmed|false-positive <id>` line in a comment by someone with write
 * access (newest wins) > a ticked box (= confirmed) > the label at close, for cases with nothing else.
 * Comments that carry the script's own marker are never read as answers.
 * @param {{ body?: string, state?: string, labels?: { name: string }[],
 *           comments?: { body: string, authorAssociation?: string, createdAt?: string }[] }} view
 * @param {string[]} caseIds
 */
export function readResponses(view, caseIds) {
  const wanted = new Set(caseIds)
  /** @type {Map<string, { verdict: string, source: string }>} */
  const out = new Map()
  const comments = [...(view.comments ?? [])].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt))
  )
  const ours = comments.filter((c) => String(c.body ?? '').includes('<!-- daily-qa key='))
  const people = comments.filter(
    (c) => !ours.includes(c) && WRITERS.has(String(c.authorAssociation ?? '').toUpperCase())
  )

  const commands = new Map()
  for (const c of people) {
    for (const line of String(c.body ?? '').split('\n')) {
      const m = /^\s*daily-qa:\s*(confirmed|false-positive)\s+(pr\d+-k\d+)\s*$/.exec(line)
      if (m && wanted.has(m[2])) commands.set(m[2], m[1]) // later comment overwrites: newest wins
    }
  }
  for (const [id, verdict] of commands) out.set(id, { verdict, source: 'comment' })

  for (const text of [view.body ?? '', ...ours.map((c) => c.body)]) {
    for (const line of String(text).split('\n')) {
      if (!/^\s*[-*] \[[xX]\]/.test(line)) continue
      const id = CASE_ID.exec(line)?.[0]
      if (id && wanted.has(id) && !out.has(id)) out.set(id, { verdict: 'confirmed', source: 'checkbox' })
    }
  }

  if (String(view.state ?? '').toUpperCase() === 'CLOSED') {
    const labels = new Set((view.labels ?? []).map((l) => l.name))
    const c = labels.has(LABELS.confirmed)
    const f = labels.has(LABELS.falsePositive)
    if (c !== f) {
      for (const id of wanted) {
        if (!out.has(id)) out.set(id, { verdict: c ? 'confirmed' : 'false-positive', source: 'label' })
      }
    }
  }
  return out
}
