// Runs INSIDE the page (Playwright `page.evaluate`): no imports, no closures over Node values.

/**
 * Freeze every sticky or fixed element where it rests at the top of the page, so the boxes read next
 * match the full-page image: a sticky header becomes part of the flow, a fixed bar (header, back-to-top
 * button, cookie note) is pinned where it sits in the first screen instead of repeating down the image.
 * Returns how many elements were frozen.
 */
export function freezeFloating() {
  const OFF = '.t4-offcanvas, .t4-off-canvas, [class*="off-canvas"], [class*="offcanvas"]'
  let frozen = 0
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  const vw = window.innerWidth
  const vh = window.innerHeight
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest(OFF)) continue
    const r = el.getBoundingClientRect()
    if (cs.position === 'sticky') {
      el.style.setProperty('position', 'relative', 'important')
      el.style.setProperty('top', 'auto', 'important')
    } else if (r.height >= vh * 0.8) {
      continue // a full-screen decoration (lines, a backdrop) paints the same at every scroll position
    } else if (r.top <= 4 && r.width >= vw * 0.9) {
      // A fixed header: pinned where it rests in the first screen.
      el.style.setProperty('position', 'absolute', 'important')
      el.style.setProperty('top', `${Math.round(r.top + window.scrollY)}px`, 'important')
      el.style.setProperty('bottom', 'auto', 'important')
    } else {
      // A floating widget (back-to-top button, chat bubble, cookie note) belongs to no block.
      el.style.setProperty('visibility', 'hidden', 'important')
    }
    frozen++
  }
  return frozen
}

/**
 * The blocks of the page with their boxes in page coordinates.
 * - modules wrapped as `#Mod<N>`;
 * - ACM blocks that only carry `#acm-<name>-<N>` (a hero rendered without the module wrapper);
 * - modules assigned to the page whose position renders with no wrapper (`.t4-<position>`), from `assigned`;
 * - the template header (`#t4-header`) and the component area (`#t4-main-body`, or `main` when it holds
 *   only the component and not the whole page).
 * A block inside the off-canvas menu, hidden, or without size is recorded with `visible: false`.
 * @param {{entity: string, position: string}[]} assigned
 */
export function findBlocks(assigned) {
  const OFF = '.t4-offcanvas, .t4-off-canvas, [class*="off-canvas"], .offcanvas'
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return {
      left: Math.max(0, Math.round(r.left + window.scrollX)),
      top: Math.max(0, Math.round(r.top + window.scrollY)),
      width: Math.round(Math.min(r.width, document.documentElement.scrollWidth)),
      height: Math.round(r.height)
    }
  }
  const hidden = (el) => {
    for (let x = el; x && x !== document.body; x = x.parentElement) {
      const cs = getComputedStyle(x)
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true
    }
    return false
  }
  const out = []
  const taken = new Set()
  const add = (el, block, kind, extra = {}) => {
    const offCanvas = !!el.closest(OFF)
    const b = box(el)
    const visible = !offCanvas && !hidden(el) && b.width >= 4 && b.height >= 4
    out.push({ block, kind, visible, offCanvas, ...b, ...extra })
    // Tagged so later reads (details, row measurements) find the same element.
    el.setAttribute('data-kit-block', block)
    taken.add(block)
  }
  for (const el of document.querySelectorAll('[id^="Mod"]')) {
    const m = el.id.match(/^Mod(\d+)$/)
    if (m && !taken.has(`module-${m[1]}`)) add(el, `module-${m[1]}`, 'module')
  }
  for (const el of document.querySelectorAll('[id^="acm-"]')) {
    const m = el.id.match(/-(\d+)$/)
    if (!m || taken.has(`module-${m[1]}`)) continue
    if (el.parentElement?.closest('[id^="acm-"], [id^="Mod"]')) continue
    add(el, `module-${m[1]}`, 'acm')
  }
  for (const a of assigned ?? []) {
    if (taken.has(a.entity) || !a.position) continue
    const el = document.querySelector(`.t4-${CSS.escape(a.position)}, #t4-${CSS.escape(a.position)}`)
    if (!el || el.querySelector('[id^="Mod"], [id^="acm-"]')) continue
    // Two modules in one bare position cannot be told apart: name the position, not a guess.
    const same = (assigned ?? []).filter((x) => x.position === a.position && !taken.has(x.entity))
    if (same.length > 1) continue
    add(el, a.entity, 'position', { position: a.position })
  }
  // Blocks rendered inside another one (a tabs block renders each tab's block as \`.mod-<N>\`).
  for (const rec of out) {
    const el = document.querySelector(`[data-kit-block="${rec.block}"]`)
    const inner = new Set()
    for (const x of el?.querySelectorAll('[class*="mod-"]') ?? [])
      for (const c of x.classList) {
        const m = c.match(/^mod-(\d+)$/)
        if (m && `module-${m[1]}` !== rec.block) inner.add(`module-${m[1]}`)
      }
    if (inner.size) rec.contains = [...inner]
  }
  const header = document.querySelector('#t4-header, .t4-header')
  if (header) add(header, 'header', 'template-header')
  const body = document.querySelector('#t4-main-body')
  const main = body ?? document.querySelector('main')
  if (main && (body || !main.querySelector('#t4-header, [id^="Mod"], [id^="acm-"]'))) {
    add(main, 'main-body', 'component')
  } else {
    out.push({
      block: 'main-body',
      kind: 'component',
      visible: false,
      offCanvas: false,
      note: 'no component area'
    })
  }
  const docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
  return { blocks: out.sort((a, b) => (a.top ?? 0) - (b.top ?? 0)), docHeight }
}
