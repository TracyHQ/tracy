// The look section and the pictures summary of a build plan (ticket #593, Contract B `build-contract-plan.mjs`).
// Pure: the template, the brand step's record and the placed blocks in, the two plan sections and the assumptions they
// bring out. The brand step itself is unchanged; this only reads its record.
import { MAX_GENERATED_FRAMES } from './build-contract-plan.mjs'

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

/** How many image frames a placed block holds: its image fields, and its item image fields once per item shown. */
function framesOf(block, description, data) {
  const images = (fields) => list(fields).filter((f) => f?.type === 'image').length
  const items = block.data.filter((id) => data.byId.get(id)?.what === 'item').length
  return images(description.fields) + images(description.itemFields) * items
}

/**
 * The pictures summary: frames filled by the business's own labelled photos, and frames to be generated, at most
 * `MAX_GENERATED_FRAMES`. Frames above that cap are reported as left out. The pictures step (#595) assigns each photo
 * to a frame; this is the count the customer approves.
 * @param {object[]} pages placed pages of the plan
 * @param {Map<string, object>} blocks block id -> its description (block store or library)
 * @param {ReturnType<import('./plan-data.mjs').planDataOf>} data
 */
export function picturesOf(pages, blocks, data) {
  let frames = 0
  for (const page of pages)
    for (const block of page.blocks) frames += framesOf(block, blocks.get(block.block) ?? {}, data)
  const photos = data.items.filter((i) => i.kind === 'gallery' && isText(data.byId.get(i.id).source.label))
  const own = Math.min(frames, photos.length)
  const missing = frames - own
  const generated = Math.min(missing, MAX_GENERATED_FRAMES)
  const from = [...new Set(photos.flatMap((p) => p.sources.map((s) => s.name)))]
  const pictures = {
    own: { frames: own, from: own > 0 ? from : [] },
    generated: {
      frames: generated,
      ...(generated > 0 ? { reason: 'Some picture spots have no fitting photo of yours.' } : {})
    }
  }
  const leftOut =
    missing > generated
      ? [
          {
            what: `${missing - generated} picture spots`,
            kind: 'feature',
            reason: `At most ${MAX_GENERATED_FRAMES} pictures are generated for a site, so these spots stay without a picture.`
          }
        ]
      : []
  return { pictures, leftOut }
}
