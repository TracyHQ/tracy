/**
 * The logo and favicon pictures of the "Customize your site" sheet, the parts that are not drawing (T08 of
 * TracyHQ/tch#1013, approved canvas `11-sheet-review-canvas.html`).
 *
 * 🔒 THE SERVER IS THE JUDGE, THE BROWSER ONLY SAYS IT FIRST. `POST /api/sites/brand-files` refuses a file that is not a
 * PNG, is over 8 MB, has a long side under 500 px (logo) or is not a square of 512 px or more (favicon). The same rules
 * run here before anything is sent, so the customer reads the line with the file's own numbers at once; a refusal from
 * the door reads as the same line (`serverProblem`).
 *
 * 🔒 A BLEND IS A WARNING, NEVER A REFUSAL (U6, D8). `blendOf` measures how much of a logo's visible ink is too close to
 * each preview tile (WCAG contrast under 1.5:1 against #ffffff and #0a0a0a); past 20% the tile says so, and the file is
 * kept. Four white corners mean a solid white background: those white pixels are not the logo, and on the dark tile the
 * warning is about the white box instead.
 *
 * Messages are keys of this plugin's strings (`strings.ts`), with their numbers as params.
 *
 * Plain JavaScript so `node --test` runs it without a build step (same as `site-brief.mjs`).
 */

/** The largest picture the door takes. Mirrors `BRAND_MAX_BYTES` of `apps/tracy-web/src/sites/brief-engines/brand-images.js`. */
export const BRAND_MAX_BYTES = 8 * 1048576
/** The shortest long side of a logo. Mirrors `LOGO_MIN_EDGE` there. */
export const LOGO_MIN_EDGE = 500
/** The smallest favicon edge. Mirrors `FAVICON_MIN_EDGE` there. */
export const FAVICON_MIN_EDGE = 512
/** The side of the copy a picture is measured on: enough to see its ink, cheap enough to run on every pick. */
export const SAMPLE_EDGE = 64
/** Contrast under this against a tile means the pixel vanishes into it (WCAG ratio). */
const BLEND_CONTRAST = 1.5
/** A share of blending pixels over this warns. */
const BLEND_SHARE = 0.2

/**
 * @typedef {{ key: string, params?: Record<string, string | number> }} Problem
 * @typedef {'light' | 'dark' | 'single' | 'favicon'} Tile
 * @typedef {{ lowOnLight: number, lowOnDark: number, box: boolean }} Blend
 */

/**
 * A size as the customer reads it: "9.4 MB", "184 KB".
 * @param {number} bytes
 */
function sizeOf(bytes) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

/**
 * Why this file cannot be the logo or the favicon, or null when it can. `file` is what the browser read of it.
 * @param {'logo' | 'favicon'} question
 * @param {{ type: string, size: number, width: number, height: number, unreadable?: boolean }} file
 * @returns {Problem | null}
 */
export function fileProblem(question, file) {
  if (file.type !== 'image/png') return { key: 'brand_png_only' }
  if (file.size > BRAND_MAX_BYTES) return { key: 'brand_too_large', params: { size: sizeOf(file.size) } }
  if (file.unreadable) return { key: 'brand_unreadable' }
  const dims = { width: file.width, height: file.height }
  if (question === 'favicon') {
    if (file.width !== file.height) return { key: 'brand_favicon_square', params: dims }
    if (file.width < FAVICON_MIN_EDGE) return { key: 'brand_favicon_small', params: dims }
    return null
  }
  return Math.max(file.width, file.height) < LOGO_MIN_EDGE ? { key: 'brand_logo_small', params: dims } : null
}

/**
 * The line a refusal of the upload door is said with: its problem code, with the numbers the browser read of the file.
 * Any other failure (the switch turned off meanwhile, no store, a dropped network) is one "try again" line.
 * @param {string} code
 * @param {{ size: number, width: number, height: number }} file
 * @returns {Problem}
 */
