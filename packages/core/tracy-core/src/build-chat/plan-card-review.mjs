/**
 * What the plan card shows of the plan's intent and what the owner can take off it (#575, the plan card the owner
 * reviewed): the key messages and the sections that carry them, how a customer reaches the business (the main
 * button, the end of each page, the channels the footers show), what every page shares (menu, header, footer), each
 * page's notes for the writer and its search intent, the standard pages, what is not on the site grouped by why, what
 * came from each kind of source, and what the owner can send later.
 *
 * Which parts carry a trash button follows the locks the draft door answers (`review.locks`, made from the template's
 * kit by `planLocksOf`): a part the kit or the plan keeps has none. Without locks (an older server) no page, section
 * or item is offered for removal. Pure: no React, no DOM.
 */
import { plainTextOf as text } from './plain-text.mjs'

const listOr = (value) => (Array.isArray(value) ? value : [])
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** The fact kinds a footer's contact line shows: what the owner can take off every footer at once. */
const CHANNEL_KINDS = new Set([
  'contact.phone',
  'contact.email',
  'contact.address',
  'contact.cta_url',
  'contact.social_url'
])
/** Section types every page shares: said once for the whole site, never under each page. */
const CHROME_TYPES = new Set(['header', 'footer'])
/** The item kinds the card names one by one in a section, each with its own trash. */
const NAMED_KINDS = new Set(['service', 'person', 'quote', 'gallery'])

/**
 * Left out codes by the group of the "not on the site" list they belong to, in the order the groups show. A code the
 * table does not know goes to `other`.
 */
const GROUP_OF = Object.freeze({
  no_place_in_design: 'no_place',
  no_place_for_whatsapp: 'no_place',
  no_place_for_other_phones: 'no_place',
  no_place_for_google_rating: 'no_place',
  no_gallery_room: 'no_place',
  no_fitting_video: 'no_place',
  no_email_for_form: 'no_info',
  no_booking_link: 'no_info',
  no_items_to_show: 'no_info',
  not_collected: 'no_info',
  sources_disagree: 'held',
  kept_off_site: 'held',
  hours_unconfirmed: 'held',
  hours_sources_disagree: 'held',
  owner_withheld: 'held',
  page_nothing_to_show: 'pages',
  page_not_planned: 'pages',
  no_generated_people: 'people_spots'
})
export const NOT_ON_SITE_GROUPS = Object.freeze([
  'removed',
  'no_place',
  'no_info',
  'held',
  'reviews',
  'pages',
  'people_spots',
  'other'
])

const factById = (plan) => new Map(listOr(plan.facts).map((f) => [f.id, f]))
const itemById = (plan) => new Map(listOr(plan.items).map((i) => [i.id, i]))

/** A fact as the card names it: id, kind and label, with its value. */
const factOf = (fact) => ({
  id: fact.id,
  kind: typeof fact.kind === 'string' ? fact.kind : null,
  label: text(fact.label),
  value: text(fact.value)
})

/** The ids some page shows (block data and the rows of child lists), and per id the pages and blocks that show it. */
function shownOf(plan) {
  const where = new Map()
  const add = (id, page, block) => {
    if (typeof id !== 'string') return
    if (!where.has(id)) where.set(id, [])
    where.get(id).push({ page, block })
  }
  const rows = (lists, page, block) => {
    for (const l of listOr(lists))
      for (const r of listOr(l?.rows)) {
        add(r?.data, page, block)
        rows(r?.lists, page, block)
      }
  }
  for (const page of plan.pages)
    for (const block of page.blocks) {
      for (const id of listOr(block.data)) add(id, page, block)
      rows(block.lists, page, block)
    }
  return where
}

/** A section as the card names it: its id, label and stable key. */
const sectionOf = (block) => ({
  id: block.id,
  label: text(block.label),
  ...(typeof block.labelCode === 'string' && block.labelCode !== '' ? { labelCode: block.labelCode } : {})
})

