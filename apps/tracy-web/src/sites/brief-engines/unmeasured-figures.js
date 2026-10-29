/**
 * The demo figures a content map never measured, read and labelled at build time (spec TracyHQ/tracy#189): a transparent
 * PNG the site serves, drawn at least an icon's size, is shown to the photo labeller on a plain ground; the ones it says
 * show a subject (a person, an object, a product, an animal, food) climb the cut-out ladder, every other one (a shape,
 * a line, a pattern, a blob, a texture) stays as the template drew it. Which files and which answers count is the
 * domain's (`domain/unmeasured-figures.mjs`); this reads the files and asks.
 *
 * 🔒 NEVER IN THE WAY OF THE BUILD: no labeller, a file that cannot be read, a labeller that fails: the figure stays.
 */
import sharp from 'sharp'
import { pool } from './shared.js'

/** Figures labelled at once: each is a paid call. */
const LABEL_AT_ONCE = 2
/** The longest side a figure is shown to the labeller at: enough to say what it shows. */
const LABEL_PX = 768
/** The plain ground a figure is shown on, so its clear pixels read as nothing. */
const GROUND = '#f2f2f2'

/**
 * @param {object} input
 * @param {any} input.domain - the Website Opportunities domain
 * @param {any[]} input.slots - the content map's picture slots the build may write
 * @param {Array<{file: string, keys: string[]}>} input.never - the slot map's pictures no path replaced
 * @param {Map<string, any>} input.demo - what was read of each demo file (size, a PNG's transparency)
 * @param {(path: string) => Promise<Uint8Array | null>} input.siteBytes
 * @param {((bytes: Uint8Array) => Promise<Record<string, any> | null>) | null | undefined} input.checkDrawing - the
 *   photo labeller, one picture a call
 * @param {(note: string) => void} input.note
 * @returns {Promise<{slots: any[], kept: Array<{file: string, why: string}>, asked: number}>}
 */
export async function unmeasuredFigures({ domain, slots, never, demo, siteBytes, checkDrawing, note }) {
  if (!checkDrawing) return { slots: [], kept: [], asked: 0 }
  const candidates = domain.figureCandidatesOf({ slots, never, demo })
  if (candidates.length === 0) return { slots: [], kept: [], asked: 0 }
  const labels = new Map()
  await pool(
    candidates.map((c) => async () => {
      const bytes = await Promise.resolve(siteBytes(c.file)).catch(() => null)
      if (!bytes) return
      const shown = await sharp(Buffer.from(bytes))
        .flatten({ background: GROUND })
        .resize({ width: LABEL_PX, height: LABEL_PX, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
      const label = await Promise.resolve(checkDrawing(new Uint8Array(shown))).catch(() => null)
      if (label) labels.set(c.file, label)
    }),
    LABEL_AT_ONCE
  )
  const out = domain.unmeasuredFigureSlotsOf({ slots, candidates, labels })
  const keys = new Set(out.slots.map((s) => s.key))
  const taken = candidates.filter((c) => c.keys.some((k) => keys.has(k))).map((c) => c.file)
  if (taken.length)
    note(
      `${taken.length} unmeasured demo figure(s) show a subject, so they climb the cut-out ladder: ${taken.join(', ')}`
    )
  return { ...out, asked: candidates.length }
}
