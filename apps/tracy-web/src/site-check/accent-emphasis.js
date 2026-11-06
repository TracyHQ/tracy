// The site check's `accent-emphasis` group (ADR 0044 decision 19, 2026-11-04): a heading whose demo draws some words in the accent
// colour (a `span` in the kit slot's `inline`, "((span))NO1((/span)) BOXING STUDIO") prints a span of its own in the brand accent.
// No span on the page blocks: the writer's, when the copy named no emphasis (the written value holds no span), else the write step's.
// A span in another colour is a warning on the template (step 0): it paints that span with a fixed colour, not the accent.
// A heading that prints content map codes as words (`WHAT WE((BR/))((SPAN))COACH`) blocks on the write step, on any page and
// whichever slot it is (card N, 2026-11-06): the site stored codes where it prints HTML. Every page the host read is judged, so a
// heading on a class page counts as one on the home page does.
import { colourOfComputed, isShade } from '../lib/brand-accent/accent-colours.js'
import { spanMarkOf } from '../lib/site-copy/inline-emphasis.js'
import { showsRawCodes, visibleText } from '../lib/site-copy/emphasis-markup.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { factsOf } from './brand-accent.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const each = (value) => (Array.isArray(value) ? value : [])
// Words as the page prints them: a line break is a space, every other code or tag leaves no trace, any case.
const squashed = (text) => visibleText(text).toLowerCase()
const RAW_REASON =
  'The page prints the content map emphasis codes as words: the site stores codes where the template prints HTML.'

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
  const printed = each(measures).flatMap((m) => each(m.headingSpans).map((h) => ({ m, h })))
  const failures = []
  // One verdict per heading and page: the same heading at 1440 and at 390 is one place a visitor sees.
  const judged = new Set()
  const once = (slot, page, text) => {
    const id = `${slot ?? ''}\u0000${page}\u0000${squashed(text)}`
    if (judged.has(id)) return false
    judged.add(id)
    return true
  }
  for (const line of lines) {
    const mark = marks.get(line.slot)
    if (!mark || typeof line.ordered !== 'string') continue
    const words = squashed(line.ordered)
    // A heading no page prints is no fault a visitor sees: its block is dropped or its page not kept.
    for (const { m, h } of printed.filter(({ h }) => squashed(h.text) === words)) {
      if (!once(line.slot, m.path, h.text)) continue
      const spans = each(h.spans)
      const where = { page: m.path, width: m.width, slot: line.slot, measured: h.text.slice(0, 120) }
      const named = /\(\(\s*span\b|<\s*span\b/i.test(`${line.ordered} ${line.stored ?? ''}`)
      if (showsRawCodes(h.text))
        failures.push({ ...where, level: 'block', causingStep: WRITE_STEP, reason: RAW_REASON })
      else if (!spans.length && line.textFallback === 'plain')
        failures.push({
          ...where,
          level: 'block',
          causingStep: WRITE_STEP,
          reason:
            'The plugin refused the heading with its emphasis and the write step wrote it plain, so it prints in one colour.'
        })
      else if (!spans.length)
        failures.push({
          ...where,
          level: 'block',
          causingStep: named ? WRITE_STEP : 6,
          reason: named
            ? 'The copy marks words for the accent colour, and the page prints the heading with no span.'
            : `The demo draws "${mark.text}" in the accent colour; the copy marks no words, so the heading prints in one colour.`
        })
      else if (facts && !spans.some((s) => isBrandAccent(s.color, facts)))
        failures.push({
          ...where,
          level: 'warn',
          causingStep: 0,
          measured: spans.map((s) => `${s.text}: ${s.color}`).join('; '),
          reason: `The heading's span is not painted in the brand accent ${facts.accent}: the template colours it with a fixed value.`
        })
    }
  }
  // Codes printed as words in a heading no written line names are the write step's all the same: no visitor reads them as words.
  for (const { m, h } of printed) {
    if (
      !showsRawCodes(h.text) ||
      [...judged].some((id) => id.endsWith(`\u0000${m.path}\u0000${squashed(h.text)}`))
    )
      continue
    if (!once(null, m.path, h.text)) continue
    failures.push({
      page: m.path,
      width: m.width,
      slot: null,
      measured: h.text.slice(0, 120),
      level: 'block',
      causingStep: WRITE_STEP,
      reason: RAW_REASON
    })
  }
  return { failures, checked: judged.size }
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
