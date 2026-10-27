// The open-state axis of visual-qa (#50): every header control that owns a panel — a mega menu, a
// dropdown, a search box, the drawer behind a burger — is opened on the site and on the source with a
// real pointer, captured open (the panel's boxes, the words and icons in it with their computed
// styles, and a picture of it), and the two captures compared like a page.
//
// Why a capture of its own: a page is measured and shot at rest, and at rest a panel is closed. The
// hover scan skips what the page does not show at rest, and the mega walk (review/mega-hover.mjs) asks
// whether the pointer can travel into a panel, not what the panel looks like. On JA Vega a mega panel
// drawn as an 880 px card with 12 px headings and no icons, against the source's full-width band with
// 24 px headings and 40 px icons, passed every checkpoint.
//
// Bounds, all of them deliberate:
//   · header only — the page's own `header` or `[role=banner]`, not one inside main/article/aside/
//     footer/section. An accordion in the body or a footer disclosure is not a header menu.
//   · a trigger is a control the page SHOWS at rest whose panel it does NOT: `[aria-expanded]` or
//     `[aria-haspopup]` with the panel its `aria-controls` names (or the submenu beside it), a toggle
//     of the source framework's selector profile with the panel its own attribute names (js-offcanvas,
//     Bootstrap 4/5 offcanvas; T3's `button.off-canvas-toggle[data-nav]` and Bootstrap 3's
//     `[data-toggle="collapse"]` — lib/framework-selectors.mjs, #66), or a list item that owns a
//     nested list or panel (a hover submenu). Submenus inside an opened panel are not walked; neither
//     are combinations of open states.
//   · at most MENU_TRIGGER_CAP triggers a side; one capture per trigger, side and axis; a side's
//     captures share MENU_BUDGET_MS. What was left out is named, never counted clean.
//   · triggers pair by their WORDS (normalised), never by position: the source and the port write
//     their headers differently. A label on one side only, or said by two triggers on a side, is
//     named as such, not guessed. Two exceptions, both explicit (#56): the SOLE drawer toggle of each
//     side — known by its markup, not its words: an icon-only T4 burger says nothing — pairs with the
//     other side's, and a pair the contract declares (`design.menus.pairs`, a selector a side) pairs
//     what its selectors name.
// Opening is a real hover, then — when hover shows nothing and the trigger has a control that is not
// a link that leaves the page — a real click. Nothing forces CSS or aria-expanded: a panel that does
// not open for a person does not open here, and that is a finding (`menu-open-not-measured`) — unless
// the SOURCE is what does not open: a source page that answered, whose control was reached and
// pressed and showed nothing (a static error page that ships no script), is a measured fact of the
// source (`sourceStatic`, not a finding); visual-qa then owes another page where the source opens.
import { lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { PNG } from 'pngjs'
import { withPage } from '../lib/browser.mjs'
import { checkApplicability, noReferenceReason } from './applicability.mjs'
import { PROFILES } from '../lib/framework-selectors.mjs'

export const MENU_TRIGGER_CAP = 16
/** Time a panel is given to show after the hover, and again after the click. */
const MENU_OPEN_MS = 800
/** Time the open panel's boxes are given to hold still before they are read. */
const MENU_SETTLE_MS = 3000
/** Time a panel is given to close (Escape, pointer away, the toggle again) before the page is reloaded. */
const MENU_CLOSE_MS = 1500
/**
 * All captures of one side of one axis. Both sides together stay well inside the axis's own bound
 * (visual-qa AXIS_TIMEOUT_MS, 180 s, which the page's own measurement shares): a JA Vega header of two
 * mega panels took 5–10 s for both sides at one width.
 */
export const MENU_BUDGET_MS = 30000
/**
 * Words and icons read from one open panel. A panel holding more is not compared past them: the
 * rest is named `menu-open-not-measured`, never counted clean.
 */
const MENU_ITEM_CAP = 300
/** Findings kept per trigger; the rest are counted on the record (`truncated`). */
const MENU_FINDINGS_CAP = 40
export const MENU_KINDS = Object.freeze(['menu-open-layout', 'menu-open-parity', 'menu-open-unmatched', 'menu-open-not-measured'])

/** The words a trigger is paired by: typesetting folded, punctuation and arrows dropped, case ignored. */
export function menuKey(label) {
  return String(label ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}\s&'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The file a capture is written to: never built from the label as it is (quotes, slashes and
 * selector characters are ordinary in a label) — a readable ASCII part plus a hash of the key, so
 * two labels that fold to the same ASCII still get two files.
 */
export function menuShotName(pageId, variantId, key, side) {
  const ascii = key.normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'menu'
  const h = createHash('sha256').update(key).digest('hex').slice(0, 8)
  const safe = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, '_')
  return `shots/menus/${safe(pageId)}--${safe(variantId)}--${ascii}-${h}--${side}.png`
}

/**
 * Write a picture under `out` without following anything odd: `out` itself and every directory
 * between it and the destination are checked (and created) one at a time and refused when one is a
 * symlink or not a directory, so a linked run directory or `shots/` cannot carry the picture outside
 * the run; the destination is refused when it is a symlink or anything but a regular file (a FIFO, a
 * directory). The bytes go to a temporary file first and are renamed into place, so a write that
 * fails leaves no half picture for the index to list. A capture whose axis was given up (`signal`
 * aborted: the axis ran past its timeout and may be measured again under the same names) or whose
 * side ran past its `deadline` writes nothing; the function is synchronous, so neither can pass
 * between the check and the rename.
 */
