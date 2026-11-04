// Which way the home page shows the cup: the 3D scene, a still image, or no cup at all.
//
// One rule for the server (which knows the two admin fields) and the browser (which knows what it
// can draw), so a page never decides it twice. Plain JS on purpose: `tests/cup-route.test.mjs`
// runs it without a browser.

/** Above this many stored bytes the page does not load the owner's file. */
export const MAX_MODEL_BYTES = 10 * 1024 * 1024

/**
 * The stored byte count of the "Cup model" field value, for `cupRoute`. A value written by the seed
 * or an API carries no size, so `lookup(id)` reads it from the media record; no record, no size on
 * it or a failed lookup gives null (unknown size, which the rule does not load).
 *
 * @param {{ id?: string, size?: number } | null | undefined} value the file field value
 * @param {(id: string) => Promise<number | null | undefined>} lookup the media record's size by id
 * @returns {Promise<number | null>}
 */
export async function storedModelSize(value, lookup) {
  if (typeof value?.size === 'number') return value.size
  if (!value?.id) return null
  try {
    const size = await lookup(value.id)
    return typeof size === 'number' ? size : null
  } catch {
    return null
  }
}

/**
 * The still image of the cup, for any page that shows one (no 3D).
 * An owner's file with no owner still image gives null: the page hides the cup rather than show
 * the default cup next to the owner's object. An empty model field means the default cup, so its
 * still image is the default one even when the owner stored a still image.
 *
 * @param {{ model: { url: string, size?: number | null } | null, still: string | null }} fields
 * @param {{ model: string, still: string | null }} defaults
 * @returns {string | null}
 */
export function cupStill(fields, defaults) {
  if (!fields.model) return defaults.still
  return fields.still ?? null
}

/**
 * @param {{ model: { url: string, size?: number | null } | null, still: string | null }} fields
 *   the two home page fields; `size` is the stored byte count (from the field or its media record)
 * @param {{ model: string, still: string | null }} defaults the template's own cup and its still image
 * @param {{ reducedMotion: boolean, webgl: boolean, saveData: boolean, fileError: boolean }} browser
 * @returns {{ route: '3d', model: string } | { route: 'still', image: string | null } | { route: 'none' }}
 */
export function cupRoute(fields, defaults, browser) {
  const canDraw = browser.webgl && !browser.reducedMotion && !browser.saveData && !browser.fileError
  const size = fields.model?.size
  // An unknown size is not taken as small: loading a file only to measure it is what the cap prevents.
  const loadable = !fields.model || (Number.isFinite(size) && size >= 0 && size <= MAX_MODEL_BYTES)
  if (canDraw && loadable) return { route: '3d', model: fields.model?.url ?? defaults.model }
  if (fields.model && !fields.still) return { route: 'none' }
  return { route: 'still', image: cupStill(fields, defaults) }
}
