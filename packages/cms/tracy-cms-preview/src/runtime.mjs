/**
 * The in-page half of live preview: the script a Tracy page carries so that, while it is watched in
 * the side card's Browser tab, it can update itself without being thrown away, and — when the Tracy
 * site proxy vouched for the frame — let the person point at an element to comment on it.
 *
 * TWO JOBS. Refresh: on a `style` refresh it swaps the page's own stylesheets for freshly fetched
 * copies and the document is never reloaded, so the visitor keeps their scroll position, open menu
 * and typed text; on a `full` refresh it reloads, the truthful answer when the server has to render
 * the page again. Pick: `pick-start` outlines the element under the pointer, a click fixes it and
 * the page reports what it is (`describe` in `pick.mjs`), Escape or `pick-stop` leaves. While an
 * element stays picked, the page reports its new box whenever it scrolls or resizes, so the side
 * card's popover stays on it. Track (runtime 5): the side card hands the page the comments it keeps
 * (`pick-track`); while Edit is on, the page outlines each one it can still find and reports where it
 * is (`pick-rect`) or that it is gone (`pick-lost`), so the side card can draw its numbered pins.
 * Reveal (runtime 7): `pick-reveal {id}` scrolls one tracked element to the middle of the viewport,
 * flashes its outline and reports where it now is — the side card's "show me this comment".
 * Wrapped image (runtime 8): a picked element with no words below it that holds exactly one `<img>`
 * — a card's image link — reports that image as its `image`, so a comment on it can change the alt;
 * the pick itself stays the wrapper.
 * The words now (runtime 9): after each `pick-track`, and in Edit whenever they change, the page says
 * what every tracked element it finds reads now (`pick-text`), so a reply or a resend quotes the page
 * as it is and not as it was at the click.
 * Where the page is (runtime 11): with a picker, the page says where it is scrolled to (`pick-scroll`)
 * and goes back there on `pick-scroll-to`, so a load the side card starts itself (the recovery of a
 * lapsed picker) does not leave the person at the top.
 * Outlines that stay on their element (runtime 12, feature `follow`): an element that moves with the
 * page's own scroll is outlined in the page's coordinates, so the browser scrolls outline and element
 * in the same painted frame; only one under a fixed/sticky box or inside a box that scrolls itself
 * keeps a viewport outline redrawn on scroll (`placeOf`).
 * In lockstep (runtime 14, stage 6 acceptance v3): in Edit the page scrolls itself by the wheel and by
 * `pick-scroll-to`, one step per frame, posting where every reported element will be a frame before it
 * lands, so the side card's boxes move with the page; layout that moves without a scroll (an image
 * loaded, a slide turned, a menu closed) is followed by a frame check; what the page does not show is
 * reported `hidden`; a box open in the side card keeps the focus from the page's own `focus()` calls;
 * a route change inside a single-page site announces the page again.
 * View (runtime 17): with a picker, the page says where it is — address, scroll position, window size,
 * colour scheme (`view`, see `VIEW` in `protocol.mjs`) — so the chat can draw the same page beside the
 * customer's message. Nothing is asked of the page and nothing is drawn on it.
 *
 * 🔒 IT IS INERT ON A REAL VISIT. Everything below is behind `window.parent !== window`: a customer's
 * visitor is not inside a frame, so no listener is installed and nothing is announced.
 *
 * 🔒 WHO MAY DRIVE IT — two answers, because the two jobs carry different things.
 *
 * Refresh answers anyone. A refresh message carries a mode and nothing else: it cannot name a URL,
 * an element or a file, every address fetched is read off the page itself, and the only writes are
 * to `<link>` elements already pointing at the page's own origin. The most a stranger framing the
 * page can make it do is fetch itself and its own stylesheets again, which its own reload button
 * does. `applied`, and `ready` on a page with no picker, go to `'*'` for the same reason: they say
 * "a Tracy page is here", already visible in its markup.
 *
 * Pick answers ONE parent, because a picked element's text goes OUT of the page — including text a
 * signed-in person sees and a stranger must not. So the picker exists only when the script tag that
 * loaded this code names the parent's origin (`data-parent-origin`), which only the Tracy site proxy
 * writes, and only after checking a one-time ticket issued to a seat that may edit the site; the
 * proxy also sends `frame-ancestors <that origin>`, so no other page can frame this one to begin
 * with. A theme that includes the script itself names no origin, so on such a load the picker does
 * not exist: `ready` does not list `pick` and every `pick-*` message is ignored. With a picker,
 * a `pick-*` message is obeyed only when `event.source` is this frame's parent AND `event.origin` is
 * that origin, and every reply is posted to that origin exactly — never `'*'`. So is `ready` on
 * such a page, because it then carries the page's own address (`pageAddress`); nothing is lost by
 * narrowing it, since the proxy's `frame-ancestors <that origin>` means no other parent exists.
 * What a reply may carry is bounded by `describe`: no form values, no `[data-tracy-private]` text,
 * no script text, everything capped by `LIMITS`.
 *
 * The address alone answers the origin the proxy names on a page it vouched NO picker for
 * (`data-report-origin`, runtime 18, feature `address`): `ready` with the page's `url` goes to that
 * origin exactly, beside the anonymous `ready` to '*', and again on a route change. It carries
 * nothing of the page but its address (`pageAddress`), which is why it needs no ticket.
 *
 * TWO GENERATIONS ON ONE PAGE. The first release of this script (a refresh-only agent) is still in
 * the Tracy themes and will be until every site carries this one; both may load on the same page, in
 * either order. The old one listens anonymously and backs off when `TracyPreviewStarted === true`,
 * so this one keeps setting that flag, and registers itself as `window.TracyPreviewRuntime`
 * `{ version, dispose, legacyOwnsRefresh, parentOrigin }`. Loading after the old one, it cannot
 * remove the old listener, so it leaves refresh to it and adds only the picker. Loading after an
 * older copy of itself, it disposes that copy and inherits `legacyOwnsRefresh` (and the vouched
 * parent origin), so old → new₁ → new₂ still refreshes once per message.
 */
/* global __TRACY_RUNTIME__ */
import {
  ADDRESS_FEATURES,
  CHANNEL,
  DEFAULT_MODE,
  FEATURES,
  LOCKSTEP_WAIT_MS,
  PICK,
  VERSION,
  VIEW,
  scrollPoint,
  trackItems,
  wheelMessage
} from '../protocol.mjs'
import {
  OWN,
  box,
  describe,
  isHidden,
  levelElements,
  locate,
  ownText,
  paintsOver,
  pickAt,
  reboxed,
  unseen,
  widened
} from './pick.mjs'

/** This runtime's own version — which copy of the code, not which contract (`VERSION`). */
const RUNTIME = __TRACY_RUNTIME__

/** The query parameter a swapped stylesheet carries, and the only thing this code adds to a URL. */
const STAMP = 'tracy-preview'

/** The outline colour: Tracy's primary. */
const COLOR = '191,91,61'

/**
 * A tracked element's outline, by the state the side card gave it (`TRACK_STATES`): one thin line and
 * no fill, so several can sit on a page without hiding it; `active` — the comment whose popover is
 * open — is drawn as the live pick is. Colours are `@tracy/ui` tokens as sRGB (`tokens.css`:
 * `--primary`, `--success`, `--destructive`; `asked` is Tailwind's yellow-500, which has no token).
 */
const TRACK_LOOK = {
  saved: `1px solid rgba(${COLOR},.6)`,
  sent: `1px solid rgb(${COLOR})`,
  working: `1px solid rgb(${COLOR})`,
  done: '1px solid rgb(0,188,125)',
  failed: '1px solid rgb(231,0,11)',
  asked: '1px solid rgb(240,177,0)',
  // Not sent yet (runtime 7): `--muted-foreground` at half strength, as the approved stage-4 drawing.
  pending: '1px solid rgba(115,115,115,.5)'
}

/**
 * The live pick's two looks, one family that differs only in strength (Akemi 01/10/2026): under the
 * pointer a thin solid line at 70% with a faint fill, once picked a 2px solid line with a stronger
 * fill. A dashed hover line was hard to see on a busy page, and a solid line with a fill reads as
 * "pointing" next to "chosen" the way design tools draw it. The hover fill is what sets it apart
 * from a saved comment's outline (1px at 60%, no fill).
 */
const HOVER = `1px solid rgba(${COLOR},.7)`
const HOVER_FILL = `rgba(${COLOR},.06)`
const PICKED = `2px solid rgb(${COLOR})`
const PICKED_FILL = `rgba(${COLOR},.1)`

/** A revealed outline while it is lit: thicker than any state and filled, so the eye finds it. */
const LIT = `3px solid rgb(${COLOR})`

/** One flash step, in milliseconds: two flashes are on · off · on · off, about 600 ms in all. */
const FLASH_STEP = 150

/**
 * Whether the visitor's browser matches a preference query; false where it cannot say.
 * @param {string} query
 */
function prefers(query) {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(query).matches === true
  } catch {
    return false
  }
}

/** Whether the visitor asked for less motion: then a reveal jumps instead of gliding, and flashes once. */
function calm() {
  return prefers('(prefers-reduced-motion: reduce)')
}

/** How far an outline stands outside its element's box, on every side. */
const OUTSET = 4

/** @param {Element} el - its computed style, or null where there is none to read. */
function styleOf(el) {
  const view = el.ownerDocument && el.ownerDocument.defaultView
  try {
    return view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(el) : null
  } catch {
    return null
  }
}

/** Whether a box with `style` holds fixed descendants (and absolute ones) instead of the viewport. */
function holdsFixed(style) {
  const set = (v) => v !== undefined && v !== '' && v !== 'none'
  if (set(style.transform) || set(style.filter) || set(style.perspective) || set(style.backdropFilter))
    return true
  if (/paint|layout|strict|content/.test(style.contain || '')) return true
  return /transform|filter|perspective/.test(style.willChange || '')
}

