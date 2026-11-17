// The research's vision labels carried to the picture policy (#575, pictures gap audit port 2). The research labels
// every collected photo with the step chain's vision call (`apps/tracy-web/src/lib/picture-vision.js`, prompt p6) and the
// brief keeps those labels on each asset (`brief-schema.json` assets: content, quality, size, the three photo risks,
// boxes). The needs profile keeps only a picture's address and caption, so this module joins the labels back by the
// address the asset manifest gives each asset. Pure.
//
// 🔒 A FULL LABEL IS NOT ASKED FOR AGAIN. A photo whose research label names its content and decides the three photo
// risks (isBlurry, hasTextOrWatermark, showsOtherBusiness: true or false, never null) is placed with that label. Any
// other photo, or one no asset names, is marked `needsLook` and labelled again by the build's one vision call
// (`picture-labelling.mjs`), so no photo reaches a frame with a label that decides nothing (the step chain's P09).
import { ASSET_CONTENT_KINDS } from './pictures/asset-labels.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const CONTENT = new Set(ASSET_CONTENT_KINDS)
/** The three photo risks the step chain's shortlist reads (`picture-links.mjs` PHOTO_RISK_LABELS). */
export const PHOTO_RISKS = Object.freeze(['isBlurry', 'hasTextOrWatermark', 'showsOtherBusiness'])
/** The asset labels a picture record takes from the research, when it has none of its own. */
const CARRIED = Object.freeze([
  'content',
  'quality',
  'width',
  'height',
  'orientation',
  ...PHOTO_RISKS,
  'textPresence',
  'hasTextOverlay',
  'isGraphic',
  'unlabelledReason',
  'subjectBox',
  'faceBoxes',
  'peopleCount',
  'depicts',
  'portraitOf'
])

/** Whether a label decides every question the picture policy asks of a photo. */
export const decidesEverything = (labels) =>
  isText(labels?.label) &&
  CONTENT.has(labels?.content) &&
  PHOTO_RISKS.every((k) => typeof labels[k] === 'boolean')

/**
 * The research labels of the brief's photos, by the address the asset manifest stores for each.
 * @param {object} brief the stored research brief (`assets`)
 * @param {Array<{id: string, sourceUrl?: string}>} manifest the asset manifest stored beside it
 * @returns {Map<string, object>} address -> the carried labels, the caption as `label`
 */
export function researchLabelsOf(brief, manifest) {
  const byId = new Map(
    list(brief?.assets)
      .filter((a) => isText(a?.id))
      .map((a) => [a.id, a])
  )
  const out = new Map()
  for (const entry of list(manifest)) {
    const asset = isText(entry?.sourceUrl) ? byId.get(entry.id) : null
    if (!asset) continue
    const labels = {}
    for (const key of CARRIED) if (asset[key] !== undefined && asset[key] !== null) labels[key] = asset[key]
    for (const key of PHOTO_RISKS) if (asset[key] === null) labels[key] = null
    if (isText(asset.caption)) labels.label = asset.caption.trim()
    out.set(entry.sourceUrl, labels)
  }
  return out
}

/**
 * Own picture records with the research's labels: a record keeps what it has and takes the rest. A photo whose
 * labels decide everything is `labelledBy: 'research'`; any other photo is marked `needsLook`. Videos are left as they
 * are: the vision call is shown stored still pictures only.
 * @param {object[]} pictures own picture records (`picture-frames.mjs` `ownPicturesOf`)
 * @param {Map<string, object>} labels `researchLabelsOf`
 */
export function withResearchLabels(pictures, labels) {
  return list(pictures).map((picture) => {
    if (picture?.stock || picture?.media !== 'photo') return picture
    const found = labels.get(picture.ref) ?? {}
    const merged = { ...picture }
    for (const [key, value] of Object.entries(found))
      if (merged[key] === undefined || merged[key] === null) merged[key] = value
    if (decidesEverything(found) && decidesEverything(merged)) return { ...merged, labelledBy: 'research' }
    return { ...merged, needsLook: true }
  })
}
