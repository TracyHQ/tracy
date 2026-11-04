// The pieces the theme groups share: the host's look reads, and the ratio of two colours as WCAG counts it.
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'

const each = (value) => (Array.isArray(value) ? value : [])

/** The look reads of a check's pages, or unmeasured for a host from before them: silence is not green. */
export async function lookEntries(context, name) {
  const read = await pagesRead(context)
  const entries = read.measures.filter((m) => m.look?.sides)
  if (!entries.length)
    throw new GroupUnmeasured(`The host answered no look read (\`look\`), so ${name} was not measured.`)
  return { read, entries }
}

/** The sides read, and a warning for a page with a switch nothing here knows how to press. */
export function sidesSaid(entries) {
  const sides = [...new Set(entries.flatMap((m) => Object.keys(m.look.sides)))]
  const unknown = entries.find((m) => m.look.switchSeen)
  return {
    themes: sides,
    themeFailures: unknown
      ? [
          {
            page: unknown.path,
            level: 'warn',
            reason:
              'This page has a light and dark switch of a kind this read does not know, so only the side it opens on was measured.'
          }
        ]
      : []
  }
}

const channel = (v) => {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
export const ratioOfLuminances = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

/** The ratio of a colour, its alpha blended over the ground, against that ground. */
export function contrast(fg, bg) {
  const a = fg[3] ?? 1
  return ratioOfLuminances(luminance([0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))), luminance(bg))
}

/** WCAG's bar: 3 for large text (24 px, or 18.66 px bold), 4.5 for the rest. */
export const needed = (large) => (large ? 3 : 4.5)

/** A warning for each page and side whose read ran out of room: part of it was not judged. */
export function truncatedFailures(entries) {
  const failures = []
  for (const m of entries)
    for (const [side, read] of Object.entries(m.look.sides))
      if (read.truncated)
        failures.push({
          page: m.path,
          width: m.width,
          level: 'warn',
          reason: `This page has more to read in the ${side} theme than the look read could hold, so part of it was not judged.`
        })
  return failures
}

export { each }