/** The locks the draft door answered, or null: what the kit and the plan keep (`planLocksOf`). */
function locksOf(review) {
  const locks = review?.locks
  if (!isPlainObject(locks)) return null
  return {
    pages: isPlainObject(locks.pages) ? locks.pages : {},
    blocks: isPlainObject(locks.blocks) ? locks.blocks : {},
    facts: isPlainObject(locks.facts) ? locks.facts : {},
    minItems: isPlainObject(locks.minItems) ? locks.minItems : {}
  }
}

/** Whether one more item can come off a block: its count stays at its kit minimum and it keeps one detail. */
function itemRemovable(block, items, locks) {
  if (!locks) return false
  const data = listOr(block.data)
  const count = data.filter((id) => items.has(id)).length
  const min = Number.isSafeInteger(locks.minItems[block.id]) ? locks.minItems[block.id] : 0
  return data.length > 1 && count - 1 >= min
}

/** The key messages with the sections that carry each, page by page. */
function keyMessagesOf(plan) {
  return listOr(plan.keyMessages).map((m) => {
    const carriedBy = []
    for (const page of plan.pages) {
      const blocks = page.blocks.filter((b) => listOr(b.carries).includes(m.id)).map(sectionOf)
      if (blocks.length) carriedBy.push({ page: page.id, pageName: text(page.name), blocks })
    }
    return { id: m.id, label: text(m.label), field: `keyMessages[${m.id}].label`, carriedBy }
  })
}

/** The pages (by name) and sections that show a fact. */
const placesOf = (where, id) =>
  listOr(where.get(id)).map(({ page, block }) => ({
    page: page.id,
    pageName: text(page.name),
    section: sectionOf(block),
    footer: block.type === 'footer'
  }))

/** How a customer reaches the business: the main button, the end of each page and each channel shown. */
function reachOf(plan, where, locks) {
  const facts = factById(plan)
  const primary = listOr(plan.primaryAction?.factIds)
    .map((id) => facts.get(id))
    .filter(Boolean)
  const ends = plan.pages
    .filter((p) => p.endAction && p.blocks.some((b) => b.id === p.endAction.block))
    .map((p) => ({
      page: p.id,
      pageName: text(p.name),
      section: sectionOf(p.blocks.find((b) => b.id === p.endAction.block)),
      facts: listOr(p.endAction.factIds)
        .map((id) => facts.get(id))
        .filter(Boolean)
        .map(factOf)
    }))
  const channels = listOr(plan.facts)
    .filter((f) => CHANNEL_KINDS.has(f.kind) && where.has(f.id))
    .map((f) => {
      const places = placesOf(where, f.id)
      const footers = places.filter((p) => p.footer)
      const footerBlocks = plan.pages.flatMap((p) =>
        p.blocks.filter((b) => b.type === 'footer' && listOr(b.data).includes(f.id))
      )
      const removable =
        Boolean(locks) &&
        footers.length > 0 &&
        !locks.facts[f.id] &&
        footerBlocks.every((b) => listOr(b.data).length > 1)
      return { ...factOf(f), places, footerPages: footers.length, removable }
    })
  return {
    primary: primary.map((f) => ({ ...factOf(f), places: placesOf(where, f.id) })),
    ends,
    channels
  }
}

/** What every page shares: the menu (the pages a header list names), the header and footer facts. */
function siteOf(plan) {
  const facts = factById(plan)
  const pages = new Map(plan.pages.map((p) => [p.id, text(p.name)]))
  const chrome = (type) => {
    const ids = []
    for (const page of plan.pages)
      for (const b of page.blocks)
        if (b.type === type)
          for (const id of listOr(b.data)) if (facts.has(id) && !ids.includes(id)) ids.push(id)
    return ids.map((id) => factOf(facts.get(id)))
  }
  const menu = []
  for (const page of plan.pages)
    for (const b of page.blocks) {
      if (b.type !== 'header') continue
      for (const l of listOr(b.lists))
        for (const r of listOr(l?.rows))
          if (typeof r?.page === 'string' && pages.has(r.page) && !menu.includes(pages.get(r.page)))
            menu.push(pages.get(r.page))
    }
  return {
    menu,
    header: chrome('header'),
    footer: chrome('footer'),
    privacyLink: listOr(plan.legalPages).length > 0
  }
}