export function writeShot(out, rel, buf, { signal = null, deadline = Infinity } = {}) {
  const file = path.join(out, rel)
  const inside = path.relative(out, file)
  if (path.isAbsolute(rel) || !inside || inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`${rel} is not a path inside the run's directory`)
  const refuse = (at, st, want) => {
    const name = path.relative(out, at) || out
    if (st.isSymbolicLink()) throw new Error(`${name} is a symlink; a capture is never written through one`)
    if (want === 'directory' ? !st.isDirectory() : !st.isFile()) throw new Error(`${name} exists and is not a regular ${want}`)
  }
  refuse(out, lstatSync(out), 'directory')
  let at = out
  for (const part of path.dirname(inside).split(path.sep).filter((x) => x && x !== '.')) {
    at = path.join(at, part)
    let st
    try {
      st = lstatSync(at)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
      mkdirSync(at)
      st = lstatSync(at)
    }
    refuse(at, st, 'directory')
  }
  try {
    refuse(file, lstatSync(file), 'file')
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  if (signal?.aborted) throw new Error('the capture was given up (its axis ran out of time); nothing is written')
  if (Date.now() >= deadline) throw new Error('the capture ran past the open-state budget of its side; nothing is written')
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    writeFileSync(tmp, buf, { flag: 'wx' })
    renameSync(tmp, file)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  return rel
}

// ─────────────────────────────────────────────── in-page functions (serialised into the browser)
/**
 * The header's triggers, tagged `data-vqa-menu*="<i>"` (trigger, the element hovered, the control
 * clicked, the panel). Returns the census: headers found, triggers (label, how it is opened, a
 * `problem` when its panel cannot be named or other controls open it too, `drawer` when it toggles an off-canvas panel, `declared`:
 * the indices of the contract's declared pairs whose selector names it, `kind`: what made it a
 * trigger), panels already open at rest and triggers past `cap`. Called with `cap`, or
 * `[cap, selectors, toggles]` — this side's selector of each declared pair (`declaredInvalid` lists
 * those the page does not accept as a selector) and the toggles of the selector profile
 * (lib/framework-selectors.mjs `menu.toggles`; absent: the T4 profile's, written out here because a
 * function sent into the page cannot reach that module — a test holds the two equal).
 */
export function inPageMenuTriggers(arg) {
  const [cap, selectors = [], toggleRules = null] = Array.isArray(arg) ? arg : [arg]
  const TOGGLES = toggleRules ?? [
    { selector: '[data-offcanvas-trigger]', refs: ['data-offcanvas-trigger'], form: 'bare-id', drawer: true },
    { selector: '[data-bs-toggle="offcanvas"], [data-toggle="offcanvas"]', refs: ['data-bs-target', 'data-target', 'href'], form: 'id', drawer: true }
  ]
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
  const box = (e) => e.getBoundingClientRect()
  const shown = (e) => {
    if (!e || !e.isConnected) return false
    const r = box(e)
    if (r.width < 2 || r.height < 2) return false
    if (r.right <= 0 || r.left >= innerWidth || r.bottom <= 0) return false
    if (getComputedStyle(e).visibility !== 'visible') return false
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false
      if (a !== e && cs.overflow !== 'visible') {
        const c = box(a)
        if (r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) return false
      }
    }
    return true
  }
  const panelShown = (p) => shown(p) || [...p.querySelectorAll('*')].some(shown)
  for (const a of ['data-vqa-menu', 'data-vqa-menu-hover', 'data-vqa-menu-toggle', 'data-vqa-menu-panel'])
    for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a)
  const outside = 'main, article, aside, footer, section, [role=main], [role=contentinfo]'
  let heads = [...document.querySelectorAll('header, [role=banner]')].filter((h) => !h.parentElement?.closest(outside))
  heads = heads.filter((h) => !heads.some((o) => o !== h && o.contains(h)))
  const PANEL_TAG = /^(UL|OL|DIV|SECTION|NAV|ASIDE|DIALOG|FORM)$/
  const panelsOf = (li, not) => [...li.children].filter((c) => c !== not && !c.contains(not) && PANEL_TAG.test(c.tagName))
  // The words a sighted reader sees: a clipped 1 px box (`.screen-reader-text`) is heard, not seen.
  const srOnly = (e) => {
    const r = box(e)
    const cs = getComputedStyle(e)
    return (r.width <= 1 && r.height <= 1) || (cs.position === 'absolute' && /rect\(0/.test(cs.clip)) || cs.clipPath === 'inset(50%)'
  }
  const seen = (e) => {
    let out = ''
    const walk = (n) => {
      for (const c of n.childNodes)
        if (c.nodeType === 3) out += ` ${c.textContent}`
        else if (c.nodeType === 1 && getComputedStyle(c).display !== 'none' && !srOnly(c)) walk(c)
    }
    if (e) walk(e)
    return norm(out)
  }
  // An item's label: the words its own label shows (the link beside a caret button), else the words the
  // control shows, else what it is called for a screen reader (aria-label, its hidden text, title).
  const labelOf = (item, panel, fallback) => {
    const own = item ? [...item.children].find((c) => c !== panel && !c.contains(panel) && !PANEL_TAG.test(c.tagName) && seen(c)) : null
    const text = seen(own) || seen(fallback) || norm(fallback?.getAttribute('aria-label')) || norm(fallback?.innerText) || norm(fallback?.getAttribute('title'))
    return { text, el: own ?? fallback }
  }
  // A control that is a link to another page is hovered, never clicked: the click would leave the page,
  // whatever role it claims (the T4 item is `<a href="/services/" role="button">`).
  // A drawer toggle (below) is a control whatever its tag: the T4 toggle is a bare `<span>`, and a
  // click is the only way it opens.
  const clickable = (e, drawer = false) => {
    if (!e) return false
    if (e.tagName === 'A') {
      const href = (e.getAttribute('href') ?? '').trim()
      return href === '' || href.startsWith('#') || /^javascript:/i.test(href)
    }
    return drawer || e.tagName === 'BUTTON' || e.getAttribute('role') === 'button'
  }
  // Some small controls expose no target attribute but do reveal their panel on click. Observe that
  // transition once during the census, then close it again before the real capture pass.
  const panelAfterClick = (t) => {
    if (!clickable(t) || t.tagName === 'A') return null
    if (t.tagName === 'BUTTON' && t.form && t.type === 'submit') return null
    const before = new Set([...document.querySelectorAll('*')].filter(shown))
    try {
      t.click()
      const newlyShown = [...document.querySelectorAll('*')].filter((e) => !before.has(e) && shown(e) && /^(UL|OL|DIV|SECTION|NAV|ASIDE|DIALOG|FORM|ARTICLE|MAIN|MENU|OUTPUT)$/.test(e.tagName))
      const roots = newlyShown.filter((e) => !newlyShown.some((other) => other !== e && other.contains(e)))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      if (roots.some(shown)) t.click()
      if (roots.length === 1) return { el: roots[0] }
      if (roots.length > 1) return { bad: `clicking it reveals ${roots.length} possible panels; which one it opens cannot be told` }
      return null
    } catch {
      return null
    }
  }
  // The toggles of the frameworks sources are built on, which name their panel by an attribute of
  // their own and may carry no aria at all (the selector profile's `menu.toggles`): js-offcanvas (T4
  // `span.t4-offcanvas-toggle[data-offcanvas-trigger="off-canvas-right-push"]`), Bootstrap 4/5
  // (`[data-bs-toggle="offcanvas"]`) and, for T3, its `button.off-canvas-toggle[data-nav]` and
  // Bootstrap 3's `[data-toggle="collapse"]`. A rule whose selector the page refuses is no rule.
  const rules = TOGGLES.filter((r) => {
    try {
      document.querySelector(r.selector)
      return true
    } catch {
      return false
    }
  })
  const ruleOf = (t) => rules.find((r) => t.matches(r.selector)) ?? null
  const offcanvasToggle = (t) => Boolean(ruleOf(t)?.drawer)
  const ID = /^#[^\s#.[\]>+~:,()'"]+$/
  const CLASS = /^\.-?[_a-zA-Z][_a-zA-Z0-9-]*$/
  // The panel a control names: aria-controls, and its toggle rule's attribute, in the rule's form —
  // `bare-id` (the id itself), `id` (`#id`), `id-or-class` (`#id`, or `.class` naming EXACTLY one
  // element: a class two elements carry cannot say which one opens). `{ el, id, via }`, `{ bad }`
  // for a reference that names no single panel, or null when it names none. An `href` is read on a
  // link only.
  // 🔒 ONE REFERENCE, ONE PANEL. aria-controls listing several ids, an id two elements carry, and an
  // aria-controls that names another element than the toggle's own attribute cannot say which panel
  // the control opens: each is `{ bad }`, never the first match.
  const short = (v) => String(v).slice(0, 60)
  const byId = (id, via) => {
    const all = document.querySelectorAll(`[id="${CSS.escape(id)}"]`)
    if (all.length > 1) return { bad: `its ${via} names #${short(id)}, which ${all.length} elements carry; which one it opens cannot be told` }
    if (!all.length) return { bad: `its ${via} names #${short(id)}, which is not in the page` }
    return { el: all[0], id, via }
  }
  const ruleRefOf = (t) => {
    const rule = ruleOf(t)
    if (!rule) return null
    for (const a of rule.refs) {
      if (a === 'href' && t.tagName !== 'A') continue
      const v = (t.getAttribute(a) ?? '').trim()
      if (!v) continue
      if (rule.form === 'bare-id') return byId(v, a)
      if (ID.test(v)) return byId(v.slice(1), a)
      if (rule.form === 'id-or-class' && CLASS.test(v)) {
        const all = document.getElementsByClassName(v.slice(1))
        if (all.length === 1) return { el: all[0], id: all[0].id || v, via: a }
        return { bad: all.length ? `its ${a} "${short(v)}" names ${all.length} elements; which one it opens cannot be told` : `its ${a} "${short(v)}" names no element in the page` }
      }
      return { bad: `its ${a} "${short(v)}" names no panel by id${rule.form === 'id-or-class' ? ' or single class' : ''}` }
    }
    return null
  }
  const refOf = (t) => {
    const ids = (t.getAttribute('aria-controls') ?? '').trim().split(/\s+/).filter(Boolean)
    if (ids.length > 1) return { bad: `its aria-controls names ${ids.length} panels (${short(ids.join(' '))}); which one it opens cannot be told` }
    const aria = ids.length ? byId(ids[0], 'aria-controls') : null
    const own = ruleRefOf(t)
    if (aria?.bad) return aria
    if (aria && own && !own.bad && own.el !== aria.el) return { bad: `its aria-controls names #${short(ids[0])} and its ${own.via} another element; which one it opens cannot be told` }
    if (aria && own?.bad) return { bad: `its aria-controls names #${short(ids[0])}, but ${own.bad}` }
    if (aria || own) return aria ?? own
    // Hash links and data-target are common panel references outside the framework-specific toggle
    // profiles. They name the panel directly and must not be treated as a label or guessed by order.
    const target = (t.getAttribute('data-target') ?? '').trim()
    const href = t.tagName === 'A' ? (t.getAttribute('href') ?? '').trim() : ''
    for (const [value, via] of [[target, 'data-target'], [href, 'href']]) {
      if (!value) continue
      if (ID.test(value)) return byId(value.slice(1), via)
      if (via === 'data-target' && value.startsWith('#')) return { bad: `its data-target "${short(value)}" does not name one panel by id` }
    }
    return null
  }
  // 🔒 A DRAWER BY ITS MARKUP, NEVER BY ITS WORDS. An icon-only burger says nothing to pair it by, and
  // the two sides' burgers often say different things (T4's says nothing, core/navigation's "Open
  // menu"). A trigger is a drawer toggle when it names its panel (above), sits in no list item (a
  // submenu toggle does) and one of these says the panel is off-canvas: the control opens a dialog
  // (`aria-haspopup="dialog"`, core/navigation), the panel is one (`<dialog>`, `role=dialog`,
  // `aria-modal`), the control is an offcanvas toggle, or the panel is fixed to the viewport at rest.
  // Class names are not read: `drawer` or `offcanvas` in a class says nothing a browser acts on.
  const drawerOf = (t, panel, li) => {
    if (!panel || li || panel.contains(t)) return false
    if (t.getAttribute('aria-haspopup') === 'dialog' || offcanvasToggle(t)) return true
    if (panel.tagName === 'DIALOG' || panel.getAttribute('role') === 'dialog' || panel.getAttribute('aria-modal') === 'true') return true
    return getComputedStyle(panel).position === 'fixed'
  }
  const found = []
  const panels = new Set()
  // panel → the entry of the control that took it and the list item it sits in
  const owners = new Map()
  const items = new Set()
  for (const h of heads) {
    for (const t of h.querySelectorAll(['[aria-expanded]', '[aria-haspopup]:not([aria-haspopup="false"])', ...rules.map((r) => r.selector)].join(', '))) {
      if (!shown(t)) continue
      const li = t.closest('li') && h.contains(t.closest('li')) ? t.closest('li') : null
      let panel = null
      let problem = null
      const ref = refOf(t)
      if (ref?.bad) problem = ref.bad
      else if (ref) panel = ref.el
      else if (li) panel = panelsOf(li, t)[0] ?? null
      if (!panel && !problem && t.nextElementSibling && PANEL_TAG.test(t.nextElementSibling.tagName)) panel = t.nextElementSibling
      if (!panel && !problem) {
        const discovered = panelAfterClick(t)
        if (discovered?.bad) problem = discovered.bad
        else if (discovered) panel = discovered.el
      }
      if (!panel && !problem) problem = 'it names no panel (aria-controls) and owns no submenu beside it'
      if (panel && panels.has(panel)) {
        // 🔒 ONE PANEL, ONE OWNER. Two controls of one item (`li > a[aria-haspopup] + button`) are one
        // trigger. Two controls elsewhere that open the same panel cannot say which of them the other
        // header's trigger answers to: the panel's entry names the conflict and is never measured, and
        // its drawer toggle is never the side's sole drawer.
        const own = owners.get(panel)
        if (own?.entry && !panel.contains(t) && !(li && own.li === li)) {
          own.entry.controls += 1
          own.entry.problem = `${own.entry.controls} controls in the header open the same panel${panel.id ? ` #${String(panel.id).slice(0, 60)}` : ''}; which one owns it cannot be told`
        }
        continue
      }
      if (panel && (panel.contains(t) || panelShown(panel))) {
        found.push({ openAtRest: true })
        continue
      }
      if (li) items.add(li)
      if (panel) panels.add(panel)
      // The item is the element that holds the control and its panel side by side (a mega-menu block
      // `div > a + button + div`, a submenu `li > a + ul`), else the list item; a panel elsewhere (a
      // drawer) has none, and the control's own words label it.
      const holder = panel?.parentElement
      const item = holder && holder !== document.body && h.contains(holder) && holder.contains(t) ? holder : li
      const label = labelOf(item, panel, t)
      const entry = { trigger: t, hover: label.el && shown(label.el) ? label.el : t, toggle: t, panel, label: label.text, how: 'control', kind: ref?.via ?? (t.matches('[aria-expanded], [aria-haspopup]') ? 'aria' : 'toggle'), problem, drawer: Boolean(panel) && drawerOf(t, panel, li), controls: 1 }
      if (panel) owners.set(panel, { entry, li })
      found.push(entry)
    }
    for (const li of h.querySelectorAll('li')) {
      if (items.has(li)) continue
      const panel = panelsOf(li, null).find((c) => c.querySelector('a, button, [tabindex]'))
      if (!panel || panels.has(panel)) continue
      const label = labelOf(li, panel, null)
      if (!label.el || !shown(label.el)) continue
      if ([...panels].some((p) => p.contains(li))) continue
      if (panelShown(panel)) {
        found.push({ openAtRest: true })
        continue
      }
      items.add(li)
      panels.add(panel)
      owners.set(panel, { entry: null, li })
      const ctl = [...li.children].find((c) => c !== panel && (c.matches('[aria-expanded]') || c.tagName === 'BUTTON')) ?? null
      found.push({ trigger: label.el, hover: label.el, toggle: ctl, panel, label: label.text, how: 'hover', kind: 'submenu', problem: null })
    }
  }
  const real = found.filter((f) => !f.openAtRest)
  const taken = real.slice(0, cap)
  // The elements each declared selector names on this page; a selector the page refuses names none.
  const declaredInvalid = []
  const named = selectors.map((sel, n) => {
    try {
      return typeof sel === 'string' && sel.trim() ? new Set(document.querySelectorAll(sel)) : (declaredInvalid.push(n), new Set())
    } catch {
      declaredInvalid.push(n)
      return new Set()
    }
  })
  return {
    headers: heads.length,
    openAtRest: found.length - real.length,
    overCap: real.length - taken.length,
    ...(declaredInvalid.length ? { declaredInvalid } : {}),
    triggers: taken.map((f, i) => {
      f.trigger.setAttribute('data-vqa-menu', String(i))
      f.hover.setAttribute('data-vqa-menu-hover', String(i))
      if (f.toggle) f.toggle.setAttribute('data-vqa-menu-toggle', String(i))
      if (f.panel) f.panel.setAttribute('data-vqa-menu-panel', String(i))
      const declared = named.flatMap((set, n) => ([f.trigger, f.hover, f.toggle].some((e) => e && set.has(e)) ? [n] : []))
      const panel = f.panel ? {
        text: norm(f.panel.textContent),
        controls: [...f.panel.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]')].map((e) => ({
          tag: e.tagName.toLowerCase(),
          type: norm(e.getAttribute('type')).toLowerCase(),
          label: norm(e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || e.innerText || e.value || e.getAttribute('href'))
        }))
      } : null
      return { i, label: f.label, how: f.how, kind: f.kind, clickable: clickable(f.toggle, f.drawer), tag: f.trigger.tagName.toLowerCase(), problem: f.problem, region: 'chrome', ...(panel ? { panel } : {}), ...(f.drawer ? { drawer: true } : {}), ...(declared.length ? { declared } : {}) }
    })
  }
}

