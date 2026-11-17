// The whole brand file of the brand step before the site (#575, P1 of the brand audit): the look record of
// `brandLookOf` keeps only the accent and the kind of logo, so the brand file itself (every logo picture per ground,
// the favicon set, the colour shifts per side, the owner tasks) is kept beside it, with the bytes of every picture it
// names, read from the brand file's folder before the run's files can go.
//
// It is the write step's own reading of a brand file (`write-step/brand-write-orders.js` `exportBrandOrders`, and
// `write-step/brand-stage.js` `readPictures`): the same kit check (the file is made on this kit, every spot it names is
// in the kit), the same orders (which picture each logo spot and each icon of the favicon set takes), and the same
// folder check (no file outside the brand file's folder). A file it names that cannot be read stops typed, never a
// brand kept without its pictures.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { BrandStepError } from 'website-opportunities/domain/brand-before-site.mjs'
import { exportBrandOrders } from './write-step/brand-write-orders.js'

/** The schema of what the draft keeps of a brand file (`build_draft.brand.file`). */
export const BRAND_KEPT_SCHEMA = 'tracy-brand-kept/v1'

const MIME = {
  png: 'image/png',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp'
}
const mimeOf = (file) => MIME[String(file).split('.').pop().toLowerCase()] ?? 'application/octet-stream'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const each = (value) => (Array.isArray(value) ? value : [])

/** The kit document of the step chain's kit value (`{ref, doc}`) or the document itself. */
const kitDocOf = (kit) => kit?.doc ?? kit ?? {}

/** Every logo spot of the kit that takes a picture of the brand file: where it is and on which ground. */
function logosOf(orders, kitDoc) {
  const spots = new Map(each(kitDoc.site?.logoSpots).map((k) => [k?.id, k]))
  return orders
    .filter((o) => o.item === 'logo' && o.file)
    .map((o) => {
      const k = spots.get(o.spot) ?? {}
      return {
        spot: o.spot,
        side: k.ground?.side === 'dark' ? 'dark' : 'light',
        ground: k.ground?.colour ?? null,
        setting: k.setting ?? null,
        block: k.block ?? null,
        width: Number(k.width) || null,
        height: Number(k.height) || null,
        file: o.file
      }
    })
}

/** The icons of the favicon set the brand file names, by link (`ico`, `png32`, `png512`, `phone180`). */
function faviconOf(brandFile) {
  const out = {}
  for (const link of ['ico', 'png32', 'png512', 'phone180']) {
    const file = brandFile?.favicon?.[link]
    if (typeof file === 'string' && file.trim() !== '') out[link] = file
  }
  return out
}

/**
 * The brand file as the draft keeps it, and the bytes of every picture it names.
 * @param {{brandFile: object, file: string, kit: object, read?: (file: string) => Promise<Buffer>}} input `file`: where
 *   the brand file is (its pictures are named relative to its folder); `kit`: the kit the step ran on
 * @returns {Promise<{kept: object, bytes: Map<string, Buffer>}>}
 * @throws {BrandStepError} `brand_file_other_kit` (made on another kit, or naming a spot the kit does not have),
 *   `brand_file_picture_outside` and `brand_file_picture_missing`; all `noRerun`
 */
export async function keptBrandFileOf({ brandFile, file, kit, read = readFile }) {
  const kitDoc = kitDocOf(kit)
  const plan = exportBrandOrders({ brand: brandFile, kit: kitDoc })
  if (plan.problems.length)
    throw new BrandStepError(
      'brand_file_other_kit',
      `the brand file is not for this kit: ${plan.problems.join('; ')}`,
      { problems: plan.problems },
      { noRerun: true }
    )
  const logos = logosOf(plan.orders, kitDoc)
  const favicon = faviconOf(brandFile)
  const folder = path.dirname(path.resolve(file))
  const bytes = new Map()
  const pictures = {}
  for (const name of [...logos.map((l) => l.file), ...Object.values(favicon)]) {
    if (bytes.has(name)) continue
    const where = path.resolve(folder, name)
    if (path.relative(folder, where).startsWith('..') || path.isAbsolute(path.relative(folder, where)))
      throw new BrandStepError(
        'brand_file_picture_outside',
        `the brand file names ${name}, outside its folder`,
        { file: name },
        { noRerun: true }
      )
    let got
    try {
      got = await read(where)
    } catch (error) {
      throw new BrandStepError(
        'brand_file_picture_missing',
        `the brand file names ${name}, which cannot be read (${error?.code ?? 'error'})`,
        { file: name },
        { noRerun: true }
      )
    }
    bytes.set(name, Buffer.from(got))
    pictures[name] = { sha256: sha256(got), mime: mimeOf(name), size: got.length }
  }
  const kept = {
    schema: BRAND_KEPT_SCHEMA,
    kit: brandFile.kit ?? null,
    brandFile: structuredClone(brandFile),
    logos,
    favicon,
    pictures
  }
  return { kept, bytes }
}
