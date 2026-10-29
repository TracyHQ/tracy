// The bounded cleanup turn after a brief build (spec TracyHQ/tracy#189, ticket #197). The Customize engine builds the
// site, the demo-leftover check reads it, and when the check still reports leftovers ONE short agent turn receives only
// those findings. This module is pure: the prompt text, the limits, and the before/after comparison the hand-off
// report shows. The runner (`apps/tracy-web/src/opportunities-build/demo-leftover-cleanup.js`) wires it to the agent.
import { LEFTOVER_KINDS } from './demo-leftovers.mjs'
import { statisticWriterLines } from './statistic-tuples.mjs'

export const LEFTOVER_CLEANUP_VERSION = 'leftover-cleanup/1'

/** The turn is bounded in time and in tool calls; the runner enforces the time, the prompt states both. */
export const CLEANUP_LIMITS = Object.freeze({ timeoutMs: 8 * 60_000, toolCalls: 40 })

/** Findings the prompt lists; the rest are counted (the next check lists them again). */
export const CLEANUP_FINDINGS_SHOWN = 40

/**
 * What to put in place of each kind, by the one replacement order: the owner's own data, then a neutral substitute
 * (initials, the name as text, a sentence with no numbers, hiding the element), and never the demo's value.
 */
const INSTEAD = Object.freeze({
  C01: "the owner's own picture if the site holds one, otherwise hide the picture block",
  C02: 'take the demo post off the page and out of the menu and lists',
  C03: "the owner's own offering if the brief has one, otherwise hide the card and its page",
  C04: 'hide the icon, or use a plain neutral one',
  C05: "the owner's own picture, otherwise hide the cut-out figure",
  C06: "the owner's own pictures, one per card, otherwise hide the pictures of the cards",
  C07: "the owner's own person if the brief names one (name as text, initials in place of a photo), otherwise hide the block",
  C08: "the owner's own video link if the brief has one, otherwise hide the video block",
  C09: 'a plain label in the business\'s own words ("Contact us", "Learn more"), or hide the decorative text',
  C10: 'a plain neutral background colour in place of the demo picture',
  C11: 'hide the page and remove its menu entry',
  C12: "a plain address in the business's own words, with the old address redirecting to it",
  C13: "the owner's logo if the site holds one, otherwise the business name as text",
  C14: 'remove the template credit line',
  C15: 'hide the avatars or the signature',
  C16: "the owner's name and a plain sentence with no numbers, or hide the demo parts",
  C17: "the owner's own value from the owner data below if it is there, otherwise hide the line",
  C18: "the owner's own link or map if the owner data has it, otherwise hide the icon or the map",
  C19: 'point the link to a page that exists, or remove the link',
  C20: "the owner's words inside the template's own inline tags (the accent span, the line break) at the same place",
  C21: 'hide the whole form block (heading, text, field and button): a form stays only with a real destination',
  C22: 'keep one icon per channel kind and one channel (the main phone) in a block shown on every page; show the address with commas'
})

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
 * The cleanup turn's one message: the findings and nothing else of the build task.
 * @param {{leftovers: {findings?: any[]}, brief?: any, limits?: {timeoutMs: number, toolCalls: number}}} input
 * @returns {string}
 */
export function renderLeftoverCleanupPrompt({ leftovers, brief = null, limits = CLEANUP_LIMITS }) {
  const findings = Array.isArray(leftovers?.findings) ? leftovers.findings : []
  const lines = []
  const line = (s = '') => lines.push(s)
  line(
    'A check of this site found places that still show the template demo instead of the business. Fix only these places.'
  )
  line()
  line('Rules:')
  line(
    "1. Replace each with the owner's own data. If the owner data below does not have it, use a neutral substitute (initials, the name as text, a sentence with no numbers), or hide the element. Never keep the demo value. Never invent people, prices, numbers or facts."
  )
  line(
    '2. Touch nothing else. Do not remove, rename or rebuild any page, section or menu entry that is not listed, and do not restyle the site.'
  )
  line(
    `3. This is a short job: at most ${limits.toolCalls} tool calls and about ${Math.round(limits.timeoutMs / 60_000)} minutes. Stop when the listed places are done.`
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
    const name = LEFTOVER_KINDS[f.kind]?.name ?? f.kind
    line(
      `- ${f.kind} ${name} | page ${f.page} | ${f.place} | found ${JSON.stringify(String(f.found ?? '').slice(0, 80))} | instead: ${INSTEAD[f.kind] ?? "the owner's own data, otherwise a neutral substitute, otherwise hide it"}`
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