/**
 * The open panel `i` as it shows: whether it shows, its box (its own, or the union of what it shows
 * when it is a zero-size wrapper), its largest painted surface, the words and icons in it — boxes
 * relative to the panel, the words with `props` computed, at most `itemCap` (`more` counts the rest)
 * — how many of them the viewport cuts (`beyond`), and whether anything in it still animates.
 */
function inPageMenuPanel([i, props, textProps = props, itemCap = 300]) {
  const panel = document.querySelector(`[data-vqa-menu-panel="${i}"]`)
  if (!panel) return { shown: false, reason: 'the panel left the page' }
  const r1 = (v) => Math.round(v * 10) / 10
  const drawn = (e) => {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    if (getComputedStyle(e).visibility !== 'visible') return false
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false
    }
    return r.right > 0 && r.left < innerWidth && r.bottom > 0
  }
  const all = [panel, ...panel.querySelectorAll('*')]
  const vis = all.filter(drawn)
  if (!vis.length) return { shown: false, reason: 'nothing in the panel is drawn' }
  const rectOf = (e) => {
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  }
  let rect = drawn(panel) ? rectOf(panel) : null
  if (!rect) {
    const rs = vis.map(rectOf)
    const x = Math.min(...rs.map((r) => r.x))
    const y = Math.min(...rs.map((r) => r.y))
    rect = { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
  }
  const rel = (e) => {
    const r = rectOf(e)
    return { x: r1(r.x - rect.x), y: r1(r.y - rect.y), w: r1(r.w), h: r1(r.h) }
  }
  const painted = (cs) => {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(cs.backgroundColor)
    return (m && (m[4] === undefined || +m[4] > 0)) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none'
  }
  let surface = null
  for (const e of vis) {
    if (!painted(getComputedStyle(e))) continue
    const r = rectOf(e)
    if (!surface || r.w * r.h > surface.w * surface.h) surface = r
  }
  const ICON = /^(IMG|SVG|PICTURE|CANVAS|VIDEO)$/i
  // 🔒 THE WORDS' BOX, NOT THEIR ELEMENT'S. Two headers write the same panel with other wrappers: a
  // title in a `span` on one side is a block on the other, a card's `h4` holds the whole card on one
  // side and only its title on the other. Their element boxes differ while the words sit in the same
  // place (measured on JA Vega: 8 of 10 deltas of an open panel were such boxes). So a word's box is
  // the box of its own text, and the fill it is compared on is the nearest painted background at or
  // above it inside the panel — the same composition the page's parity uses.
  const wordsBox = (e) => {
    const rs = []
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue
      const rg = document.createRange()
      rg.selectNodeContents(n)
      const r = rg.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) rs.push(r)
    }
    if (!rs.length) return null
    const x = Math.min(...rs.map((r) => r.x))
    const y = Math.min(...rs.map((r) => r.y))
    return { x: r1(x - rect.x), y: r1(y - rect.y), w: r1(Math.max(...rs.map((r) => r.right)) - x), h: r1(Math.max(...rs.map((r) => r.bottom)) - y) }
  }
  const fillOf = (e) => {
    for (let a = e; a; a = a === panel ? null : a.parentElement) {
      const bg = getComputedStyle(a).backgroundColor
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(bg)
      if (m && (m[4] === undefined || +m[4] > 0)) return bg
    }
    return 'rgba(0, 0, 0, 0)'
  }
  // Words only a screen reader gets (a clipped 1 px box) or drawn at 0 px are no words on either side,
  // as in the page's parity.
  const srBox = (a) => {
    const r = a.getBoundingClientRect()
    const cs = getComputedStyle(a)
    return (r.width <= 1 && r.height <= 1) || (cs.position === 'absolute' && /rect\(0/.test(cs.clip)) || cs.clipPath === 'inset(50%)'
  }
  const unseen = (e) => {
    for (let a = e; a && a !== panel.parentElement; a = a.parentElement) if (srBox(a)) return true
    return parseFloat(getComputedStyle(e).fontSize) === 0
  }
  const seenWords = (el) => {
    let out = ''
    const walk = (n) => {
      for (const c of n.childNodes)
        if (c.nodeType === 3) out += ` ${c.textContent}`
        else if (c.nodeType === 1 && getComputedStyle(c).display !== 'none' && !srBox(c)) walk(c)
    }
    walk(el)
    return out.replace(/\s+/g, ' ').trim()
  }
  // The PLACE of some words: the element that holds them and every ancestor inside the panel that
  // shows the same words (`a > span`, `h3 > span`). Text properties are read on the deepest (it draws
  // the words); box properties on the deepest one that paints, else on the outermost — as the page's
  // parity composes a place (composeStyles).
  const transparentBg = (c) => /^rgba\(\d+, \d+, \d+, 0\)$|^transparent$/.test(c)
  const boxOf = (e) => {
    const words = seenWords(e)
    const chain = [e]
    for (let a = e.parentElement; a && a !== panel && panel.contains(a) && seenWords(a) === words; a = a.parentElement) chain.push(a)
    return chain.find((x) => !transparentBg(getComputedStyle(x).backgroundColor)) ?? chain[chain.length - 1]
  }
  const items = []
  let more = 0
  let beyond = 0
  for (const e of vis) {
    if (e === panel && !e.childElementCount && !e.textContent.trim()) continue
    if (unseen(e)) continue
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim()
    let item = null
    const words = own ? wordsBox(e) : null
    if (words) {
      const cs = getComputedStyle(e)
      const bs = getComputedStyle(boxOf(e))
      const styles = Object.fromEntries(props.map((p) => [p, p === 'background-color' ? fillOf(e) : (textProps.includes(p) ? cs : bs).getPropertyValue(p)]))
      item = { kind: 'text', tag: e.tagName.toLowerCase(), text: own.slice(0, 120), ...words, styles }
    } else if (ICON.test(e.tagName) || e.getAttribute('role') === 'img') {
      if (e.closest('svg') !== e && e.closest('svg')) continue
      item = { kind: 'icon', tag: e.tagName.toLowerCase(), ...rel(e) }
    }
    if (!item) continue
    // a word or icon the viewport cuts is not in the picture (items wholly off to a side are not
    // drawn at all, as an off-canvas level of a drawer is not)
    const ax = rect.x + item.x
    const ay = rect.y + item.y
    if (ax < -1 || ay < -1 || ax + item.w > innerWidth + 1 || ay + item.h > innerHeight + 1) beyond++
    if (items.length >= itemCap) more++
    else items.push(item)
  }
  const animating = panel.getAnimations({ subtree: true }).some((a) => (a.playState === 'running' || a.playState === 'pending') && a.effect?.getComputedTiming().endTime !== Infinity && (!a.timeline || a.timeline instanceof DocumentTimeline))
  return {
    shown: true,
    rect: { x: r1(rect.x), y: r1(rect.y), w: r1(rect.w), h: r1(rect.h) },
    surface: surface ? { x: r1(surface.x), y: r1(surface.y), w: r1(surface.w), h: r1(surface.h) } : null,
    items,
    more,
    beyond,
    animating,
    viewport: { w: innerWidth, h: innerHeight },
    scroll: { x: scrollX, y: scrollY }
  }
}

