// The write order of an AI quickstart build (ticket #597): everything the write step writes, built from the saved step
// values of the run and nothing else. Pure: the approved plan with its profile, the AI quickstart declarations, the
// look, every writer page, the pictures and the icons in; one `tracy-write-order/v1` document out, the write step's
// only input. Spec: docs/references/write-order.md. The check is `checkWriteOrder` (`write-order-check.mjs`).
import { placeLimitsOf } from './field-place-limits.mjs'
import { planDataOf } from './plan-data.mjs'
import { blockPlacesOf } from './write-order-block.mjs'
import { dataIndexOf } from './write-order-data.mjs'
import { WriteOrderError } from './write-order-error.mjs'
import { writerPlaceOf } from './write-order-fields.mjs'
import { declarationsOf, positionOf, refuseInput, writtenPagesOf } from './write-order-input.mjs'
import { hideEmptyPictures, settleBlock } from './write-order-hide.mjs'
import { joinLibraryBlock } from './write-order-library.mjs'
import { classedIcons, libraryPositionOf, lookOf } from './write-order-look.mjs'
import { menuOf, pagesInOrder, seoLimitsOf, seoOf } from './write-order-pages.mjs'
import { itemPageTypesOf } from './write-order-targets.mjs'

export { NO_RERUN, WriteOrderError } from './write-order-error.mjs'
export { answerLimitOf } from './write-order-buttons.mjs'
export const WRITE_ORDER_SCHEMA = 'tracy-write-order/v1'

const list = (value) => (Array.isArray(value) ? value : [])

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
  const answer = refuseInput(plan, aiq, profile)
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
  const iconEntries = classedIcons(list(icons?.icons ?? pictures.icons), aiq?.mapping)
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
    answer,
    pages,
    placeLimits: placeLimitsOf(declarations.values()),
    itemPageTypes: itemPageTypesOf(aiq?.pageRecipes)
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
        position: positionOf(
          description,
          page.blocks,
          i,
          description.source === 'library' ? libraryPositionOf(aiq?.mapping, page.pageType) : undefined
        ),
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
  hideEmptyPictures(placed, hidden)
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
  const index = dataIndexOf(data, profile)
  const orderLook = lookOf(look, plan, index.facts)
  const limits = seoLimitsOf(aiq?.mapping)
  for (const page of orderPages)
    page.seo = seoOf(page, {
      home: page.home,
      facts: index.facts,
      pictures: shownPictures,
      homeShare:
        orderPages[0].seo?.shareImage?.frame && !orderPages[0].seo.shareImage.from
          ? orderPages[0].seo.shareImage
          : null,
      logo: orderLook?.logo,
      limits,
      written: written.get(page.id)?.seo
    })
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
      aiQuickstart: { version: aiq?.aiQuickstart?.version ?? aiq?.template?.version ?? null },
      ...(aiq?.mapping ? { mapping: structuredClone(aiq.mapping) } : {})
    },
    look: orderLook,
    seo: limits,
    ...index,
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
