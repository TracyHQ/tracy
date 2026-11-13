// The write order of an AI quickstart build (ticket #597): everything the write step writes, built from the saved step
// values of the run and nothing else. Pure: the approved plan with its profile, the AI quickstart declarations, the
// look, every writer page, the pictures and the icons in; one `tracy-write-order/v1` document out, the write step's
// only input. Spec: docs/references/write-order.md. The check is `checkWriteOrder` (`write-order-check.mjs`).
import { planDataOf } from './plan-data.mjs'
import { blockPlacesOf } from './write-order-block.mjs'
import { answeredLabelOf, writerPlaceOf } from './write-order-fields.mjs'
import { settleBlock } from './write-order-hide.mjs'
import { joinLibraryBlock } from './write-order-library.mjs'
import { menuOf, pagesInOrder, seoOf } from './write-order-pages.mjs'
import { ANSWER_SOURCE } from './plan-answers.mjs'

export const WRITE_ORDER_SCHEMA = 'tracy-write-order/v1'

const list = (value) => (Array.isArray(value) ? value : [])

/** A write order that cannot be built from the inputs given, with a code the step chain reports (ADR 0047). */
export class WriteOrderError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
  }
}

/** Block id -> declaration: the template's block store first, then the Tracy library blocks it lacks. */
function declarationsOf(aiq) {
  const blocks = new Map()
  for (const block of list(aiq?.blockStore?.blocks)) blocks.set(block.id, block)
  for (const block of list(aiq?.library))
    if (!blocks.has(block.id)) blocks.set(block.id, { ...block, source: 'library' })
  return blocks
}

/** The written pages by id, from `writer:<page>` step values (`{page}`) or one `writePages` result (`{pages}`). */
function writtenPagesOf(writers) {
  const pages = list(writers).flatMap((w) => (w?.page ? [w.page] : list(w?.pages)))
  return new Map(pages.map((p) => [p.id, p]))
}

const positionOf = (description, blocks, i) => ({
  request: list(description.positions)[0] ?? null,
  declared: list(description.positions),
  afterBlock: blocks[i - 1]?.id ?? null,
  beforeBlock: blocks[i + 1]?.id ?? null
})

/**
 * Build the write order.
 * @param {{run: {id: string, kind?: 'build' | 'partial', edit?: string}, aiq: {ref?: string, blockStore: object,
 *   library?: object[], template: {slug: string, name?: string, version: string}, aiQuickstart?: {version: string}},
 *   approval: {plan: object, profile: object}, look?: object, writers: object[], pictures: {frames: object[],
 *   reduced?: object[], prompt?: object}, icons?: {icons: object[], iconPrompt?: object, iconKeywordsPrompt?: object},
 *   records?: Record<string, string>}} input saved step values; `approval.profile` is the profile the approved plan
 *   was gated with (after any edit), the only profile the build reads
 * @returns {object} the order (`docs/references/write-order.md`)
 */
