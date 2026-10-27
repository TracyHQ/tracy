/**
 * PREVIEW-PARITY's judgement of one page under one system (Akemi, 17/10/2026: the Design system popup must
 * show the template as Try on shows it, or a customer takes the difference for a bug): the popup's page
 * against the same page after Try on, both read by PARITY_PROBE (./probe.mjs). PURE.
 *
 * A finding is something a visitor sees differ, never timing: the page after Try on is the reference.
 * - icon:   an icon font that drew its glyphs after Try on and did not load in the popup (empty squares);
 * - font:   a web font the page's words were set in after Try on that did not load in the popup;
 * - box:    a large block seen after Try on that the popup hides, or draws a size apart (beyond BOX);
 * - slider: a carousel its script built after Try on that the popup shows unbuilt, with another number of
 *           slides, another slide width or another height (beyond SLIDER);
 * - page:   the whole page a share taller or shorter (beyond PAGE).
 * A block whose size follows from a block inside it that differs is not told twice: only the innermost.
 */

/** Tolerances: under them two sizes are the same block drawn by the same rules. */
export const PARITY_TOLERANCE = Object.freeze({
  /** box: a height apart by more than this many pixels and this share of its height */
  boxPx: 48,
  boxShare: 0.2,
  /** box: a width apart by more than this many pixels and this share of its width */
  boxWidthShare: 0.15,
  /** slider: the first slide's width apart by more than this share (and 24 px) */
  slideShare: 0.15,
  /** page: the document's height apart by more than this share */
  page: 0.15,
  /** font: a family counts once the page sets at least this many texts in it */
  fontWords: 3
})

/** A key as /ops shows it: its id and its last two levels (the full key only matches the two sides). */
export const shortAt = (/** @type {string} */ key) => {
  const parts = key.split(' > ')
  return parts.length <= 3
    ? key
    : `${parts[0].startsWith('#') ? `${parts[0]} … ` : '… '}${parts.slice(-2).join(' > ')}`
}

const apart = (
  /** @type {number} */ a,
  /** @type {number} */ b,
  /** @type {number} */ px,
  /** @type {number} */ share
) => Math.abs(a - b) > Math.max(px, share * Math.max(a, b))

/**
 * @param {any} popup PARITY_PROBE of the popup's page
 * @param {any} tryOn PARITY_PROBE of the same page after Try on
 * @param {typeof PARITY_TOLERANCE} [t]
 * @returns {{ count: number, findings: { kind: string, at: string, [k: string]: any }[] }}
 */
export function compareParity(popup, tryOn, t = PARITY_TOLERANCE) {
  /** @type {{ kind: string, at: string, [k: string]: any }[]} */
  const findings = []
  if (!popup || !tryOn) return { count: 0, findings }
  for (const [family, a] of Object.entries(tryOn.icons ?? {})) {
    const b = popup.icons?.[family]
    if (a.ok && b && !b.ok)
      findings.push({ kind: 'icon', at: shortAt(b.at ?? a.at), family, glyphs: b.glyphs })
  }
  for (const [family, a] of Object.entries(tryOn.fonts ?? {})) {
    if (!a.ok || a.words < t.fontWords) continue
    const b = popup.fonts?.[family]
    if (!b || !b.ok)
      findings.push({
        kind: 'font',
        at: shortAt(a.at),
        family,
        words: a.words,
        popup: b ? 'not loaded' : 'not used'
      })
  }
  /** @type {{ kind: string, at: string, [k: string]: any }[]} */
  const boxes = []
  for (const [at, a] of Object.entries(tryOn.boxes ?? {})) {
    if (!a.seen) continue
    const b = popup.boxes?.[at]
    if (!b || !b.seen) boxes.push({ kind: 'box', at, tryOn: [a.w, a.h], popup: b ? 'hidden' : 'missing' })
    else if (apart(a.h, b.h, t.boxPx, t.boxShare) || apart(a.w, b.w, t.boxPx, t.boxWidthShare))
      boxes.push({ kind: 'box', at, tryOn: [a.w, a.h], popup: [b.w, b.h] })
  }
  /** @type {{ kind: string, at: string, [k: string]: any }[]} */
  const sliders = []
  for (const [at, a] of Object.entries(tryOn.sliders ?? {})) {
    const b = popup.sliders?.[at]
    if (!b) {
      sliders.push({ kind: 'slider', at, tryOn: a, popup: 'missing' })
      continue
    }
    const why = [
      a.built !== b.built ? (b.built ? 'built' : 'not built by its script') : null,
      a.showing !== b.showing ? `${b.showing} slides showing, not ${a.showing}` : null,
      a.itemW && b.itemW && apart(a.itemW, b.itemW, 24, t.slideShare)
        ? `slide ${b.itemW}px wide, not ${a.itemW}px`
        : null,
      apart(a.h, b.h, t.boxPx, t.boxShare) ? `${b.h}px tall, not ${a.h}px` : null
    ].filter(Boolean)
    if (why.length) sliders.push({ kind: 'slider', at, why: why.join(', ') })
  }
  // the innermost: a block whose key is a prefix of another flagged block's or carousel's key only follows
  // from it (JA Essence's footer gallery module grew because its carousel was not built: one finding)
  const inner = [...boxes, ...sliders]
  findings.push(
    ...boxes
      .filter((x) => !inner.some((y) => y !== x && y.at.startsWith(`${x.at} > `)))
      .map((x) => ({ ...x, at: shortAt(x.at) })),
    ...sliders.map((x) => ({ ...x, at: shortAt(x.at) }))
  )
  if (tryOn.height && popup.height && Math.abs(tryOn.height - popup.height) > t.page * tryOn.height)
    findings.push({ kind: 'page', at: 'page', tryOn: tryOn.height, popup: popup.height })
  return { count: findings.length, findings }
}