/**
 * Where an outline around `el` is drawn from, so it stays on `el` in every frame the browser paints
 * (runtime 12, feature `follow`; Brian 30/09/2026).
 *
 * The browser scrolls a page on its compositor and runs `scroll` listeners after it has already
 * painted the scrolled page. An outline placed in the viewport (`position:fixed`) and redrawn from
 * `scroll` therefore trails its element by one painted frame on every scroll step — a screencast of
 * Chrome measured a full wheel step (60 px) each time, the outline hanging where the element had been.
 * So an element that moves only with the page's own scroll gets its outline in the PAGE's
 * coordinates (`position:absolute` under the root): the compositor scrolls both in the same frame.
 *
 * Only an element under a `fixed` or `sticky` box keeps a fixed outline redrawn on every scroll: a
 * stuck header does not move with the page, and a fixed outline stays exactly on it. An element
 * inside a box that scrolls by itself stays in the page's coordinates too: the page's scroll then
 * moves both at once, and the box's own scroll redraws the outline on its `scroll` event (one frame
 * behind there is the best a page-level drawing can do without touching the customer's markup).
 *
 * A positioned or transformed root holds the absolute outline (and a transformed one the fixed one
 * too), so then both are placed from the root's box instead of the page origin or the viewport.
 * @param {Element} el
 * @returns {{ position: 'absolute' | 'fixed', dx: number, dy: number, page: boolean }}
 */
function placeOf(el) {
  const root = (el.ownerDocument || document).documentElement
  let inView = false
  for (let node = el; node && node !== root && !inView; node = node.parentElement) {
    const style = styleOf(node)
    if (style === null) break
    inView = style.position === 'fixed' || style.position === 'sticky'
  }
  const rootStyle = styleOf(root)
  const transformed = rootStyle !== null && holdsFixed(rootStyle)
  const positioned =
    rootStyle !== null &&
    rootStyle.position !== undefined &&
    rootStyle.position !== '' &&
    rootStyle.position !== 'static'
  const fromRoot = () => {
    const b = root.getBoundingClientRect()
    return { dx: -b.left, dy: -b.top }
  }
  if (inView) return { position: 'fixed', ...(transformed ? fromRoot() : { dx: 0, dy: 0 }), page: false }
  if (transformed || positioned) return { position: 'absolute', ...fromRoot(), page: true }
  return {
    position: 'absolute',
    dx: Number(window.scrollX) || 0,
    dy: Number(window.scrollY) || 0,
    page: true
  }
}

/**
 * The inline style of one outline around `el`: `all:initial` and every property `!important`, so no
 * customer rule reaches it and it reaches no customer element. Placed by {@link placeOf}; an outline
 * in the page is kept inside the page's scroll size, because an absolute box past the page's edge
 * makes the page wider (a full-width band's outline would add a horizontal scrollbar) where a fixed
 * one never did.
 * @param {Element} el
 * @param {string} border
 * @param {string} background
 */
function outlineCss(el, border, background, hidden = null) {
  const r = el.getBoundingClientRect()
  const at = placeOf(el)
  let left = r.left - OUTSET + at.dx
  let top = r.top - OUTSET + at.dy
  let right = r.left + r.width + OUTSET + at.dx
  let bottom = r.top + r.height + OUTSET + at.dy
  if (at.page) {
    const root = (el.ownerDocument || document).documentElement
    const w = Number(root.scrollWidth)
    const hgt = Number(root.scrollHeight)
    if (w > 0) {
      left = Math.max(0, left)
      right = Math.min(w, right)
    }
    if (hgt > 0) {
      top = Math.max(0, top)
      bottom = Math.min(hgt, bottom)
    }
  }
  const rules = [
    'all:initial',
    // A box that scrolls itself has the element out of sight (runtime 14, `clip`): no outline over
    // whatever the box shows instead.
    `display:${hidden === 'clipped' ? 'none' : 'block'}`,
    `position:${at.position}`,
    // In the element's own stacking layer (runtime 14): a fixed bar the page paints above the element
    // — WordPress's admin bar, a sticky header — paints above its outline too. It was 2147483647, over
    // every bar of the page (acceptance v3 B06).
    `z-index:${String(layerOf(el))}`,
    'pointer-events:none',
    'box-sizing:border-box',
    `left:${String(left)}px`,
    `top:${String(top)}px`,
    `width:${String(Math.max(0, right - left))}px`,
    `height:${String(Math.max(0, bottom - top))}px`,
    `border:${border}`,
    'border-radius:2px',
    `background:${background}`
  ]
  return `${rules.join(' !important;')} !important`
}

/**
 * The stacking layer an outline around `el` is painted in: the z-index of the outermost positioned
 * box around it that sets one (its layer in the page's root stacking context), 0 when none does.
 * Appended after the page's own elements, the outline then paints over the element and its layer,
 * and under any box the page paints above that layer.
 * @param {Element} el
 */
function layerOf(el) {
  const root = (el.ownerDocument || document).documentElement
  let z = 0
  for (let node = el; node && node !== root && node.nodeType === 1; node = node.parentElement) {
    const style = styleOf(node)
    if (style === null) break
    const n = Number.parseInt(style.zIndex, 10)
    if (
      style.position !== undefined &&
      style.position !== '' &&
      style.position !== 'static' &&
      Number.isFinite(n)
    )
      z = n
  }
  return Math.max(0, z)
}

/** Overflow values that cut what lies outside the box. */
const CLIPS = /hidden|auto|scroll|clip/

/** @param {Element} outer @param {Element} node - whether `node` is `outer` or inside it. */
function within(outer, node) {
  for (let up = node; up && up.nodeType === 1; up = up.parentElement) if (up === outer) return true
  return false
}

/**
 * The part of `node` that cuts its overflow, in the viewport: its padding box — inside the border,
 * where the overflow is cut (runtime 15, acceptance v5 J01: a slide moved out of a carousel with a
 * 1 px border stayed "in sight" under the border, and kept a 37 px outline sliver and its popover).
 * The border box when the browser gives no inner size (an inline box, not laid out).
 * @param {Element} node
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function cutBox(node) {
  const b = node.getBoundingClientRect()
  const cw = Number(node.clientWidth)
  const ch = Number(node.clientHeight)
  const cl = Number(node.clientLeft) || 0
  const ct = Number(node.clientTop) || 0
  const inner = (size, outer) => Number.isFinite(size) && (size > 0 || !(outer > 0))
  return {
    left: b.left + (inner(cw, b.width) ? cl : 0),
    top: b.top + (inner(ch, b.height) ? ct : 0),
    right: inner(cw, b.width) ? b.left + cl + cw : b.left + b.width,
    bottom: inner(ch, b.height) ? b.top + ct + ch : b.top + b.height
  }
}

/**
 * Why `el` must not be drawn over, or null (runtime 14, feature `clip`; `HIDDEN_REASONS`).
 *
 * `clipped`: the boxes around it that cut their overflow — a list that scrolls itself, a card with
 * `overflow:hidden` — leave nothing of it in sight (acceptance v3 B04: a row scrolled out of its box
 * kept its outline, pin and popover over the video below). A box the element escapes (it is
 * absolutely placed and the box is not positioned) does not cut it; nothing beyond a fixed box does.
 * `covered`: the corner a pin points at, the element's visible top-left, is painted over by another
 * box of the page — a fixed bar, an open menu (B13: pins sat on WordPress's admin bar).
 * @param {Element} el
 * @returns {'clipped' | 'covered' | null}
 */
function hiddenOf(el) {
  const doc = el.ownerDocument || document
  const root = doc.documentElement
  const r = el.getBoundingClientRect()
  // Not laid out at all (`display:none`, taken out of the page), or not painted (acceptance v3 J03,
  // J04, J-new-3: a closed tab, a collapsed accordion, an invisible slide kept their outline).
  // Runtime 15 (acceptance v5 JS-v5-new-7d): a box of one pixel or less is the screen-reader-only
  // pattern — nothing a person sees; its outline was a 9 px red dot beside a popover.
  if (el.isConnected === false || !(r.width > 1 || r.height > 1) || unseen(el)) return 'clipped'
  let left = r.left
  let top = r.top
  let right = r.left + r.width
  let bottom = r.top + r.height
  let escaped = false
  let fixed = false
  for (
    let node = el;
    node && node !== root && node !== doc.body && node.nodeType === 1;
    node = node.parentElement
  ) {
    const style = styleOf(node)
    if (style === null) break
    const positioned = style.position !== undefined && style.position !== '' && style.position !== 'static'
    if (node !== el && (!escaped || positioned)) {
      const cutX = CLIPS.test(style.overflowX || style.overflow || '')
      const cutY = CLIPS.test(style.overflowY || style.overflow || '')
      if (cutX || cutY) {
        const b = cutBox(node)
        if (cutX) {
          left = Math.max(left, b.left)
          right = Math.min(right, b.right)
        }
        if (cutY) {
          top = Math.max(top, b.top)
          bottom = Math.min(bottom, b.bottom)
        }
        if (right <= left || bottom <= top) return 'clipped'
      }
    }
    if (style.position === 'fixed') {
      fixed = true
      break
    }
    if (style.position === 'absolute') escaped = true
    else if (positioned && node !== el) escaped = false
  }
  const view = window
  const width = Number(view.innerWidth) || 0
  const height = Number(view.innerHeight) || 0
  // A fixed box shows only what is in the viewport: an offcanvas or a drawer slid out of it by a
  // transform keeps its items' boxes, off screen, for good (acceptance v3 J06: a pin and an outline
  // floated over the hero at every scroll, for every seat, after reloads).
  if (fixed && width > 0 && height > 0) {
    if (Math.min(right, width) <= Math.max(left, 0) || Math.min(bottom, height) <= Math.max(top, 0))
      return 'clipped'
  }
  const x = left + 2
  const y = top + 2
  if (
    typeof doc.elementsFromPoint === 'function' &&
    right - left > 4 &&
    bottom - top > 4 &&
    x >= 0 &&
    y >= 0 &&
    (width === 0 || x < width) &&
    (height === 0 || y < height)
  )
    // Topmost first: the first box that paints something there, unless the element (or a box it is
    // in, or one in it) comes first. See-through layers and invisible slides are looked through.
    for (const hit of doc.elementsFromPoint(x, y) || []) {
      if (!hit || hit.nodeType !== 1 || hit.hasAttribute(OWN)) continue
      if (within(el, hit) || within(hit, el)) return null
      if (paintsOver(hit)) return 'covered'
    }
  return null
}

