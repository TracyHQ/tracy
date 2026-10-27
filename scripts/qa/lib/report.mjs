// The nightly report the owner reads in two minutes (plan §9): `reports/<runId>.md` on `qa/daily-tests`.
// Every Vietnamese word lives in ../templates/report.vi.md and ../templates/labels.vi.json; this file
// only arranges data. Every untrusted string (quotes, observations, PR titles, commit subjects, log
// lines) goes through literal() / literalInline().
//
// Exports:
//   fill(template: string, vars: Record<string, unknown>) -> string
//     replaces {{name}}; throws on a placeholder without a value.
//   fmt(label: string, vars: Record<string, unknown>) -> string        replaces {name} in a label.
//   loadLabels(dir?) -> object                                          labels.vi.json
//   renderReport(night: Night, opts?: { templateDir?: string, labels?: object }) -> string
//
// Night (all lists optional; an empty list renders as "none"):
//   { runId, range: { from, to }, stand: { sha, reconciled, baseline }, prCount,
//     directCommits: { sha, subject }[], durationMin,
//     fence: { ok }, standCanary: { ok },
//     models: { plan, sonnet, sol: { model, effort }, verify: { model, effort } },
//     redSummary: { sonnet, sol, both, verified },
//     needsReview: { pr, author, caseId, quote, observed, differsFromB: 'yes'|'no'|'unknown',
//                    redLanes: string[], issue: number|null, look }[],
//     laneDisagreements: { pr, caseId, sonnet, sol }[]           (lane statuses)
//     inconclusive: { pr, caseId, reason }[], unclassified: { pr, caseId }[],
//     following: { pr, caseId, issue, nights }[],
//     observedOk: { pr, caseId, quote, lanes: string[] }[],
//     notCheckable: { pr, reason }[], docsOnly: number[], notReached: number[],
//     ended: { pr, state, reason }[],
//     issues: publishIssues() summary + { feedback: { sonnet: { confirmed, falsePositive }, sol: {...} } },
//     lanes: { sonnet: LaneRow, sol: LaneRow }, calibration: { sonnet: Calib, sol: Calib },
//       LaneRow = { assigned, ran, redOnT, differs, testWrong, confirmed, falsePositive, timeouts, minutesPerPr, cost }
//       Calib = { true: status, false: status, falseVerdict }
//     regression: { core, ran, passed, failed, quarantined: { caseId, reason }[] },
//     chat: { primer: 'ok'|'failed'|'off', turns: { sonnet, sol, verify }, failures: { hung, quota, credential, provider },
//             balance: { start, end } },
//     troubles: string[], sites: { created, deleted, orphans }, access: { humanUrl, otp, rerun } }

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { literal, literalInline } from './literal.mjs'

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')
const LANES = ['sonnet', 'sol']
const SMALL_SAMPLE = 10

/** @param {string} tpl @param {Record<string, unknown>} vars */
export function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`template placeholder without a value: ${k}`)
    return String(vars[k])
  })
}

