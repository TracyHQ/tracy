// Faults read from one page's own measures, whose owner is decided from the write report: a button that leads to the page it is on, a
// page title printed as a heading, and a created page showing controls the template's content pages do not.
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'
import { ownerStep, TEMPLATE_STEP } from './steps.js'

const each = (value) => (Array.isArray(value) ? value : [])
const squashed = (text) =>
  String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** A page's path as a kept page says it, whichever way the host opened it. */
export const pathOfMeasure = (p) => {
  const path = String(p ?? '')
    .replace(/^\/index\.php(?=\/|$)/, '')
    .replace(/\/+$/, '')
    .toLowerCase()
  return path === '' ? '/' : path
}

const oncePerPage = (measures, listOf, findingOf) => {
  const seen = new Set()
  const out = []
  for (const m of each(measures))
    for (const item of listOf(m)) {
      const finding = { page: m.path, ...findingOf(item, m) }
      const id = `${m.path} ${JSON.stringify(finding.measured)}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push(finding)
    }
  return out
}

// ── Self links ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Who owns a button: the slot of a link with its words, through the write report. A link no line wrote, in a slot no step owns, is the
 * planner's (as `unowned-slots`); a link in no slot at all is the template's.
 */
export function selfLinkOwner({ text, page }, { slots = [], lines = [], unowned = [] }) {
  const said = squashed(text)
  const worded = slots.filter((s) => s.type !== 'url' && s.type !== 'image' && squashed(s.current) === said)
  const groupOf = (s) => s.group?.id ?? null
  const link = slots.find(
    (s) =>
      s.type === 'url' &&
      worded.some(
        (w) =>
          (groupOf(w) && groupOf(w) === groupOf(s)) ||
          (s.xpath &&
            w.entity === s.entity &&
            String(w.xpath ?? '').startsWith(`${String(s.xpath).replace(/\/@href$/, '')}/text()`))
      )
  )
  if (!link) return { step: TEMPLATE_STEP, slot: null }
  const line = lines.find((l) => l.key === link.key && l.status === 'written')
  if (line) return { step: ownerStep(line.owner) ?? 3, slot: line.slot }
  const free = unowned.find((u) => String(u.slot).replace(/^block-/, 'module-') === link.key)
  return { step: 3, slot: free?.slot ?? link.key, page }
}

export const selfLinksGroup = {
  name: 'self-links',
  causingStep: 3,
  async run(context) {
    const read = await pagesRead(context)
    const known = read.measures.filter((m) => Array.isArray(m.selfLinks))
    if (!known.length)
      throw new GroupUnmeasured(
        'The host answered no links to the page they are on, so this was not measured.'
      )
    const found = known.flatMap((m) => m.selfLinks.map((l) => ({ ...l, page: m.path })))
    let slots = []
    if (found.length) {
      const reading = await context.read('content.contract', { operation: 'inspect' })
      slots = each(reading.slots)
    }
    const failures = oncePerPage(
      known,
      (m) => m.selfLinks,
      (l, m) => {
        const { step, slot } = selfLinkOwner(
          { text: l.text, page: m.path },
          { slots, lines: each(context.report?.slots), unowned: each(context.report?.unowned) }
        )
        return {
          measured: l.text || l.selector,
          slot,
          causingStep: step,
          reason: 'This button leads to the page it is on.'
        }
      }
    )
    return { checked: known.length, failures }
  }
}

// ── Separators ────────────────────────────────────────────────────────────────────────────────────────────────────

const HARD = /\s(?:\||»|::)\s/
const SOFT = /\s[-·•–—]\s/

/**
 * A page title printed as a heading: a bar or the like between words, or a softer mark when the whole of it is the page's own title
 * (a dash can belong in a heading; the same words as the browser tab cannot).
 */
export function hasSeparator(text, title) {
  const t = String(text)
  return HARD.test(t) || (SOFT.test(t) && squashed(t) === squashed(title))
}

export function findSeparatorHeadings(measures) {
  return [
    ...oncePerPage(
      measures,
      (m) =>
        [...each(m.mainHeadings), ...each(m.headings), ...each(m.minorHeadings)].filter((h) =>
          hasSeparator(h, m.title)
        ),
      (h) => ({
        measured: String(h).slice(0, 120),
        reason: 'A page title with its separator is printed as a heading.'
      })
    ),
    ...oncePerPage(
      measures,
      (m) => each(m.hiddenHeadings).filter((h) => hasSeparator(h, m.title)),
      (h) => ({
        measured: String(h).slice(0, 120),
        level: 'warn',
        reason:
          'A heading kept for a screen reader holds a page title with its separator; a visitor does not see it.'
      })
    )
  ]
}

export const headingSeparatorGroup = {
  name: 'heading-separator',
  causingStep: 6,
  async run(context) {
    const read = await pagesRead(context)
    const known = read.measures.filter((m) => Array.isArray(m.hiddenHeadings))
    if (!known.length)
      throw new GroupUnmeasured('The host answered no hidden headings, so this was not measured.')
    return { checked: known.length, failures: findSeparatorHeadings(known) }
  }
}

// ── Controls on a created page ────────────────────────────────────────────────────────────────────────────────────

/** The pages the write step created, by the kept page's id its lines carry. */
export function createdPaths(report) {
  const ids = new Set(
    each(report?.slots)
      .filter((s) => s.part === 'page-address')
      .map((s) => String(s.slot).replace(/:address$/, ''))
  )
  return new Set(
    each(report?.keptPages)
      .filter((p) => ids.has(p.id))
      .map((p) => pathOfMeasure(p.path))
  )
}

/**
 * A created page's controls against the template's content pages at the same width: those of the same view (`view-article`), or every
 * other page when none shares it. What a kept page prints too belongs to the template and stays.
 * @returns {{ failures: object[], compared: number } | null} null when no page can stand for the template's content pages
 */
export function judgeCreatedControls(measures, created) {
  const known = each(measures).filter((m) => Array.isArray(m.contentControls))
  const mine = known.filter((m) => created.has(pathOfMeasure(m.path)))
  const failures = []
  let compared = 0
  for (const m of mine) {
    const others = known.filter((o) => o.width === m.width && !created.has(pathOfMeasure(o.path)))
    const sameView = others.filter((o) => o.view && o.view === m.view)
    const content = sameView.length ? sameView : others.filter((o) => pathOfMeasure(o.path) !== '/')
    if (!content.length) return null
    compared++
    const theirs = new Set(content.flatMap((o) => o.contentControls.map((c) => c.key)))
    const extra = m.contentControls.filter((c) => !theirs.has(c.key))
    if (extra.length)
      failures.push({
        page: m.path,
        width: m.width,
        measured: {
          count: extra.length,
          shown: extra.slice(0, 8).map((c) => `${c.key}${c.text ? ` "${c.text}"` : ''}`)
        },
        reason: `This created page shows controls none of the ${content.length} content pages of the template shows at this width.`
      })
  }
  return { failures, compared }
}

export const createdControlsGroup = {
  name: 'created-controls',
  causingStep: 9,
  async run(context) {
    const created = createdPaths(context.report)
    if (!created.size) return { checked: 0, failures: [] }
    const read = await pagesRead(context)
    if (!read.measures.some((m) => Array.isArray(m.contentControls)))
      throw new GroupUnmeasured('The host answered no content controls, so this was not measured.')
    const judged = judgeCreatedControls(read.measures, created)
    if (!judged)
      throw new GroupUnmeasured(
        "No kept page stands for the template's content pages, so this was not measured."
      )
    return { checked: judged.compared, failures: judged.failures }
  }
}
