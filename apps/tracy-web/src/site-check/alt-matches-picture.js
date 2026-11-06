// The site check's `alt-matches-picture` measure (ADR 0044, decision 28): the alt a page prints for a picture describes the picture
// placed there. Steps 6 (the writer, who writes the alts) and 8 (the pictures) run in parallel, so step 8 cannot compare them
// (its manifest says `altCheck: deferred`); this does it on the written site, after step 9, with no model call: the alt is read
// from the page as a visitor's browser gets it, and compared with what step 8's looker said the picture shows (the `seen` sentence
// of site-pictures.json), by the word overlap step 8 uses for its alt notes (lib/alt-compare.js).
//
// A picture is measured when step 8 left a seen sentence for its frame and a page that shows the slot prints it in an <img> (or a
// <picture> whose <source> names it) with an alt. Anything else is listed in `notMeasured` with why, never counted as checked: a
// frame the looker did not look at (an icon, initials, a look that failed), a picture painted as a background (no alt), an empty
// alt, or no page that prints it (`written-not-printed` owns that). With several printed copies, one alt that agrees is enough.
//
// A disagreeing alt blocks on its slot. It is the writer's (step 6) when the alt is words the write report says the writer wrote;
// otherwise the page prints an alt nobody in the run wrote (the template's or the demo's, left by the write step), step 9.
import { compareAlt } from '../lib/alt-compare.js'
import {
  attr,
  bodyOf,
  decoded,
  pictureKey,
  printedSlotsOf,
  slotsOnPages,
  wordsKey
} from '../lib/printed-in-body.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'

const PICTURES_VERSION = 'site-pictures/1'
const COPY_STEP = 6
const TAG = /<[a-z][a-z0-9-]*\b[^>]*>/gi
const PICTURE = /<picture\b[\s\S]*?<\/picture\s*>/gi

/** The files one tag names in `src` or `srcset`. */
const filesOf = (tag) =>
  [attr(tag, 'src'), ...String(attr(tag, 'srcset') ?? '').split(',')]
    .map((part) =>
      pictureKey(
        String(part ?? '')
          .trim()
          .split(/\s+/)[0]
      )
    )
    .filter(Boolean)

/**
 * The alts a page prints for one picture file: one per <img> of the body that names it, or that sits in a <picture> one of whose
 * <source> tags names it. An <img> with no alt attribute gives null.
 * @param {string} html the page as the site serves it
 * @param {string} file the picture's path, as the write report orders it
 * @returns {(string | null)[]}
 */
export function printedAlts(html, file) {
  const key = pictureKey(file)
  const out = []
  const altOf = (img) => {
    const alt = attr(img, 'alt')
    return alt === null ? null : decoded(alt)
  }
  const body = bodyOf(html).replace(PICTURE, (whole) => {
    const tags = [...whole.matchAll(TAG)].map((m) => m[0])
    const img = tags.find((t) => /^<img\b/i.test(t))
    if (img && tags.some((t) => filesOf(t).includes(key))) out.push(altOf(img))
    return ' '
  })
  for (const m of body.matchAll(TAG))
    if (/^<img\b/i.test(m[0]) && filesOf(m[0]).includes(key)) out.push(altOf(m[0]))
  return out
}

/** Step 8's seen sentence by frame: frames and template settings, only the non-empty ones. */
function seenByFrame(pictures) {
  const out = new Map()
  for (const list of ['frames', 'siteSettings'])
    for (const e of Array.isArray(pictures?.[list]) ? pictures[list] : [])
      if (typeof e?.frame === 'string' && typeof e.seen === 'string' && e.seen.trim())
        out.set(e.frame, e.seen.trim())
  return out
}

export const altMatchesPictureGroup = {
  name: 'alt-matches-picture',
  causingStep: COPY_STEP,
  /** @param {{ report: object, kit?: object | null, pictures?: object | null, pageHtml?: (path: string) => Promise<string | null> }} context */
  async run({ report, kit, pictures, pageHtml }) {
    if (typeof pageHtml !== 'function')
      throw new GroupUnmeasured('No page reader was given, so no alt could be read as a visitor reads it.')
    if (!kit) throw new GroupUnmeasured('No kit was given, so which page shows which picture is not known.')
    const written = printedSlotsOf(report?.slots, kit).filter((s) => s.kind === 'picture')
    if (!written.length)
      return {
        checked: 0,
        notApplicable: 'the write report holds no written picture of the content',
        notMeasured: [],
        failures: []
      }
    if (pictures?.version !== PICTURES_VERSION)
      throw new GroupUnmeasured(
        `No ${PICTURES_VERSION} manifest of step 8 was given, so what each picture shows is not known.`
      )
    const seen = seenByFrame(pictures)
    const onPages = slotsOnPages(kit, report?.keptPages)
    const html = new Map()
    const pageOf = async (path) => {
      if (!html.has(path)) html.set(path, await pageHtml(path).catch(() => null))
      return html.get(path)
    }
    const writerWords = new Set(
      (Array.isArray(report?.slots) ? report.slots : [])
        .filter((l) => l?.owner === 'writer' && l.status === 'written' && typeof l.ordered === 'string')
        .map((l) => wordsKey(l.ordered))
        .filter(Boolean)
    )
    const notMeasured = []
    const failures = []
    let checked = 0
    for (const s of written) {
      const said = seen.get(s.slot)
      if (!said) {
        notMeasured.push({
          slot: s.slot,
          reason:
            'step 8 left no description of this picture (not looked at: an icon, initials, a twin or a failed look)'
        })
        continue
      }
      const printed = []
      for (const [path, ids] of onPages) {
        if (!ids.includes(s.slot)) continue
        const page = await pageOf(path)
        if (typeof page === 'string')
          for (const alt of printedAlts(page, s.value)) printed.push({ path, alt })
      }
      const withAlt = printed.filter((p) => typeof p.alt === 'string' && p.alt.trim())
      if (!withAlt.length) {
        notMeasured.push({
          slot: s.slot,
          reason: printed.length
            ? 'the page prints the picture with no alt'
            : 'no page read prints the picture in an img (painted as a background, which has no alt, or not printed)'
        })
        continue
      }
      checked++
      const compared = withAlt.map((p) => ({ ...p, ...compareAlt(p.alt, said) }))
      if (compared.some((c) => c.agrees)) continue
      const [first] = compared
      const theWriters = writerWords.has(wordsKey(first.alt))
      failures.push({
        page: first.path,
        slot: s.slot,
        measured: first.alt,
        seen: said,
        shared: first.shared,
        causingStep: theWriters ? COPY_STEP : WRITE_STEP,
        reason: theWriters
          ? `The alt does not describe the picture placed: step 8's looker saw "${said}", and the alt shares ${first.shared.length ? `only ${first.shared.join(', ')}` : 'no main word'} with it. The writer rewrites this alt from the picture.`
          : `The alt printed is not words the writer wrote for this run, and it does not describe the picture placed (step 8's looker saw "${said}"): the write step left the template's or the demo's alt on this picture.`
      })
    }
    return {
      checked,
      ...(checked
        ? {}
        : { reason: 'no picture was compared: none had both a step 8 description and a printed alt' }),
      notMeasured,
      failures
    }
  }
}