/** One page's intent and sections with what the owner can take off. */
function pageOf(plan, page, index, { items, locks, facts }) {
  const messages = new Map(listOr(plan.keyMessages).map((m) => [m.id, text(m.label)]))
  const end = page.endAction?.block ?? null
  const seo = isPlainObject(page.seo)
    ? {
        searchTerms: listOr(page.seo.searchTerms).map(text),
        ...(typeof page.seo.titleIntent === 'string' ? { titleIntent: text(page.seo.titleIntent) } : {}),
        ...(typeof page.seo.descriptionIntent === 'string'
          ? { descriptionIntent: text(page.seo.descriptionIntent) }
          : {}),
        ownerAdded: listOr(page.seo.ownerAdded).map(text)
      }
    : null
  return {
    id: page.id,
    name: text(page.name),
    removable: Boolean(locks) && index > 0 && !locks.pages[page.id],
    lock: locks?.pages[page.id] ?? null,
    ...(typeof page.keyMessage === 'string' ? { keyMessage: text(page.keyMessage) } : {}),
    ...(typeof page.visitorQuestion === 'string' ? { visitorQuestion: text(page.visitorQuestion) } : {}),
    seo,
    sections: page.blocks
      .filter((b) => !CHROME_TYPES.has(b.type))
      .map((b) => {
        const named = listOr(b.data).filter((id) => NAMED_KINDS.has(items.get(id)?.kind))
        const canTakeItem = itemRemovable(b, items, locks)
        return {
          ...sectionOf(b),
          type: b.type,
          ...(b.source === 'library' ? { library: true } : {}),
          ...(typeof b.message === 'string' ? { message: text(b.message) } : {}),
          carries: listOr(b.carries)
            .filter((id) => messages.has(id))
            .map((id) => ({ id, label: messages.get(id) })),
          end: b.id === end,
          removable: Boolean(locks) && !locks.blocks[b.id],
          items: named.map((id) => {
            const item = items.get(id)
            return { id, kind: item.kind, label: text(item.label), removable: canTakeItem }
          }),
          facts: listOr(b.data)
            .filter((id) => facts.has(id))
            .map((id) => factOf(facts.get(id)))
        }
      })
  }
}

/** The privacy page and the page shown for an address that does not exist. */
function standardOf(plan) {
  const facts = factById(plan)
  const names = new Map(plan.pages.map((p) => [p.id, text(p.name)]))
  const privacy = listOr(plan.legalPages).find((l) => l?.kind === 'privacy')
  return {
    privacy: privacy
      ? {
          page: privacy.use === 'create' ? null : (names.get(privacy.use) ?? null),
          facts: listOr(privacy.factIds)
            .map((id) => facts.get(id))
            .filter(Boolean)
            .map(factOf)
        }
      : null,
    notFound: isPlainObject(plan.notFound)
      ? {
          leadsTo: listOr(plan.notFound.leadsTo)
            .map((id) => names.get(id))
            .filter(Boolean)
        }
      : null
  }
}

/**
 * What the owner took off at this review, one line per removal: the part's own entry (`owner_removed` with
 * `params.removal`), the count of details that went with it, and whether a restore can name it now.
 */
function removedOf(plan, removals) {
  const restorable = new Set(listOr(removals).map((r) => r?.id))
  const byRemoval = new Map()
  for (const e of listOr(plan.leftOut)) {
    if (e?.code !== 'owner_removed' || typeof e.params?.removal !== 'string') continue
    const id = e.params.removal
    if (!byRemoval.has(id)) byRemoval.set(id, { removal: id, part: null, details: 0 })
    const line = byRemoval.get(id)
    if (typeof e.item === 'string') line.details += 1
    else line.part = { what: text(e.what), kind: e.kind }
  }
  const items = itemById(plan)
  const facts = factById(plan)
  return [...byRemoval.values()].map((line) => {
    const firstDetail = listOr(plan.leftOut).find(
      (e) => e?.params?.removal === line.removal && typeof e.item === 'string'
    )
    const what =
      line.part?.what ??
      text(
        items.get(firstDetail?.item)?.label ?? facts.get(firstDetail?.item)?.label ?? firstDetail?.what ?? ''
      )
    const detailKind = items.get(firstDetail?.item)?.kind ?? null
    return {
      removal: line.removal,
      what,
      kind: line.part?.kind ?? 'item',
      ...(line.part ? {} : { dataKind: detailKind }),
      details: line.part ? line.details : Math.max(line.details - 1, 0),
      restorable: restorable.has(line.removal)
    }
  })
}

