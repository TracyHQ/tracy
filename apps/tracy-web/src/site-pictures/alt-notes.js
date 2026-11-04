// Alt notes for the writer (#343, ADR 0043): when a run is given the writer's copy file (`site-copy/1`), each frame's
// alt text is compared with what the looker saw in the picture actually placed there. Pure code, no model call.
//
// The comparison is a plain word overlap, so its verdict is easy to explain: both texts are cut into content words
// (lower case, letters and digits, three letters or more, common little words dropped, a plural or -ing ending
// trimmed), and the alt "agrees" when at least one of its content words is in the seen sentence and at least a third of
// them are. Anything else "differs": the note asks the writer to read the picture again. The note lists the shared
// words, so a reader sees why. Frames with no alt, or no seen sentence, get no note.
import { COPY_VERSION } from '../lib/site-copy-view.js'

const STOP = new Set(
  (
    'the and with for from into onto over under this that these those their there here its his her our your they them ' +
    'are was were been being has have had who whom which what when where while also very just some any each every ' +
    'one two three photo picture image shows showing shown'
  ).split(' ')
)

/** The content words of a text, as the comparison reads them. */
export function contentWords(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .match(/[a-z0-9]+/g)
  const out = new Set()
  for (const w of words ?? []) {
    if (w.length < 3 || STOP.has(w)) continue
    out.add(w.replace(/(ing|es|s)$/, '') || w)
  }
  return out
}

/** One alt against one seen sentence: { agrees, shared }. */
export function compareAlt(alt, seen) {
  const a = contentWords(alt)
  const s = contentWords(seen)
  const shared = [...a].filter((w) => s.has(w))
  return { agrees: shared.length >= 1 && shared.length * 3 >= a.size, shared }
}

/**
 * The alts of a writer copy file by frame, as a run stores them, or a problem. Only `version` and `alts` are read.
 * @returns {{ alts: Array<{ frame: string, text: string }> } | { problem: string }}
 */
export function altsOfCopy(copy) {
  if (!copy || typeof copy !== 'object' || Array.isArray(copy)) return { problem: 'it is not a JSON object' }
  if (copy.version !== COPY_VERSION)
    return { problem: `its version must be "${COPY_VERSION}", found ${JSON.stringify(copy.version)}` }
  if (!Array.isArray(copy.alts)) return { problem: 'it has no alts list' }
  const alts = copy.alts
    .filter((a) => a && typeof a.frame === 'string' && typeof a.text === 'string')
    .map((a) => ({ frame: a.frame, text: a.text }))
  return { alts }
}

/**
 * The manifest's `altNotes`: one note per frame that has both a writer alt and a seen sentence, in manifest order.
 * @param {Array<{ frame: string, text: string }> | null} alts null when the run was given no copy file
 * @param {Array<{ frame: string, seen?: string | null }>} entries the manifest's frames and siteSettings entries
 */
export function altNotesFor(alts, entries) {
  if (!alts) return []
  const byFrame = new Map(alts.map((a) => [a.frame, a.text]))
  const notes = []
  for (const e of entries) {
    const alt = byFrame.get(e.frame)
    if (typeof alt !== 'string' || typeof e.seen !== 'string' || !e.seen) continue
    const { agrees, shared } = compareAlt(alt, e.seen)
    notes.push({
      frame: e.frame,
      alt,
      seen: e.seen,
      agrees,
      shared,
      note: agrees
        ? 'the alt and what the looker saw share their main words'
        : 'the alt may not describe the picture placed: read the picture and rewrite the alt'
    })
  }
  return notes
}
