// The look section and the pictures summary of a build plan (ticket #593, Contract B `build-contract-plan.mjs`).
// Pure: the template, the brand step's record and the placed blocks in, the two plan sections and the assumptions they
// bring out. The brand step itself is unchanged; this only reads its record.
import { MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'
import { ownPicturesOf } from './picture-frames.mjs'
import { assignPictures } from './picture-policy.mjs'

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])
/** How the customer reads where a logo came from, per `logoResearch.chosen.source` of the brand step. */
const LOGO_SOURCE_NAMES = Object.freeze({
  website: 'Website',
  google: 'Google listing',
  instagram: 'Instagram profile',
  facebook: 'Facebook page',
  tiktok: 'TikTok profile'
})

/** The brand accent colour the brand step read: the website's first, then the social profiles'. */
function brandAccentOf(brand) {
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
 * The look section from the chosen template and the brand step's record, and the assumptions it makes.
 * @param {{slug: string, name: string, version: string, accent?: string}} template the chosen template; `accent` is its
 *   own accent colour, kept when the brand step found none
 * @param {object | null} brand the brand step's record (`place-executor.js` stage `brand`)
 */
export function lookOf(template, brand) {
  const assumptions = []
  let accent = brandAccentOf(brand)
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
    const name = LOGO_SOURCE_NAMES[chosen?.source] ?? (isText(chosen?.source) ? chosen.source : 'Your pages')
    logo = { kind: 'own', source: name }
  } else {
    logo = { kind: 'text' }
    assumptions.push({
      id: 'logo',
      field: 'look.logo',
      said: 'No logo was found, so your business name is set as text.'
    })
  }
  const { slug, name, version } = template ?? {}
  return { look: { template: { slug, name, version }, accent, logo }, assumptions }
}

/** A label that stands in, for counting only, for an own photo the pictures step labels before it places it. */
const TO_BE_LABELLED = 'to be labelled'
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * The pictures summary, counted by the picture policy (`picture-policy.mjs`, #595): frames filled by the business's own
 * photos (an unlabelled own photo counts: the pictures step labels it before use), and frames to be generated, at most
 * `MAX_GENERATED_FRAMES`, never for a person. Items an image block drops for lack of an own photo leave the pages and
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
  const leftOut = reduced.map(({ item }) => ({
    what: data.byId.get(item)?.entry?.label ?? item,
    kind: 'item',
    reason:
      'It has no photo of yours, and its section is complete without it, so no picture is generated for it.'
  }))
  const none = (reason) => frames.filter((f) => f.source === 'none' && f.reason === reason).length
  const people = none('no_generated_people')
  if (people > 0)
    leftOut.push({
      what: count(people, 'picture spot of a person', 'picture spots of people'),
      kind: 'feature',
      reason:
        'Pictures of people are never generated, so these spots show no picture until you add your own photo.'
    })
  const capped = none('generated_cap')
  if (capped > 0)
    leftOut.push({
      what: count(capped, 'picture spot', 'picture spots'),
      kind: 'feature',
      reason: `At most ${MAX_GENERATED_FRAMES} pictures are generated for a site, so these spots stay without a picture.`
    })
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
