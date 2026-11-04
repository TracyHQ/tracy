/**
 * The template kit of the contract that seals a release, read from the contract folder itself
 * (`template-kit.json` beside `content-map.json`, committed by whoever captured the kit; in the image through the same
 * Dockerfile COPY as the contract), the way `content-coverage/reader.js` reads `content-coverage.json`. /ops only reads
 * it; the kit is captured by `packages/cms/tracy-quickstart-tools/template-kit`.
 *
 * A template kit is made once per template version: full page and per block screenshots at 1440 and 390, a per page
 * summary of the content map, and a version stamp. The images are not in this repo: `cli.mjs pack` (in
 * `packages/cms/tracy-quickstart-tools/template-kit`) zips them with this file as `template-kit-<template>-<version>.zip`,
 * published as an asset of the quickstart's GitHub release in `RELEASES_REPO` (`quickstart-releases.js`), for example
 * tag `quickstart/ja-boxing/j6`, asset `template-kit-ja-boxing-1.0.10.zip`; `approval.imagesSha256` is checked with
 * `imagesDigest`. This file is the text part. The shape this reader uses (every other key is kept and ignored):
 *
 *   {
 *     "kitVersion": "1.0.0",
 *     "template":   { "name": "<template id>", "version": "<template version>" },
 *     "quickstart": { "slug": "<quickstart slug>", "version": "<quickstart version>" },   required: version
 *     "images":     [ { "path": "<relative path>", "sha256": "<64 hex>" } ],          required, at least one
 *     "pageGroups": [ ... ],
 *     "pages":      [ { "id", "group", "path", "inMainMenu", "blocks": [...], "images": <by width> } ],
 *     "blocks":     [ { "id", "role", "shared", "images": <by width>, "visibleAt": ["1440"], "notShownAt": ["390"],
 *                       "notShownBecause": "<why>", "lists", "frames", "links", "fixedText", "demoOwned",
 *                       "look": { "image", "sha256", "text" } } ],      look optional, on a page too (below)
 *     "templateGaps": [ { "id", "kind", "where": { "pageId" | "blockId" | "path" | "selector" }, "detail",
 *                         "evidence": [<image id>], "accepted": null | { "reason", "by" } } ],   optional
 *     "errors":     [ ... ],
 *     "approval":   { "by": "<GitHub login or e-mail>", "at": "<ISO date>", "imagesSha256": "<imagesDigest(images)>" } | null
 *   }
 *
 * `images` of a page or a block names its screenshot at each width, as an object keyed by width
 * (`{ "1440": "<image id>", "390": "<image id>" }`) or a list of `{ width, id }` (a bare string counts for the width
 * its name carries). The step reads only which widths are present.
 *
 * `look` of a page or a block is a short plain text of what its 1440 shot shows (layout, columns, media, headings and
 * buttons, density), written once per kit version by the packager's own Claude Code (`cli.mjs looks`), so a planner
 * reads text instead of opening every shot. `image` names the shot it describes and `sha256` is that image's sha256 in
 * `images`: a recaptured shot leaves its look stale. `looksMissingOf` lists the shots without a current look; the
 * approval does not cover looks (they are text, not images), so writing them never makes an approval stale.
 *
 * 🔒 AN APPROVAL COUNTS ONLY FOR THE IMAGE SET IT SAW. `approval.imagesSha256` is `imagesDigest(images)`: the sha256 of
 * the image list in the `sha256sum` line format (`<sha256>  <path>\n`), sorted by path. Capture the kit again and any
 * changed, added or removed picture makes the old approval stale, never a pass.
 */
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const KIT_FILE = 'template-kit.json'

/** The two widths every page and block must be pictured at. */
export const KIT_WIDTHS = Object.freeze([1440, 390])

/**
 * @typedef {{ state: 'none' } | { state: 'invalid', reason: string } | { state: 'read', doc: any }} Kit
 */

const HEX64 = /^[0-9a-f]{64}$/

/**
 * The digest an approval names: sha256 over the image list as `sha256sum` lines, sorted by path, so the order the
 * images are listed in never matters.
 * @param {{ path: string, sha256: string }[]} images
 */
export function imagesDigest(images) {
  const lines = [...images]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((i) => `${String(i.sha256).toLowerCase()}  ${i.path}\n`)
  return createHash('sha256').update(lines.join('')).digest('hex')
}

/**
 * Why a parsed kit cannot be judged, or null. Checks only what the step reads.
 * @param {any} doc
 */
export function kitFileProblem(doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return `${KIT_FILE} is not an object`
  if (typeof doc.quickstart?.version !== 'string' || doc.quickstart.version === '')
    return `${KIT_FILE} names no quickstart version`
  if (!Array.isArray(doc.images) || doc.images.length === 0) return `${KIT_FILE} lists no images`
  for (const image of doc.images) {
    if (typeof image?.path !== 'string' || image.path === '') return `an image in ${KIT_FILE} has no path`
    if (typeof image.sha256 !== 'string' || !HEX64.test(image.sha256.toLowerCase()))
      return `image ${image.path} has no valid sha256`
  }
  for (const key of ['pages', 'blocks', 'templateGaps'])
    if (doc[key] !== undefined && !Array.isArray(doc[key])) return `${key} in ${KIT_FILE} is not a list`
  return null
}

