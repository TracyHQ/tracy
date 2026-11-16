// The look section and the pictures summary of a build plan (ticket #593, Contract B `build-contract-plan.mjs`).
// Pure: the template, the brand step's record and the placed blocks in, the two plan sections and the assumptions they
// bring out. The brand step itself is unchanged; this only reads its record (`brand-before-site.mjs`, #616).
import { isBrandLook, lookOfBrandRecord, logoSourceKindOfName, logoSourceName } from './brand-before-site.mjs'
import { ownPicturesOf } from './picture-frames.mjs'
import { assignPictures } from './picture-policy.mjs'
import { shownElsewhereLeftOut } from './plan-gallery-spread.mjs'
import { LOGO_CODES, PICTURES_ESTIMATE_CODE, sourceKindsOf } from './plan-wording-codes.mjs'

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
  if (chosen || isText(brand?.logo)) {
    const sourceKind = logoSourceKindOfName(logoSourceName(chosen?.source))
    logo = {
      kind: 'own',
      source: logoSourceName(chosen?.source),
      code: LOGO_CODES.own,
      ...(sourceKind ? { sourceKind } : {})
    }
  } else {
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
  no_own_photo: 'You have no photo of it, and the section works without it, so I left it out.',
  stock_only: 'The only photo is a stock photo, and Tracy never uses stock photos, so I left it out.',
  own_photo_unfit: 'Its photo does not fit the space, and the section works without it, so I left it out.'
})
/** Picture spots that stay empty, by reason: how one and several are named, and why, as the customer reads it. */
const EMPTY_FRAME_REASONS = Object.freeze({
  no_generated_people: [
    'picture spot of a person',
    'picture spots of people',
    'Tracy never creates pictures of people, so these places stay empty until you add your own photo.'
  ],
  no_fitting_video: [
    'video spot',
    'video spots',
    'None of your videos fit this space (wide pictures without text on top), so it shows no video.'
  ],
  no_own_logo: [
    'logo spot',
    'logo spots',
    'Tracy never makes up logos of other organisations, so these places stay empty until you add the logo.'
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
 * How the customer reads the generated count: an estimate, for the own photos are labelled only when the site is built,
 * and every spot left without a fitting photo of theirs then gets a drawn picture (D45).
 */
const estimateOf = (n) =>
  `About ${count(n, 'picture', 'pictures')} will be created where you have no suitable photo. The final number depends on your photos.`
/**
 * The generated part of the pictures summary for a count: the estimate sentence with its stable code and the count
 * (`code`, `params.count`), none of them for a count of zero. Also used where a count the customer lowered is kept.
 */
export const generatedOf = (n) =>
  n > 0
    ? { frames: n, reason: estimateOf(n), code: PICTURES_ESTIMATE_CODE, params: { count: n } }
    : { frames: 0 }

/**
 * The pictures summary, counted by the picture policy (`picture-policy.mjs`, #595): frames filled by the business's own
 * photos (an unlabelled own photo counts: the pictures step labels it before use), and frames to be generated (every frame
 * that may be drawn and has no own photo, no cap, D45), never for a person. Items an image block drops for lack of an own photo leave the pages and
 * are reported as left out, as are frames that stay without a picture. The pictures step assigns each photo to a frame;
 * the generated count is an estimate the customer reads ("about N pictures will be drawn"), never a cap: a photo
 * counted here that turns out unfit when it is labelled is replaced by a drawing.
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
    own: {
      frames: counts.own,
      from: counts.own > 0 ? from : [],
      // The kinds of those sources as data (`website`, `google`, `social`, `answer`), beside their names.
      ...(counts.own > 0 && sourceKindsOf(from).length > 0 ? { fromKinds: sourceKindsOf(from) } : {})
    },
    generated: generatedOf(counts.generated)
  }
  // A gallery photo dropped because it already shows in another gallery is said once per gallery, with the count.
  const elsewhere = shownElsewhereLeftOut(reduced, frames, pictures)
  const leftOut = elsewhere.rest.map(({ item, reason }) => {
    const code = Object.hasOwn(ITEM_REASONS, reason) ? reason : 'no_own_photo'
    return { what: data.byId.get(item)?.entry?.label ?? item, kind: 'item', reason: ITEM_REASONS[code], code }
  })
  for (const [reason, [one, many, said]] of Object.entries(EMPTY_FRAME_REASONS)) {
    const n = frames.filter((f) => f.source === 'none' && f.reason === reason).length
    if (n > 0) leftOut.push({ what: count(n, one, many), kind: 'feature', reason: said, code: reason })
  }
  leftOut.push(...elsewhere.entries)
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
