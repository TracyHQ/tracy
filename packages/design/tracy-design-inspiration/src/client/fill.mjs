/**
 * Which of the customer's words go into which slot of an inspiration's fixture — the pure half of the
 * swap (spec §4f decisions 1 and 3). `slots` come from `slots.json` (built by
 * `scripts/build-od-slots.mjs`); `source` is what the agent read into `design-preview.json`; the
 * answer is a list of `{ id, text }` the DOM half applies. No DOM here, so `test/fill.test.mjs`
 * pins every rule.
 *
 * Two modes. `cut` puts the site's OWN words in, trimmed to the slot's length at a word boundary —
 * instant, no model. `copy` is a map of slot id → text an agent already wrote to fit (the
 * `design-copy/<id>.json` of §4f); where it has a key it wins, where it does not the cut rule applies.
 */

/**
 * Keep the site's words within 125% of the slot's own word count, cut at a word boundary.
 * @param {string} text
 * @param {number} slotWords
 */
export function cutTo(text, slotWords, floor = 1) {
  const w = text.trim().split(/\s+/).filter(Boolean)
  const max = Math.max(floor, Math.round(slotWords * 1.25))
  return w.length <= max ? w.join(' ') : `${w.slice(0, max).join(' ')}…`
}

/**
 * @typedef {{ id: string, role: string, words: number, text?: string, inNav?: boolean }} Slot
 * @typedef {{ path: string, type: string, label: string, data?: Record<string, unknown> }} Page
 * @typedef {{
 *   site: { name?: string|null, nav?: string[], eyebrow?: string|null, headline?: string|null, sub?: string|null, cta?: string|null, cta2?: string|null },
 *   pages?: Page[],
 *   page?: Page | null,
 *   copy?: Record<string, string> | null
 * }} Source
 */

/**
 * A queue of candidate texts per role; each slot takes the next one that is non-empty.
 * @param {Source} source
 * @returns {Record<string, unknown[]>}
 */
function queues(source) {
  const s = source.site
  const page = source.page ?? null
  const data = /** @type {Record<string, any>} */ (page?.data ?? {})
  const isHome = !page || page.type === 'home'
  // Only the words that have a place in a component board: the brand, the menu, the page's
  // eyebrow, headline and lead, the two calls to action. Everything else the fixture draws —
  // the metric figures, the panel and card titles, the labels, the quotes — is the author's demo
  // and stays. Measured 07/09 (Lee, on the Brutalism home chip): prices poured into the metric
  // tiles read "$29 · $299 · 3.2s" under "Signal quality · Active flows · Response time", and the
  // other pages' labels became the titles of component cards — a fixture is not a page of the
  // site, so the site's lists have no honest slot in it. The pages with such lists (listing,
  // pricing) are seeded from the section library, not from the fixture.
  return {
    brand: [s.name],
    headline: [isHome ? s.headline : (data.title ?? page?.label ?? s.headline)],
    eyebrow: [isHome ? s.eyebrow : page?.label],
    paragraph: [isHome ? s.sub : (data.lead ?? s.sub), ...(Array.isArray(data.body) ? data.body : [])],
    button: [s.cta, s.cta2],
    nav: [...(s.nav ?? [])],
    title: [],
    subtitle: [],
    number: [],
    label: [],
    quote: [],
    link: []
  }
}

/**
 * @param {Slot[]} slots
 * @param {Source} source
 * @returns {{ id: string, text: string, role: string }[]}
 */
export function planFill(slots, source) {
  const q = queues(source)
  const nav = [...q.nav]
  const out = []
  for (const slot of slots) {
    const written = source.copy?.[slot.id]
    if (typeof written === 'string' && written.trim() !== '') {
      out.push({ id: slot.id, text: written.trim(), role: slot.role })
      continue
    }
    // A button inside the nav is a menu entry, not a call to action.
    const role = slot.inNav && (slot.role === 'button' || slot.role === 'label') ? 'nav' : slot.role
    // A headline cut to three words says nothing; give the roles that carry meaning a floor.
    const floor = role === 'headline' ? 6 : role === 'paragraph' ? 12 : role === 'button' ? 4 : 1
    const queue = role === 'nav' ? nav : (q[role] ?? null)
    if (!queue) continue
    let next
    while (queue.length > 0 && (next === undefined || next === null || String(next).trim() === ''))
      next = queue.shift()
    if (next === undefined || next === null || String(next).trim() === '') continue
    out.push({ id: slot.id, text: cutTo(String(next), slot.words, floor), role })
  }
  return out
}

/**
 * "Your words" for one of the inspiration's SAMPLE PRODUCTS (landing, form, newsletter, …). The six
 * artifacts of an inspiration are one skeleton; what makes a Deck a deck is the author's text, so the cut
 * rule above (site headline into every headline) made every kind read the same (Lee, 06/09 16:36).
 * Here the author's words stay and only what belongs to the site changes: the brand slot, the buttons
 * (the site's calls to action), and the nav. The inspiration's own name inside the author's sentences
 * ("Bugatti Editorial issue") is swapped by `swapBrand` in fixture.ts, on the document itself — the
 * shared slot map carries the template system's words, not this inspiration's. `copy` still wins.
 *
 * @param {Slot[]} slots
 * @param {Source} source
 * @returns {{ id: string, text: string, role: string }[]}
 */
export function planBrandFill(slots, source) {
  const s = source.site
  const name = (s.name ?? '').trim()
  const nav = [...(s.nav ?? [])]
  const buttons = [s.cta, s.cta2].filter((t) => typeof t === 'string' && t.trim() !== '')
  const out = []
  for (const slot of slots) {
    const written = source.copy?.[slot.id]
    if (typeof written === 'string' && written.trim() !== '') {
      out.push({ id: slot.id, text: written.trim(), role: slot.role })
      continue
    }
    const role = slot.inNav && (slot.role === 'button' || slot.role === 'label') ? 'nav' : slot.role
    if (role === 'nav') {
      const next = nav.shift()
      if (next) out.push({ id: slot.id, text: cutTo(String(next), slot.words), role })
    } else if (role === 'brand' && name !== '') {
      out.push({ id: slot.id, text: name, role })
    } else if (role === 'button' && buttons.length > 0) {
      out.push({ id: slot.id, text: cutTo(String(buttons.shift()), slot.words, 4), role })
    }
  }
  return out
}