/** @param {string} label @param {Record<string, unknown>} [vars] */
export function fmt(label, vars = {}) {
  return String(label).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

export function loadLabels(dir = TEMPLATES) {
  return JSON.parse(readFileSync(join(dir, 'labels.vi.json'), 'utf8'))
}

// ---------------------------------------------------------------------------------------------
// small pieces

const cell = (text) => literalInline(text, { table: true })
const num = (n) => (Number.isFinite(Number(n)) ? String(Number(n)) : '-')
const sha7 = (s) => literalInline(String(s ?? '').slice(0, 7))
const prRef = (n) => `#${num(n)}`
const caseRef = (id) => literalInline(id)

function table(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n')
}

function list(items, none) {
  return items.length ? items.map((i) => `- ${i}`).join('\n') : none
}

function sub(title, body) {
  return `**${title}**\n\n${body}`
}

// ---------------------------------------------------------------------------------------------
// sections

function header(n, L) {
  const counts = [
    [L.counts.inconclusive, n.inconclusive?.length ?? 0],
    [L.counts.observedOk, n.observedOk?.length ?? 0],
    [L.counts.notCheckable, n.notCheckable?.length ?? 0],
    [L.counts.docsOnly, n.docsOnly?.length ?? 0],
    [L.counts.notReached, n.notReached?.length ?? 0],
    [L.counts.unclassified, n.unclassified?.length ?? 0]
  ]
    .map(([label, count]) => `${label} ${count}`)
    .join(' · ')
  const chat = n.chat ?? {}
  const failures = chat.failures ?? {}
  const turns = chat.turns ?? {}
  const totalTurns = ['sonnet', 'sol', 'verify'].reduce((s, l) => s + (Number(turns[l]) || 0), 0)
  const min = Number(n.durationMin) || 0
  const health = [
    fmt(L.health.baseline, { state: literalInline(n.stand?.baseline ?? 'unverified') }),
    n.fence?.ok && n.standCanary?.ok ? L.health.fenceOk : L.health.fenceBad,
    fmt(L.health.chat, {
      primer: L.health.primer[chat.primer] ?? literalInline(chat.primer),
      turns: totalTurns,
      hung: num(failures.hung ?? 0)
    }),
    fmt(L.health.duration, { h: Math.floor(min / 60), m: min % 60 })
  ].join(' · ')
  const m = n.models ?? {}
  const effort = (x) =>
    fmt(L.model.effort, { model: literalInline(x?.model), effort: literalInline(x?.effort) })
  const models = [
    literalInline(m.plan),
    literalInline(m.sonnet),
    `sol = ${effort(m.sol)}`,
    `verify = ${effort(m.verify)}`
  ].join(' · ')
  const rs = n.redSummary ?? {}
  return {
    runId: literalInline(n.runId),
    from: sha7(n.range?.from),
    to: sha7(n.range?.to),
    standSha: sha7(n.stand?.sha),
    standState: n.stand?.reconciled ? L.reconciled : L.notReconciled,
    prCount: num(n.prCount),
    directCount: num(n.directCommits?.length ?? 0),
    reviewCount: new Set((n.needsReview ?? []).map((r) => r.pr)).size,
    reviewDetail: fmt(L.reviewDetail, {
      sonnet: num(rs.sonnet ?? 0),
      sol: num(rs.sol ?? 0),
      both: num(rs.both ?? 0),
      verified: num(rs.verified ?? 0)
    }),
    countsLine: counts,
    healthLine: health,
    modelsLine: models
  }
}

function needsReview(n, L) {
  const rows = (n.needsReview ?? []).map((r) => [
    prRef(r.pr),
    cell(r.author),
    caseRef(r.caseId),
    cell(r.quote),
    cell(r.observed),
    L.differsFromB[r.differsFromB] ?? L.differsFromB.unknown,
    (r.redLanes ?? []).map((l) => literalInline(l)).join(', '),
    r.issue ? prRef(r.issue) : '-',
    cell(r.look)
  ])
  return rows.length ? table(L.reviewTable, rows) : L.none
}

function laneDisagreements(n, L) {
  const st = (s) => L.laneStatus[s] ?? literalInline(s ?? '-')
  const rows = (n.laneDisagreements ?? []).map((r) => [
    prRef(r.pr),
    caseRef(r.caseId),
    st(r.sonnet),
    st(r.sol)
  ])
  return rows.length ? table(L.laneTable, rows) : L.none
}

function pending(n, L) {
  const inc = (n.inconclusive ?? []).map(
    (r) => `${prRef(r.pr)} ${caseRef(r.caseId)}: ${literalInline(r.reason)}`
  )
  const unc = (n.unclassified ?? []).map((r) => `${prRef(r.pr)} ${caseRef(r.caseId)}`)
  const fol = (n.following ?? []).map(
    (r) =>
      `${prRef(r.pr)} ${caseRef(r.caseId)}${r.issue ? ` (issue ${prRef(r.issue)})` : ''}, ${fmt(L.pending.followingItem, { nights: num(r.nights) })}`
  )
  return [
    sub(L.pending.inconclusive, list(inc, L.none)),
    sub(L.pending.unclassified, list(unc, L.none)),
    sub(L.pending.following, list(fol, L.none))
  ].join('\n\n')
}

function observedOk(n, L) {
  const rows = (n.observedOk ?? []).map((r) => [
    prRef(r.pr),
    caseRef(r.caseId),
    cell(r.quote),
    (r.lanes ?? []).map((l) => literalInline(l)).join(', ')
  ])
  return rows.length ? table(L.observedTable, rows) : L.none
}

function notChecked(n, L) {
  const nc = (n.notCheckable ?? []).map((r) => `${prRef(r.pr)}: ${literalInline(r.reason)}`)
  const docs = (n.docsOnly ?? []).map(prRef)
  const direct = (n.directCommits ?? []).map((c) => `${sha7(c.sha)} ${literalInline(c.subject)}`)
  const reached = (n.notReached ?? []).map(prRef)
  const ended = (n.ended ?? []).map(
    (r) => `${prRef(r.pr)} ${literalInline(r.state)}: ${literalInline(r.reason)}`
  )
  const inline = (xs) => (xs.length ? xs.join(', ') : L.none)
  return [
    sub(L.notChecked.notCheckable, list(nc, L.none)),
    sub(L.notChecked.docsOnly, inline(docs)),
    sub(L.notChecked.directCommits, list(direct, L.none)),
    sub(L.notChecked.notReached, inline(reached)),
    sub(L.notChecked.ended, list(ended, L.none))
  ].join('\n\n')
}

function reasonText(reason, L) {
  const s = String(reason ?? '')
  const i = s.indexOf(':')
  const head = i < 0 ? s : s.slice(0, i)
  const tail = i < 0 ? '' : s.slice(i + 1).trim()
  const word = L.issues.reasons[head]
  if (!word) return literalInline(s)
  return tail ? `${word}: ${literalInline(tail)}` : word
}

function issues(n, L) {
  const s = n.issues ?? {}
  const parts = []
  if (s.blocked) parts.push(fmt(L.issues.blocked, { reason: reasonText(s.blocked, L) }))
  const cases = (ids) => (ids ?? []).map(caseRef).join(', ')
  parts.push(
    sub(
      L.issues.created,
      list(
        (s.created ?? []).map((c) => `${prRef(c.issue)} ← PR ${prRef(c.pr)}: ${cases(c.cases)}`),
        L.none
      )
    )
  )
  parts.push(
    sub(
      L.issues.commented,
      list(
        (s.commented ?? []).map((c) => `${prRef(c.issue)} ← PR ${prRef(c.pr)}: ${cases(c.cases)}`),
        L.none
      )
    )
  )
  parts.push(
    sub(
      L.issues.notOpened,
      list(
        (s.notOpened ?? []).map((c) => `PR ${prRef(c.pr)} (${cases(c.cases)}): ${reasonText(c.reason, L)}`),
        L.none
      )
    )
  )
  parts.push(
    sub(
      L.issues.unassigned,
      list(
        (s.unassigned ?? []).map((c) => `${prRef(c.issue)} ← PR ${prRef(c.pr)}: ${literalInline(c.reason)}`),
        L.none
      )
    )
  )
  parts.push(
    sub(
      L.issues.unknown,
      list(
        (s.unknown ?? []).map((c) => `PR ${prRef(c.pr)}: ${cases(c.cases)}`),
        L.none
      )
    )
  )
  const fb = s.feedback ?? {}
  parts.push(
    table(
      L.issues.feedbackTable,
      LANES.map((l) => [l, num(fb[l]?.confirmed ?? 0), num(fb[l]?.falsePositive ?? 0)])
    )
  )
  return parts.join('\n\n')
}

function laneComparison(n, L) {
  const lanes = n.lanes ?? {}
  const calib = n.calibration ?? {}
  const st = (s) => L.laneStatus[s] ?? literalInline(s ?? '-')
  const C = L.compare.rows
  const row = (label, f) => [label, ...LANES.map((l) => f(lanes[l] ?? {}, l))]
  const rows = [
    [L.compare.calibTrue, ...LANES.map((l) => st(calib[l]?.true))],
    [
      L.compare.calibFalse,
      ...LANES.map((l) => `${st(calib[l]?.false)}, ${literalInline(calib[l]?.falseVerdict ?? '-')}`)
    ],
    row(C.coverage, (x) => `${num(x.ran)} / ${num(x.assigned)}`),
    row(C.redOnT, (x) => num(x.redOnT)),
    row(C.differs, (x) => num(x.differs)),
    row(C.testWrong, (x) => num(x.testWrong)),
    row(C.confirmed, (x) => num(x.confirmed)),
    row(C.falsePositive, (x) => num(x.falsePositive)),
    row(C.timeouts, (x) => num(x.timeouts)),
    row(C.minutesPerPr, (x) => num(x.minutesPerPr)),
    row(C.cost, (x) => literalInline(x.cost))
  ]
  const out = [table(L.compare.header, rows)]
  const smallest = Math.min(...LANES.map((l) => Number(lanes[l]?.redOnT) || 0))
  if (smallest < SMALL_SAMPLE) out.push(fmt(L.compare.smallSample, { n: smallest }))
  return out.join('\n\n')
}

function regression(n, L) {
  const r = n.regression ?? {}
  const q = (r.quarantined ?? []).map((x) => `${caseRef(x.caseId)}: ${literalInline(x.reason)}`)
  return [
    fmt(L.regression.core, { state: literalInline(r.core ?? '-') }),
    fmt(L.regression.suite, { passed: num(r.passed ?? 0), ran: num(r.ran ?? 0), failed: num(r.failed ?? 0) }),
    sub(L.regression.quarantined, list(q, L.none))
  ].join('\n\n')
}

function chat(n, L) {
  const c = n.chat ?? {}
  const t = c.turns ?? {}
  const f = c.failures ?? {}
  const b = c.balance ?? {}
  return [
    fmt(L.chat.turns, { sonnet: num(t.sonnet ?? 0), sol: num(t.sol ?? 0), verify: num(t.verify ?? 0) }),
    fmt(L.chat.failures, {
      hung: num(f.hung ?? 0),
      quota: num(f.quota ?? 0),
      credential: num(f.credential ?? 0),
      provider: num(f.provider ?? 0)
    }),
    fmt(L.chat.balance, { start: literalInline(b.start ?? '-'), end: literalInline(b.end ?? '-') })
  ].join('\n\n')
}

function troubles(n, L) {
  const s = n.sites ?? {}
  const sites = fmt(L.troubles.sites, {
    created: num(s.created ?? 0),
    deleted: num(s.deleted ?? 0),
    orphans: num(s.orphans ?? 0)
  })
  const lines = n.troubles ?? []
  return [sites, lines.length ? literal(lines.join('\n'), { maxLines: 80 }) : L.none].join('\n\n')
}

function access(n, L) {
  const a = n.access ?? {}
  return [
    `- ${fmt(L.access.human, { url: literalInline(a.humanUrl) })}`,
    `- ${fmt(L.access.otp, { cmd: literalInline(a.otp) })}`,
    `- ${fmt(L.access.rerun, { cmd: literalInline(a.rerun) })}`
  ].join('\n')
}

/**
 * @param {object} night
 * @param {{ templateDir?: string, labels?: object }} [opts]
 */
export function renderReport(night, opts = {}) {
  const dir = opts.templateDir ?? TEMPLATES
  const L = opts.labels ?? loadLabels(dir)
  const tpl = readFileSync(join(dir, 'report.vi.md'), 'utf8')
  return fill(tpl, {
    ...header(night, L),
    needsReview: needsReview(night, L),
    laneDisagreements: laneDisagreements(night, L),
    pending: pending(night, L),
    observedOk: observedOk(night, L),
    notChecked: notChecked(night, L),
    issues: issues(night, L),
    laneComparison: laneComparison(night, L),
    regression: regression(night, L),
    chat: chat(night, L),
    troubles: troubles(night, L),
    access: access(night, L)
  })
}
