// What the finisher's content orders (content-repair-orders.js, #422) may take new words and addresses from, and nothing else
// (spec #418): the brief's facts, the writer's site copy file (its alts and its page titles and descriptions), step 8's
// description of each picture, and the pages the written site keeps. Missing files give empty sources, so an order that
// needs one is refused with the reason, never filled by a guess. Pure.
import { readCopy } from '../../lib/site-copy-view.js'

const each = (value) => (Array.isArray(value) ? value : [])

/** Step 8's seen sentence by frame (site-pictures/1): frames and template settings, the non-empty ones. */
function seenByFrame(pictures) {
  const out = new Map()
  for (const list of ['frames', 'siteSettings'])
    for (const e of each(pictures?.[list]))
      if (typeof e?.frame === 'string' && typeof e.seen === 'string' && e.seen.trim())
        out.set(e.frame, e.seen.trim())
  return out
}

/** The brief's facts the site may show, by field: `phone`, `email`, `name`, ... each with every value it gives. */
function briefValues(brief) {
  const out = new Map()
  for (const fact of each(brief?.facts)) {
    if (typeof fact?.field !== 'string' || fact.onSite === false) continue
    for (const value of Array.isArray(fact.value) ? fact.value : [fact.value])
      if (typeof value === 'string' && value.trim()) {
        if (!out.has(fact.field)) out.set(fact.field, [])
        out.get(fact.field).push(value.trim())
      }
  }
  return out
}

/**
 * The brief's own words for a page's title and description, when the site copy gives none: the business name it gives (a
 * title) and the purpose it gives that page (a description), matched by the page's kit id or its path. Each is a list, empty
 * when the brief has no such fact: nothing is composed.
 */
function briefPageMetaOf(brief, names) {
  return (page) => {
    const entry = each(brief?.pages).find(
      (p) => (p?.id && p.id === page.id) || (p?.path && p.path === page.path)
    )
    const purpose = typeof entry?.purpose === 'string' && entry.purpose.trim() ? [entry.purpose.trim()] : []
    return { title: [...names], description: purpose }
  }
}

/**
 * @param {{ kit: object, report: object, contentMap?: object | null, facts?: { brief?: object, copy?: object,
 *   pictures?: object } | null, sitePages: { path: string, id: string | null }[] }} input
 */
export function orderFacts({ kit, report, contentMap = null, facts = null, sitePages }) {
  const view = facts?.copy ? readCopy(facts.copy).view : { alts: [], seo: [] }
  const mapSlots = new Map(each(contentMap?.slots).map((s) => [s?.key, s]))
  const lines = new Map(each(report?.slots).map((l) => [l?.slot, l]))
  const kitSlots = new Map()
  for (const block of each(kit?.blocks))
    for (const slot of each(block?.slots)) kitSlots.set(slot?.id, { ...slot, block: block.id })
  const brief = briefValues(facts?.brief)
  return {
    kit,
    contentMap,
    sitePages,
    /** The kit slot by id, with the id of the block it is in. */
    kitSlotOf: (id) => kitSlots.get(id) ?? null,
    /** The content map entry of a key, or null. */
    mapSlotOf: (key) => mapSlots.get(key) ?? null,
    /** A line of the write report by its slot, whatever its status. */
    reportLineOf: (slot) => lines.get(slot) ?? null,
    brief,
    /** The brief's words for a page's title and description, for when the site copy gives none. */
    briefPageMeta: briefPageMetaOf(facts?.brief, brief.get('name') ?? []),
    copyAlts: new Map(view.alts.map((a) => [a.frame, a.text])),
    copySeo: new Map(view.seo.map((s) => [s.page, { title: s.title, description: s.description }])),
    seen: seenByFrame(facts?.pictures)
  }
}

/**
 * The sources the fixer is shown with one fault, so the order it proposes can name what code will accept: the brief's facts
 * by field, the paths of the pages the site keeps, step 8's description and the site copy's alt of each picture, and the site
 * copy's title and description of the fault's page (else the brief's words for them).
 * @param {ReturnType<typeof orderFacts>} facts
 * @param {{ page: string }} fault
 */
export function fixerSources(facts, fault) {
  const page = facts.sitePages.find((p) => p.path === fault.page)
  return {
    brief: Object.fromEntries(facts.brief),
    pages: facts.sitePages.map((p) => p.path),
    pictures: Object.fromEntries(facts.seen),
    alts: Object.fromEntries(facts.copyAlts),
    pageMeta: page?.id ? (facts.copySeo.get(page.id) ?? { fromBrief: facts.briefPageMeta(page) }) : null
  }
}
