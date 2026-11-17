// The brand step's pictures in a draft write (#575, P1 to P3 of the brand audit): the logo frames of the write order
// (`reason: logo_from_brand_step`) and the site icon take the pictures of the brand file the draft keeps
// (`brand-before-site-files.js`), stored as draft pictures (`build-draft/pictures.js` `keepBrand`). Without them every
// logo frame had no stored bytes and the write guard stopped the build (`picture_not_stored`).
//
// Which picture a logo frame takes is read from the kit, never from a template name: the frame's field is a logo fact
// of the mapping (`blocks.<block>.fields.<field>.fact`), the fact's places name the record the logo is written to (a
// template site setting `site_logo`, a module), and the brand file's logo spot of that setting or block is the picture
// (its ground side is the fact's: `site_logo` light, `site_logo_dark` dark). A frame no spot matches takes the spot of
// its own theme's ground; none of either, no picture (the guard says so).
//
// The site icon takes the brand file's own icon in the format the kit's path names (`.ico`: the 16, 32 and 48 pixel
// set the bench made and checked; `.png`: its 32 pixel icon), under the stored key `look.favicon`
// (`draft-write-plan-favicon.mjs`).
const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The stored id prefix of a brand picture: `brand:<draft picture id>`. */
export const BRAND_STORED = 'brand:'

/** The brand file's kept entry of a picture as a stored entry, or null when it was never stored. */
function storedOf(file, name) {
  const p = file?.pictures?.[name]
  return isText(p?.id) ? { id: `${BRAND_STORED}${p.id}`, mime: p.mime ?? 'image/png' } : null
}

/** The template block of an order block (`home-b1` is `header`). */
function templateBlocksOf(order) {
  const out = new Map()
  for (const page of list(order?.pages)) for (const b of list(page?.blocks)) out.set(b.id, b.block)
  return out
}

/** The logo spot of the brand file a frame takes. */
function spotOfFrame(frame, block, { logos, mapping }) {
  const fact = mapping?.blocks?.[block]?.fields?.[frame.field]?.fact
  for (const loc of list(mapping?.facts?.[fact])) {
    const key = mapping?.entities?.[loc?.entity]?.identity?.key
    const module = /^module-(\d+)$/.exec(String(loc?.entity ?? ''))?.[1]
    const found = logos.find(
      (l) => (isText(key) && l.setting === key) || (module && l.block === `block-${module}`)
    )
    if (found) return found
  }
  return isText(frame.theme) ? (logos.find((l) => l.side === frame.theme) ?? null) : null
}

/**
 * The stored brand pictures of a write order: `{<frame>: {id, mime}}` for every logo frame, and `look.favicon` for the
 * site icon the kit declares.
 * @param {{order: object, brand?: {file?: object} | null, mapping?: object}} input `brand`: the kept brand file of the
 *   plan (`step-chain-draft-source.js`); `mapping`: the kit's mapping file
 */
export function brandStoredOf({ order, brand, mapping }) {
  const file = brand?.file
  if (!file || typeof file !== 'object') return {}
  const out = {}
  const logos = list(file.logos).filter((l) => storedOf(file, l.file))
  const blocks = templateBlocksOf(order)
  for (const p of list(order?.pictures)) {
    if (p?.reason !== 'logo_from_brand_step') continue
    const spot = spotOfFrame(p, blocks.get(p.block), { logos, mapping })
    if (spot) out[p.frame] = storedOf(file, spot.file)
  }
  const path = String(mapping?.look?.favicon?.path ?? '')
  const format = path.split('.').pop().toLowerCase()
  const icon = format === 'ico' ? file.favicon?.ico : format === 'png' ? file.favicon?.png32 : null
  const stored = isText(icon) ? storedOf(file, icon) : null
  if (stored) out['look.favicon'] = stored
  return out
}

/** The sha256 the kept brand file gives a stored brand id, or null. */
export function brandHashOf(brand, id) {
  const wanted = String(id ?? '').slice(BRAND_STORED.length)
  const found = Object.values(brand?.file?.pictures ?? {}).find((p) => p?.id === wanted)
  return found?.sha256 ?? null
}

/**
 * The brand file's colour shifts per side (`colours.shifts`, #575 P4 of the brand audit), when the plan's accent is the
 * brand file's own new accent and the plan sets no dark accent of its own; else null, and the write paints the plan's
 * tones as they are. An accent the owner changed, or one the brand step's record adjusted, is not the brand file's.
 * @param {{file?: object} | null} brand the kept brand file of the plan
 * @param {{accent?: string, accentDark?: string} | null} look the approved plan's look
 */
export function accentShiftsOf(brand, look) {
  const colours = brand?.file?.brandFile?.colours
  if (colours?.decision !== 'new-accent' || look?.accentDark) return null
  if (String(colours.accent ?? '').toLowerCase() !== String(look?.accent ?? '').toLowerCase()) return null
  const shifts = list(colours.shifts)
  return shifts.length ? structuredClone(shifts) : null
}
