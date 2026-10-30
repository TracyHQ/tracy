// The bounded cleanup turn after a brief build (spec TracyHQ/tracy#189, ticket #197). The Customize engine builds the
// site, the demo-leftover check reads it, and when the check still reports leftovers ONE short agent turn receives only
// those findings. This module is pure: the prompt text, the limits, and the before/after comparison the hand-off
// report shows. The runner (`apps/tracy-web/src/opportunities-build/demo-leftover-cleanup.js`) wires it to the agent.
import { LEFTOVER_KINDS } from './demo-leftovers.mjs'
import { repairOf, ruleOfFinding } from './build-rules.mjs'
import { statisticWriterLines } from './statistic-tuples.mjs'

export const LEFTOVER_CLEANUP_VERSION = 'leftover-cleanup/1'

/** The turn is bounded in time and in tool calls; the runner enforces the time, the prompt states both. */
export const CLEANUP_LIMITS = Object.freeze({ timeoutMs: 8 * 60_000, toolCalls: 40 })

/** Findings the prompt lists; the rest are counted (the next check lists them again). */
export const CLEANUP_FINDINGS_SHOWN = 40

/** One owner fact line of the brief, only when the brief has it. */
function ownerLines(brief) {
  const b = brief?.business ?? {}
  const rows = [
    ['name', b.name],
    ['address', b.address],
    ['phone', b.phone],
    ['email', b.email]
  ]
  return rows
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v.trim())}`)
}

/**
 * What goes in a record place (#189 item 18, `record-roles.mjs`): its own record from the brief, written as it is, else
 * the block comes off. Null for a place that is no record.
 * @param {string} place
 * @param {Record<string, string>} records
 * @param {Set<string>} recordPlaces
 */
function recordInstead(place, records, recordPlaces) {
  const record = records[place]
  if (typeof record === 'string' && record.trim())
    return `write exactly ${JSON.stringify(record.trim())} (its record from the brief), never the business name`
  if (recordPlaces.has(place))
    return 'hide the block: this place holds a record the brief does not have, never the business name or invented words'
  return null
}

/**
 * The cleanup turn's one message: the findings and nothing else of the build task.
 * @param {{leftovers: {findings?: any[]}, brief?: any, limits?: {timeoutMs: number, toolCalls: number},
 *   records?: Record<string, string>, recordPlaces?: Iterable<string>}} input - `records`: the record each record place
 *   of the site plan carries (`recordValuesOf`); `recordPlaces`: every record-role place of the content map
 * @returns {string}
 */
export function renderLeftoverCleanupPrompt({
  leftovers,
  brief = null,
  limits = CLEANUP_LIMITS,
  records = {},
  recordPlaces = []
}) {
  const places = new Set([...recordPlaces, ...Object.keys(records)])
  const findings = Array.isArray(leftovers?.findings) ? leftovers.findings : []
  const lines = []
  const line = (s = '') => lines.push(s)
  line(
    'A check of this site found places that still show the template demo instead of the business. Fix only these places.'
  )
  line()
  line('Rules:')
  line(
    "1. Replace each with the owner's own data. If the owner data below does not have it, use a neutral substitute (initials, the name as text, a sentence with no numbers) written in the shape of its siblings, or hide the element only where the layout survives without it. Never keep the demo value. Never invent people, prices, numbers or facts."
  )
  line(
    '2. Touch nothing else. Do not remove, rename or rebuild any page, section or menu entry that is not listed, and do not restyle the site.'
  )
  line(
    `3. This is a short job: at most ${limits.toolCalls} tool calls and about ${Math.round(limits.timeoutMs / 60_000)} minutes. Stop when the listed places are done.`
  )
  line(
    "4. A guest review's words, author and source, a person's name, a statistic, a contact line and a video link are records: write only the record a place is given below, never the business name; a record place given none is hidden."
  )
  line()
  const broken = Array.isArray(leftovers?.broken) ? leftovers.broken : []
  if (broken.length) {
    line('## The site is not fully served (fix this before anything else)')
    for (const b of broken.slice(0, CLEANUP_FINDINGS_SHOWN))
      line(`- page ${b.path} | ${b.why ?? 'not served with 200'}`)
    line(
      'A page that does not answer shows no demo words, so the check could not judge it. Find why it fails and restore it. Do not report the site as done while one of these pages is not served.'
    )
    line()
  }
  line('## Findings (kind, page, place, found, put instead)')
  for (const f of findings.slice(0, CLEANUP_FINDINGS_SHOWN)) {
    // What to put instead comes from the site build rules registry (`build-rules.mjs`), one wording for every turn.
    const name = LEFTOVER_KINDS[f.kind]?.name ?? ruleOfFinding(f)?.id ?? f.kind
    line(
      `- ${f.kind} ${name} | page ${f.page} | ${f.place} | found ${JSON.stringify(String(f.found ?? '').slice(0, 80))} | instead: ${recordInstead(String(f.place ?? ''), records, places) ?? repairOf(f) ?? "the owner's own data, otherwise a neutral substitute, otherwise hide it"}`
    )
  }
  if (findings.length > CLEANUP_FINDINGS_SHOWN)
    line(`- and ${findings.length - CLEANUP_FINDINGS_SHOWN} more of the same kinds, found by the next check.`)
  const owner = ownerLines(brief)
  if (owner.length) {
    line()
    line('## Owner data')
    for (const o of owner) line(o)
  }
  line()
  line('## Accepted statistics (number, label, source)')
  for (const row of statisticWriterLines(brief)) line(row)
  return lines.join('\n')
}

/**
 * The repair loop's bounds (COO decision 30/10/2026): at most three rounds, each a bounded turn (`CLEANUP_LIMITS`), all of
 * them within twenty minutes. A round that would start with less than `minRoundMs` left does not start.
 */
export const REPAIR_LIMITS = Object.freeze({ rounds: 3, totalMs: 20 * 60_000, minRoundMs: 60_000 })

/**
 * The findings the repair loop hands the agent: only those whose site build rule (`build-rules.mjs`) says what to put
 * instead, each with that rule's id, repair text and guarantee, the ones that block the build first, at most
 * `CLEANUP_FINDINGS_SHOWN`. A finding no rule can repair stays for the person under Needs fixes.
 * @param {{findings?: any[]}} report
 * @returns {Array<{finding: any, rule: string | null, repair: string, guarantee: string | null, blocks: boolean}>}
 */
export function repairFindings(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : []
  const flagged = []
  for (const finding of findings) {
    const repair = repairOf(finding)
    if (!repair) continue
    const rule = ruleOfFinding(finding)
    flagged.push({
      finding,
      rule: rule?.id ?? null,
      repair,
      guarantee: rule?.guarantee ?? null,
      blocks: rule?.severity === 'blocker' && rule.blocks?.(finding) === true
    })
  }
  // A stable sort: blockers first, the check's own order inside each group.
  return [...flagged.filter((f) => f.blocks), ...flagged.filter((f) => !f.blocks)]
}

/** The count each repair round must lower: every repairable finding, plus every kept page that is not served. */
export function repairCount(report) {
  const broken = Array.isArray(report?.broken) ? report.broken.length : 0
  return repairFindings(report).length + broken
}

/**
 * One repair round's message: the flagged findings with the registry's repair text and guarantee, the pages that do not
 * answer, the owner data, and nothing else of the build task. Hard facts come only from the owner data and the accepted
 * statistics below.
 * @param {{leftovers: {findings?: any[], broken?: any[]}, brief?: any, limits?: {timeoutMs: number, toolCalls: number},
 *   records?: Record<string, string>, recordPlaces?: Iterable<string>, round?: number, rounds?: number}} input
 * @returns {string}
 */
export function renderRepairPrompt({
  leftovers,
  brief = null,
  limits = CLEANUP_LIMITS,
  records = {},
  recordPlaces = [],
  round = 1,
  rounds = REPAIR_LIMITS.rounds
}) {
  const places = new Set([...recordPlaces, ...Object.keys(records)])
  const flagged = repairFindings(leftovers)
  const lines = []
  const line = (s = '') => lines.push(s)
  line(
    `Repair round ${round} of at most ${rounds}. A check of this site found places that break its build rules. Fix only these places; the check runs again when you stop.`
  )
  line()
  line('Rules:')
  line(
    "1. Put in each place what its line says instead. Use the owner's own data below; editorial words may be written from the business and its trade in the shape of the place's siblings. Never keep the demo value."
  )
  line(
    '2. A hard fact (a price, a phone number, an address, opening hours, a name, a year, a guarantee, a statistic) is written only when the owner data or the accepted statistics below hold it. Never invent one: hide the element instead, only where the layout survives without it.'
  )
  line(
    '3. Touch nothing else. Do not remove, rename or rebuild any page, section or menu entry that is not listed, and do not restyle the site.'
  )
  line(
    `4. This is a short job: at most ${limits.toolCalls} tool calls and about ${Math.round(limits.timeoutMs / 60_000)} minutes. Stop when the listed places are done.`
  )
  line()
  const broken = Array.isArray(leftovers?.broken) ? leftovers.broken : []
  if (broken.length) {
    line('## The site is not fully served (fix this before anything else)')
    for (const b of broken.slice(0, CLEANUP_FINDINGS_SHOWN))
      line(`- page ${b.path} | ${b.why ?? 'not served with 200'}`)
    line('A page that does not answer could not be judged. Find why it fails and restore it.')
    line()
  }
  line('## Places to fix (kind, page, place, found, instead, rule)')
  // 🔒 ONE LINE PER PLACE, NOT PER PAGE (R12, 30/10/2026): a value left in a place every page shows (a footer, a shared
  // module) is one fix, and listed once per page it filled the round's lines and kept every other place from the turn.
  const groups = new Map()
  for (const f of flagged) {
    const k = f.finding
    // Findings of the page-wide checks (menu, footer, head blocks) name their page and place in their own fields.
    const page = k.page ?? k.path ?? 'the whole site'
    const place = k.place ?? k.href ?? k.why ?? k.reason ?? 'see the rule'
    const found = String(k.found ?? k.label ?? '').slice(0, 80)
    const key = JSON.stringify([k.kind, place, found, f.repair])
    const known = groups.get(key)
    if (known) {
      if (!known.pages.includes(page)) known.pages.push(page)
      continue
    }
    groups.set(key, { f, place, found, pages: [page] })
  }
  const listed = [...groups.values()]
  const PAGES_SHOWN = 6
  for (const { f, place, found, pages } of listed.slice(0, CLEANUP_FINDINGS_SHOWN)) {
    const k = f.finding
    const name = LEFTOVER_KINDS[k.kind]?.name ?? f.rule ?? k.kind
    const instead = recordInstead(String(k.place ?? ''), records, places) ?? f.repair
    const why = f.guarantee ? ` | rule: ${f.guarantee}` : ''
    const where =
      pages.length === 1
        ? `page ${pages[0]}`
        : `pages ${pages.slice(0, PAGES_SHOWN).join(', ')}${pages.length > PAGES_SHOWN ? ', …' : ''} (${pages.length} pages)`
    line(
      `- ${k.kind} ${name}${f.blocks ? ' (blocks the build)' : ''} | ${where} | ${place} | found ${JSON.stringify(found)} | instead: ${instead}${why}`
    )
  }
  if (listed.length > CLEANUP_FINDINGS_SHOWN)
    line(`- and ${listed.length - CLEANUP_FINDINGS_SHOWN} more places, listed in the next round.`)
  const owner = ownerLines(brief)
  if (owner.length) {
    line()
    line('## Owner data')
    for (const o of owner) line(o)
  }
  line()
  line('## Accepted statistics (number, label, source)')
  for (const row of statisticWriterLines(brief)) line(row)
  return lines.join('\n')
}

const keyOf = (f) => `${f.kind}|${f.page}|${f.place}`

/** A short, storable summary of one check report. */
export function summarizeLeftovers(report) {
  const findings = Array.isArray(report?.findings) ? report.findings : []
  return {
    total: findings.length,
    counts: report?.counts ?? {},
    findings: findings.map(({ kind, page, place, found }) => ({ kind, page, place, found })),
    broken: Array.isArray(report?.broken) ? report.broken : [],
    pages: Array.isArray(report?.pages) ? report.pages : [],
    unread: Array.isArray(report?.unread) ? report.unread : []
  }
}

/**
 * What the turn changed: findings it fixed, findings that remain, findings it introduced, and the pages that were read
 * before and are not served after (the turn never replaces the engine's site with less).
 * @param {object} before - the check report before the turn
 * @param {object} after - the check report after the turn
 */
export function compareLeftovers(before, after) {
  const was = new Map((before?.findings ?? []).map((f) => [keyOf(f), f]))
  const now = new Map((after?.findings ?? []).map((f) => [keyOf(f), f]))
  const afterPages = new Set(after?.pages ?? [])
  return {
    fixed: [...was].filter(([k]) => !now.has(k)).map(([, f]) => f),
    remaining: [...now].filter(([k]) => was.has(k)).map(([, f]) => f),
    introduced: [...now].filter(([k]) => !was.has(k)).map(([, f]) => f),
    pagesLost: (before?.pages ?? []).filter(
      (p) => !afterPages.has(p) && p !== '/tracy-leftover-check-missing-page'
    )
  }
}