export function serverProblem(code, file) {
  const dims = { width: file.width, height: file.height }
  if (code === 'PNG_ONLY') return { key: 'brand_png_only' }
  if (code === 'PNG_UNREADABLE') return { key: 'brand_unreadable' }
  if (code === 'TOO_LARGE') return { key: 'brand_too_large', params: { size: sizeOf(file.size) } }
  if (code === 'LOGO_TOO_SMALL') return { key: 'brand_logo_small', params: dims }
  if (code === 'FAVICON_NOT_SQUARE') return { key: 'brand_favicon_square', params: dims }
  if (code === 'FAVICON_TOO_SMALL') return { key: 'brand_favicon_small', params: dims }
  return { key: 'brand_upload_failed' }
}

/** One sRGB channel (0-255) as linear light, for WCAG relative luminance. */
const linear = (/** @type {number} */ c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
/** The luminance of the two fixed preview tiles: #ffffff and #0a0a0a. */
const TILE_LIGHT = 1
const TILE_DARK = linear(10)
const isWhite = (/** @type {ArrayLike<number>} */ d, /** @type {number} */ i) =>
  d[i + 3] > 245 && d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235

/**
 * How much of a logo blends into each tile, measured on an RGBA sample (`SAMPLE_EDGE` square, the algorithm of the
 * approved canvas's `readFile`). Pixels under half opacity are not the logo; on a solid white background (four white
 * corners) the white pixels are not either.
 * @param {Uint8ClampedArray | number[]} data RGBA, row by row
 * @param {number} [edge] the sample's side, to find its corners
 * @returns {Blend}
 */
export function blendOf(data, edge = Math.round(Math.sqrt(data.length / 4))) {
  const corners = [0, edge - 1, edge * (edge - 1), edge * edge - 1]
  const box = corners.every((p) => isWhite(data, p * 4))
  let seen = 0
  let lowOnLight = 0
  let lowOnDark = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    if (box && isWhite(data, i)) continue
    const l = 0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2])
    seen += 1
    if ((TILE_LIGHT + 0.05) / (l + 0.05) < BLEND_CONTRAST) lowOnLight += 1
    if ((l + 0.05) / (TILE_DARK + 0.05) < BLEND_CONTRAST) lowOnDark += 1
  }
  return seen === 0
    ? { lowOnLight: 0, lowOnDark: 0, box }
    : { lowOnLight: lowOnLight / seen, lowOnDark: lowOnDark / seen, box }
}

/**
 * The warnings a logo earns on one tile, as string keys. The single tile previews on white, like the light one.
 * @param {Tile} tile
 * @param {Blend | null | undefined} blend
 * @returns {string[]}
 */
export function tileWarnings(tile, blend) {
  if (!blend) return []
  if (tile === 'dark') {
    if (blend.box) return ['brand_white_box']
    return blend.lowOnDark > BLEND_SHARE ? ['brand_blend_dark'] : []
  }
  if (tile === 'light' || tile === 'single')
    return blend.lowOnLight > BLEND_SHARE ? ['brand_blend_light'] : []
  return []
}

/**
 * The role a tile uploads under (`role` of the door).
 * @param {'logo' | 'favicon'} question
 * @param {Tile} tile
 */
export function roleOf(question, tile) {
  if (question === 'favicon') return 'favicon'
  return tile === 'single' ? 'logo' : `logo-${tile}`
}

/**
 * Send one picture to the upload door. Relative path: dsh is served under the door's own origin (`rewrite.mjs`).
 * @param {Blob} file
 * @param {string} role
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<{ ok: true, id: string, width: number, height: number } | { ok: false, code: string }>}
 */
export async function uploadBrandFile(file, role, fetchImpl = fetch) {
  const body = new FormData()
  body.append('file', file)
  body.append('role', role)
  let response
  try {
    response = await fetchImpl('/api/sites/brand-files', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      body
    })
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
  /** @type {any} */
  let answer = null
  try {
    answer = await response.json()
  } catch {
    answer = null
  }
  if (response.status === 201 && typeof answer?.id === 'string' && answer.id !== '')
    return { ok: true, id: answer.id, width: Number(answer.width) || 0, height: Number(answer.height) || 0 }
  if (response.ok) return { ok: false, code: 'BAD_ANSWER' }
  return { ok: false, code: typeof answer?.code === 'string' ? answer.code : `HTTP_${response.status}` }
}