/**
 * Whether the pointer lands on trigger `i`'s hovered element (and, with `toggle`, on its clicked control): the
 * topmost element at the centre of each is the element itself or inside it. A control something else covers
 * is reached by `hover({ force })` and by a click that Playwright retargets, and does not react because a
 * person could not press it either — not a control that does not react.
 */
function inPageHit([i, toggle]) {
  const lands = (sel) => {
    const e = document.querySelector(sel)
    if (!e) return false
    const r = e.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return Boolean(top) && e.contains(top)
  }
  return lands(`[data-vqa-menu-hover="${i}"]`) && (!toggle || lands(`[data-vqa-menu-toggle="${i}"]`))
}

/** Whether panel `i` shows anything at all (the cheap poll of opening and closing). */
function inPageMenuShown(i) {
  const panel = document.querySelector(`[data-vqa-menu-panel="${i}"]`)
  if (!panel) return false
  const drawn = (e) => {
    const r = e.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility !== 'visible') return false
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.display === 'none' || parseFloat(cs.opacity) < 0.05) return false
    }
    return r.right > 0 && r.left < innerWidth && r.bottom > 0
  }
  return drawn(panel) || [...panel.querySelectorAll('*')].some(drawn)
}

// ─────────────────────────────────────────────── pairing and comparison (pure)
/**
 * The key of the drawer pair: the sole drawer toggle of each side (inPageMenuTriggers `drawer`).
 * menuKey drops parentheses, so no words fold to it, nor to a declared pair's key.
 */
export const DRAWER_KEY = '(off-canvas)'
/** The key of the `n`-th pair the contract declares (`design.menus.pairs`). */
export const declaredKey = (n) => `(declared ${n + 1})`
/**
 * What a declared pair is called in findings: its own `label` (at most 120 characters, as the contract
 * allows), else its two selectors, each cut at 60.
 */
const declaredLabel = (d, n) => {
  const cut = (v, max) => {
    const t = String(v ?? '').trim()
    return t.length > max ? `${t.slice(0, max - 1)}…` : t
  }
  return cut(d?.label, 120) || `declared pair ${n + 1}: ${cut(d?.source, 60)} ↔ ${cut(d?.site, 60)}`
}

/**
 * One side's triggers grouped by the key they pair by — ONE rule for the first census and for the
 * census taken again after a reload (captureSide), so a trigger keeps its identity across the reload.
 * A trigger a declared pair names (`declared` < `count`) is that pair's only; with `structural`, the
 * side's sole drawer toggle is the drawer pair's; every other trigger goes by its words. Returns
 * `{ groups: key → triggers, drawers }` (the drawer toggles no declaration took).
 */
export function menuGroups(census, { declared = 0, structural = false } = {}) {
  const groups = new Map()
  const push = (k, t) => {
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(t)
  }
  const rest = []
  for (const t of census?.triggers ?? []) {
    const ns = [...new Set(t.declared ?? [])].filter((n) => Number.isInteger(n) && n >= 0 && n < declared)
    // a trigger two declared pairs name belongs to neither: each pair names the overlap, none is measured
    const mine = ns.length > 1 ? { ...t, problem: `declared pairs ${ns.map((n) => n + 1).join(', ')} name the same trigger; a trigger belongs to one pair` } : t
    for (const n of ns) push(declaredKey(n), mine)
    if (!ns.length) rest.push(t)
  }
  // a drawer toggle with a problem (its panel opened by other controls too) still counts: it is never
  // taken for the side's sole drawer while another stands beside it, and the pair it would make is
  // named, not measured
  const drawers = rest.filter((t) => t.drawer)
  const sole = structural && drawers.length === 1 ? drawers[0] : null
  if (sole) push(DRAWER_KEY, sole)
  for (const t of rest) if (t !== sole) push(menuKey(t.label), t)
  return { groups, drawers }
}

const panelPairKey = (trigger) => {
  if (!trigger?.panel || trigger.problem) return null
  const text = menuKey(trigger.panel.text)
  const controls = (trigger.panel.controls ?? []).map((c) => [c.tag, c.type, menuKey(c.label)])
  if (!text && !controls.length) return null
  const panel = { text, controls }
  return `panel:${createHash('sha256').update(JSON.stringify(panel)).digest('hex').slice(0, 16)}`
}

/**
 * Pair the triggers of the two sides. Every key has exactly one outcome: `matched` (one trigger a
 * side, both with a panel), `unmatched` (on one side only), or `notMeasured` (said by more than one
 * trigger on a side, or a trigger whose ownership is in doubt). A trigger with a `problem` (a panel
 * that cannot be named, a panel other controls open too, a trigger two declared pairs name) is ALWAYS
 * not measured — checked before anything else, on every path, since an unmatched finding can be
 * accepted as an intentional omission and an ownership conflict never can. In this order:
 *   1. a pair the contract declares (`declared`: `[{ site, source, label? }]`, a selector a side) —
 *      the trigger each selector names, whatever it says;
 *   2. the drawer: when each header has exactly ONE drawer toggle left and their words do not
 *      already pair them, the two are the drawer pair (`DRAWER_KEY`) — its labels are kept, not used;
 *   3. words for labelled triggers;
 *   4. panel text and controls for an unlabeled source trigger with a unique site candidate.
 * Two drawers on a side are never told apart by position: they go by their words.
 */
export function pairMenus(site, source, { declared = [] } = {}) {
  const count = declared.length
  const first = { site: menuGroups(site, { declared: count }), source: menuGroups(source, { declared: count }) }
  const [ds, dr] = [first.site.drawers, first.source.drawers]
  const structural = ds.length === 1 && dr.length === 1 && !(menuKey(ds[0].label) && menuKey(ds[0].label) === menuKey(dr[0].label))
  const sides = structural ? { site: menuGroups(site, { declared: count, structural }).groups, source: menuGroups(source, { declared: count, structural }).groups } : { site: first.site.groups, source: first.source.groups }
  const out = { matched: [], unmatched: [], notMeasured: [] }
  const other = (side) => (side === 'site' ? 'source' : 'site')
  // the one gate every path passes first: each trigger of the key with a problem is named not measured
  const troubled = (key, label, s, r) => {
    const broken = [...s.map((t) => ['site', t]), ...r.map((t) => ['source', t])].filter(([, t]) => t.problem)
    for (const [side, t] of broken) out.notMeasured.push({ key, label, side, reason: t.problem })
    return broken.length > 0
  }
  declared.forEach((d, n) => {
    const key = declaredKey(n)
    const label = declaredLabel(d, n)
    const refused = ['site', 'source'].filter((side) => ((side === 'site' ? site : source)?.declaredInvalid ?? []).includes(n))
    if (refused.length) {
      for (const side of refused) out.notMeasured.push({ key, label, side, reason: `the declared ${side} selector ${JSON.stringify(String(d?.[side] ?? '')).slice(0, 160)} is not a selector the page accepts` })
      return
    }
    const s = sides.site.get(key) ?? []
    const r = sides.source.get(key) ?? []
    // neither header shows it at this width (a desktop menu at 390): nothing to pair, nothing lost
    if (!s.length && !r.length) return
    if (troubled(key, label, s, r)) return
    if (!s.length || !r.length) {
      const side = s.length ? 'site' : 'source'
      out.unmatched.push({ key, label, side, reason: `the ${other(side)} header shows no trigger the declared selector ${JSON.stringify(String(d?.[other(side)] ?? '')).slice(0, 160)} names` })
      return
    }
    const many = [['site', s], ['source', r]].filter(([, l]) => l.length > 1)
    if (many.length) {
      for (const [side, l] of many) out.notMeasured.push({ key, label, side, reason: `the declared ${side} selector names ${l.length} triggers; a pair is never picked by position` })
      return
    }
    out.matched.push({ key, label, by: 'declared', site: s[0], source: r[0] })
  })
  if (structural) {
    if (!troubled(DRAWER_KEY, DRAWER_KEY, [ds[0]], [dr[0]])) out.matched.push({ key: DRAWER_KEY, label: DRAWER_KEY, by: 'structure', site: ds[0], source: dr[0], labels: { site: ds[0].label, source: dr[0].label } })
  }
  // Resolve the existing labelled path before looking at panel identity. This claims a matching
  // site trigger so an anonymous source control cannot take it first.
  const claimedSite = new Set(out.matched.map((m) => m.site))
  const claimedSource = new Set(out.matched.map((m) => m.source))
  const blockedSite = new Set()
  const blockedSource = new Set()
  const pendingWords = []
  const wordKeys = [...new Set([...sides.source.keys(), ...sides.site.keys()])].filter((k) => k && !k.startsWith('(')).sort()
  for (const key of wordKeys) {
    const s = sides.site.get(key) ?? []
    const r = sides.source.get(key) ?? []
    if (!s.length && !r.length) continue
    const label = (r[0] ?? s[0]).label
    if (troubled(key, label, s, r)) {
      s.forEach((t) => blockedSite.add(t))
      r.forEach((t) => blockedSource.add(t))
      continue
    }
    if (!s.length || !r.length) {
      const side = s.length ? 'site' : 'source'
      pendingWords.push({
        key,
        label,
        side,
        triggers: side === 'site' ? s : r,
        reason: `the ${side === 'site' ? 'source' : 'site'} header has no trigger that says these words`
      })
      continue
    }
    const many = [['site', s], ['source', r]].filter(([, l]) => l.length > 1)
    if (many.length) {
      for (const [side, l] of many) {
        out.notMeasured.push({ key, label, side, reason: `${l.length} triggers on the ${side} header say these words; a pair is never picked by position` })
        l.forEach((t) => (side === 'site' ? blockedSite : blockedSource).add(t))
      }
      continue
    }
    claimedSite.add(s[0])
    claimedSource.add(r[0])
    out.matched.push({ key, label, by: 'words', site: s[0], source: r[0] })
  }
  // An icon-only source control has no words to compare. Its named panel is the identity instead:
  // match its normalized text and controls against remaining site candidates in the same region, and
  // only when exactly one candidate remains. Declared pairs, the drawer and labelled matches claim
  // their triggers first.
  const emptySources = sides.source.get('') ?? []
  const sourcePanelKeys = new Set()
  for (const t of emptySources) {
    if (claimedSource.has(t) || blockedSource.has(t) || t.problem || t.drawer) continue
    const key = panelPairKey(t)
    if (!key) continue
    sourcePanelKeys.add(t)
    const candidates = [...new Set([...sides.site.values()].flat())].filter((candidate) =>
      !claimedSite.has(candidate) && !blockedSite.has(candidate) && !candidate.problem && !candidate.drawer && !candidate.declared?.length &&
      candidate.region === t.region && panelPairKey(candidate) === key)
    if (candidates.length === 1) {
      const siteTrigger = candidates[0]
      claimedSite.add(siteTrigger)
      claimedSource.add(t)
      out.matched.push({ key, label: siteTrigger.label || t.panel?.text || '', by: 'panel', site: siteTrigger, source: t, labels: { site: siteTrigger.label, source: t.label } })
    } else {
      const descriptions = candidates.map((candidate) => candidate.label || `${candidate.tag} (unlabeled)`).join(', ')
      const reason = candidates.length
        ? `the source trigger's panel matches ${candidates.length} site candidates (${descriptions}); panel pairing is ambiguous`
        : 'no site candidate has the same panel text and controls in the chrome region'
      out.unmatched.push({ key, label: '', side: 'source', reason })
    }
  }
  // A trigger that says nothing (an icon-only burger) the steps above did not pair cannot be paired
  // by words: it is on its side only, like a label the other side lacks — named, and a cited decision
  // may accept it.
  for (const side of ['site', 'source'])
    for (const t of sides[side].get('') ?? []) {
      if (sourcePanelKeys.has(t) || claimedSite.has(t) || claimedSource.has(t)) continue
      if (troubled('', '', side === 'site' ? [t] : [], side === 'source' ? [t] : [])) continue
      const drawers = { site: ds.length, source: dr.length }
      const why = t.drawer ? `; a drawer toggle pairs by its markup only when each header has exactly one (the site has ${drawers.site}, the source ${drawers.source})` : ''
      const noPanelIdentity = t.panel && !menuKey(t.panel.text) && !(t.panel.controls ?? []).length
        ? '; its panel has no text or controls to identify it'
        : ''
      out.unmatched.push({ key: '', label: '', side, reason: `a ${t.tag} that opens a panel says no words to pair it by (visible text, aria-label or title)${noPanelIdentity}${why}` })
    }
  for (const pending of pendingWords) {
    if (pending.triggers.every((t) => claimedSite.has(t) || claimedSource.has(t))) continue
    out.unmatched.push({ key: pending.key, label: pending.label, side: pending.side, reason: pending.reason })
  }
  return out
}