/**
 * Where an outline around `el` is attached: inside the open MODAL dialog that holds it — a modal is
 * painted in the top layer, above anything attached to the root (acceptance v3 J05: the outline of a
 * pick in Joomla's language dialog was invisible, and hung on the page once the dialog closed) —
 * else the root element.
 * @param {Element} el
 */
function hostOf(el) {
  const root = (el.ownerDocument || document).documentElement
  for (let node = el; node && node !== root && node.nodeType === 1; node = node.parentElement) {
    if (node.tagName !== 'DIALOG') continue
    let modal = false
    try {
      modal = typeof node.matches === 'function' ? node.matches(':modal') : node.hasAttribute('open')
    } catch {
      modal = node.hasAttribute('open')
    }
    return modal ? node : root
  }
  return root
}

/** Attach the outline `node` where `el` is painted (`hostOf`), moving it when that changed. */
function attach(node, el) {
  const host = hostOf(el)
  if (node.parentNode === host) return
  if (node.parentNode) node.parentNode.removeChild(node)
  host.appendChild(node)
}

/** A box and why it must not be drawn over, as one key: a report is sent only when this changes. */
function reportKey(rect, hidden) {
  return `${boxKey(rect)}${hidden === null || hidden === undefined ? '' : `:${hidden}`}`
}

/** @param {object} target - a `PickTarget`; the same with `hidden` for `el` now (none when it can be seen). */
function withHidden(target, el) {
  const { hidden: _gone, ...rest } = target
  const hidden = hiddenOf(el)
  return hidden === null ? rest : { ...rest, hidden }
}

/** One line of a line-based wheel (`deltaMode` 1), in CSS pixels. */
const WHEEL_LINE = 16

/**
 * How far one frame of a glide moves toward where the wheel asked: a part of what is left, all of it
 * once that is small (a trackpad's steps, the end of a glide). About seven frames for a 300 px notch.
 */
const GLIDE_PART = 0.35
const GLIDE_SNAP = 30

/** @param {number} from @param {number} to */
function glideStep(from, to) {
  const left = to - from
  return Math.abs(left) <= GLIDE_SNAP ? to : from + Math.round(left * GLIDE_PART)
}

/**
 * Presses, releases and menu events the picker takes while picking and a hold swallows (runtime 14,
 * acceptance v3 J-new-1: a modal the page opens on `pointerup` opened on the click that picked).
 * `pointerup` and `click` have handlers of their own. Runtime 16 (acceptance v5 PICK-new-7): also
 * `selectstart`, so a double-click never selects the page's words.
 */
const PRESSES = [
  'mousedown',
  'pointerdown',
  'mouseup',
  'touchstart',
  'touchend',
  'dblclick',
  'auxclick',
  'contextmenu',
  'selectstart'
]

/**
 * Events after which the page may have moved an element without scrolling or mutating the DOM — a
 * CSS transition or animation, an image loaded, a menu closed by `:hover` when the pointer left, a
 * focus change — each starts the frame check (`kick`).
 */
const SETTLERS = [
  'transitionrun',
  'transitionend',
  'animationstart',
  'animationiteration',
  'animationend',
  'load',
  'mouseout',
  'focusin',
  'focusout'
]

/** How many still frames the frame check waits before it stops (about half a second). */
const STILL_FRAMES = 30

/** Form controls the browser sends no click for while they are disabled. */
const DISABLEABLE = /^(BUTTON|INPUT|SELECT|TEXTAREA|OPTGROUP|OPTION|FIELDSET)$/

/** @param {unknown} node - whether it is, or sits in, a disabled form control. */
function inDisabled(node) {
  for (let up = /** @type {any} */ (node); up && up.nodeType === 1; up = up.parentElement)
    if (DISABLEABLE.test(up.tagName) && up.hasAttribute('disabled')) return true
  return false
}

/**
 * While picking, the page's embeds let the pointer through (runtime 14, acceptance v3 K10): a move or
 * a click over an iframe went to the frame inside, the page never heard it, and a map or a video
 * could not be commented on. `pickAt` finds the embed under the pointer by its box instead.
 */
const EMBED_RULE = 'iframe,embed,object{pointer-events:none!important}'

/** The wheel listener's options: it must be able to `preventDefault`, and it hears the wheel first. */
const WHEEL_OPTIONS = { capture: true, passive: false }

/** The least time between two `pick-hover` messages, in milliseconds. */
const HOVER_GAP = 80

/**
 * Post one message to the parent frame.
 * @param {object} message
 * @param {string} target - `'*'` for refresh messages, the vouched parent origin for pick replies.
 */
function post(message, target) {
  try {
    window.parent.postMessage(message, target)
  } catch {
    /* A frame that refuses to be posted to is a frame that is not listening. */
  }
}

/**
 * How long a `full` refresh waits for the page's stylesheets to come back past the browser's cache
 * before it reloads anyway. Same-origin sheets on a site the person is editing come back in tens of
 * milliseconds; the cap only keeps a hung request from holding the reload forever.
 */
const FRESHEN_WAIT_MS = 3000

/**
 * The page's own stylesheets: each `<link>` with the address it names, without the stamp an earlier
 * swap added — that bare address is the one the next load of the page asks for.
 * @returns {Array<{ link: Element, url: URL }>}
 */
function ownSheets() {
  const links = Array.prototype.slice.call(document.querySelectorAll('link[rel~="stylesheet"][href]'))
  const sheets = []
  for (const link of links) {
    let url
    try {
      url = new URL(link.href, document.baseURI)
    } catch {
      continue
    }
    if (url.origin !== window.location.origin) continue
    url.searchParams.delete(STAMP)
    sheets.push({ link, url })
  }
  return sheets
}

/**
 * Fetch each address again past the browser's HTTP cache, so the copy the cache holds for it is the
 * one on disk now.
 *
 * 🔒 WHY (stage 6 acceptance v5, R05, 30/09/2026). A look change rewrites a theme stylesheet in place
 * — WordPress `sections.css?ver=1.1.2`, whose `ver` is the theme's version and never moves — and the
 * server sends it with `Last-Modified` and no `Cache-Control`, so Chrome keeps it "fresh" by its own
 * estimate. A reload revalidates the document, not its stylesheets: the sender watched the old size
 * for ~10 minutes after Tracy said done, and the style swap below showed the new size only until the
 * next load of the page brought the cached copy back. `cache: 'reload'` goes to the network and
 * stores what comes back under the same address, so the reload that follows — and every later load in
 * this browser — reads the new file. `no-cors` + `include` is how the `<link>` itself asks, so the
 * entry refreshed is the one the page reads.
 * @param {URL[]} urls
 * @returns {Promise<unknown> | null} settles when every fetch has; null where nothing can be fetched.
 */
function freshen(urls) {
  if (urls.length === 0 || typeof window.fetch !== 'function') return null
  const quiet = () => {}
  return Promise.all(
    urls.map((url) => {
      try {
        return window
          .fetch(url.href, { cache: 'reload', mode: 'no-cors', credentials: 'include' })
          .then(quiet, quiet)
      } catch {
        return null
      }
    })
  )
}

/**
 * Swap every same-origin stylesheet for a freshly fetched copy, without reloading the document.
 *
 * 🔒 THE OLD SHEET IS REMOVED ONLY AFTER THE NEW ONE HAS LOADED. Removing it first — the obvious
 * order — unstyles the page for as long as the request takes, which on a cold cache is a white
 * flash of raw HTML: exactly the thing this whole mechanism exists to stop happening.
 *
 * The swapped `<link>` carries a stamp so this document cannot reuse what it already parsed; the bare
 * address is fetched again past the cache too ({@link freshen}), so the next load of the page does
 * not bring the old sheet back.
 *
 * Cross-origin sheets (a font service, a CDN) are left alone: they are not what the agent just
 * edited, and refetching them would cost the page a round trip for nothing.
 *
 * @returns {number} how many sheets were swapped; zero means this page cannot be refreshed this way.
 */
function swapStyles() {
  const sheets = ownSheets()
  freshen(sheets.map((sheet) => sheet.url))
  for (const { link, url } of sheets) {
    const stamped = new URL(url.href)
    stamped.searchParams.set(STAMP, String(Date.now()))
    const fresh = link.cloneNode(false)
    fresh.href = stamped.href
    const drop = () => {
      if (link.parentNode !== null) link.parentNode.removeChild(link)
    }
    fresh.addEventListener('load', drop)
    fresh.addEventListener('error', drop)
    link.parentNode.insertBefore(fresh, link.nextSibling)
  }
  return sheets.length
}

/**
 * Reload the document once its stylesheets have been fetched again past the cache ({@link freshen}),
 * or after {@link FRESHEN_WAIT_MS}, whichever comes first; at once when there is nothing to fetch.
 */
function reloadFresh() {
  const pending = freshen(ownSheets().map((sheet) => sheet.url))
  if (pending === null) {
    window.location.reload()
    return
  }
  let gone = false
  const go = () => {
    if (gone) return
    gone = true
    window.location.reload()
  }
  pending.then(go, go)
  window.setTimeout(go, FRESHEN_WAIT_MS)
}

/**
 * Do what one refresh request asks, and answer with what was actually done.
 *
 * A `style` request on a page with no same-origin stylesheet cannot be honoured, and pretending
 * otherwise would leave the person looking at an unchanged page believing it changed. It falls
 * through to a reload and says so.
 * @param {string} mode - the requested mode.
 */
function apply(mode) {
  const applied = { channel: CHANNEL, v: VERSION, kind: 'applied' }
  if (mode === 'style' && swapStyles() > 0) {
    post({ ...applied, mode: 'style' }, '*')
    return
  }
  post({ ...applied, mode: DEFAULT_MODE }, '*')
  reloadFresh()
}

/**
 * The parent origin the Tracy site proxy vouched for, read off the script tag running this code.
 * Anything that is not exactly an http(s) origin is no origin: the picker then does not exist.
 * @returns {string | null}
 */
function vouchedOrigin() {
  return scriptOrigin('parentOrigin')
}

/**
 * The origin the site proxy named for a page it did NOT vouch a picker for (`data-report-origin`,
 * runtime 18, feature `address`): Tracy's own, the one parent this page may tell its address to.
 * @returns {string | null}
 */
function reportedOrigin() {
  return scriptOrigin('reportOrigin')
}

/**
 * An origin written on the script tag that loaded this code, or null when it is missing or is not
 * exactly an http(s) origin.
 * @param {'parentOrigin' | 'reportOrigin'} name - the `dataset` key.
 * @returns {string | null}
 */