/**
 * The widths a page or block is pictured at, from its `images` (see the shape above).
 * @param {unknown} images
 * @returns {Set<number>}
 */
export function widthsOf(images) {
  const found = new Set()
  if (Array.isArray(images)) {
    for (const entry of images) {
      if (entry && typeof entry === 'object' && Number.isFinite(Number(/** @type {any} */ (entry).width)))
        found.add(Number(/** @type {any} */ (entry).width))
      else if (typeof entry === 'string')
        for (const w of KIT_WIDTHS) if (new RegExp(`(^|\\D)${w}(\\D|$)`).test(entry)) found.add(w)
    }
  } else if (images && typeof images === 'object') {
    for (const [key, value] of Object.entries(images))
      if (Number.isFinite(Number(key)) && value) found.add(Number(key))
  }
  return found
}

/**
 * The widths a block declares it is not shown at, counted only when it says why: `notShownAt` (widths as strings
 * or numbers) with a non-empty `notShownBecause`. Without a reason the declaration excuses nothing.
 * @param {any} block
 * @returns {Set<number>}
 */
export function notShownWidthsOf(block) {
  const because = block?.notShownBecause
  if (typeof because !== 'string' || because.trim() === '' || !Array.isArray(block?.notShownAt))
    return new Set()
  return new Set(block.notShownAt.map(Number).filter((w) => KIT_WIDTHS.includes(w)))
}

/** The width a look describes: the planner reads the desktop shot. */
export const LOOK_WIDTH = 1440

/**
 * The image reference a page or block names at `width` (see the shape above), or null.
 * @param {unknown} images
 * @param {number} width
 * @returns {string | null}
 */
export function imageAt(images, width) {
  if (Array.isArray(images)) {
    for (const entry of images) {
      if (entry && typeof entry === 'object' && Number(/** @type {any} */ (entry).width) === width) {
        const id = /** @type {any} */ (entry).id
        if (typeof id === 'string' && id) return id
      } else if (typeof entry === 'string' && new RegExp(`(^|\\D)${width}(\\D|$)`).test(entry)) return entry
    }
    return null
  }
  if (images && typeof images === 'object') {
    const ref = /** @type {any} */ (images)[String(width)]
    return typeof ref === 'string' && ref ? ref : null
  }
  return null
}

/**
 * Every page and block whose 1440 shot has no current look: none, or one naming another shot or another sha256 than
 * the image record holds, or with no text. A shot the kit's `images` does not hold has no file to describe and is
 * left out (the pack guarantees every shot it names is in `images`).
 * @param {any} doc
 * @returns {{ kind: 'page' | 'block', id: string, image: string, why: 'missing' | 'stale' }[]}
 */
export function looksMissingOf(doc) {
  const records = new Map()
  for (const image of Array.isArray(doc?.images) ? doc.images : []) {
    if (typeof image?.id === 'string') records.set(image.id, image)
    if (typeof image?.path === 'string') records.set(image.path, image)
  }
  /** @type {{ kind: 'page' | 'block', id: string, image: string, why: 'missing' | 'stale' }[]} */
  const out = []
  for (const [kind, list] of /** @type {const} */ ([
    ['page', doc?.pages],
    ['block', doc?.blocks]
  ]))
    for (const item of Array.isArray(list) ? list : []) {
      const image = imageAt(item?.images, LOOK_WIDTH)
      const record = image ? records.get(image) : undefined
      if (!image || !record) continue
      const look = item.look
      const hasText = typeof look?.text === 'string' && look.text.trim() !== ''
      if (!look || typeof look !== 'object' || !hasText) {
        out.push({ kind, id: String(item.id ?? '?'), image, why: 'missing' })
        continue
      }
      const sameShot = records.get(look.image) === record
      const sameBytes = String(look.sha256 ?? '').toLowerCase() === String(record.sha256).toLowerCase()
      if (!sameShot || !sameBytes) out.push({ kind, id: String(item.id ?? '?'), image, why: 'stale' })
    }
  return out
}

/** @type {Map<string, { stamp: string, readAt: number, value: Kit }>} */
const memo = new Map()
/** A stamp read this close to a file's last write may hide a second write in the same tick (as the coverage reader). */
const RACY_MS = 2000

/**
 * @param {{ id: string, dir?: string } | null | undefined} contract what `contractFor` answered
 * @returns {Kit}
 */
export function kitOfContract(contract) {
  if (!contract?.dir) return { state: 'none' }
  const file = path.join(contract.dir, KIT_FILE)
  let stamp = 'missing'
  let writtenMs = 0
  try {
    const stat = statSync(file, { bigint: true })
    stamp = `${stat.mtimeNs}:${stat.size}`
    writtenMs = Number(stat.mtimeNs / 1000000n)
  } catch {
    // no file: the stamp stays `missing`
  }
  const seen = memo.get(file)
  if (seen && seen.stamp === stamp && seen.readAt - writtenMs > RACY_MS) return seen.value
  const value = readKit(file)
  memo.set(file, { stamp, readAt: Date.now(), value })
  return value
}

/** @returns {Kit} */
function readKit(file) {
  let doc
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return { state: 'none' }
    return { state: 'invalid', reason: `${KIT_FILE} is not valid JSON` }
  }
  const problem = kitFileProblem(doc)
  if (problem) return { state: 'invalid', reason: problem }
  return { state: 'read', doc }
}