const px = (v) => `${+Number(v).toFixed(1)}px`
const iconBox = (i) => `${Math.round(i.x)},${Math.round(i.y)} ${Math.round(i.w)}×${Math.round(i.h)}`

/**
 * Compare one trigger's panel, captured open on both sides. `diffProperty` is the page's own
 * two-sided comparison (visual-qa.mjs); `geometry` is the px tolerance of boxes. Returns findings in
 * the parity shape — `deltas: [{ property, expected (source), observed (site) }]` — so clustering and
 * run comparison read them like any other.
 */
export function compareMenuPanels(label, source, site, { props, diffProperty, hexTolerance = 8, pxTolerance = 1, geometry = 1 }) {
  const where = `header menu "${label}"`
  const findings = []
  const panel = []
  for (const k of ['x', 'y', 'w', 'h']) if (Math.abs(source.rect[k] - site.rect[k]) > geometry) panel.push({ property: `panel-${k}`, expected: px(source.rect[k]), observed: px(site.rect[k]) })
  if (Boolean(source.surface) !== Boolean(site.surface)) panel.push({ property: 'surface', expected: source.surface ? `${px(source.surface.w)} × ${px(source.surface.h)}` : 'none', observed: site.surface ? `${px(site.surface.w)} × ${px(site.surface.h)}` : 'none' })
  else if (source.surface) for (const k of ['x', 'y', 'w', 'h']) if (Math.abs(source.surface[k] - site.surface[k]) > geometry) panel.push({ property: `surface-${k}`, expected: px(source.surface[k]), observed: px(site.surface[k]) })
  if (panel.length) findings.push({ kind: 'menu-open-layout', element: `${where} › panel`, trigger: label, subject: { text: label }, properties: panel.map((d) => d.property), deltas: panel })
  // words: the n-th place that says them on the source against the n-th on the site
  const byText = (items) => {
    const m = new Map()
    for (const it of items.filter((x) => x.kind === 'text')) {
      const k = menuKey(it.text)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(it)
    }
    return m
  }
  const src = byText(source.items)
  const got = byText(site.items)
  for (const [k, list] of src) {
    const mine = got.get(k) ?? []
    list.forEach((a, n) => {
      const b = mine[n]
      const element = `${where} › ${a.tag} "${a.text.slice(0, 60)}"`
      if (!b) return findings.push({ kind: 'menu-open-parity', element, trigger: label, subject: { selector: a.tag, text: a.text }, properties: ['present'], deltas: [{ property: 'present', expected: 'yes', observed: 'no' }] })
      const deltas = []
      for (const g of ['x', 'y', 'w', 'h']) if (Math.abs(a[g] - b[g]) > geometry) deltas.push({ property: g, expected: px(a[g]), observed: px(b[g]) })
      for (const p of props) {
        const d = diffProperty(p, a.styles?.[p], b.styles?.[p], { hexTolerance, pxTolerance })
        if (d) deltas.push(d)
      }
      if (deltas.length) findings.push({ kind: 'menu-open-parity', element, trigger: label, subject: { selector: a.tag, text: a.text }, properties: deltas.map((d) => d.property), deltas })
    })
  }
  for (const [k, list] of got) {
    const theirs = src.get(k) ?? []
    for (const b of list.slice(theirs.length)) findings.push({ kind: 'menu-open-parity', element: `${where} › ${b.tag} "${b.text.slice(0, 60)}"`, trigger: label, subject: { selector: b.tag, text: b.text }, properties: ['present'], deltas: [{ property: 'present', expected: 'no', observed: 'yes' }] })
  }
  // icons: no words to pair by — compared as a count, and each source icon (in reading order) against
  // the nearest site icon not yet taken, by its whole box: an icon that moved is as much a change as
  // one that grew
  const icons = (items) => items.filter((x) => x.kind === 'icon' && Math.min(x.w, x.h) >= 8).sort((a, b) => a.y - b.y || a.x - b.x)
  const si = icons(source.items)
  const ti = icons(site.items)
  const idel = []
  if (si.length !== ti.length) idel.push({ property: 'icons', expected: String(si.length), observed: String(ti.length) })
  const pool = [...ti]
  const far = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h)
  const off = []
  for (const a of si) {
    if (!pool.length) break
    let n = 0
    for (let k = 1; k < pool.length; k++) if (far(a, pool[k]) < far(a, pool[n])) n = k
    const [b] = pool.splice(n, 1)
    if (['x', 'y', 'w', 'h'].some((g) => Math.abs(a[g] - b[g]) > geometry)) off.push([a, b])
  }
  if (off.length) idel.push({ property: 'icon-boxes', expected: off.map(([a]) => iconBox(a)).join(' '), observed: off.map(([, b]) => iconBox(b)).join(' ') })
  if (idel.length) findings.push({ kind: 'menu-open-parity', element: `${where} › icons`, trigger: label, subject: { selector: 'img, svg' }, properties: idel.map((d) => d.property), deltas: idel })
  const kept = findings.slice(0, MENU_FINDINGS_CAP)
  return { findings: kept, truncated: findings.length - kept.length }
}

/** Side of the square cells two pictures of a panel are compared in. */
const MENU_PICTURE_CELL = 8
/**
 * Mean channel difference (0–255) above which a cell of the two pictures differs. Words drawn in the
 * same place with the same styles by the same browser differ by less at their edges; a word or icon
 * drawn in another colour, or missing, fills its cells with far more.
 */
const MENU_PICTURE_LEVEL = 24

/**
 * Compare the two pictures of one open panel (`{ width, height, data }` RGBA, as pngjs decodes them),
 * cell by cell. The picture is what a person sees: a panel an ancestor clips, one drawn under another
 * surface, an icon in another colour or of another shape reads the same in boxes and styles and
 * differs here. Each cell is compared at the offsets within `geometry` px and keeps its best, so
 * words the boxes accept as in place are not a difference of pixels. Pictures whose sizes differ by
 * more than `geometry` are not compared: the panel's box already says so (`menu-open-layout`).
 * Returns null when the pictures agree, else a finding; the counts and the region are kept beside the
 * deltas, which stay what was expected and observed, so the identity of the finding does not move
 * from run to run with a pixel count.
 */
export function comparePanelPictures(label, source, site, { geometry = 1, cell = MENU_PICTURE_CELL, level = MENU_PICTURE_LEVEL } = {}) {
  if (Math.abs(source.width - site.width) > geometry || Math.abs(source.height - site.height) > geometry) return null
  const w = Math.min(source.width, site.width)
  const h = Math.min(source.height, site.height)
  const g = Math.max(0, Math.floor(geometry))
  const at = (img, x, y) => (y * img.width + x) * 4
  const cellDiff = (cx, cy, dx, dy) => {
    let sum = 0
    let n = 0
    for (let y = cy; y < Math.min(cy + cell, h); y++)
      for (let x = cx; x < Math.min(cx + cell, w); x++) {
        const sx = Math.min(w - 1, Math.max(0, x + dx))
        const sy = Math.min(h - 1, Math.max(0, y + dy))
        const i = at(source, sx, sy)
        const j = at(site, x, y)
        sum += Math.max(Math.abs(source.data[i] - site.data[j]), Math.abs(source.data[i + 1] - site.data[j + 1]), Math.abs(source.data[i + 2] - site.data[j + 2]))
        n++
      }
    return n ? sum / n : 0
  }
  let cells = 0
  let off = 0
  let box = null
  for (let cy = 0; cy < h; cy += cell)
    for (let cx = 0; cx < w; cx += cell) {
      cells++
      let best = cellDiff(cx, cy, 0, 0)
      for (let dy = -g; dy <= g && best > level; dy++) for (let dx = -g; dx <= g && best > level; dx++) best = Math.min(best, cellDiff(cx, cy, dx, dy))
      if (best <= level) continue
      off++
      const x1 = Math.min(cx + cell, w)
      const y1 = Math.min(cy + cell, h)
      box = box ? { x: Math.min(box.x, cx), y: Math.min(box.y, cy), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) } : { x: cx, y: cy, x1, y1 }
    }
  if (!off) return null
  return {
    kind: 'menu-open-parity',
    element: `header menu "${label}" › picture`,
    trigger: label,
    subject: { text: label },
    properties: ['picture'],
    deltas: [{ property: 'picture', expected: 'the source panel as drawn', observed: 'drawn otherwise' }],
    picture: { cell, level, cells, differing: off, region: { x: box.x, y: box.y, w: box.x1 - box.x, h: box.y1 - box.y } }
  }
}

