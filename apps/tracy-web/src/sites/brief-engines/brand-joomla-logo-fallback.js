/**
 * A brief build's logo never leaves the template's demo logo on the page (spec TracyHQ/tracy#189, #193): the owner's logo
 * where it can be placed, else the business name as text.
 *
 *   logoForSlot        a logo narrower than its picture slot's `fit.minWidth` is set, at its own size, on a transparent
 *                      canvas that wide (the plugin refuses a narrower picture, `SLOT_IMAGE_TOO_SMALL`); a logo that would
 *                      then show smaller than a legible height is not placed, and the spot shows the name
 *   nameForDemoLogos   every module whose HTML still shows a demo logo file (header copies, footer, any custom module) shows
 *                      the business name as text in its place
 *
 * 🔒 BRIEF BUILDS ONLY (`prepared.nameFallback`): a site built from the template with no brief keeps its demo. Rules by slot
 * fit and by the content map's logo files, never by one template.
 */
import sharp from 'sharp'
import { joomlaIdentityHtml } from './joomla-plan-identity.js'

/** The plugin's floor is 1.5 times the slot's desktop box: a picture that wide shows at two thirds of its pixels. */
const MIN_WIDTH_OVER_BOX = 1.5
/** The least height, in CSS pixels on the desktop page, the logo's own drawing may show at to stay legible. */
export const LEGIBLE_LOGO_PX = 16
/** Rows of a module listing read at once (the door's ceiling for whole rows). */
const PAGE = 25

/**
 * The height of the drawn part of a picture (transparent rows above and below left out).
 * @param {Uint8Array} bytes
 */
async function drawnHeight(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let top = -1
  let bottom = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1)
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        if (top < 0) top = y
        bottom = y
        break
      }
  }
  return top < 0 ? 0 : bottom - top + 1
}

/**
 * The logo a picture slot takes, or why it shows the name instead.
 * @param {Uint8Array} bytes - the logo as the brand step prepared it (padded to the template's frame)
 * @param {{minWidth?: number, aspect?: number, boxes?: {desktop?: {width?: number}}} | null | undefined} fit
 * @returns {Promise<{bytes: Uint8Array, padded: boolean} | {text: true, reason: string}>}
 */
export async function logoForSlot(bytes, fit) {
  const minWidth = Number.isInteger(fit?.minWidth) && fit.minWidth > 0 ? fit.minWidth : 0
  const meta = await sharp(bytes).metadata()
  if (!meta.width || !meta.height) return { text: true, reason: 'the logo could not be read' }
  if (!minWidth || meta.width >= minWidth) return { bytes, padded: false }
  const box =
    Number(fit?.boxes?.desktop?.width) > 0 ? Number(fit.boxes.desktop.width) : minWidth / MIN_WIDTH_OVER_BOX
  const shown = ((await drawnHeight(bytes)) * box) / minWidth
  if (shown < LEGIBLE_LOGO_PX)
    return {
      text: true,
      reason: `the logo is too small for this spot (${meta.width} pixels wide, it would show ${Math.round(shown)} pixels high)`
    }
  const aspect = Number(fit?.aspect) > 0 ? Number(fit.aspect) : meta.width / meta.height
  const height = Math.max(meta.height, Math.round(minWidth / aspect))
  const left = Math.floor((minWidth - meta.width) / 2)
  const top = Math.floor((height - meta.height) / 2)
  const out = await sharp(bytes)
    .ensureAlpha()
    .extend({
      left,
      right: minWidth - meta.width - left,
      top,
      bottom: height - meta.height - top,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer()
  return { bytes: out, padded: true }
}

/**
 * Every module showing one of the template's logo files shows the business name as text in its place.
 * @param {object} input
 * @param {string} input.name
 * @param {string[]} input.demoFiles - the files of the content map's logo slots (site plan `logo.demoFiles`)
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.read
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.write
 * @param {(where: string) => void} input.wrote @param {(where: string, reason: string) => void} input.skip
 * @returns {Promise<number>} the modules changed
 */
export async function nameForDemoLogos({ name, demoFiles, read, write, wrote, skip }) {
  if (!name || !demoFiles?.length) return 0
  const plan = { logo: { decision: 'name-as-text', name, demoFiles } }
  let changed = 0
  try {
    for (let offset = 0; offset < 5000; offset += PAGE) {
      const answer = await read('content.list', { kind: 'module', limit: PAGE, offset, include_body: true })
      if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
      const rows = Array.isArray(answer?.items) ? answer.items : []
      for (const row of rows) {
        const html = typeof row.content === 'string' ? row.content : ''
        if (!html) continue
        const made = joomlaIdentityHtml(html, plan)
        if (made.logos === 0) continue
        await write('content.update', { kind: 'module', id: Number(row.id), fields: { content: made.html } })
        changed += 1
      }
      if (rows.length < PAGE) break
    }
  } catch (error) {
    skip(
      'logo-text',
      `the modules showing the template's logo could not be changed (${error instanceof Error ? error.message : error})`
    )
  }
  if (changed) wrote('logo-text')
  return changed
}
