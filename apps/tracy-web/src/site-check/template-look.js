// The template look: a written site against the same template untouched. A written site may change its words, its pictures and its
// accent family; the rest of the look is the template's. The host reads each element's computed look on each side of the switch, on
// the untouched site once per version (`demo-baseline.js`) and on the written site in every check. Pure, tested on invented reads.
//
// How a false red is kept out: an element is matched by its nearest block and the names of its last three levels, never by position,
// so more or fewer words or rows move nothing. Each property is compared with every value that element had on the untouched page, so
// a row that became the last one takes the last row's margin. An element gone is a hidden block; one no untouched page had is counted
// and not judged. Sizes and positions are not read at all, and a picture changing is not a change in the look.
import { onlyAccent, factsOf } from './brand-accent.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { each, lookEntries, sidesSaid, truncatedFailures } from './look-reads.js'
import { pathOfMeasure } from './page-faults.js'

export const NOT_COMPARED = [
  'sizes, positions and display, which follow the words and what is hidden',
  'side margins, since auto computes to a number that follows a box',
  'hover and focus states',
  'the phone width',
  'the insides of drawings (svg) and the pictures themselves',
  'elements no untouched page has, which are counted as unmatched'
]
const SHOWN = 8
/** Under this share of a page's elements matched, the page itself differs too much for a green to mean anything. */
const MATCHED_ENOUGH = 0.5

const valuesOf = (styles, key, n) => (styles.keys[key]?.[n] ?? []).map((i) => styles.table[i])
const offOf = (styles, key, n) => {
  const moved = styles.off?.[key]?.[n]
  return moved ? moved.map((i) => styles.table[i]) : valuesOf(styles, key, n)
}

/** A background picture coming or going is a picture changing, which is no change in the look. */
const onlyPicture = (a, b) => (a === 'none' && b === 'url()') || (a === 'url()' && b === 'none')

const fits = (prop, value, allowed, facts) =>
  allowed.some(
    (was) =>
      was === value ||
      (prop === 'background-image' && onlyPicture(was, value)) ||
      onlyAccent({ prop, with: value, without: was }, facts)
  )

/**
 * One side of one page against the untouched one.
 * @param {{ table: string[], keys: object, off?: object }} written
 * @param {{ table: string[], keys: object }[]} untouched the page itself, or for a created page every untouched page
 * @param {string[]} props
 * @param {object | null} facts what the brand style says of itself
 * @returns {{ changes: object[], matched: number, unmatched: number }}
 */
export function compareStyles(written, untouched, props, facts) {
  const changes = []
  let matched = 0
  let unmatched = 0
  for (const key of Object.keys(written.keys)) {
    const against = untouched.filter((u) => u.keys[key])
    if (!against.length) {
      unmatched++
      continue
    }
    matched++
    props.forEach((prop, n) => {
      const allowed = against.flatMap((u) => valuesOf(u, key, n))
      for (const value of valuesOf(written, key, n)) {
        if (fits(prop, value, allowed, facts)) continue
        // Off with the brand style and it fits: the style did it. Still off: something the write step put on the page did.
        const brand = offOf(written, key, n).every((v) => fits(prop, v, allowed, null))
        changes.push({ key, prop, was: allowed[0] ?? null, now: value, step: brand ? 2 : 9 })
      }
    })
  }
  return { changes, matched, unmatched }
}

const brief = (c) => `${c.key} ${c.prop}: ${c.was} -> ${c.now}`.slice(0, 240)

/** @returns {{ failures: object[], compared: number, unmatched: number }} */
export function judgeTemplateLook(entries, baseline) {
  const pages = Object.fromEntries(
    Object.entries(baseline.pages).map(([path, page]) => [pathOfMeasure(path), page])
  )
  const failures = []
  let compared = 0
  let unmatchedAll = 0
  for (const m of entries) {
    const facts = factsOf(m.look.head)
    const own = pages[pathOfMeasure(m.path)]
    for (const [side, read] of Object.entries(m.look.sides)) {
      const untouched = own
        ? each(own.sides[side]?.styles ? [own.sides[side].styles] : [])
        : Object.values(pages).flatMap((p) => (p.sides[side]?.styles ? [p.sides[side].styles] : []))
      if (!untouched.length) {
        failures.push({
          page: m.path,
          level: 'warn',
          reason: `The untouched site has no ${side} theme read, so this theme was not compared.`
        })
        continue
      }
      const { changes, matched, unmatched } = compareStyles(read.styles, untouched, baseline.props, facts)
      compared += matched
      unmatchedAll += unmatched
      for (const step of [2, 9]) {
        const mine = changes.filter((c) => c.step === step)
        if (!mine.length) continue
        failures.push({
          page: m.path,
          width: m.width,
          causingStep: step,
          measured: { count: mine.length, shown: mine.slice(0, SHOWN).map(brief) },
          reason:
            step === 2
              ? `In the ${side} theme the brand style changes the template's look beyond the accent family.`
              : `In the ${side} theme the page differs from the untouched template in more than words, pictures and the accent family.`
        })
      }
      if (matched + unmatched > 0 && matched / (matched + unmatched) < MATCHED_ENOUGH)
        failures.push({
          page: m.path,
          level: 'warn',
          measured: { matched, unmatched },
          reason: `In the ${side} theme most of this page has no match on the untouched site, so most of it was not compared.`
        })
    }
  }
  return { failures, compared, unmatched: unmatchedAll }
}

export const templateLookGroup = {
  name: 'template-look',
  causingStep: 9,
  async run(context) {
    const { entries } = await lookEntries(context, 'the template look')
    const look = context.baseline?.look
    if (!look?.pages)
      throw new GroupUnmeasured(
        `The baseline of ${context.report.contract ?? 'this quickstart'} holds no look: measure it again on an untouched site.`
      )
    const desktop = entries.filter((m) => m.look.props)
    if (!desktop.length) throw new GroupUnmeasured('The host read no element look at the desktop width.')
    const { themes, themeFailures } = sidesSaid(desktop)
    const { failures, compared, unmatched } = judgeTemplateLook(desktop, look)
    return {
      checked: compared,
      unmatched,
      themes,
      notCompared: NOT_COMPARED,
      failures: [...failures, ...themeFailures, ...truncatedFailures(desktop)]
    }
  }
}