export function buildWriteOrder({ run, aiq, approval, look, writers, pictures, icons, records = {} }) {
  const plan = approval?.plan
  const profile = approval?.profile
  if (!Array.isArray(plan?.pages) || plan.pages.length === 0)
    throw new WriteOrderError('plan_missing', 'the write order needs the approved plan with its pages')
  if (!profile) throw new WriteOrderError('profile_missing', 'the write order needs the approved profile')
  if (!Array.isArray(pictures?.frames))
    throw new WriteOrderError('pictures_missing', 'the write order needs the frames of the pictures step')
  const declarations = declarationsOf(aiq)
  const data = planDataOf(profile)
  const written = writtenPagesOf(writers)
  const missing = plan.pages.filter((p) => !written.has(p.id)).map((p) => p.id)
  if (missing.length)
    throw new WriteOrderError('writer_missing', `no written copy for page(s) ${missing.join(', ')}`, {
      pages: missing
    })
  const writtenByPlace = new Map()
  for (const [pageId, page] of written)
    for (const entry of list(page.fields)) writtenByPlace.set(writerPlaceOf(pageId, entry), entry)
  const frames = new Map(pictures.frames.map((f) => [f.id, f]))
  const iconEntries = list(icons?.icons ?? pictures.icons)
  const iconsById = new Map(iconEntries.map((i) => [i.id, i]))
  const dropped = new Map(
    list(pictures.reduced).map((r) => [`${r.page}.${r.block}.${r.item}`, 'item_dropped'])
  )
  const pages = pagesInOrder(plan)
  const ctx = {
    data,
    frames,
    icons: iconsById,
    written: writtenByPlace,
    answer: answeredLabelOf(profile),
    pages
  }
  const hidden = []
  const used = new Set()
  const orderPages = pages.map((page, n) => {
    const blocks = list(page.blocks).map((block, i) => {
      const description = declarations.get(block.block)
      if (!description)
        throw new WriteOrderError('unknown_block', `${block.block} of ${block.id} is not a declared block`)
      const places = blockPlacesOf(page, block, description, ctx)
      const out = {
        id: block.id,
        block: block.block,
        type: description.type,
        source: description.source === 'library' ? 'library' : 'template',
        order: i,
        position: positionOf(description, page.blocks, i),
        ...places.own,
        items: places.items,
        lists: places.lists
      }
      if (out.source === 'library') joinLibraryBlock(out, description, { profile, data, hidden })
      settleBlock(out, description, { dropped, hidden })
      return out
    })
    return {
      id: page.id,
      pageType: page.pageType,
      name: page.name,
      home: n === 0,
      menu: menuOf(page, n),
      blocks
    }
  })
  // Every place of the order is a place the plan placed; writer entries are checked against them below.
  const placed = []
  const visit = (place) => {
    for (const e of place.fields) used.add(e.place)
    placed.push(place)
  }
  for (const page of orderPages)
    for (const block of page.blocks) {
      visit(block)
      for (const item of block.items) {
        visit(item)
        for (const g of item.lists) g.rows.forEach(visit)
      }
      for (const g of block.lists) g.rows.forEach(visit)
    }
  const shownPictures = placed.flatMap((p) => p.pictures)
  const fileOf = new Map(shownPictures.filter((p) => p.file).map((p) => [p.frame, p.file]))
  for (const picture of shownPictures)
    if (picture.sameAs && !picture.file && fileOf.has(picture.sameAs))
      picture.file = fileOf.get(picture.sameAs)
  const shownIcons = placed.flatMap((p) => p.icons)
  const links = new Map(
    placed
      .flatMap((p) => p.fields)
      .filter((e) => e.icon)
      .map((e) => [e.icon, e.place])
  )
  for (const icon of shownIcons)
    if (icon.case === 'social' && icon.source === 'none' && links.has(icon.id))
      icon.hidesLink = links.get(icon.id)
  for (const page of orderPages) page.seo = seoOf(page, page.home, data.facts, shownPictures)
  const unplaced = [...writtenByPlace.entries()]
    // A row field the writer leaves to the pictures or the icon step is held by `pictures` or `icons`.
    .filter(([, entry]) => entry.action !== 'pictures' && entry.action !== 'network')
    .filter(([place]) => !used.has(place) && !hidden.some((h) => place.startsWith(`${h.at}.`)))
    .map(([place, entry]) => ({ place, key: entry.key }))
  const derived = placed
    .flatMap((p) => p.fields)
    .filter((e) => e.from === 'derived')
    .map(({ place, derived: form, target }) => ({ place, derived: form, target }))
  return {
    schema: WRITE_ORDER_SCHEMA,
    run: { id: run?.id ?? null, kind: run?.kind ?? 'build', ...(run?.edit ? { edit: run.edit } : {}) },
    plan: { id: plan.id ?? null, revision: plan.revision ?? null, language: plan.language ?? null },
    template: {
      slug: aiq?.template?.slug ?? null,
      version: aiq?.template?.version ?? null,
      kitRef: aiq?.ref ?? null,
      aiQuickstart: { version: aiq?.aiQuickstart?.version ?? aiq?.template?.version ?? null }
    },
    look: look ?? { accent: plan.look?.accent ?? null, accentFrom: null, logo: plan.look?.logo ?? null },
    facts: data.facts.map(({ id, kind, value }) => ({
      kind,
      value,
      data: id,
      ...(list(data.byId.get(id)?.source?.sources).includes(ANSWER_SOURCE) ? { from: 'answer' } : {})
    })),
    pages: orderPages,
    pictures: shownPictures,
    icons: shownIcons,
    derived,
    hidden,
    unplaced,
    provenance: {
      prompts: {
        writer: list(writers)[0]?.prompt ?? null,
        pictures: pictures.prompt ?? null,
        icons: icons?.iconPrompt ?? null,
        iconKeywords: icons?.iconKeywordsPrompt ?? null
      },
      records
    }
  }
}
