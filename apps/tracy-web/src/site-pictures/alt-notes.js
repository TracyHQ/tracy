// Alt notes for the writer (#343, ADR 0043): when a run is given the writer's copy file (`site-copy/1`), each frame's
// alt text is compared with what the looker saw in the picture actually placed there. Pure code, no model call.
//
// The comparison (lib/alt-compare.js, shared with the site check's `alt-matches-picture`) is a plain word overlap, so its verdict is easy to explain: both texts are cut into content words
// (lower case, letters and digits, three letters or more, common little words dropped, a plural or -ing ending
// trimmed), and the alt "agrees" when at least one of its content words is in the seen sentence and at least a third of
// them are. Anything else "differs": the note asks the writer to read the picture again. The note lists the shared
// words, so a reader sees why. Frames with no alt, or no seen sentence, get no note.
import { compareAlt } from '../lib/alt-compare.js'
import { COPY_VERSION } from '../lib/site-copy-view.js'

export { compareAlt, contentWords } from '../lib/alt-compare.js'

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

/**
 * What the manifest says of its alt check (`altCheck`). Without a writer copy file (steps 6 and 8 run in parallel, so the
 * alts do not exist yet when this step runs) `altNotes` stays empty, and that is said: the comparison is deferred to the
 * site check, which reads the alt each page prints and compares it with the seen sentences of this manifest.
 * @param {Array<{ frame: string, text: string }> | null} alts null when the run was given no copy file
 */
export function altCheckFor(alts) {
  if (!alts)
    return {
      status: 'deferred',
      to: 'step 11 site check, group alt-matches-picture',
      reason:
        'the run was given no writer copy file, so no alt was compared here; step 11 (alt-matches-picture) compares the alt each page prints with the seen sentences of this manifest'
    }
  return { status: 'compared', reason: 'the writer copy file was given; altNotes holds the comparison' }
}
