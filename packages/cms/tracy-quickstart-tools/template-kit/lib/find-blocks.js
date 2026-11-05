// Runs INSIDE the page (Playwright `page.evaluate`): no imports, no closures over Node values.

/**
 * Freeze every sticky or fixed element where it rests at the top of the page, so the boxes read next
 * match the full-page image: a sticky header becomes part of the flow, a fixed bar (header, back-to-top
 * button, cookie note) is pinned where it sits in the first screen instead of repeating down the image.
 * Returns how many elements were frozen.
 */
export function freezeFloating() {
  const OFF = '.t4-offcanvas, .t4-off-canvas, .t3-off-canvas, [class*="off-canvas"], [class*="offcanvas"]'
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
 * The blocks of the page with their boxes in page coordinates, on a T4 or a T3 template.
 * - modules wrapped as `#Mod<N>`;
 * - ACM blocks that only carry `#acm-<name>-<N>` (a hero rendered without the module wrapper);
 * - a module assigned to the page that prints with no wrapper but an id of its own ending in `-<module id>` (a T3 ACM
 *   block `#block-slideshow-101`, a raw-chrome module `#mod-105`), from `assigned`: only the outermost such element,
 *   and only when it is the one element of the page whose id ends in that number;
 * - modules assigned to the page whose position renders with no wrapper (`.t4-<position>`, `.t3-<position>`);
 * - the template header (`#t4-header`, `#t3-header`) and the component area (`#t4-main-body`, `#t3-mainbody`, or
 *   `main` when it holds only the component and not the whole page).
 * A block inside the off-canvas menu, hidden, or without size is recorded with `visible: false`.
 * @param {{entity: string, position: string}[]} assigned
 */
export function findBlocks(assigned) {
  const OFF = '.t4-offcanvas, .t4-off-canvas, .t3-off-canvas, [class*="off-canvas"], .offcanvas'
  const HEADER = '#t4-header, .t4-header, #t3-header, .t3-header'
  const WRAPPED = '[id^="Mod"], [id^="acm-"]'
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
  // A module printed with no wrapper but its own id ending in `-<module id>`. The number alone proves nothing (an
  // article, a product or a menu entry can end in the same digits), so: an id of words then the number, a module
  // ASSIGNED to this page with that id, outside every block found so far, and no second element of its own elsewhere
  // (the outermost one counts; an inner `#block-slider-104` of `#block-slideshow-104` is the same block).
  // A T3 rule only: T3 prints module chrome as `#mod-<N>`, `#block-<style>-<N>`, `#uber-<layout>-<N>`. A T4 page
  // wraps every module in `#Mod<N>`, and its own layout ids (`#t4-section-1`) would match by accident. On T3 too,
  // template layout, grid and list ids (`t3-`, `t4-`, `col-`, `row-`, `item-`, `menu-item-`, `grid-`) are never
  // module chrome.
  const isT3 = !!document.querySelector('#t3-header, #t3-mainbody, .t3-wrapper, .t3-off-canvas')
  const LAYOUT_ID = /^(?:t3|t4|col|row|item|menu-item|grid)-/i
  const assignedIds = new Set(
    isT3 ? (assigned ?? []).map((a) => /^module-(\d+)$/.exec(a.entity ?? '')?.[1]).filter(Boolean) : []
  )
  const byId = new Map()
  for (const el of assignedIds.size ? document.querySelectorAll('[id]') : []) {
    const m = /^[a-z][a-z0-9_]*(?:-[a-z][a-z0-9_]*)*-(\d+)$/i.exec(el.id)
    if (!m || LAYOUT_ID.test(el.id) || !assignedIds.has(m[1]) || taken.has(`module-${m[1]}`)) continue
    // Outside every block found so far, and around none: a wrapper holding one only shares the digits.
    if (el.closest('[data-kit-block]') || el.querySelector('[data-kit-block]')) continue
    const list = byId.get(m[1]) ?? []
    if (!list.some((x) => x.contains(el))) list.push(el)
    byId.set(m[1], list)
  }
  for (const [id, list] of byId) if (list.length === 1) add(list[0], `module-${id}`, 'module-id')
  for (const a of assigned ?? []) {
    if (taken.has(a.entity) || !a.position) continue
    const p = CSS.escape(a.position)
    const el = document.querySelector(`.t4-${p}, #t4-${p}, .t3-${p}, #t3-${p}`)
    if (!el || el.querySelector(`${WRAPPED}, [data-kit-block]`)) continue
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
  const header = document.querySelector(HEADER)
  if (header) add(header, 'header', 'template-header')
  const body = document.querySelector('#t4-main-body, #t3-mainbody')
  const main = body ?? document.querySelector('main')
  if (main && (body || !main.querySelector(`${HEADER}, ${WRAPPED}`))) {
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
