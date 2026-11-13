// The look section and the pictures summary of a build plan (ticket #593, Contract B `build-contract-plan.mjs`).
// Pure: the template, the brand step's record and the placed blocks in, the two plan sections and the assumptions they
// bring out. The brand step itself is unchanged; this only reads its record (`brand-before-site.mjs`, #616).
import { isBrandLook, lookOfBrandRecord, logoSourceName } from './brand-before-site.mjs'
import { ownPicturesOf } from './picture-frames.mjs'
import { assignPictures } from './picture-policy.mjs'

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** The brand accent colour the research read: the website's first, then the social profiles'. Tests only. */
function researchAccentOf(brand) {
  for (const observed of [brand?.website, brand?.social]) {
    if (!observed) continue
    const colors = list(observed.colors)
    const candidates = [
      observed.accent?.hex,
      colors.find((c) => c?.role === 'accent')?.hex,
      colors.find((c) => c?.role === 'primary')?.hex
    ]
    const found = candidates.find((hex) => typeof hex === 'string' && HEX_COLOUR.test(hex))
    if (found) return found.toLowerCase()
  }
  return null
}

/**
 * The look of the old fallback, for tests only (`allowTemplateLook`): the research's own colours read directly, and
 * without any the template's accent and a text logo. Never on the product path (#616).
 */
function templateFallbackLookOf(template, brand) {
  const assumptions = []
  let accent = researchAccentOf(brand)
  if (!accent) {
    accent = HEX_COLOUR.test(template?.accent ?? '') ? template.accent.toLowerCase() : null
    assumptions.push({
      id: 'accent',
      field: 'look.accent',
      said: 'No brand colour was found on your pages, so the colour of the template is kept.'
    })
  }
  const chosen = brand?.logoResearch?.chosen
  let logo
  if (chosen || isText(brand?.logo)) logo = { kind: 'own', source: logoSourceName(chosen?.source) }
  else {
    logo = { kind: 'text' }
    assumptions.push({
      id: 'logo',
      field: 'look.logo',
      said: 'No logo was found, so your business name is set as text.'
    })
  }
  const { slug, name, version } = template ?? {}
  return {
    look: { template: { slug, name, version }, accent, logo },
    assumptions,
    sources: { accent: { from: 'template-fallback' }, logo: { from: 'template-fallback' } }
  }
}

/**
 * The look section from the chosen template and the brand step's record (`brandLookOf`, #616), the assumptions it
 * makes, and where the accent and the logo came from (`sources`). On the product path a missing brand record is a
 * `brand_missing` error: the plan never falls back to the template's look.
 * @param {{slug: string, name: string, version: string, accent?: string}} template the chosen template
 * @param {object | null} brand the brand step's record (`brand-before-site.mjs`)
 * @param {{allowTemplateLook?: boolean}} [options] `allowTemplateLook` (tests only, default false): a brand that is no
 *   record reads as the old fallback
 */
export function lookOf(template, brand, { allowTemplateLook = false } = {}) {
  if (isBrandLook(brand)) return lookOfBrandRecord(template, brand)
  if (allowTemplateLook) return templateFallbackLookOf(template, brand)
  return lookOfBrandRecord(template, null)
}

/** Why the plan drops an item of an image block, as the customer reads it (`picture-fit.mjs` reasons). */
const ITEM_REASONS = Object.freeze({
  no_own_photo:
    'It has no photo of yours, and its section is complete without it, so no picture is generated for it.',
  stock_only:
    'Its only photo is a stock photo, and Tracy never adds a stock photo; its section is complete without it.',
  own_photo_unfit:
    'Its photo does not fit the picture spot of its section, and the section is complete without it.'
})
/** Picture spots that stay empty, by reason: how one and several are named, and why, as the customer reads it. */
const EMPTY_FRAME_REASONS = Object.freeze({
  no_generated_people: [
    'picture spot of a person',
    'picture spots of people',
    'Pictures of people are never generated, so these spots show no picture until you add your own photo.'
  ],
  no_fitting_video: [
    'video spot',
    'video spots',
    'No video of yours is landscape or near square without words printed over it, so these spots show no video.'
  ],
  no_own_logo: [
    'logo spot',
    'logo spots',
    'A logo of another organisation is never drawn, so these spots stay empty until you add the logo.'
  ],
  gallery_own_photos_only: [
    'gallery photo spot',
    'gallery photo spots',
    'A gallery shows only your own photos, so these spots stay empty until you add a photo.'
  ]
})
/** A label that stands in, for counting only, for an own photo the pictures step labels before it places it. */
const TO_BE_LABELLED = 'to be labelled'
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The pictures summary, counted by the picture policy (`picture-policy.mjs`, #595): frames filled by the business's own
 * photos (an unlabelled own photo counts: the pictures step labels it before use), and frames to be generated (every frame
 * that may be drawn and has no own photo, no cap, D45), never for a person. Items an image block drops for lack of an own photo leave the pages and
 * are reported as left out, as are frames that stay without a picture. The pictures step assigns each photo to a frame;
 * this is the count the customer approves.
 * @param {object[]} pages placed pages of the plan
 * @param {Map<string, object>} blocks block id -> its description (block store or library)
 * @param {ReturnType<import('./plan-data.mjs').planDataOf>} data
 * @returns {{pictures: object, leftOut: object[], pages: object[]}} `pages` with the dropped items taken out
 */
export function picturesOf(pages, blocks, data) {
  const pictures = ownPicturesOf(data).map((p) =>
    p.stock || isText(p.label) ? p : { ...p, label: TO_BE_LABELLED }
  )
  const { frames, reduced, counts } = assignPictures({ pages, blocks, data, pictures })
  const from = [...new Set(frames.filter((f) => f.source === 'own').flatMap((f) => f.from))]
  const summary = {
    own: { frames: counts.own, from: counts.own > 0 ? from : [] },
    generated: {
      frames: counts.generated,
      ...(counts.generated > 0 ? { reason: 'Some picture spots have no fitting photo of yours.' } : {})
    }
  }
  const leftOut = reduced.map(({ item, reason }) => ({
    what: data.byId.get(item)?.entry?.label ?? item,
    kind: 'item',
    reason: ITEM_REASONS[reason] ?? ITEM_REASONS.no_own_photo
  }))
  for (const [reason, [one, many, said]] of Object.entries(EMPTY_FRAME_REASONS)) {
    const n = frames.filter((f) => f.source === 'none' && f.reason === reason).length
    if (n > 0) leftOut.push({ what: count(n, one, many), kind: 'feature', reason: said })
  }
  const dropped = new Set(reduced.map((r) => `${r.page}.${r.block}.${r.item}`))
  const kept = list(pages).map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      data: block.data.filter((id) => !dropped.has(`${page.id}.${block.id}.${id}`))
    }))
  }))
  return { pictures: summary, leftOut, pages: kept }
}
