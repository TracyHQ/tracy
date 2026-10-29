// The cut-outs a content map never measured (spec TracyHQ/tracy#189). Most released maps carry no Slot fit (ADR 0039),
// so a transparent figure of the demo (a chef, a product, a dog standing over the section's ground) is only known as
// "a PNG that may be a cut-out" (`slot-map.mjs`) and was left on the site: another business's figure on the owner's
// site. A brief build reads the demo file's transparency from the site; where it is transparent and drawn at least an
// icon's size, the photo labeller is asked what it shows:
//
//   a subject (a person, an object, a product, an animal, food)   demo content: the slot climbs the cut-out ladder
//                                                                 (`cutout-ladder.mjs`), step 1 or step 2 only, as its
//                                                                 zone is unknown (never framed)
//   anything else (shapes, lines, patterns, blobs, textures)      a design piece of the template: it stays
//   no answer from the labeller                                   it stays (nothing is taken off on a guess)
//
// 🔒 BY MEASURE AND BY LABEL, NEVER BY NAME OF ONE TEMPLATE: the candidate is chosen from the demo file's measured
// transparency and size and the slot's role; the name rules of `pictureKindOf` only keep logos, faces, signatures, icons
// and maps out. Pure: the engine reads the files and asks the labeller.
import { ICON_PX, pictureKindOf } from './pictures/content-map-fit.mjs'
import { fileOf } from './pictures/slot-map.mjs'

/** The labeller subjects that are demo content when a transparent figure shows them (`lib/picture-vision.js`). */
export const FIGURE_SUBJECTS = Object.freeze([
  'people',
  'food',
  'drink',
  'dessert',
  'product',
  'equipment',
  'work-result',
  'service-in-action',
  'event'
])
/** The most demo figures one build asks the labeller about: each is a paid call. */
export const MAX_FIGURE_LABELS = 8

const SUBJECTS = new Set(FIGURE_SUBJECTS)
const personal = (role) => /^(?:person|quote)\./.test(String(role ?? ''))

/**
 * Whether the photo labeller's answer on a transparent demo figure says it shows a subject (demo content), not a design
 * piece. A thing the subject list has no name for (an animal) counts only when the labeller says it is no graphic.
 * @param {{subject?: string, isGraphic?: boolean, peopleCount?: number} | null | undefined} label
 */
export function figureShowsSubject(label) {
  if (!label || typeof label !== 'object') return false
  if (Number(label.peopleCount) > 0) return true
  if (SUBJECTS.has(label.subject)) return true
  return label.subject === 'other' && label.isGraphic === false
}

/**
 * The demo files that may be unmeasured cut-outs: a PNG the site serves transparent, drawn at least an icon's size, in a
 * slot with no measured kind and no person or quote role, that `pictureKindOf` calls a cut-out. Largest first, at most
 * `max`: the labeller is asked about these.
 * @param {object} input
 * @param {any[]} input.slots - the content map's picture slots the build may write
 * @param {Array<{file: string, keys: string[]}>} input.never - the slot map's pictures no path replaced
 * @param {Map<string, {width?: number, height?: number, alpha?: boolean}>} input.demo - what was read of each demo file
 * @param {number} [input.max]
 * @returns {Array<{file: string, keys: string[], width: number, height: number}>}
 */
export function figureCandidatesOf({ slots = [], never = [], demo, max = MAX_FIGURE_LABELS }) {
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const out = []
  for (const entry of never) {
    if (!/\.png$/i.test(entry?.file ?? '')) continue
    const source = demo?.get?.(entry.file)
    if (source?.alpha !== true || !source.width || !source.height) continue
    if (Math.max(source.width, source.height) < ICON_PX) continue
    const keys = (entry.keys ?? []).filter((key) => {
      const slot = byKey.get(key)
      if (!slot || slot.type !== 'image' || slot.fit?.kind || personal(slot.role)) return false
      const words = `${slot.label ?? ''} ${(slot.jsonPath ?? []).join(' ')}`
      return pictureKindOf({ words, file: entry.file, source }).kind === 'cutout'
    })
    if (keys.length) out.push({ file: entry.file, keys, width: source.width, height: source.height })
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, Math.max(0, max))
}

/**
 * The slots the cut-out ladder takes over: each candidate's slots whose figure the labeller says shows a subject, given
 * an unmeasured cut-out fit so the decor plan (`decorOf`) reads them as cut-outs.
 * @param {object} input
 * @param {any[]} input.slots
 * @param {Array<{file: string, keys: string[]}>} input.candidates - `figureCandidatesOf`
 * @param {Map<string, any>} input.labels - the labeller's answer by demo file; a file with none stays
 * @returns {{slots: any[], kept: Array<{file: string, why: string}>}}
 */
export function unmeasuredFigureSlotsOf({ slots = [], candidates = [], labels }) {
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const out = []
  const kept = []
  for (const c of candidates) {
    const label = labels?.get?.(c.file) ?? null
    if (!label) {
      kept.push({ file: c.file, why: 'the labeller gave no answer' })
      continue
    }
    if (!figureShowsSubject(label)) {
      kept.push({ file: c.file, why: `a design piece (${label.subject ?? 'unknown'})` })
      continue
    }
    for (const key of c.keys) {
      const slot = byKey.get(key)
      if (!slot || fileOf(slot.sample) !== c.file) continue
      out.push({ ...slot, fit: { ...slot.fit, measured: false, kind: 'cutout', transparent: true } })
    }
  }
  return { slots: out, kept }
}