// ─────────────────────────────────────────────── the browser part
/** Thrown by `bounded` when the side's deadline passes or its axis is given up. */
class Spent extends Error {}

/**
 * Run the page operation `op()` against `deadline` and `signal`: it is not started once either has
 * come, and when either comes while it is pending the caller gets `Spent` at once. The operation is
 * left behind — its page is closed with its context by withPage — and nothing it returns is used, so
 * no evaluate, pointer move, picture or page load can carry a capture past its budget.
 */
function bounded(op, deadline, signal) {
  if (signal?.aborted || Date.now() >= deadline) return Promise.reject(new Spent())
  const work = Promise.resolve().then(op)
  work.catch(() => {})
  let timer = null
  let onAbort = null
  const stop = new Promise((_, reject) => {
    if (Number.isFinite(deadline)) timer = setTimeout(() => reject(new Spent()), Math.min(2 ** 31 - 1, Math.max(0, deadline - Date.now())))
    onAbort = () => reject(new Spent())
    signal?.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([work, stop]).finally(() => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  })
}

const until = async (fn, ms, step = 50) => {
  const end = Date.now() + ms
  for (;;) {
    if (await fn()) return true
    if (Date.now() >= end) return false
    await new Promise((r) => setTimeout(r, step))
  }
}

/**
 * Whether open panel `i` holds still: every box in it the same, sample after sample every 16 ms, for
 * `holdMs` and at least `holdMs / 32` samples, with nothing in it animating — within `boundMs`. Many
 * samples, not two reads some time apart: a panel moved by script on a period reads the same twice
 * often enough to be caught mid-motion by the picture. Samples are timed by `setTimeout`, not by
 * animation frames: a page that is not painted gets few frames, and two frames 300 ms apart are two
 * reads again (measured: a panel moved every 40 ms passed as still in one run of three). A panel
 * that is replaced or removed while it is watched is not settled.
 */
export function inPageMenuHeld([i, holdMs, boundMs]) {
  const panel = document.querySelector(`[data-vqa-menu-panel="${i}"]`)
  if (!panel) return { settled: false, reason: 'the panel left the page' }
  const sig = () => {
    if (!panel.isConnected) return null
    return [panel, ...panel.querySelectorAll('*')]
      .slice(0, 400)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return `${r.x},${r.y},${r.width},${r.height}`
      })
      .join(';')
  }
  const moving = () => panel.getAnimations({ subtree: true }).some((a) => (a.playState === 'running' || a.playState === 'pending') && a.effect?.getComputedTiming().endTime !== Infinity && (!a.timeline || a.timeline instanceof DocumentTimeline))
  const need = Math.max(3, Math.ceil(holdMs / 32))
  return new Promise((resolve) => {
    const start = performance.now()
    let last = null
    let since = start
    let same = 0
    const sample = () => {
      const now = performance.now()
      const s = sig()
      if (s === null) return resolve({ settled: false, reason: 'the panel left the page while it was watched' })
      if (s !== last || moving()) {
        last = s
        since = now
        same = 0
      } else if (++same >= need && now - since >= holdMs) return resolve({ settled: true })
      if (now - start > boundMs) return resolve({ settled: false, reason: `the open panel did not hold still for ${holdMs} ms within ${boundMs} ms` })
      setTimeout(sample, 16)
    }
    sample()
  })
}

/** Time the open panel must hold still, frame after frame, before it is read. */
const MENU_HOLD_MS = 300

/** Wait for the open panel to hold still (inPageMenuHeld), then read it; `run` bounds each evaluate. */
async function settledPanel(run, p, i, props, textProps, ms, itemCap) {
  const held = await run(() => p.evaluate(inPageMenuHeld, [i, MENU_HOLD_MS, ms]))
  if (!held.settled) return held
  const now = await run(() => p.evaluate(inPageMenuPanel, [i, props, textProps, itemCap]))
  if (!now.shown) return { settled: false, reason: `the panel closed while it was read (${now.reason})` }
  return { settled: true, panel: now }
}

/**
 * How far past the viewport a panel's box may reach and still be pictured whole: a full-bleed band
 * drawn 1 px past the edge (measured on JA Vega: x -1, 1426 wide at 1440) holds nothing there.
 */
const MENU_CLIP_PX = 1

const GIVEN_UP = 'the capture was given up: its axis ran out of time'
const SPENT = 'the open-state budget for this side ran out during the capture'

/**
 * Open trigger `t` on page `p` for real, read the panel once it holds still, write its picture to
 * `rel`, and close it again. Returns the capture (`opened`, `via`, the panel, `screenshot` and its
 * bytes `png`, `clipped` when the viewport cuts the panel) or `{ opened: false, reason }`, plus
 * `closed`: how it was closed, `'none'` when nothing was opened, or null when the page must be
 * loaded again before the next trigger — the panel would not close, the page left for another URL,
 * a click opened nothing and may have changed something else, or the budget ran out on the way.
 * Every page operation is bounded by `deadline` (the side's budget) and `signal` (bounded): once
 * either has come nothing more is done, a picture is written only before it (writeShot checks), and
 * a capture is accepted only once its picture is written.
 */
export async function captureMenu(p, t, { out, rel, props, textProps = props, openMs = MENU_OPEN_MS, settleMs = MENU_SETTLE_MS, closeMs = MENU_CLOSE_MS, itemCap = MENU_ITEM_CAP, deadline = Infinity, signal = null }) {
  const left = () => deadline - Date.now()
  const spent = () => Boolean(signal?.aborted) || left() <= 0
  const cut = (ms) => Math.max(0, Math.min(ms, left()))
  const timeout = (ms) => Math.max(1, cut(ms))
  const why = () => (signal?.aborted ? GIVEN_UP : SPENT)
  const run = (op) => bounded(op, deadline, signal)
  if (spent()) return { opened: false, reason: why(), closed: 'none' }
  const home = p.url()
  const away = () => (p.url() !== home ? p.url() : null)
  const shownNow = () => run(() => p.evaluate(inPageMenuShown, t.i))
  let cap = null
  let via = null
  try {
    await run(() => p.evaluate(() => scrollTo(0, 0)))
    await run(() => p.mouse.move(0, 0))
    if (await shownNow()) return { opened: false, reason: 'the panel already showed before the trigger was touched', closed: null }
    let reached = true
    let clicked = false
    try {
      await run(() => p.locator(`[data-vqa-menu-hover="${t.i}"]`).first().hover({ timeout: timeout(2000), force: true }))
    } catch (e) {
      if (e instanceof Spent) throw e
      reached = false
    }
    if (away()) return { opened: false, reason: `hovering it left the page for ${away()}`, closed: null }
    if (reached && (await until(shownNow, cut(openMs)))) via = 'hover'
    else if (t.clickable && !spent()) {
      clicked = true
      try {
        await run(() => p.locator(`[data-vqa-menu-toggle="${t.i}"]`).first().click({ timeout: timeout(2000) }))
      } catch (e) {
        if (e instanceof Spent) throw e
        return { opened: false, reason: `its control could not be clicked: ${String(e.message).split('\n')[0].slice(0, 160)}`, closed: null }
      }
      if (away()) return { opened: false, reason: `a click of its control left the page for ${away()}`, closed: null }
      if (await until(shownNow, cut(openMs))) via = 'click'
    }
    if (!via) {
      if (spent()) return { opened: false, reason: why(), closed: clicked ? null : 'none' }
      const how = reached ? 'on hover' : 'the pointer could not reach it'
      const reason = `the panel did not show ${how}${t.clickable ? ' nor on a click of its control' : ' and it has no control to click that stays on the page'}`
      // 🔒 NONRESPONSIVE ONLY WHEN EVERY ATTEMPT RAN TO ITS END: the pointer reached the control, the
      // click (when there is one) landed, the page stayed, and the panel stayed shut for the whole wait.
      // A control the pointer could not reach, a timeout or a spent budget is a failure to measure.
      const nonresponsive = reached && !away() && (clicked || !t.clickable) && (await run(() => p.evaluate(inPageHit, [t.i, clicked])))
      return { opened: false, reason, closed: clicked || away() ? null : 'none', ...(nonresponsive ? { nonresponsive: true, outcome: { hover: 'no-effect', click: clicked ? 'no-effect' : 'none' } } : {}) }
    }
    cap = { opened: true, via }
    const s = left() < MENU_HOLD_MS ? { settled: false, reason: why() } : await settledPanel(run, p, t.i, props, textProps, cut(settleMs), itemCap)
    if (!s.settled) Object.assign(cap, { opened: false, reason: s.reason })
    else {
      const { rect, viewport } = s.panel
      const x0 = Math.max(0, Math.floor(rect.x))
      const y0 = Math.max(0, Math.floor(rect.y))
      const x1 = Math.min(viewport.w, Math.ceil(rect.x + rect.w))
      const y1 = Math.min(viewport.h, Math.ceil(rect.y + rect.h))
      cap.panel = s.panel
      if (x1 - x0 < 1 || y1 - y0 < 1) Object.assign(cap, { opened: false, reason: 'the open panel lies outside the viewport' })
      else {
        const past = Math.max(x0 - rect.x, y0 - rect.y, rect.x + rect.w - x1, rect.y + rect.h - y1)
        if (past > MENU_CLIP_PX || s.panel.beyond) cap.clipped = { px: Math.round(past * 10) / 10, items: s.panel.beyond }
        let buf = null
        try {
          buf = await run(() => p.screenshot({ clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, timeout: timeout(10000) }))
        } catch (e) {
          if (e instanceof Spent) throw e
          cap.screenshotError = String(e.message).split('\n')[0].slice(0, 200)
        }
        if (buf) {
          if (spent()) throw new Spent()
          try {
            cap.screenshot = writeShot(out, rel, buf, { signal, deadline })
            cap.png = buf
          } catch (e) {
            if (spent()) throw new Spent()
            cap.screenshotError = String(e.message).split('\n')[0].slice(0, 200)
          }
        }
      }
    }
  } catch (e) {
    if (!(e instanceof Spent)) throw e
    // what was not written before the deadline is no capture; the page is loaded again if time is left
    return { opened: false, reason: why(), ...(via ? { via } : {}), closed: null }
  }
  // close: Escape and the pointer away, then the control again for a panel a click opened. A capture
  // already written stands; a close the budget cuts short leaves the page to be loaded again.
  try {
    await run(() => p.keyboard.press('Escape')).catch((e) => {
      if (e instanceof Spent) throw e
    })
    await run(() => p.mouse.move(0, 0))
    const hidden = async () => !(await shownNow())
    if (await until(hidden, cut(closeMs))) cap.closed = 'escape'
    else if (via === 'click' && t.clickable && !spent()) {
      await run(() => p.locator(`[data-vqa-menu-toggle="${t.i}"]`).first().click({ timeout: timeout(2000) })).catch((e) => {
        if (e instanceof Spent) throw e
      })
      await run(() => p.mouse.move(0, 0))
      cap.closed = (await until(hidden, cut(closeMs))) ? 'toggle' : null
    } else cap.closed = null
  } catch (e) {
    if (!(e instanceof Spent)) throw e
    cap.closed = null
  }
  if (away()) cap.closed = null
  return cap
}

