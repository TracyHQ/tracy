/**
 * The brief photo inventory of a brief build (spec TracyHQ/tracy#231, ticket #234): every image of a content brief, with
 * the labels the brief already holds and a verdict read by code from those labels. The site plan decides every photo once
 * (used in which picture slots, or not used with a reason), and the plan check refuses a plan that places a photo whose
 * verdict is `reject` (`site-plan-check-photos.js`). No model is involved; a label the brief does not hold is listed in
 * `unknown`, never guessed.
 *
 * Labels read: caption, subject (`content`, labelled by the vision step at collection), depicts / portraitOf, size,
 * orientation, quality grade, faces and people seen, graphic, own photo, uploader. Refusal reasons: `graphic` (a logo,
 * flyer or text graphic), `too-small` (too small to label), `duplicate` (the same bytes as an earlier image).
 * Sharpness is measured only once a photo is cut for its frame (`sharpness-gate.js`), and no label says whether a photo
 * carries a watermark or shows another business: those stay with the picture stage.
 * CMS-neutral.
 */

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')
const GRAPHIC_CONTENT = new Set(['logo', 'text-graphic'])
/** The research-time risk labels of a photo and the refusal reason each gives when true. */
const RISK_LABELS = /** @type {const} */ ([
  ['isBlurry', 'blurry'],
  ['hasTextOrWatermark', 'text-or-watermark'],
  ['showsOtherBusiness', 'other-business']
])

/** The fact sheet's `photo-N` source id of each caption (`brief-fact-sheet.js` numbers the linked captions once). */
function sourceIdsOf(/** @type {any} */ factSheet) {
  /** @type {Map<string, string>} */
  const byCaption = new Map()
  for (const record of [...(factSheet?.offerings ?? []), ...(factSheet?.people ?? [])])
    for (const photo of record?.photos ?? [])
      if (photo?.label && !byCaption.has(photo.label)) byCaption.set(photo.label, photo.sourceId)
  return byCaption
}

/**
 * The photos of a content brief, in the brief's order.
 * @param {any} brief - the content brief of a brief build
 * @param {any} [factSheet] - its fact sheet (`briefFactSheet`), for the `photo-N` source ids
 */
export function briefPhotos(brief, factSheet = null) {
  const assets = Array.isArray(brief?.assets) ? brief.assets : []
  const sourceIds = sourceIdsOf(factSheet)
  const seen = new Set()
  const out = []
  for (const asset of assets) {
    if (!asset || asset.kind !== 'image' || !text(asset.id)) continue
    const caption = text(asset.caption)
    const content = text(asset.content)
    const subject = content && content !== 'unlabelled' ? content : null
    const sized = Number.isInteger(asset.width) && Number.isInteger(asset.height)
    const rejectedFor = []
    if (
      asset.isGraphic === true ||
      GRAPHIC_CONTENT.has(content) ||
      asset.unlabelledReason === 'not_a_photograph'
    )
      rejectedFor.push('graphic')
    if (asset.unlabelledReason === 'too_small') rejectedFor.push('too-small')
    if (asset.sha256 && seen.has(asset.sha256)) rejectedFor.push('duplicate')
    if (asset.sha256) seen.add(asset.sha256)
    for (const [label, reason] of RISK_LABELS) if (asset[label] === true) rejectedFor.push(reason)
    out.push({
      id: `photo:${asset.id}`,
      sourceId: (caption && sourceIds.get(caption)) || null,
      caption: caption || null,
      subject,
      category: text(asset.category) || null,
      depicts: text(asset.depicts?.id) || null,
      portraitOf: text(asset.portraitOf?.id) || null,
      size: sized ? `${asset.width}x${asset.height}` : null,
      orientation: asset.orientation && asset.orientation !== 'unknown' ? asset.orientation : null,
      quality: asset.quality && asset.quality !== 'unknown' ? asset.quality : null,
      faces: Array.isArray(asset.faceBoxes) ? asset.faceBoxes.length : null,
      people: Number.isInteger(asset.peopleCount) ? asset.peopleCount : null,
      ownPhoto: typeof asset.isOwnPhoto === 'boolean' ? asset.isOwnPhoto : null,
      uploader: text(asset.uploaderRole) || null,
      verdict: rejectedFor.length ? 'reject' : 'accept',
      rejectedFor,
      unknown: [
        ...(subject ? [] : ['subject']),
        ...(sized ? [] : ['size']),
        ...RISK_LABELS.filter(([label]) => asset[label] === null).map(([, reason]) => reason)
      ]
    })
  }
  return out
}