function scriptOrigin(name) {
  const script = document.currentScript
  const value = script && script.dataset ? script.dataset[name] : undefined
  if (typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value) return value
  } catch {
    /* not a URL */
  }
  return null
}

/** The longest page address a pick reply carries; a longer one is left out rather than cut. */
const URL_LIMIT = 2048

/**
 * Parts of an address that must never leave the page: the one-time preview ticket the proxy redeems
 * (it stays in the bar, because the proxy answers a redeemed one without a 303), anything that reads
 * as a token or a key, and a `#fragment`, which is where single-page admin screens keep both.
 */
const SECRET_PARAM =
  /^(?:tracy_preview|token|access_token|id_token|auth|key|api_?key|secret|password|pass|pwd|sig|signature|code|state|nonce|ticket|session|sid|jwt)$/i

/**
 * The page's own address. The Browser tab's address bar does not follow a click INSIDE the frame, so a
 * side card that only knew its bar named the page it had opened.
 *
 * 🔒 WHAT IS SENT IS THE PAGE, NOT ITS CREDENTIALS (28/09/2026). It was `location.href` whole, so the
 * address that rode into `content.locate` and into the agent's turn carried whatever the page's URL
 * held: `user:password@` from a basic-auth preview, a `#access_token=…` fragment from an admin screen,
 * and the one-time `tracy_preview` ticket, which stays in the bar after it is redeemed. And a URL over
 * 2048 characters was dropped whole, so the agent was told the WRONG page — the tab's own address —
 * rather than none. Now the address is rebuilt: origin and path always, a `#fragment` never, secret-
 * looking parameters dropped by name, and the query trimmed parameter by parameter until it fits, so a
 * long address still names its own page.
 * @returns {string | null}
 */
function pageAddress() {
  const loc = window.location
  const href = loc && typeof loc.href === 'string' ? loc.href : ''
  if (href === '') return null
  let url
  try {
    url = new URL(href)
  } catch {
    return null
  }
  // A password in the address is never a page's identity, and `username@host` names no page either.
  url.username = ''
  url.password = ''
  url.hash = ''
  // Collected first, deleted after: `searchParams.keys()` is live, and deleting while walking it
  // steps over the next name — which would leave a secret behind.
  const secret = []
  for (const name of url.searchParams.keys()) if (SECRET_PARAM.test(name)) secret.push(name)
  for (const name of secret) url.searchParams.delete(name)
  if (url.href.length <= URL_LIMIT) return url.href
  // Too long even so: drop query parameters from the end until it fits, then the query itself. The
  // origin and the path are what names the page, and they are kept whatever happens.
  const names = [...url.searchParams.keys()]
  for (let i = names.length - 1; i >= 0 && url.href.length > URL_LIMIT; i--) url.searchParams.delete(names[i])
  if (url.href.length > URL_LIMIT) url.search = ''
  return url.href.length <= URL_LIMIT ? url.href : null
}

/** `{ url }` for a message to the vouched parent origin, or nothing when the address is unusable. */
function here() {
  const url = pageAddress()
  return url === null ? {} : { url }
}

/**
 * Run `fn` once on the next animation frame, however often this is called before then.
 * @param {() => void} fn
 * @returns {() => void}
 */
function perFrame(fn) {
  let queued = false
  const run = () => {
    queued = false
    fn()
  }
  return () => {
    if (queued) return
    queued = true
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run)
    else window.setTimeout(run, 16)
  }
}

/** @param {import('../protocol.mjs').PickRect} rect */
function boxKey(rect) {
  return `${String(rect.x)},${String(rect.y)},${String(rect.width)},${String(rect.height)}`
}

/**
 * The picker, bound to the one origin it answers.
 *
 * Its only marks on the page are one element it creates (`<tracy-pick>`, styled inline with
 * `all:initial` and every property `!important`, so neither a customer rule reaches it nor it a
 * customer element) and, while picking, the root element's inline `cursor`, restored on the way out.
 * @param {string} parentOrigin
 */