/**
 * Open and capture, on one loaded page, the triggers of `wanted` (key → trigger of the census).
 * A capture that leaves the page changed (a panel that will not close, another URL) has the page
 * loaded again (`reload`) before the next trigger, and the triggers found again by the key they
 * were paired by (menuGroups: `declared`, the number of declared pairs, and the drawer pair when
 * `wanted` holds it); a page that cannot be loaded again names what it left. The side shares one
 * budget, a deadline every page operation — the reload too — is bounded by; what is left when it
 * runs out, or when `signal` is aborted, is named. Returns key → capture.
 */
export async function captureSide(p, wanted, { reload, out, relOf, props, textProps = props, budgetMs = MENU_BUDGET_MS, itemCap = MENU_ITEM_CAP, declared = 0, signal = null, timing = {} }) {
  const deadline = Date.now() + budgetMs
  const caps = new Map()
  let current = new Map(wanted)
  let lost = null
  // 🔒 THE PAGE CAPTURED IS THE PAGE IN FRONT. The site page waits while the source is captured in
  // another page, and Chromium then slows that page's timers although it still reads `visible`: a
  // panel that a script keeps moving read as still, and was captured mid-motion (measured on this
  // module's fixture). visual-qa launches Chromium with background throttling off (RUN_LAUNCH_ARGS),
  // which also covers axes running side by side; a browser handed in by a caller may not be.
  await bounded(() => p.bringToFront(), deadline, signal).catch(() => {})
  const keys = [...wanted.keys()]
  for (const [n, key] of keys.entries()) {
    if (signal?.aborted) {
      caps.set(key, { opened: false, reason: GIVEN_UP })
      continue
    }
    if (Date.now() >= deadline) {
      caps.set(key, { opened: false, reason: `the open-state budget of ${budgetMs} ms for this side ran out first` })
      continue
    }
    if (lost) {
      caps.set(key, { opened: false, reason: lost })
      continue
    }
    const t = current.get(key)
    if (!t) {
      const said = key === DRAWER_KEY ? 'the header had no single drawer toggle' : key.startsWith('(declared ') ? 'no single trigger answered to the declared selector' : 'no single trigger said these words'
      caps.set(key, { opened: false, reason: `after the page was loaded again ${said}` })
      continue
    }
    let cap
    try {
      cap = await captureMenu(p, t, { out, rel: relOf(key), props, textProps, itemCap, deadline, signal, ...timing })
    } catch (e) {
      cap = { opened: false, reason: `the capture failed: ${String(e.message).split('\n')[0].slice(0, 200)}`, closed: null }
    }
    caps.set(key, cap)
    if (cap.closed !== null || n === keys.length - 1 || signal?.aborted || Date.now() >= deadline) continue
    try {
      const census = await bounded(reload, deadline, signal)
      const again = menuGroups(census, { declared, structural: wanted.has(DRAWER_KEY) }).groups
      current = new Map([...again].filter(([k, l]) => k && l.length === 1 && !l[0].problem).map(([k, l]) => [k, l[0]]))
      // A panel pair may have a labelled site trigger, whose regular reload key is its words.
      // Recover it by the same panel fingerprint used to make the pair.
      for (const key of wanted.keys()) {
        if (!key.startsWith('panel:') || current.has(key)) continue
        const matches = [...again.values()].flat().filter((t) => !t.problem && panelPairKey(t) === key)
        if (matches.length === 1) current.set(key, matches[0])
      }
      cap.closed = 'reload'
    } catch (e) {
      // a reload the budget cut short: the next trigger is named by the checks at the top
      if (!(e instanceof Spent)) lost = `the page could not be loaded again after the previous trigger: ${String(e.message).split('\n')[0].slice(0, 160)}`
    }
  }
  return caps
}

/** The scripts a page runs: external or inline, not data blocks (JSON-LD, templates). */
function inPageScriptCount() {
  return [...document.scripts].filter((s) => {
    const type = (s.getAttribute('type') ?? '').trim().toLowerCase()
    if (type && !/^(module|(text|application)\/(javascript|ecmascript))$/.test(type)) return false
    return Boolean(s.getAttribute('src')) || s.textContent.trim() !== ''
  }).length
}

/** A side that loaded as it owes but shows no header its declared profile reads. */
class Headerless extends Error {}

/** One side's capture as the record keeps it: the panel's boxes, how it opened, the picture. */
const sideRecord = (cap, isStatic = false) =>
  isStatic
    ? { opened: false, static: true, reason: cap.reason, closed: cap.closed ?? null }
    : cap.opened
    ? { opened: true, via: cap.via, rect: cap.panel.rect, surface: cap.panel.surface, items: cap.panel.items, moreItems: cap.panel.more, screenshot: cap.screenshot ?? null, clipped: cap.clipped ?? false, closed: cap.closed, ...(cap.screenshotError ? { screenshotError: cap.screenshotError } : {}) }
    : { opened: false, reason: cap.reason, ...(cap.via ? { via: cap.via } : {}), closed: cap.closed ?? null }

/**
 * The header census of one side alone (inPageMenuTriggers), read as measureMenus reads it — the status the side owes, the rest
 * visual-qa settles — without opening anything: `{ headers, triggers, status }`. For a fact about a side the open-state axis did
 * not read (visual-qa's mega walk on a dark axis whose source has no dark of its own reads the source's light page).
 */
export async function headerCensus(browser, { url, opts, settle, status = null, profile = null, declared = [], cap = MENU_TRIGGER_CAP }) {
  const toggles = (profile ?? PROFILES.T4).menu.toggles
  return withPage(browser, opts, async (pg) => {
    const res = await pg.goto(url, { waitUntil: 'networkidle' })
    const got = res?.status() ?? 0
    if (status != null ? got !== status : !(got >= 200 && got <= 299)) throw new Error(`${url} answered ${got || 'no response'}, expected ${status ?? '2xx'}`)
    await settle(pg)
    await pg.evaluate(() => scrollTo(0, 0))
    const c = await pg.evaluate(inPageMenuTriggers, [cap, declared, toggles])
    return { headers: c.headers, triggers: c.triggers.length, status: got }
  })
}

/**
 * The open-state axis of one page axis: load the site and the source (`siteOpts`/`sourceOpts` for
 * withPage), find the header's triggers on both, pair them, open and capture each pair on both
 * sides, compare. Returns `{ record, findings }`; the record is `axis.menus` in visual.json.
 * `settle` is visual-qa's (the same rest as the page's own capture). `declared` is the contract's
 * `design.menus.pairs` (pairMenus). `status` is `{ site, source }`, the status each side owes (2xx
 * when absent). A side that does not load, or answers another status, is no clean pair: the record says so
 * and a `menu-open-not-measured` finding names it. `profile` is the source framework's selector
 * profile (lib/framework-selectors.mjs; the T4 one when absent): its `menu.toggles` are the controls
 * read as triggers on both sides, and its `id` is recorded (`record.profile`). `assumed` (true when
 * `profile` is absent) says the framework was not declared and the T4 lists stand in for it: only then
 * is a 2xx side that shows no header read as a page without menus. Under a declared profile such a
 * side is not measured — a header the profile does not read is not an empty header.
 */
