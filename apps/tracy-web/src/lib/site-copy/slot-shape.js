// Shared: the site writer's input and the copy check read it, so it lives in lib/ (module-graph.test.mjs).
// How long a text slot's demo is, and in what shape (ADR 0042, 2026-11-04): the writer is given these numbers and W03 and W15
// judge against the same ones. Pure, no input is modified.
//
// A kit text slot carries `demoChars: { total, lead, bullets }`, measured by the kit tool on the uncut demo text. An older kit
// has none; then the numbers are read from the `sample` the way W03 always did: the whole sample less a closing ellipsis for
// the total, the lines before the first "- " line for the lead and each "- " line for a point.
import { stripEllipsis } from './text-tools.js'

/** A text whose demo is at most this long is a short heading: no floor, no ceiling from the demo. */
export const SHORT_DEMO_MAX = 40
/** The share of the demo a written text must reach (part by part). */
export const DEMO_FLOOR_RATIO = 0.8
/** The top is the demo itself; this many characters over it are rounding, not a longer text. */
export const DEMO_CEILING_TOLERANCE = 3

const BULLET = /^\s*-\s+/
const isCount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** The kit's own demoChars when it is well formed, else null. */
function kitDemoChars(slot) {
  const d = slot?.demoChars
  if (!d || typeof d !== 'object' || !isCount(d.total)) return null
  return {
    total: d.total,
    lead: isCount(d.lead) && d.lead > 0 ? d.lead : null,
    bullets: Array.isArray(d.bullets) ? d.bullets.filter(isCount) : [],
    from: 'kit'
  }
}

/** The demo lengths read from the sample, for a kit without demoChars. */
function sampleDemoChars(slot) {
  const sample = typeof slot?.sample === 'string' ? slot.sample : ''
  const lines = sample.split('\n')
  const firstBullet = lines.findIndex((l) => BULLET.test(l))
  const leadLines = firstBullet === -1 ? lines : lines.slice(0, firstBullet)
  const bulletLines = firstBullet === -1 ? [] : lines.slice(firstBullet).filter((l) => BULLET.test(l))
  const lead = stripEllipsis(leadLines.join(' ').trim()).trim().length
  return {
    total: stripEllipsis(sample).length,
    lead: bulletLines.length && lead > 0 ? lead : null,
    bullets: bulletLines.map((l) => stripEllipsis(l.replace(BULLET, '').trim()).length),
    from: 'sample'
  }
}

/** The demo lengths of a kit text slot: the kit's when it has them, else measured on the sample. */
export function demoCharsOf(slot) {
  return kitDemoChars(slot) ?? sampleDemoChars(slot)
}

/**
 * The shape the writer writes a slot in: a lead paragraph and short points when the demo shows a paragraph followed by bullets,
 * points alone when it shows bullets only, and one text otherwise (`points: 0`).
 * @returns {{ lead: boolean, points: number, leadChars: number | null, pointChars: { min: number, max: number } | null }}
 */
export function slotShape(slot) {
  const demo = demoCharsOf(slot)
  const bullets = Number(slot?.bullets) > 0 ? Number(slot.bullets) : 0
  const measured = demo.bullets.filter((n) => n > 0)
  const points = bullets ? Math.max(bullets, measured.length) : 0
  const lead = points > 0 && demo.lead !== null
  return {
    lead,
    points,
    leadChars: lead ? demo.lead : null,
    pointChars: points && measured.length ? { min: Math.min(...measured), max: Math.max(...measured) } : null
  }
}

const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length

/**
 * The length bounds of a part of the demo: 80% of it to the demo itself (plus the rounding tolerance), none for a demo of at
 * most `shortMax` characters (a short heading; a point of a long slot passes 0).
 * @param {number | null} demo
 * @returns {{ floor: number, ceiling: number } | null}
 */
export function boundsOf(demo, shortMax = SHORT_DEMO_MAX) {
  if (!isCount(demo) || demo <= 0 || demo <= shortMax) return null
  return { floor: Math.ceil(demo * DEMO_FLOOR_RATIO), ceiling: demo + DEMO_CEILING_TOLERANCE }
}

/**
 * The demo length a written text is compared with. A text written with fewer points than the demo shows (the plan gives fewer)
 * is compared with the demo's lead plus that many average demo points, so a shorter list is never pushed into longer sentences.
 * @param {object} slot the kit slot
 * @param {number} written how many items the writer wrote
 */
export function demoTotalFor(slot, written) {
  const demo = demoCharsOf(slot)
  const shape = slotShape(slot)
  const points = demo.bullets.filter((n) => n > 0)
  if (!shape.points || !points.length) return demo.total
  const wrotePoints = Math.max(0, written - (shape.lead ? 1 : 0))
  if (wrotePoints >= points.length || wrotePoints === 0) return demo.total
  const lead = shape.lead ? shape.leadChars : 0
  // One space between items, as W03 joins them.
  return Math.round(lead + mean(points) * wrotePoints + (written - 1))
}

/** The average length of the demo's points, or null when it shows none. */
export function demoPointMean(slot) {
  const points = demoCharsOf(slot).bullets.filter((n) => n > 0)
  return points.length ? mean(points) : null
}