function createPicker(parentOrigin) {
  let state = 'idle'
  let overlay = null
  /** The style last written on `overlay`. */
  let drawn = ''
  let current = null
  let hoverEl = null
  let sentEl = null
  let lastSent = 0
  let timer = 0
  let framed = false
  let px = 0
  let py = 0
  let levels = []
  let cursor = null
  /** The element the person picked, and what was reported about it (`picked`). */
  let pickedEl = null
  let pickedTarget = null
  /** The box last reported for it, as `x,y,width,height`: a report is sent only when it moved. */
  let reportedBox = ''

  const reply = (kind, extra) => post({ channel: CHANNEL, v: VERSION, kind, ...extra }, parentOrigin)

  function draw(el, solid) {
    current = el
    if (overlay === null) {
      overlay = document.createElement('tracy-pick')
      overlay.setAttribute(OWN, '')
      overlay.setAttribute('aria-hidden', 'true')
    }
    attach(overlay, el)
    const css = outlineCss(el, solid ? PICKED : HOVER, solid ? PICKED_FILL : HOVER_FILL, hiddenOf(el))
    // Written only when it changed: an outline in the page is the same on every scroll event.
    if (css !== drawn) overlay.style.cssText = css
    drawn = css
  }

  function tick() {
    framed = false
    if (state !== 'picking') return
    const el = pickAt(px, py, document)
    if (el === null) {
      // Nothing of the page here (Tracy's own badge): no outline, and a click here picks nothing.
      hoverEl = null
      if (overlay !== null && overlay.parentNode) overlay.parentNode.removeChild(overlay)
      overlay = null
      drawn = ''
      current = null
      return
    }
    hoverEl = el
    draw(el, false)
    if (el !== sentEl && timer === 0)
      timer = window.setTimeout(flushHover, Math.max(0, lastSent + HOVER_GAP - Date.now()))
  }

  function flushHover() {
    timer = 0
    if (state !== 'picking' || hoverEl === null || hoverEl === sentEl) return
    sentEl = hoverEl
    lastSent = Date.now()
    reply(PICK.hover, { target: describe(hoverEl), ...here() })
  }

  function onMove(event) {
    if (held) return
    px = event.clientX
    py = event.clientY
    if (framed) return
    framed = true
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(tick)
    else window.setTimeout(tick, 16)
  }

  /** While picking, a press belongs to the picker: no link opens, no menu toggles, no focus moves. */
  function onPress(event) {
    // Held, the hold's own listeners swallow it (and tell the side card of a click).
    if (held) return
    event.preventDefault()
    event.stopPropagation()
  }

  function onClick(event) {
    if (held) return
    onPress(event)
    // A click with no pointer behind it (Enter on a focused link) has no position: keep the hover.
    pick((event.detail === 0 ? null : pickAt(event.clientX, event.clientY, document)) || hoverEl)
  }

  /**
   * A press released on a disabled form control (runtime 14, acceptance v3 K09): the browser sends no
   * click for one — "Send request" stays disabled until consent is ticked — but it does send pointer
   * events, so the pick is made here. An enabled target waits for its click, as before.
   */
  function onRelease(event) {
    if (held) return
    onPress(event)
    if ((event.button !== undefined && event.button !== 0) || !inDisabled(event.target)) return
    pick(pickAt(event.clientX, event.clientY, document) || hoverEl)
  }

  /** @param {Element | null} el - the element a press chose: picked, outlined solid and reported. */
  function pick(el) {
    if (el === null) return
    stopPointer()
    state = 'picked'
    levels = levelElements(el)
    draw(el, true)
    pickedEl = el
    pickedTarget = describe(el)
    const first = withHidden(pickedTarget, el)
    reportedBox = reportKey(first.rect, first.hidden)
    lastTarget = first
    watchSize(el)
    reply(PICK.picked, { target: first, ...here() })
  }

  /** What was last reported about the pick (`picked`), kept for when its element is gone. */
  let lastTarget = null

  function onKey(event) {
    if (event.key !== 'Escape' || state === 'idle') return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }

  /**
   * The picked element's new box, when it changed. The outline is redrawn on every event (it is this
   * page's own drawing), but the side card's popover is placed from the last reported box, so without
   * this report it stayed where the element had been (28/09/2026). The same `picked` shape with
   * `moved: true`: the words and marks are the ones already reported (not read again), only the boxes
   * — and `hidden` — are measured anew. A tab moves an open pick of that element by it and never opens
   * a pick from it — it may arrive after the tab closed the pick. An element taken out of the page
   * that its selector no longer finds is reported `clipped` at its last box (the draft stays with the
   * side card).
   * @returns {boolean} whether a report was sent.
   */
  function sayPick() {
    if (state !== 'picked' || pickedEl === null || pickedTarget === null) return false
    const target =
      pickedEl.isConnected === false && lastTarget !== null
        ? { ...lastTarget, hidden: 'clipped' }
        : withHidden(reboxed(pickedTarget, pickedEl, levels), pickedEl)
    const key = reportKey(target.rect, target.hidden)
    if (key === reportedBox) return false
    reportedBox = key
    if (target.hidden !== 'clipped' || pickedEl.isConnected !== false) lastTarget = target
    reply(PICK.picked, { target, moved: true, ...here() })
    return true
  }

  /**
   * A picked element the page took out of the page (a re-render, a framework swapping its markup):
   * the ONE element its selector now finds with the same words becomes the pick (runtime 14,
   * acceptance v3 J18/J19). None: the pick stays on the detached element and is reported `clipped`.
   */
  function refind() {
    if (pickedEl === null || pickedTarget === null || pickedEl.isConnected !== false) return
    const { el } = locate(
      { selector: pickedTarget.selector, text: pickedTarget.text, state: 'active', tag: pickedTarget.tag },
      document
    )
    if (el === null) return
    if (current === pickedEl) current = el
    pickedEl = el
    levels = levelElements(el)
    // A widened pick found again starts a new path from where it is now (runtime 19): the old steps
    // below it are elements of the markup that was swapped out.
    if (pickedTarget.level > 0) pickedTarget = widened(levels, 0)
    watchSize(el)
  }

  /**
   * `pick-level {index}` (runtime 19, feature `widen`): the pick moves to that level — the outline, the
   * element the frame check follows, and what is reported. A fresh `picked` (not `moved`) carries the
   * level's own words, selector and marks, the first pick's levels and `level: index`, so the side
   * card's popover, path line and stored target all follow. Before 19 only the outline moved, and no
   * side card asked for it. An index it never reported is ignored.
   * @param {unknown} i
   */
  function toLevel(i) {
    if (state !== 'picked' || typeof i !== 'number' || i % 1 !== 0 || i < 0 || i >= levels.length) return
    const el = levels[i]
    if (el.isConnected === false) return
    draw(el, true)
    pickedEl = el
    pickedTarget = widened(levels, i)
    const target = withHidden(pickedTarget, el)
    reportedBox = reportKey(target.rect, target.hidden)
    lastTarget = target
    watchSize(el)
    reply(PICK.picked, { target, ...here() })
  }

  // ── The frame check (runtime 14): layout that moves without a scroll ──
  //
  // Scroll and resize were the only redraws, so an outline and the side card's popover stayed where
  // the element HAD been when the page moved it otherwise: an image loaded above it, a carousel or a
  // tab switched, an accordion collapsed, a menu closed, an animation ran (acceptance v3 J01–J12,
  // J18, J19, J33). A DOM change, a size change, a transition, an animation, a load or a pointer or
  // focus change starts a check every animation frame — outline redrawn, box reported when it moved —
  // that stops after {@link STILL_FRAMES} frames in which nothing moved.

  let stillLeft = 0
  let checking = false
  let domWatch = null
  let sizeWatch = null

  function kick() {
    stillLeft = STILL_FRAMES
    if (checking) return
    checking = true
    raf(check)
  }

  function check() {
    checking = false
    if (state === 'idle') return
    let moved = false
    if (state === 'picked' && pickedEl !== null) {
      refind()
      const before = drawn
      if (current !== null && overlay !== null) draw(current, true)
      moved = drawn !== before
      if (!gliding()) moved = sayPick() || moved
    }
    if (showing) moved = measure() || moved
    stillLeft = moved ? STILL_FRAMES : stillLeft - 1
    if (stillLeft > 0) {
      checking = true
      raf(check)
    }
  }

  /** @param {MutationRecord[]} records - a change that is not one of the picker's own drawings. */
  function onDom(records) {
    for (const record of records) {
      const node = record.target.nodeType === 1 ? record.target : record.target.parentElement
      if (node === null || !node.hasAttribute(OWN)) return kick()
    }
  }

  /** Watch the size of the picked element (and the page's body, which reflows under it). */
  function watchSize(el) {
    if (sizeWatch === null) return
    try {
      sizeWatch.disconnect()
      sizeWatch.observe(el)
      if (document.body) sizeWatch.observe(document.body)
    } catch {
      /* an element a ResizeObserver cannot watch still has the frame check */
    }
  }

  const reportMove = perFrame(() => {
    // A glide has already said where the element is going; the page is not there yet.
    if (!gliding()) sayPick()
  })

  function onViewport() {
    if (current !== null && overlay !== null) draw(current, state === 'picked')
    if (state === 'picked') reportMove()
  }

  // ── Lockstep (runtime 14): the wheel scrolls in whole frames, the side card told first ──
  //
  // The side card draws its popover, pins and thread card from the boxes this page reports. A scroll
  // the browser runs itself is painted before any script hears of it, so every box the side card drew
  // trailed its element by a frame or two (acceptance v3 B01/B12: up to 125 px in a smooth 300 px
  // scroll, while the outline, drawn in the page, stayed exact). In Edit the page takes the wheel and
  // scrolls itself, one step per frame: it moves to the next step, measures every reported element
  // there, moves back, posts those boxes, and lands on the step in the NEXT frame — by then the side
  // card has drawn them. `pick-scroll-to` (the wheel over a side card box) goes the same way.

  /** The glide in progress: what scrolls, where the wheel asked, the step posted and not landed yet. */
  let glider = null
  let aim = { x: 0, y: 0 }
  let planned = null
  /** Bumped by every new schedule and by a stop, so a frame queued for an older one does nothing. */
  let glideGen = 0

  function gliding() {
    return planned !== null
  }

  function page() {
    return document.scrollingElement || document.documentElement
  }

  /** @param {Element | 'page'} s */
  function posOf(s) {
    return s === 'page'
      ? { x: Number(window.scrollX) || 0, y: Number(window.scrollY) || 0 }
      : { x: Number(s.scrollLeft) || 0, y: Number(s.scrollTop) || 0 }
  }

  /** @param {Element | 'page'} s - the furthest it can scroll, on each axis. */
  function maxOf(s) {
    if (s === 'page') {
      const root = page()
      return {
        x: Math.max(
          0,
          (Number(root.scrollWidth) || 0) - (Number(window.innerWidth) || Number(root.clientWidth) || 0)
        ),
        y: Math.max(
          0,
          (Number(root.scrollHeight) || 0) - (Number(window.innerHeight) || Number(root.clientHeight) || 0)
        )
      }
    }
    return {
      x: Math.max(0, (Number(s.scrollWidth) || 0) - (Number(s.clientWidth) || 0)),
      y: Math.max(0, (Number(s.scrollHeight) || 0) - (Number(s.clientHeight) || 0))
    }
  }

  /** @param {Element | 'page'} s @param {{ x: number, y: number }} at - scrolled there at once. */
  function setPos(s, at) {
    try {
      if (s === 'page') window.scrollTo({ left: at.x, top: at.y, behavior: 'instant' })
      else if (typeof s.scrollTo === 'function') s.scrollTo({ left: at.x, top: at.y, behavior: 'instant' })
      else {
        s.scrollLeft = at.x
        s.scrollTop = at.y
      }
    } catch {
      /* a box that cannot scroll stays where it is */
    }
  }

  /** @param {number} at @param {number} max @param {number} d - whether a scroll by `d` moves at all. */
  const moves = (at, max, d) => (d > 0 ? at < max - 0.5 : d < 0 ? at > 0.5 : false)

  /**
   * What a wheel by (dx, dy) over `target` scrolls: the nearest box around it that scrolls itself and
   * can still go that way, else the page when it can; null when nothing can (the browser keeps it).
   */
  function scrollerFor(target, dx, dy) {
    const root = document.documentElement
    let node =
      target && target.nodeType === 1 ? target : target && target.parentElement ? target.parentElement : null
    for (
      ;
      node && node !== root && node !== document.body && node.nodeType === 1;
      node = node.parentElement
    ) {
      const style = styleOf(node)
      if (style === null) continue
      const max = maxOf(node)
      const at = posOf(node)
      if (/auto|scroll/.test(style.overflowY || style.overflow || '') && moves(at.y, max.y, dy)) return node
      if (/auto|scroll/.test(style.overflowX || style.overflow || '') && moves(at.x, max.x, dx)) return node
    }
    const max = maxOf('page')
    const at = posOf('page')
    return moves(at.y, max.y, dy) || moves(at.x, max.x, dx) ? 'page' : null
  }

  /** Post where every reported element will be once the page is scrolled as it is NOW (a glide step). */
  function sayAll() {
    sayPick()
    if (showing) sayTracked()
  }

  /** The number of the step last posted (`pick-step`), and whether the side card answers `pick-drawn`. */
  let stepSeq = 0
  let answers = false
  let waitTimer = 0

  /** Measure the next step of the glide and post it; false when the glide has arrived. */
  function plan() {
    const now = posOf(glider)
    const next = { x: glideStep(now.x, aim.x), y: glideStep(now.y, aim.y) }
    if (next.x === now.x && next.y === now.y) {
      planned = null
      glider = null
      return false
    }
    planned = next
    setPos(glider, next)
    sayAll()
    setPos(glider, now)
    stepSeq += 1
    reply(PICK.step, { step: stepSeq })
    return true
  }

  /**
   * When the step just posted lands: on the side card's `pick-drawn` for it once the side card has
   * shown it answers (at most {@link LOCKSTEP_WAIT_MS} later), else in the frame after `frames` more.
   */
  function await_(gen, frames) {
    const step = stepSeq
    if (answers) {
      if (waitTimer !== 0) window.clearTimeout(waitTimer)
      waitTimer = window.setTimeout(() => {
        waitTimer = 0
        land(gen, step)
      }, LOCKSTEP_WAIT_MS)
      return
    }
    if (frames === 2) raf(() => raf(() => land(gen, step)))
    else raf(() => land(gen, step))
  }

  /** `pick-drawn {step}`: the side card has drawn that step's boxes — it lands in the next frame. */
  function drawnStep(step) {
    if (typeof step !== 'number') return
    answers = true
    if (planned === null || step !== stepSeq) return
    if (waitTimer !== 0) window.clearTimeout(waitTimer)
    waitTimer = 0
    const gen = glideGen
    raf(() => land(gen, step))
  }

  /** Land the step posted before, redraw the outlines in this same frame, post the next step. */
  function land(gen, step) {
    if (gen !== glideGen || glider === null || planned === null || step !== stepSeq) return
    const s = glider
    setPos(s, planned)
    planned = null
    if (current !== null && overlay !== null) draw(current, state === 'picked')
    if (showing) measure()
    if (plan()) await_(gen, 1)
  }

  function raf(fn) {
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(fn)
    else window.setTimeout(fn, 16)
  }

  /**
   * Scroll `s` by (dx, dy) — or to `to` — in lockstep: a step is measured and posted inside one frame
   * and lands in the next. A wheel event is handed to the page at the start of a frame, so its first
   * step is posted at once; a message arrives between frames, so its first step waits for the next
   * frame to be posted in (posted between frames, it could land before the side card had drawn it —
   * measured 21 px off on the wheel over a popover).
   */
  function glide(s, dx, dy, inFrame, to = null) {
    if (glider !== null && glider !== s) settle()
    const base = glider === s ? aim : posOf(s)
    const max = maxOf(s)
    const want = to === null ? { x: base.x + dx, y: base.y + dy } : to
    glider = s
    aim = { x: Math.max(0, Math.min(max.x, want.x)), y: Math.max(0, Math.min(max.y, want.y)) }
    if (planned !== null || waiting) return
    glideGen += 1
    const gen = glideGen
    if (inFrame) {
      // A frame requested during the wheel's own dispatch still runs in this frame: land in the next.
      if (plan()) await_(gen, 2)
      return
    }
    waiting = true
    raf(() => {
      waiting = false
      if (gen === glideGen && glider !== null && plan()) await_(gen, 1)
    })
  }

  /** A glide asked for between frames, whose first step waits for the next frame. */
  let waiting = false

  /** Land a glide at once (Edit is leaving, or another box takes the wheel). */
  function settle() {
    glideGen += 1
    if (waitTimer !== 0) window.clearTimeout(waitTimer)
    waitTimer = 0
    if (glider !== null && (planned !== null || waiting)) setPos(glider, aim)
    glider = null
    planned = null
    waiting = false
  }

  function onWheel(event) {
    if (event.ctrlKey || event.defaultPrevented) return
    const unit =
      event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? Number(window.innerHeight) || 800 : 1
    const dx = (Number(event.deltaX) || 0) * unit
    const dy = (Number(event.deltaY) || 0) * unit
    if (dx === 0 && dy === 0) return
    const s = scrollerFor(event.target, dx, dy)
    if (s === null) return
    event.preventDefault()
    glide(s, dx, dy, true)
  }

  /** Leave picking's pointer state (its listeners stay, gated by `state`: {@link listen}). */
  function stopPointer() {
    if (timer !== 0) window.clearTimeout(timer)
    timer = 0
    if (cursor !== null) document.documentElement.style.cursor = cursor
    cursor = null
    if (embedSheet !== null && embedSheet.parentNode) embedSheet.parentNode.removeChild(embedSheet)
    embedSheet = null
  }

  /** The picker's stylesheet letting the pointer through embeds while picking (`EMBED_RULE`). */
  let embedSheet = null

  /** Leave picking without a word — the page is going away, or a newer runtime takes over. */
  function reset() {
    stopPointer()
    settle()
    window.removeEventListener('scroll', onViewport, true)
    window.removeEventListener('resize', onViewport)
    window.removeEventListener('wheel', onWheel, WHEEL_OPTIONS)
    for (const name of SETTLERS) window.removeEventListener(name, kick, true)
    if (domWatch !== null) domWatch.disconnect()
    domWatch = null
    if (sizeWatch !== null) sizeWatch.disconnect()
    sizeWatch = null
    lastTarget = null
    if (overlay !== null && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    overlay = null
    drawn = ''
    current = null
    hoverEl = null
    sentEl = null
    levels = []
    pickedEl = null
    pickedTarget = null
    reportedBox = ''
    state = 'idle'
  }

  // ── Tracked elements ──
  //
  // The set the side card gave (`pick-track`) lives until the next `pick-track` or until this document
  // goes away (`pagehide`). It is SHOWN — outlined, measured, reported — only while Edit is on, i.e.
  // between `pick-start` and `pick-stop`/Escape: a `pick-track` that arrives outside Edit is kept and
  // shown by the next `pick-start`, and leaving Edit takes every tracked outline down with the live
  // one. Replies name only ids in the current set, so a frame queued before a new set cannot speak
  // for an id the side card has dropped.

  /** @type {Array<{ id: string, selector: string, text: string, state: string }>} */
  let items = []
  let showing = false
  /** Per id: its outline element, and what was last reported (`x,y,w,h` or `lost:<reason>`). */
  const outlines = new Map()
  const said = new Map()
  /** Per id of the current set: the words last said (`pick-text`), so the same words go once. */
  const told = new Map()
  /** The id a reveal is flashing, while its outline is lit; its timers; a passing outline outside Edit. */
  let lit = null
  let flashTimers = []
  let passing = null

  /** The inline style of a tracked outline around `el`: lit while revealed, else by its state. */
  function lookOf(item, el) {
    const hidden = hiddenOf(el)
    if (item.id === lit) return outlineCss(el, LIT, `rgba(${COLOR},.2)`, hidden)
    const active = item.state === 'active'
    return outlineCss(
      el,
      active ? PICKED : TRACK_LOOK[item.state],
      active ? PICKED_FILL : 'transparent',
      hidden
    )
  }

  /** Say what `el`, found for `item`, reads now — once per change of its words. */
  function tell(item, el) {
    const text = ownText(el)
    if (told.get(item.id) === text) return
    told.set(item.id, text)
    reply(PICK.text, { id: item.id, text })
  }

  /** @returns {boolean} whether any outline was redrawn or any report sent. */
  function measure() {
    if (!showing) return false
    let changed = false
    for (const item of items) {
      const { el } = locate(item, document)
      let node = outlines.get(item.id)
      if (el === null || isHidden(el)) {
        // Never an outline on a guess, and never over a subtree the page keeps to itself.
        if (node !== undefined) {
          node.parentNode.removeChild(node)
          changed = true
        }
        outlines.delete(item.id)
      } else {
        if (node === undefined) {
          node = document.createElement('tracy-pin')
          node.setAttribute(OWN, '')
          node.setAttribute('aria-hidden', 'true')
          outlines.set(item.id, node)
        }
        attach(node, el)
        const css = lookOf(item, el)
        // Written only when it changed: our own write would otherwise wake the observer every frame.
        if (node.style.cssText !== css) {
          node.style.cssText = css
          changed = true
        }
      }
    }
    // While a glide step is posted and not landed, the page is not where the side card was told.
    if (!gliding()) changed = sayTracked() || changed
    return changed
  }

  /**
   * Say, for every tracked item, its words now and where it is (or that it is lost), when changed.
   * @returns {boolean} whether a box or a loss was reported.
   */
  function sayTracked() {
    let sent = false
    for (const item of items) {
      const { el, reason } = locate(item, document)
      if (el !== null) tell(item, el)
      const rect = el === null ? null : box(el)
      const hidden = el === null ? null : hiddenOf(el)
      const key = rect === null ? `lost:${reason}` : reportKey(rect, hidden)
      if (said.get(item.id) === key) continue
      said.set(item.id, key)
      sent = true
      if (rect === null) reply(PICK.lost, { id: item.id, reason })
      else reply(PICK.rect, { id: item.id, rect, ...(hidden === null ? {} : { hidden }) })
    }
    return sent
  }

  const remeasure = perFrame(measure)

  /**
   * Take down the passing outline a flash drew outside Edit. Once Edit is on it follows nothing: left
   * up, it stays where the element was when the flash began and reads as a stray box after a resize.
   */
  function dropPassing() {
    if (passing !== null && passing.parentNode) passing.parentNode.removeChild(passing)
    passing = null
  }

  function show() {
    if (showing || items.length === 0) return
    showing = true
    dropPassing()
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
    measure()
  }

  /** End a flash now: no timer left, nothing lit, no passing outline. */
  function stopFlash() {
    for (const id of flashTimers) window.clearTimeout(id)
    flashTimers = []
    lit = null
    dropPassing()
  }

  /**
   * Flash `el`'s outline `times` times. In Edit the tracked outline itself is lit and drawn again by
   * `measure` (which also follows a smooth scroll); outside Edit a passing outline is drawn for the
   * flash and taken down when it ends, and where the element finally is gets reported then.
   */
  function flash(item, el, times) {
    const step = times === 1 ? 2 * FLASH_STEP : FLASH_STEP
    const paint = (on) => {
      lit = on ? item.id : null
      if (showing) {
        // Edit came on during the flash: the tracked outline is lit now, never the passing one too.
        dropPassing()
        return measure()
      }
      if (!on) return dropPassing()
      if (passing === null) {
        passing = document.createElement('tracy-pin')
        passing.setAttribute(OWN, '')
        passing.setAttribute('aria-hidden', 'true')
        document.documentElement.appendChild(passing)
      }
      passing.style.cssText = lookOf(item, el)
    }
    paint(true)
    for (let i = 1; i < 2 * times; i += 1) {
      const last = i === 2 * times - 1
      flashTimers.push(
        window.setTimeout(() => {
          paint(i % 2 === 0)
          if (last) {
            flashTimers = []
            if (!showing) report(item, el)
          }
        }, i * step)
      )
    }
  }

  /** Outside Edit: say where one revealed element is, once per box (the in-Edit path is `measure`). */
  function report(item, el) {
    if (items.indexOf(item) === -1) return
    const rect = box(el)
    const key = boxKey(rect)
    if (said.get(item.id) === key) return
    said.set(item.id, key)
    reply(PICK.rect, { id: item.id, rect })
  }

  /**
   * `pick-reveal`: show the person one tracked comment. Scroll its element to the middle, flash its
   * outline, say where it now is. An id not in the set is a late message and is ignored; an element
   * that is no longer the one picked is reported lost, and nothing is scrolled to a guess.
   * @param {unknown} id
   */
  function reveal(id) {
    const item = items.find((one) => one.id === id)
    if (item === undefined) return
    stopFlash()
    const { el, reason } = locate(item, document)
    said.delete(item.id)
    if (el === null) {
      if (showing) return measure()
      said.set(item.id, `lost:${reason}`)
      return reply(PICK.lost, { id: item.id, reason })
    }
    const still = calm()
    try {
      if (typeof el.scrollIntoView === 'function')
        el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
    } catch {
      /* a page that cannot scroll still gets its outline flashed where the element is */
    }
    if (!isHidden(el)) flash(item, el, still ? 1 : 2)
    if (showing) measure()
    else report(item, el)
  }

  function hide() {
    stopFlash()
    showing = false
    window.removeEventListener('scroll', remeasure, true)
    window.removeEventListener('resize', remeasure)
    for (const node of outlines.values()) if (node.parentNode) node.parentNode.removeChild(node)
    outlines.clear()
    said.clear()
  }

  /** @param {unknown} list - a `pick-track` message's `items`; out of bounds = the message is ignored. */
  function track(list) {
    const valid = trackItems(list)
    if (valid === null) return
    hide()
    items = valid
    told.clear()
    // Outside Edit the set is only kept (the next `pick-start` shows it) — but its words are said now:
    // a reply sent from the Comments view outside Edit quotes them.
    if (state !== 'idle') show()
    else
      for (const item of items) {
        const { el } = locate(item, document)
        if (el !== null) tell(item, el)
      }
  }

  function cancel() {
    reset()
    hide()
    reply(PICK.cancel)
  }

  // ── Hold (runtime 11): the side card has a box open; clicks close it, they never reach the page ──
  let held = false

  /** A press while held: nobody on the page hears it (no focus move, no drag, no menu). */
  function onHeldPress(event) {
    event.preventDefault()
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
    event.stopPropagation()
  }

  /**
   * A click while held: swallowed like a press — no pick, no link — and told to the side card. Only a
   * click the person made: a page script's `el.click()` (autoplay, analytics) is swallowed and told to
   * nobody, so it cannot close a box (runtime 14, acceptance v3 J-new-2).
   */
  function onHeldClick(event) {
    onHeldPress(event)
    if (event.isTrusted === false) return
    reply(PICK.outside, {
      x: Math.round(Number(event.clientX) || 0),
      y: Math.round(Number(event.clientY) || 0)
    })
  }

  function hold(on) {
    held = on
  }

  // ── Listeners the page cannot get in front of (runtime 15) ──
  //
  // Picking's presses and clicks, the hold's, the move and Escape are heard on the window in the capture
  // phase by listeners added ONCE, when the runtime loads, and switched by `state` and `held`. They were
  // added again on every `pick-start` and `pick-hold`, so after Interactive → Edit they stood behind any
  // window listener the page had added since, and one calling `stopImmediatePropagation` made picking
  // impossible (acceptance v5 JS-v5-new-5; only an earlier listener on the same target can stop another).
  // The wheel, scroll, resize and the frame check's events are still added only in Edit: a wheel
  // listener that may cancel makes every scroll of the page wait for its script, which a page must not
  // pay for outside Edit.

  /** When the person last pressed inside the frame (`pointerdown`, `mousedown`, `touchstart`), in ms. */
  let pressedAt = -Infinity

  function onAnyMove(event) {
    if (state === 'picking') onMove(event)
  }

  // Picked but not (yet) held — the side card's `pick-hold` is a round trip away — a press is still
  // the picker's and is swallowed without a word (runtime 16, acceptance v5 PICK-new-7): the second
  // click of a double-click fell into that gap, followed a link and selected a heading's word.

  function onAnyPress(event) {
    if (event.isTrusted !== false && /^(pointerdown|mousedown|touchstart)$/.test(event.type || ''))
      pressedAt = Date.now()
    if (held || state === 'picked') onHeldPress(event)
    else if (state === 'picking') onPress(event)
  }

  function onAnyRelease(event) {
    if (held || state === 'picked') onHeldPress(event)
    else if (state === 'picking') onRelease(event)
  }

  function onAnyClick(event) {
    if (held) onHeldClick(event)
    else if (state === 'picked') onHeldPress(event)
    else if (state === 'picking') onClick(event)
  }

  /** How long after a press by the person the frame may take the focus without it being taken back. */
  const PRESS_GRACE_MS = 500
  let refocusQueued = false

  /**
   * The frame took the focus while a box is held open, and not from a press of the person (runtime 15,
   * feature `refocus`): a reference to `focus` the page kept from before this runtime loaded cannot be
   * wrapped. The page's element lets go of it and the side card is asked to put it back in the box.
   */
  function onFocus() {
    if (!held || Date.now() - pressedAt < PRESS_GRACE_MS) return
    const active = document.activeElement
    try {
      if (active && active !== document.body && typeof active.blur === 'function') active.blur()
    } catch {
      /* an element that cannot blur still loses the keys once the side card takes the focus back */
    }
    // The window's focus and the element's arrive together: one request per frame.
    if (refocusQueued) return
    refocusQueued = true
    reply(PICK.refocus)
    raf(() => {
      refocusQueued = false
    })
  }

  /** @param {boolean} on - add (true) or remove (false) every listener that lives as long as the runtime. */
  function listen(on) {
    const change = on ? window.addEventListener : window.removeEventListener
    change.call(window, 'mousemove', onAnyMove, true)
    for (const name of PRESSES) change.call(window, name, onAnyPress, true)
    change.call(window, 'pointerup', onAnyRelease, true)
    change.call(window, 'click', onAnyClick, true)
    change.call(window, 'keydown', onKey, true)
    change.call(window, 'focus', onFocus, true)
  }

  /**
   * While a box is open in the side card, the page's own ways of taking the focus do nothing (runtime
   * 14, acceptance v3 J27; runtime 15, acceptance v5 JS-v5-new-4): `focus()` of any element,
   * `window.focus()`, and a field's `select()` and `setSelectionRange()` — a focus trap or a chat widget
   * took 34 of 36 characters typed in the popover; `window.focus()` and `select()` lost 22 and 19 of 26.
   * Wrapped ONCE, when the runtime loads, and switched by `held`: wrapped only while held, a reference
   * the page kept (`const f = HTMLElement.prototype.focus`) was the unwrapped one and took 23 of 26.
   * A reference kept from before this runtime loaded is left to {@link onFocus}. Put back as they were
   * on dispose (unless the page replaced them since).
   * @param {boolean} on
   */
  function guardFocus(on) {
    if (on) {
      const protoOf = (name) => {
        const kind = window[name]
        return typeof kind === 'function' ? kind.prototype : null
      }
      for (const name of ['HTMLElement', 'SVGElement']) wrap(protoOf(name), 'focus')
      for (const name of ['HTMLInputElement', 'HTMLTextAreaElement']) {
        wrap(protoOf(name), 'select')
        wrap(protoOf(name), 'setSelectionRange')
      }
      wrap(window, 'focus')
      return
    }
    for (const { owner, name, own, original, wrapped } of focusKept.splice(0)) {
      try {
        if (owner[name] !== wrapped) continue
        if (own) owner[name] = original
        else delete owner[name]
      } catch {
        /* an owner that cannot be written was never wrapped */
      }
    }
  }

  /**
   * @param {object | null} owner
   * @param {string} name - a method of `owner` that does nothing while held.
   */
  function wrap(owner, name) {
    if (!owner) return
    let original
    try {
      original = owner[name]
    } catch {
      return
    }
    if (typeof original !== 'function') return
    const own = Object.prototype.hasOwnProperty.call(owner, name)
    // Named as the method it stands for, so the page reading `focus.name` sees what it wrote.
    const wrapped = {
      [name](...args) {
        return held ? undefined : original.apply(this, args)
      }
    }[name]
    try {
      owner[name] = wrapped
    } catch {
      return
    }
    focusKept.push({ owner, name, own, original, wrapped })
  }

  /** The page's methods {@link guardFocus} wrapped, to put back on dispose. */
  const focusKept = []

  function begin() {
    if (state === 'picking') return
    reset()
    state = 'picking'
    cursor = document.documentElement.style.cursor || ''
    document.documentElement.style.cursor = 'crosshair'
    embedSheet = document.createElement('style')
    embedSheet.setAttribute(OWN, '')
    embedSheet.textContent = EMBED_RULE
    document.documentElement.appendChild(embedSheet)
    // Presses, clicks, the move and Escape are heard by the listeners added at load (`listen`), on the
    // window in the capture phase (runtime 14, acceptance v3 J24/J25), ahead of the page's.
    window.addEventListener('scroll', onViewport, true)
    window.addEventListener('resize', onViewport)
    window.addEventListener('wheel', onWheel, WHEEL_OPTIONS)
    for (const name of SETTLERS) window.addEventListener(name, kick, true)
    const Watch = window.MutationObserver
    if (typeof Watch === 'function') {
      domWatch = new Watch(onDom)
      domWatch.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      })
    }
    if (typeof window.ResizeObserver === 'function') sizeWatch = new window.ResizeObserver(kick)
    // Ask once, before any scroll, whether the side card answers `pick-drawn` (lockstep): its answer to
    // the step already posted — none yet, so this number lands nothing — says it does.
    reply(PICK.step, { step: stepSeq })
    show()
  }

  return {
    /** Start listening, once, as the runtime loads: before any listener the page adds later. */
    install() {
      listen(true)
      guardFocus(true)
    },
    /**
     * `pick-scroll-to` in Edit, on a loaded page: glide there in lockstep. False when the picker is
     * not in Edit or the page is still loading — the scroll watch's plain jump (with its re-scroll at
     * `load`) then answers.
     * @param {{ x?: unknown, y?: unknown }} message
     */
    glideTo(message) {
      const at = scrollPoint(message.x, message.y)
      if (at === null || state === 'idle' || document.readyState !== 'complete') return false
      glide('page', 0, 0, false, at)
      return true
    },
    /**
     * `pick-wheel` (runtime 16, feature `wheel`): a wheel step over a side card box scrolls the box
     * around that box's element that can still move that way, else the page — in lockstep, like the
     * page's own wheel. Only in Edit.
     * @param {{ dx?: unknown, dy?: unknown, id?: unknown }} message
     */
    wheel(message) {
      const step = wheelMessage(message.dx, message.dy, message.id)
      if (step === null || state === 'idle') return
      let el = null
      if (step.id === undefined) el = pickedEl !== null && pickedEl.isConnected !== false ? pickedEl : null
      else {
        const item = items.find((one) => one.id === step.id)
        if (item !== undefined) el = locate(item, document).el
      }
      const s = scrollerFor(el, step.dx, step.dy)
      if (s !== null) glide(s, step.dx, step.dy, false)
    },
    /** @param {{ kind?: unknown, index?: unknown }} message - already checked for channel, version and sender. */
    handle(message) {
      if (message.kind === PICK.start) begin()
      else if (message.kind === PICK.stop) {
        if (state !== 'idle') cancel()
      } else if (message.kind === PICK.track) track(message.items)
      else if (message.kind === PICK.reveal) reveal(message.id)
      else if (message.kind === PICK.hold) hold(message.on === true)
      else if (message.kind === PICK.drawn) drawnStep(message.step)
      else if (message.kind === PICK.level) toLevel(message.index)
    },
    /** The document is going away: leave without a word and forget the set with it. */
    reset() {
      hold(false)
      reset()
      hide()
      items = []
      told.clear()
    },
    dispose() {
      hold(false)
      listen(false)
      guardFocus(false)
      hide()
      items = []
      if (state === 'idle') return
      cancel()
    }
  }
}

