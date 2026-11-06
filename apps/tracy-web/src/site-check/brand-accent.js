// The site check's guard on the brand style (#378): with the style and without it, on every kept page and both sides of the
// template's switch, computed styles may differ only in the accent family, and the template's accent must be gone. The host
// measures (`demo-qa-brand-style.js`); the judging is here and is pure. A style that does not say which accent it replaces
// (a whole design-system style) has no family, so everything it changes blocks.
import { colourOfComputed, COMPUTED_COLOUR, isAccent, isShade } from '../lib/brand-accent/accent-colours.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const ALPHA_SLACK = 0.02
const SHOWN = 8

/** What the style says about itself, or null. */
export function factsOf(head) {
  const line =
    /accent-only: replaces=(#[0-9a-f]{6}) accent=(#[0-9a-f]{6}) .*?family=([#0-9a-f,]+)(?: words=(#[0-9a-f]{6}))?/i.exec(
      String(head ?? '')
    )
  if (!line) return null
  return { replaces: line[1], accent: line[2], family: line[3].split(','), words: line[4] ?? null }
}

const inFamily = (hex, family) => family.some((seed) => isAccent(hex, seed))

/** Whether one computed value moved only from the template's accent family to the brand's. */
export function onlyAccent({ prop, with: worn, without }, facts) {
  if (!facts) return false
  const shape = (value) => value.replace(COMPUTED_COLOUR, '#')
  if (shape(worn) !== shape(without)) return false
  const after = worn.match(COMPUTED_COLOUR) ?? []
  const before = without.match(COMPUTED_COLOUR) ?? []
  return after.every((text, i) => {
    if (text === before[i]) return true
    const was = colourOfComputed(before[i])
    const now = colourOfComputed(text)
    if (!was || !now) return false
    if (facts.words && prop === 'color' && now.hex === facts.words) return true
    return (
      inFamily(was.hex, facts.family) &&
      isShade(now.hex, facts.accent) &&
      Math.abs(was.alpha - now.alpha) <= ALPHA_SLACK
    )
  })
}

/**
 * @param {object} read the host's `brandStyle` of one page
 * @returns {{ changed: object[], left: object[], truncated: boolean }} per side: what moved outside the family, the template
 *   accent still painted
 */
export function judgeBrandStyle(read) {
  const facts = factsOf(read?.head)
  const changed = []
  const left = []
  let truncated = false
  for (const [side, measured] of Object.entries(read?.sides ?? {})) {
    if (measured.truncated) truncated = true
    for (const change of measured.changes ?? [])
      if (!onlyAccent(change, facts)) changed.push({ side, ...change })
    if (!facts) continue
    for (const painted of measured.colours ?? []) {
      const colour = colourOfComputed(painted.colour)
      if (colour && colour.alpha > 0 && inFamily(colour.hex, facts.family)) left.push({ side, ...painted })
    }
  }
  return { changed, left, truncated }
}

const brief = (c) => `${c.side}: ${c.sample} ${c.prop} ${c.without} -> ${c.with}`.slice(0, 240)
const briefLeft = (c) => `${c.side}: ${c.sample} ${c.prop} ${c.colour} (${c.count})`

export const brandAccentGroup = {
  name: 'brand-accent',
  causingStep: 2,
  async run(context) {
    const written = (context.report?.slots ?? []).some(
      (s) => s.part === 'brand-accent' && s.status === 'written'
    )
    const read = await pagesRead(context)
    const entries = read.measures.filter((m) => m.brandStyle)
    if (!entries.length) {
      if (!written) return { checked: 0, failures: [] }
      throw new GroupUnmeasured(
        'The host answered no brand style read (`brandStyle`), so this was not measured.'
      )
    }
    const failures = []
    for (const { path, width, brandStyle } of entries) {
      if (!brandStyle.worn) {
        if (written)
          failures.push({
            page: path,
            width,
            reason: 'The brand accent was written, but this page does not wear it.'
          })
        continue
      }
      const { changed, left, truncated } = judgeBrandStyle(brandStyle)
      if (changed.length)
        failures.push({
          page: path,
          width,
          measured: { count: changed.length, shown: changed.slice(0, SHOWN).map(brief) },
          reason: 'The brand style changes something other than the accent family.'
        })
      if (left.length)
        failures.push({
          page: path,
          width,
          measured: { count: left.length, shown: left.slice(0, SHOWN).map(briefLeft) },
          reason: "The template's accent is still painted with the brand style on."
        })
      if (truncated)
        failures.push({
          page: path,
          width,
          level: 'warn',
          reason:
            'This page has more to read than the brand style read could hold, so part of it was not judged.'
        })
    }
    return { checked: entries.length, failures }
  }
}
