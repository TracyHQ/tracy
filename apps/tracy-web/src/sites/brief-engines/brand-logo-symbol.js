/**
 * The SYMBOL of a logo Tracy makes for a business that gave none (spec TracyHQ/tracy#189, COO rule 2 of 29/10/2026): drawn
 * by the picture door the Customize drawings use (`lib/picture-draw.js`, mode `symbol`), read back by the photo labeller,
 * and refused when it holds any letter. The name is set beside it as type (`brand-logo-fit.js`), never drawn.
 *
 *   symbolItem      what is drawn: the business's name and trade as context, the template's logo colours to draw in
 *   symbolVerdict   the labeller's answer read for a symbol: words or letters, or a face, refuse it; being a logo does not
 *   drawLogoSymbol  cache, then at most two drawings each checked; the bytes, or why there are none
 *
 * 🔒 NO LABELLER, NO SYMBOL: a drawing nobody looked at could carry a misspelt name, so it is never used.
 */
import { drawForPlace, drawKey } from '../../lib/picture-draw.js'
import { hexOf } from './logo-colours.js'

/** Tries of one symbol: the first, and one more when the labeller refuses it. */
const TRIES = 2
/** How long one drawing may take. */
const DRAW_MS = 30_000

/**
 * @param {{name: string, trade?: string | null, about?: string | null,
 *   palette?: import('./logo-colours.js').Palette | null}} input
 */
export function symbolItem({ name, trade = null, about = null, palette = null }) {
  const colours = [palette?.accent, ...(palette?.colours ?? [])]
    .filter(Boolean)
    .map((c) => hexOf(/** @type {any} */ (c)))
    .filter((c, i, all) => all.indexOf(c) === i)
    .slice(0, 2)
  return {
    mode: 'symbol',
    aspect: 1,
    subject: { kind: 'symbol', label: name, category: trade ?? null, about: about ?? null },
    colours,
    // The colours are part of what is drawn: a cached symbol is only reused for the same ones.
    variant: colours.join(',') || 0,
    referenceIds: []
  }
}

/**
 * Whether a drawn symbol may be used: no letters or words (`textPresence`, `hasTextOverlay`), no face. Unlike a photo's
 * verdict (`drawnPictureVerdict`), being seen as a logo is what a symbol is for.
 * @param {Record<string, any> | null | undefined} labels
 * @returns {{ok: boolean, reason: string | null}}
 */
export function symbolVerdict(labels) {
  if (!labels) return { ok: false, reason: 'labeller-unavailable' }
  if (
    labels.textPresence === 'present' ||
    labels.hasTextOverlay === true ||
    labels.content === 'text-graphic'
  )
    return { ok: false, reason: 'text-found' }
  if ((labels.faceBoxes?.length ?? 0) > 0) return { ok: false, reason: 'face-found' }
  return { ok: true, reason: null }
}

/**
 * @param {object} input
 * @param {{url: string, key: string, imageModel: string} | null} input.door - the picture door (`models().image`)
 * @param {Function | null} input.chat - the seeder's model call
 * @param {ReturnType<typeof symbolItem>} input.item
 * @param {((bytes: Uint8Array) => Promise<Record<string, any> | null>) | null} input.checkDrawing - the photo labeller
 * @param {{get: (key: string) => Promise<{bytes: Uint8Array} | null>, put: (key: string, bytes: Uint8Array) => Promise<void>} | null}
 *   [input.cache] - the build's drawing cache
 * @param {AbortSignal} [input.signal]
 * @param {number} [input.drawMs]
 * @returns {Promise<{bytes: Uint8Array, costUsd: number, cached: boolean} | {refused: string[], costUsd: number}>}
 */
export async function drawLogoSymbol({
  door,
  chat,
  item,
  checkDrawing,
  cache = null,
  signal,
  drawMs = DRAW_MS
}) {
  if (!door?.imageModel || !chat) return { refused: ['no-picture-model'], costUsd: 0 }
  if (!checkDrawing) return { refused: ['labeller-unavailable'], costUsd: 0 }
  const key = drawKey(/** @type {any} */ (item), { model: door.imageModel, shas: [] })
  const cached = await (cache?.get(key) ?? Promise.resolve(null)).catch(() => null)
  if (cached?.bytes) return { bytes: cached.bytes, costUsd: 0, cached: true }
  const refused = []
  let costUsd = 0
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const cutoff = AbortSignal.any([AbortSignal.timeout(drawMs), ...(signal ? [signal] : [])])
    let got
    try {
      got = await drawForPlace({ door, chat, item, references: [], signal: cutoff })
    } catch (error) {
      refused.push(
        /too long/.test(String(/** @type {any} */ (error)?.message)) ? 'timed-out' : 'model-failed'
      )
      continue
    }
    costUsd += Number(got.costUsd) || 0
    const labels = await checkDrawing(got.bytes).catch(() => null)
    const verdict = symbolVerdict(labels)
    if (!verdict.ok) {
      refused.push(String(verdict.reason))
      if (verdict.reason === 'labeller-unavailable') break
      continue
    }
    await (cache?.put(key, got.bytes) ?? Promise.resolve()).catch(() => {})
    return { bytes: got.bytes, costUsd, cached: false }
  }
  return { refused, costUsd }
}