/** How long the page must stay still after a scroll before it says where it is. */
const SCROLL_SETTLE_MS = 150

/**
 * Where the page is scrolled to, said to the one origin the proxy vouched for (`pick-scroll`), and the
 * way back there (`pick-scroll-to`). See `PICK` in `protocol.mjs` for why the side card needs both.
 * @param {string} parentOrigin
 */
function createScrollWatch(parentOrigin) {
  let said = ''
  let timer = 0
  /** The re-scroll waiting for `load`, when one was asked for while the document was loading. */
  let atLoad = null

  function where() {
    const x = Math.max(0, Math.round(Number(window.scrollX) || 0))
    const y = Math.max(0, Math.round(Number(window.scrollY) || 0))
    return { x, y }
  }

  function say() {
    if (timer !== 0) window.clearTimeout(timer)
    timer = 0
    const at = where()
    const key = `${String(at.x)},${String(at.y)}`
    if (key === said) return
    said = key
    post({ channel: CHANNEL, v: VERSION, kind: PICK.scroll, ...at }, parentOrigin)
  }

  function onScroll() {
    if (timer === 0) timer = window.setTimeout(say, SCROLL_SETTLE_MS)
  }

  function go(at) {
    try {
      window.scrollTo({ left: at.x, top: at.y, behavior: 'instant' })
    } catch {
      /* a page that cannot scroll stays where it is */
    }
  }

  function dropLoad() {
    if (atLoad !== null) window.removeEventListener('load', atLoad)
    atLoad = null
  }

  /** @param {{ x?: unknown, y?: unknown }} message - already checked for channel, version and sender. */
  function scrollTo(message) {
    const at = scrollPoint(message.x, message.y)
    if (at === null) return
    dropLoad()
    go(at)
    if (document.readyState === 'complete') return
    const reached = where()
    atLoad = () => {
      dropLoad()
      const now = where()
      // The person scrolled since: the page stays where they went.
      if (now.x === reached.x && now.y === reached.y) go(at)
    }
    window.addEventListener('load', atLoad)
  }

  return {
    install() {
      window.addEventListener('scroll', onScroll)
    },
    /** A new showing of the document (`pageshow`): say where it is, even if it was said before. */
    shown() {
      said = ''
      say()
    },
    say,
    scrollTo,
    dispose() {
      window.removeEventListener('scroll', onScroll)
      if (timer !== 0) window.clearTimeout(timer)
      timer = 0
      dropLoad()
    }
  }
}