/**
 * The "not on the site" lines in groups, each group with its lines (`lines`: indexes into `card.leftOut`). Reviews
 * left out for any reason are their own group; the picture spots of people the template has are counted apart.
 */
function groupsOf(cardLeftOut, plan, removals) {
  const groups = new Map(NOT_ON_SITE_GROUPS.map((g) => [g, []]))
  cardLeftOut.forEach((line, i) => {
    if (line.code === 'owner_removed') return
    const group = line.dataKind === 'quote' ? 'reviews' : (GROUP_OF[line.code] ?? 'other')
    groups.get(group).push(i)
  })
  const peopleSpots = listOr(plan.leftOut)
    .filter((e) => e?.code === 'no_generated_people')
    .reduce((n, e) => n + (Number.isSafeInteger(e.params?.count) ? e.params.count : 1), 0)
  return {
    removed: removedOf(plan, removals),
    groups: NOT_ON_SITE_GROUPS.filter((g) => g !== 'removed' && g !== 'people_spots')
      .map((g) => ({ group: g, lines: groups.get(g) }))
      .filter((g) => g.lines.length > 0),
    peopleSpots
  }
}

const SOURCE_KINDS = ['website', 'google', 'listing', 'social', 'answer']
const COUNTED = ['service', 'person', 'gallery', 'quote']

/** What came from each kind of source, and what of it the site shows: facts by name, items by count. */
function sourcesOf(plan, where) {
  const rows = []
  for (const kind of SOURCE_KINDS) {
    const from = (x) => listOr(x.sources).some((s) => s?.kind === kind)
    const facts = listOr(plan.facts).filter(from)
    const items = COUNTED.map((k) => {
      const of = listOr(plan.items).filter((i) => i.kind === k && from(i))
      const n = (list) =>
        list.reduce((c, i) => c + (Number.isSafeInteger(i.count) && i.count > 0 ? i.count : 1), 0)
      return { kind: k, got: n(of), shown: n(of.filter((i) => where.has(i.id))) }
    }).filter((c) => c.got > 0)
    if (facts.length === 0 && items.length === 0) continue
    rows.push({
      kind,
      facts: facts.map(factOf),
      shownFacts: facts.filter((f) => where.has(f.id)).map(factOf),
      items
    })
  }
  return rows
}

/**
 * The review part of the plan card.
 * @param {any} plan a whole plan (`wholePlanOf`)
 * @param {any[]} cardLeftOut the card's left out lines (`leftOutOf`)
 * @param {{locks?: object, removals?: object[]} | null} review the draft's `review`
 */
export function planReviewPartsOf(plan, cardLeftOut, review) {
  const where = shownOf(plan)
  const locks = locksOf(review)
  const items = itemById(plan)
  const facts = factById(plan)
  return {
    keyMessages: keyMessagesOf(plan),
    reach: reachOf(plan, where, locks),
    site: siteOf(plan),
    sitePages: plan.pages.map((p, i) => pageOf(plan, p, i, { items, locks, facts })),
    standard: standardOf(plan),
    notOnSite: groupsOf(cardLeftOut, plan, review?.removals),
    sources: sourcesOf(plan, where),
    later: listOr(plan.later).map((e) => ({
      code: e.code,
      what: text(e.what),
      reason: text(e.reason),
      params: isPlainObject(e.params) ? e.params : {}
    })),
    locked: locks === null
  }
}
