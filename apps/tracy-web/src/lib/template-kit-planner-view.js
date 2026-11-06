// The template kit as the site planner reads it (ADR 0041, #301 cost cuts): the kit without the fields that only
// record how a value was measured or proved, and each page's and block's look as its text alone. read_kit_part
// answers this view; the checker reads the full kit.

/**
 * Kit fields the planner never reads (#301 cost cuts): how the kit measured or proved a value, never the value itself.
 * The approved prompt names none of them (a test greps it) and the checker reads the full kit, not this view. `in`
 * limits a field to the objects held under those keys; without it the field goes wherever it appears. On JA Boxing
 * they are about 39% of the block text a run reads. Kept on purpose: `source` and `reason` (the prompt names both),
 * `iconMechanism` and a link icon's `mechanism` (the prompt decides social icons by it), `labelId` (the checker's R10b).
 */
export const PLANNER_DROPPED_KIT_FIELDS = Object.freeze([
  { field: 'hideEvidence', why: 'the before and after measurements behind a frame canHide' },
  { field: 'kindEvidence', why: 'the measurements behind a frame kind' },
  { field: 'classReason', why: 'why a picture frame was classed as it is' },
  { field: 'minEvidence', why: 'the measurements behind a list min' },
  { field: 'maxEvidence', why: 'the measurements behind a list max' },
  { field: 'evidence', in: ['fixedText', 'fixedTexts'], why: 'the measurements behind a fixed text canHide' },
  { field: 'hiddenBy', in: ['fixedText', 'fixedTexts'], why: 'the CMS setting that hides a fixed text' },
  { field: 'measuredBy', in: ['fixedText', 'fixedTexts'], why: 'how a fixed text was measured' },
  { field: 'maxCharactersFrom', why: 'where maxCharacters came from; the number itself stays' },
  { field: 'formatFrom', why: 'where a slot format came from' },
  { field: 'shotOf', why: 'which page a block image was captured on' },
  { field: 'fullShotOf', why: 'which page a page image was captured on' },
  { field: 'classes', in: ['icon'], why: 'the CSS classes of a link icon' },
  { field: 'storedFields', why: 'every stored field and what it drives: for the kit gate and a person' }
])

const DROPPED = new Map(PLANNER_DROPPED_KIT_FIELDS.map((d) => [d.field, d.in ?? null]))

/**
 * A page's or block's look as the planner reads it: its text alone, or nothing when it has none. The planner plans
 * from the text (the approved prompt names `look`); the shot's id and sha256 only keep the look current for the
 * Road to live (lib/template-kit/reader.js looksMissingOf), and the image itself is opened by the ids under `images`.
 */
export function lookTextOf(look) {
  const text = typeof look?.text === 'string' ? look.text.trim() : ''
  return text === '' ? undefined : text
}

/**
 * A kit value as the planner reads it: every field of PLANNER_DROPPED_KIT_FIELDS left out, at any depth, and every
 * `look` given as its text.
 */
export function compactForPlanner(value, holder = '') {
  if (Array.isArray(value)) return value.map((v) => compactForPlanner(v, holder))
  if (value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, v] of Object.entries(value)) {
    if (DROPPED.has(key)) {
      const holders = DROPPED.get(key)
      if (!holders || holders.includes(holder)) continue
    }
    if (key === 'look') {
      const text = lookTextOf(v)
      if (text !== undefined) out.look = text
      continue
    }
    out[key] = compactForPlanner(v, key)
  }
  return out
}
