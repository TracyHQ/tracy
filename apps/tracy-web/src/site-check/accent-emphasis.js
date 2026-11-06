// The site check's `accent-emphasis` group (ADR 0044 decision 19, 2026-11-04): a heading whose demo draws some words in the accent
// colour (a `span` in the kit slot's `inline`, "((span))NO1((/span)) BOXING STUDIO") prints a span of its own in the brand accent.
// No span on the page blocks: the writer's, when the copy named no emphasis (the written value holds no span), else the write step's.
// A span in another colour is a warning on the template (step 0): it paints that span with a fixed colour, not the accent.
import { colourOfComputed, isShade } from '../lib/brand-accent/accent-colours.js'
import { spanMarkOf } from '../lib/site-copy/inline-emphasis.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { factsOf } from './brand-accent.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const each = (value) => (Array.isArray(value) ? value : [])
const squashed = (text) =>
  String(text ?? '')
    .replace(/\(\([^()]*\)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The kit's text slots whose demo marks words with a span, by id. */
function spanSlotsOf(kit) {
  const out = new Map()
  for (const b of each(kit?.blocks))
    for (const s of [
      ...each(b?.slots),
      ...each(b?.lists).flatMap((l) => [
        ...each(l?.rowSlots),
        ...each(l?.rows).flatMap((r) => each(r?.slots))
      ])
    ])
      if (typeof s?.id === 'string' && spanMarkOf(s) && !out.has(s.id)) out.set(s.id, spanMarkOf(s))
  return out
}

/** Whether a computed colour is the brand accent (or the accent's word colour) the style names. */
function isBrandAccent(color, facts) {
  const c = colourOfComputed(color)
  if (!c || !facts) return false
  return c.hex === facts.words || c.hex === facts.accent || isShade(c.hex, facts.accent)
}

/**
 * @param {object} kit
 * @param {object[]} lines the write report's written lines, `{ slot, ordered }`
 * @param {object[]} measures the host's page measures, with `headingSpans` and (at 1440) `brandStyle`
 * @returns {{ failures: object[], checked: number }}
 */
export function judgeAccentEmphasis(kit, lines, measures) {
  const marks = spanSlotsOf(kit)
  const facts = each(measures)
    .map((m) => factsOf(m.brandStyle?.head))
    .find(Boolean)
  const failures = []
  let checked = 0
  for (const line of lines) {
    const mark = marks.get(line.slot)
    if (!mark || typeof line.ordered !== 'string') continue
    const words = squashed(line.ordered)
    const at = each(measures)
      .flatMap((m) => each(m.headingSpans).map((h) => ({ m, h })))
      .find(({ h }) => squashed(h.text) === words)
    // A heading no page prints is no fault a visitor sees: its block is dropped or its page not kept.
    if (!at) continue
    checked++
    const { m, h } = at
    const spans = each(h.spans)
    const where = { page: m.path, width: m.width, slot: line.slot, measured: h.text.slice(0, 120) }
    if (!spans.length) {
      const named = /\(\(\s*span\b/i.test(line.ordered)
      failures.push({
        ...where,
        level: 'block',
        causingStep: named ? WRITE_STEP : 6,
        reason: named
          ? 'The copy marks words for the accent colour, and the page prints the heading with no span.'
          : `The demo draws "${mark.text}" in the accent colour; the copy marks no words, so the heading prints in one colour.`
      })
    } else if (facts && !spans.some((s) => isBrandAccent(s.color, facts)))
      failures.push({
        ...where,
        level: 'warn',
        causingStep: 0,
        measured: spans.map((s) => `${s.text}: ${s.color}`).join('; '),
        reason: `The heading's span is not painted in the brand accent ${facts.accent}: the template colours it with a fixed value.`
      })
  }
  return { failures, checked }
}

export const accentEmphasisGroup = {
  name: 'accent-emphasis',
  causingStep: 6,
  async run(context) {
    const { kit, report } = context
    if (!kit) throw new GroupUnmeasured('No kit was given, so which headings the demo marks is not known.')
    if (!spanSlotsOf(kit).size)
      return { checked: 0, notApplicable: 'the kit marks no heading with an accent span', failures: [] }
    const read = await pagesRead(context)
    if (!read.measures.some((m) => Array.isArray(m.headingSpans)))
      throw new GroupUnmeasured(
        'The host answered no heading spans (`headingSpans`), so this was not measured.'
      )
    const marks = spanSlotsOf(kit)
    const lines = each(report?.slots).filter(
      (s) => s.status === 'written' && typeof s.ordered === 'string' && marks.has(s.slot)
    )
    const { failures, checked } = judgeAccentEmphasis(kit, lines, read.measures)
    // Headings written and none found as printed: the read could not tell, which is not green (decision 18).
    if (lines.length && !checked)
      throw new GroupUnmeasured(
        `None of the ${lines.length} written headings the demo marks with an accent span was found printed, so nothing was measured.`
      )
    return {
      checked,
      ...(lines.length
        ? {}
        : { notApplicable: 'no written heading is one the demo marks with an accent span' }),
      failures
    }
  }
}