export async function measureMenus({ browser, url, sourceUrl, siteOpts, sourceOpts, pageId, variantId, out, settle, props, textProps = props, diffProperty, tolerance = {}, budgetMs = MENU_BUDGET_MS, cap = MENU_TRIGGER_CAP, itemCap = MENU_ITEM_CAP, declared = [], status = {}, signal = null, timing = {}, profile = null, assumed = profile == null, targetOnly = false }) {
  const started = Date.now()
  const toggles = (profile ?? PROFILES.T4).menu.toggles
  const record = { measured: true, ...(profile ? { profile: profile.id } : {}), site: null, source: null, pairs: 0, menus: [], unmatched: [], notMeasured: [] }
  const findings = []
  if (targetOnly) {
    // Keep the evidence shape complete even when the target fails before its census.
    record.targetOnly = true
    record.comparison = { check: 'menu-comparison', status: checkApplicability('none', 'menu-comparison'), reason: noReferenceReason }
  }
  const NM = (element, side, reason, label = null) => findings.push({ kind: 'menu-open-not-measured', element, ...(label !== null ? { trigger: label } : {}), side, reason })
  const load = async (pg, u, side) => {
    // 🔒 AN EMPTY CENSUS IS A PAGE WITH NO MENUS ONLY WHEN THE PAGE ANSWERED WHAT IT OWES. A 404 page
    // without the header reads as no triggers — a clean, empty axis — unless its status refuses it.
    const res = await pg.goto(u, { waitUntil: 'networkidle' })
    const got = res?.status() ?? 0
    const want = status?.[side] ?? null
    if (want != null ? got !== want : !(got >= 200 && got <= 299)) throw new Error(`${u} answered ${got || 'no response'}, expected ${want ?? '2xx'}`)
    await settle(pg)
    await pg.evaluate(() => scrollTo(0, 0))
    const c = await pg.evaluate(inPageMenuTriggers, [cap, declared.map((d) => d[side]), toggles])
    // 🔒 A 2xx PAGE WITH NO HEADER THE DECLARED PROFILE READS IS NOT A PAGE WITHOUT MENUS (#66): a T3
    // header read with lists that do not name it counted zero triggers and passed clean. Only a page
    // owing an error status, or a run whose framework is undeclared (`assumed`, a gap of its own), may.
    if (!c.headers && !assumed && got >= 200 && got <= 299) throw new Headerless(`${u} answered ${got} but shows no header the ${(profile ?? PROFILES.T4).id} selector profile reads; its menus were not measured`)
    return c
  }
  const census = (c) => ({ headers: c.headers, triggers: c.triggers.length, openAtRest: c.openAtRest, overCap: c.overCap, labels: c.triggers.map((t) => t.label), drawers: c.triggers.filter((t) => t.drawer).length, kinds: c.triggers.map((t) => t.kind) })
  const failed = (side, e) => {
    const reason = e instanceof Headerless ? e.message : `the ${side} did not load for the open-state capture: ${String(e.message).split('\n')[0].slice(0, 160)}`
    record.measured = false
    record.reason = reason
    NM('header menus', side, reason)
  }
  if (targetOnly) {
    await withPage(browser, siteOpts, async (sp) => {
      let siteCensus
      try { siteCensus = await load(sp, url, 'site') } catch (e) { return failed('site', e) }
      record.site = census(siteCensus)
      const { groups } = menuGroups(siteCensus, { declared: declared.length })
      const wanted = new Map([...groups].map(([key, triggers]) => [key, triggers[0]]))
      const captures = await captureSide(sp, wanted, {
        out, props, textProps, budgetMs, itemCap, declared: declared.length, signal,
        reload: () => load(sp, url, 'site'),
        relOf: (key) => menuShotName(pageId, variantId, key, 'site'), timing
      })
      for (const [key, triggers] of groups) {
        const trigger = triggers[0]
        const capResult = captures.get(key)
        const row = { trigger: trigger.label, key, site: sideRecord(capResult), findings: 0 }
        record.menus.push(row)
        if (triggers.length > 1 || trigger.problem) NM('header menus', 'site', trigger.problem ?? `more than one trigger has key ${key}`, trigger.label)
        else if (!capResult?.opened) NM(`header menu "${trigger.label}"`, 'site', capResult?.reason ?? 'the trigger was not opened', trigger.label)
        else if (!capResult.screenshot) NM(`header menu "${trigger.label}"`, 'site', `its picture could not be written: ${capResult.screenshotError ?? 'no picture'}`, trigger.label)
        else if (capResult.clipped) NM(`header menu "${trigger.label}"`, 'site', `the open panel reaches past the viewport (${capResult.clipped.px} px past its edge, ${capResult.clipped.items} word(s) or icon(s) cut); its picture holds part of it`, trigger.label)
      }
      if (record.site.overCap) NM('header menus', 'site', `${record.site.overCap} trigger(s) past the cap of ${cap} were not opened`)
    })
    record.ms = Date.now() - started
    return { record, findings }
  }
  await withPage(browser, siteOpts, async (sp) => {
    let siteCensus
    try {
      siteCensus = await load(sp, url, 'site')
    } catch (e) {
      return failed('site', e)
    }
    record.site = census(siteCensus)
    let pairs = null
    const sourceCaps = new Map()
    let sourceScripts = null
    await withPage(browser, sourceOpts, async (rp) => {
      let srcCensus
      try {
        srcCensus = await load(rp, sourceUrl, 'source')
      } catch (e) {
        return failed('source', e)
      }
      record.source = census(srcCensus)
      pairs = pairMenus(siteCensus, srcCensus, { declared })
      const wanted = new Map(pairs.matched.map((m) => [m.key, m.source]))
      const sideOpts = { out, props, textProps, budgetMs, itemCap, declared: declared.length, signal }
      const caps = await captureSide(rp, wanted, { ...sideOpts, reload: () => load(rp, sourceUrl, 'source'), relOf: (k) => menuShotName(pageId, variantId, k, 'source'), timing })
      for (const [k, v] of caps) sourceCaps.set(k, v)
      // A source page that runs a script and shows nothing is not taken for a static page on one look:
      // the controls that did not react are loaded again and given twice the time. Only a second
      // nonresponse confirms it; anything else (opened, a failure, a page that would not load) stands as
      // what it is.
      sourceScripts = await rp.evaluate(inPageScriptCount).catch(() => null)
      const doubt = [...sourceCaps].filter(([, c]) => c.nonresponsive).map(([k]) => k)
      if (doubt.length && sourceScripts !== 0) {
        for (const k of doubt) sourceCaps.set(k, { ...sourceCaps.get(k), nonresponsive: false })
        try {
          const again = menuGroups(await load(rp, sourceUrl, 'source'), { declared: declared.length, structural: wanted.has(DRAWER_KEY) }).groups
          const retry = new Map(doubt.flatMap((k) => (again.get(k)?.length === 1 && !again.get(k)[0].problem ? [[k, again.get(k)[0]]] : [])))
          const second = await captureSide(rp, retry, { ...sideOpts, reload: () => load(rp, sourceUrl, 'source'), relOf: (k) => menuShotName(pageId, variantId, k, 'source'), timing: { ...timing, openMs: (timing.openMs ?? MENU_OPEN_MS) * 2 } })
          for (const [k, v] of second) sourceCaps.set(k, v.nonresponsive ? { ...v, confirmed: true } : v)
        } catch {
          // the repeat could not run: the first nonresponse stays unconfirmed, a finding
        }
      }
    })
    if (!pairs) return
    const siteCaps = await captureSide(sp, new Map(pairs.matched.map((m) => [m.key, m.site])), { reload: () => load(sp, url, 'site'), out, relOf: (k) => menuShotName(pageId, variantId, k, 'site'), props, textProps, budgetMs, itemCap, declared: declared.length, signal, timing })
    record.pairs = pairs.matched.length
    for (const side of ['site', 'source']) {
      const over = record[side].overCap
      if (over) NM('header menus', side, `${over} trigger(s) past the cap of ${cap} were not opened`)
    }
    for (const u of pairs.unmatched) {
      record.unmatched.push(u)
      findings.push({ kind: 'menu-open-unmatched', element: u.label ? `header menu "${u.label}"` : 'header menu (no words)', trigger: u.label, ...(typeof u.label === 'string' && u.label ? { subject: { text: u.label } } : {}), side: u.side, reason: u.reason })
    }
    for (const n of pairs.notMeasured) {
      record.notMeasured.push(n)
      NM(n.label ? `header menu "${n.label}"` : 'header menus', n.side, n.reason, n.label || null)
    }
    for (const m of pairs.matched) {
      const s = sourceCaps.get(m.key)
      const t = siteCaps.get(m.key)
      // a source that was reached, pressed and stayed shut — on a page with no script, or twice on one with —
      // is a fact of the source; the site's side of the pair is still measured below
      const isStatic = Boolean(s.nonresponsive) && (sourceScripts === 0 || Boolean(s.confirmed))
      const row = { trigger: m.label, key: m.key, by: m.by, ...(m.labels ? { labels: m.labels } : {}), source: sideRecord(s, isStatic), site: sideRecord(t), findings: 0 }
      record.menus.push(row)
      if (isStatic) (record.sourceStatic ??= []).push({ key: m.key, trigger: m.label, scripts: sourceScripts ?? 0, toggle: `${m.source.tag} (${m.source.kind})`, outcome: s.outcome, covered: null })
      let blind = false
      for (const [side, c] of [['source', s], ['site', t]]) {
        if (side === 'source' && isStatic) blind = true
        else if (!c.opened) {
          NM(`header menu "${m.label}"`, side, c.reason, m.label)
          blind = true
        } else if (!c.screenshot) {
          NM(`header menu "${m.label}"`, side, `its picture could not be written: ${c.screenshotError ?? 'no picture'}`, m.label)
          blind = true
        } else if (c.clipped) {
          // a picture of part of the panel is no picture of the panel
          NM(`header menu "${m.label}"`, side, `the open panel reaches past the viewport (${c.clipped.px} px past its edge, ${c.clipped.items} word(s) or icon(s) cut); its picture holds part of it`, m.label)
          blind = true
        } else if (c.panel.more) {
          // what was read is compared; what was not is named
          NM(`header menu "${m.label}"`, side, `the open panel holds ${c.panel.more} word(s) or icon(s) past the cap of ${itemCap}; they were not compared`, m.label)
        }
      }
      if (blind) continue
      const r = compareMenuPanels(m.label, s.panel, t.panel, { props, diffProperty, ...tolerance })
      row.findings = r.findings.length
      if (r.truncated) row.truncated = r.truncated
      findings.push(...r.findings)
      // the pictures are compared too: what the boxes and styles cannot see (an ancestor's clip, a
      // surface drawn over the panel, an icon's colour or shape) is in them
      let pic
      try {
        pic = comparePanelPictures(m.label, PNG.sync.read(s.png), PNG.sync.read(t.png), { geometry: tolerance.geometry ?? 1 })
      } catch (e) {
        NM(`header menu "${m.label}"`, 'site', `its pictures could not be compared: ${String(e.message).split('\n')[0].slice(0, 160)}`, m.label)
        continue
      }
      if (pic) {
        row.findings++
        row.picture = pic.picture
        findings.push(pic)
      }
    }
  })
  record.ms = Date.now() - started
  return { record, findings }
}