/**
 * The view report (runtime 17, `VIEW` in `protocol.mjs`): which page, how far it is scrolled, how large
 * its window is, which colour scheme its visitor prefers — said to the vouched parent origin.
 *
 * Sent when the page is shown, then once things settle after a scroll or a resize, and never twice
 * with the same numbers: a scroll inside a box of the page fires a scroll event here too (capture),
 * moves none of them, and so costs nothing on the wire. Nothing is drawn on the page and nothing on it
 * is read beyond these five values.
 * @param {string} parentOrigin
 */
function createViewer(parentOrigin) {
  // Which document this is: a new one means the page was loaded again, whatever its address says.
  const documentId = Math.round(
    window.performance && typeof window.performance.timeOrigin === 'number'
      ? window.performance.timeOrigin
      : Date.now()
  )
  let timer = 0
  let last = ''

  /** @param {boolean} always - the page was just shown: say so even when nothing moved since the last report. */
  function send(always) {
    timer = 0
    const url = pageAddress()
    if (url === null) return
    const view = {
      url,
      y: Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0)),
      w: Math.round(window.innerWidth),
      h: Math.round(window.innerHeight),
      dark: prefers('(prefers-color-scheme: dark)'),
      t: documentId
    }
    const key = JSON.stringify(view)
    if (!always && key === last) return
    last = key
    post({ channel: CHANNEL, v: VERSION, kind: VIEW.report, ...view }, parentOrigin)
  }

  function forget() {
    if (timer !== 0) window.clearTimeout(timer)
    timer = 0
  }

  return {
    /** The page was shown: on load, or restored from the back/forward cache. */
    shown() {
      forget()
      send(true)
    },
    /** The page scrolled or was resized: report it once it settles. */
    moved() {
      if (timer !== 0) return
      timer = window.setTimeout(() => send(false), VIEW.gap)
    },
    /** The document is going away: leave without a word. */
    reset() {
      forget()
      last = ''
    }
  }
}

/**
 * Install the agent — once per document, whichever generations of it the page includes.
 */
function start() {
  if (window.parent === window) return
  const prior = window.TracyPreviewRuntime
  let legacyOwnsRefresh
  let inherited = null
  let inheritedReport = null
  if (prior !== null && typeof prior === 'object' && typeof prior.version === 'number') {
    if (prior.version >= RUNTIME) return
    legacyOwnsRefresh = prior.legacyOwnsRefresh === true
    inherited = typeof prior.parentOrigin === 'string' ? prior.parentOrigin : null
    inheritedReport = typeof prior.reportOrigin === 'string' ? prior.reportOrigin : null
    try {
      prior.dispose()
    } catch {
      /* an older copy that cannot let go still cannot answer twice: its flag is ours now */
    }
  } else {
    legacyOwnsRefresh = window.TracyPreviewStarted === true
  }
  window.TracyPreviewStarted = true

  const parentOrigin = vouchedOrigin() || inherited
  // Without a picker, the one origin this page may tell where it is (feature `address`); with one,
  // the picker's own `ready` already says it to the vouched origin.
  const reportOrigin = parentOrigin === null ? reportedOrigin() || inheritedReport : null
  const picker = parentOrigin === null ? null : createPicker(parentOrigin)
  const scroll = parentOrigin === null ? null : createScrollWatch(parentOrigin)
  const viewer = parentOrigin === null ? null : createViewer(parentOrigin)
  const features = picker === null ? [] : [...FEATURES]

  function onMessage(event) {
    const message = event.data
    if (message === null || typeof message !== 'object') return
    if (message.channel !== CHANNEL || message.v !== VERSION) return
    if (message.kind === 'refresh') {
      if (!legacyOwnsRefresh) apply(typeof message.mode === 'string' ? message.mode : DEFAULT_MODE)
      return
    }
    if (picker !== null && event.source === window.parent && event.origin === parentOrigin) {
      if (message.kind === PICK.scrollTo) {
        if (!picker.glideTo(message)) scroll.scrollTo(message)
      } else if (message.kind === PICK.wheel) picker.wheel(message)
      else picker.handle(message)
    }
  }

  // With a picker, `ready` goes to the vouched origin only and says which page this is: after a
  // link followed inside the frame, it is the side card's one way to know (see pageAddress).
  function onPageShow() {
    const ready = { channel: CHANNEL, v: VERSION, kind: 'ready', features }
    if (picker === null) {
      post(ready, '*')
      // The anonymous `ready` above stays as it was (a local dsh the proxy did not name keeps its
      // refresh through it); the address goes to the named origin only, in a `ready` of its own.
      if (reportOrigin !== null) {
        announced = pageAddress()
        post({ ...ready, features: [...ADDRESS_FEATURES], ...here() }, reportOrigin)
      }
    } else {
      announced = pageAddress()
      post({ ...ready, ...here() }, parentOrigin)
      scroll.shown()
    }
    if (viewer !== null) viewer.shown()
  }

  function onViewport() {
    if (viewer !== null) viewer.moved()
  }

  /** The address the last `ready` named (feature `route`). */
  let announced = null

  /**
   * A page that changes its own address without loading — a single-page site's `pushState`,
   * `replaceState`, Back or Forward — announces itself again with the new address (runtime 14,
   * feature `route`, acceptance v3 J16: the address bar stayed on the old page, and its pins stayed).
   * Only in a frame the proxy vouched a picker for, or named a report origin for (feature `address`,
   * runtime 18); the page's own history methods run first and unchanged, and are put back as they
   * were on dispose.
   * @param {string} target - the one origin the new address is said to.
   * @param {string[]} named - the features the `ready` names.
   * @returns {() => void} the undo.
   */
  function watchRoute(target, named) {
    const history = window.history
    if (history === null || typeof history !== 'object') return () => {}
    const moved = () => {
      const url = pageAddress()
      if (url === null || url === announced) return
      announced = url
      post({ channel: CHANNEL, v: VERSION, kind: 'ready', features: named, url }, target)
    }
    const undo = []
    for (const name of ['pushState', 'replaceState']) {
      const original = history[name]
      if (typeof original !== 'function') continue
      const own = Object.prototype.hasOwnProperty.call(history, name)
      const wrapped = function route(...args) {
        const out = original.apply(this, args)
        moved()
        return out
      }
      try {
        history[name] = wrapped
      } catch {
        continue
      }
      undo.push(() => {
        if (history[name] !== wrapped) return
        if (own) history[name] = original
        else delete history[name]
      })
    }
    window.addEventListener('popstate', moved)
    return () => {
      for (const one of undo) one()
      window.removeEventListener('popstate', moved)
    }
  }

  let unroute = () => {}

  function onPageHide() {
    if (picker !== null) picker.reset()
    if (scroll !== null) scroll.say()
    if (viewer !== null) viewer.reset()
  }

  const installs = !(legacyOwnsRefresh && picker === null && reportOrigin === null)

  function dispose() {
    unroute()
    window.removeEventListener('message', onMessage)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('scroll', onViewport, true)
    window.removeEventListener('resize', onViewport)
    if (viewer !== null) viewer.reset()
    if (picker !== null) picker.dispose()
    if (scroll !== null) scroll.dispose()
  }

  window.TracyPreviewRuntime = { version: RUNTIME, dispose, legacyOwnsRefresh, parentOrigin, reportOrigin }
  // Next to the old agent and with no picker, this copy would add nothing but a second `ready` —
  // unless it has an address to say that the old agent never says (`reportOrigin`).
  if (!installs) return
  window.addEventListener('message', onMessage)
  // A page restored from the back/forward cache never runs its scripts again, so it would be a
  // stranger to a side card that reloaded in the meantime. `pageshow` fires in both cases.
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('pagehide', onPageHide)
  // Only a page with a picker reports where it is; the others have no parent to tell.
  if (viewer !== null) {
    // Capture, so the scroll of a box inside the page is heard too (it reports nothing new).
    window.addEventListener('scroll', onViewport, true)
    window.addEventListener('resize', onViewport)
  }
  if (scroll !== null) scroll.install()
  if (picker !== null) {
    picker.install()
    unroute = watchRoute(parentOrigin, features)
  } else if (reportOrigin !== null) unroute = watchRoute(reportOrigin, [...ADDRESS_FEATURES])
  onPageShow()
}

start()
