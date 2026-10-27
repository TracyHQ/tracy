/**
 * The live-preview wire contract, written once and read by three sides.
 *
 * WHO READS THIS. The in-page agent (`src/runtime.mjs`, emitted into both CMS themes), the side
 * card's Browser tab (`vendor/tracy/dsh-better-sidebar`, which gets a generated copy of these
 * constants), and the build that emits both. Three programs in three trees agreeing on four
 * strings is exactly the shape that drifts in silence: a renamed channel does not fail, it simply
 * stops refreshing, and the page still looks alive because the person can still press reload.
 * So the strings live HERE and the other two copies are GENERATED from this file and gated.
 *
 * WHY A CHANNEL NAME AND A VERSION. A framed page receives every `postMessage` anyone sends it,
 * including from libraries the customer's site loads. `channel` is how a message is recognised as
 * ours; `v` is how an old theme and a new side card decline to half-understand each other — a
 * mismatch is ignored, never guessed at.
 */

/** The `channel` field every message on this contract carries. */
export const CHANNEL = 'tracy-preview'

/**
 * The contract's version. Bump it when a message's SHAPE changes, never for a new mode: an
 * unknown mode already degrades to a full refresh, while an unknown shape cannot.
 */
export const VERSION = 1

/**
 * What the side card can ask a page to do, cheapest first.
 *
 * `style` is the whole point of this contract: a stylesheet is swapped in place, so the document
 * is never reloaded, nothing flashes, and the visitor keeps their scroll position, their open menu
 * and whatever they had typed. Design work — which is most of what an agent does to a page — lands
 * entirely in this mode.
 *
 * `full` reloads the document. It is the honest answer for a change in PHP, a template or the
 * database, where the server has to render the page again and no amount of client cleverness can
 * avoid it. Even then it beats what the side card did before: the frame is kept, so the browser
 * restores the scroll position itself instead of dropping the person at the top of the page.
 *
 * There is deliberately no mode between the two. Swapping `<body>` out from under a running page
 * reads well in a demo and breaks on a real CMS: the scripts that built the menu, the slider and
 * the cookie bar do not run again, and the ones that do run twice. A mode that works nine times in
 * ten is worse than one that reloads, because the tenth time is a bug report about the customer's
 * site and not about the preview.
 */
export const MODES = Object.freeze(['style', 'full'])

/** The mode used for anything this contract cannot classify. */
export const DEFAULT_MODE = 'full'

/**
 * One refresh request, as the side card sends it.
 * @param {string} mode - one of {@link MODES}; anything else is sent as {@link DEFAULT_MODE}.
 * @returns {{ channel: string, v: number, kind: 'refresh', mode: string }}
 */
export function refreshMessage(mode) {
  return { channel: CHANNEL, v: VERSION, kind: 'refresh', mode: MODES.includes(mode) ? mode : DEFAULT_MODE }
}

/**
 * Whether a received value is a message on this contract, of one kind.
 *
 * Deliberately total and deliberately dull: it is handed whatever a page or a frame posted, so it
 * assumes nothing about the value's type and never throws.
 * @param {unknown} value - the `data` of a received message event.
 * @param {string} kind - the kind the reader is willing to act on.
 * @returns {boolean}
 */
export function isMessage(value, kind) {
  if (value === null || typeof value !== 'object') return false
  const message = /** @type {{ channel?: unknown, v?: unknown, kind?: unknown }} */ (value)
  return message.channel === CHANNEL && message.v === VERSION && message.kind === kind
}

/**
 * What a page can do beyond refreshing, announced in its `ready` message. A side card lights a
 * feature only when the page names it: an older theme never names `pick`, so the Comment button
 * never appears over a page that could not answer it. A feature is additive and never bumps
 * {@link VERSION} — the shape of every existing message stays exactly as it was.
 *
 * `track` (runtime 5): the page keeps several already-picked elements outlined and reports where
 * they are (`pick-track` → `pick-rect` / `pick-lost`, see {@link PICK}). A side card that sees `pick`
 * without `track` is talking to a runtime-4 page: one pick at a time, no `pick-track`.
 *
 * `reveal` (runtime 7): the page answers `pick-reveal` and knows the tracked state `pending`. A side
 * card that sees `track` without `reveal` is talking to a runtime-5 or runtime-6 page, which refuses
 * a whole `pick-track` set carrying `pending` — so it sends `saved` there instead — and ignores
 * `pick-reveal`.
 *
 * `text` (runtime 9): the page says what a tracked element reads NOW (`pick-text`, see {@link PICK}).
 * A side card that sees `reveal` without `text` is talking to a runtime-7 or runtime-8 page, which
 * reports boxes only: it then sends the words from pick time, as it always did.
 *
 * `hold` (runtime 11, Brian 29/09 23:08): the page answers `pick-hold` (see {@link PICK}). A side card
 * that sees `text` without `hold` is talking to a runtime-9-or-older page: it keeps shielding the
 * frame itself while a box is open (which also stops the wheel there).
 *
 * `scroll` (runtime 11): the page says where it is scrolled to (`pick-scroll`) and goes back there
 * when asked (`pick-scroll-to`, see {@link PICK}). A side card that sees `text` without `scroll` is
 * talking to a runtime-9 page, which ignores `pick-scroll-to`: a recovery reload there opens at the
 * top, as it always did.
 *
 * `follow` (runtime 12, Brian 30/09/2026): the page's outlines stay on their elements in every painted
 * frame while the page scrolls — an element that moves with the page's scroll is outlined in the
 * page's coordinates instead of the viewport's, so the browser scrolls both together. Nothing on the
 * wire changes; a side card that sees `scroll` without `follow` is talking to a runtime-11 page, whose
 * outline trails a scroll step behind its element, and needs to do nothing about it.
 *
 * Runtime 14 (stage 6 acceptance v3, 30/09/2026; decided by the agent while Brian slept) adds three:
 *
 * `lockstep`: the side card's boxes (popover, pins, thread card) stay on their elements while the page
 * scrolls by the wheel or by `pick-scroll-to`. In Edit the page takes the wheel itself (unless a box
 * under the pointer can still scroll that way on its own — a nested list keeps its native scroll) and
 * scrolls in whole animation frames: it measures where every reported element WILL be, posts those
 * boxes first (`picked {moved}`, `pick-rect`), and applies the scroll one frame later, so the side
 * card has drawn its boxes by the frame in which the page moves (measured on a Chrome screencast:
 * `tasks/evidence/comment-people/r5-pick/`). After the boxes of each step the page posts
 * `pick-step {step}` (a whole number, rising); a side card that answers `pick-drawn {step}` once it has
 * drawn those boxes (after its render has committed) makes the page land each step only on that answer
 * — a busy side card then slows the scroll instead of falling behind it (measured under heavy load:
 * without the answer the boxes trailed by up to 105 px). A `pick-step` with the last number posted also
 * follows every `pick-start`, before any scroll, so the side card's answer is known before the first
 * step. The page waits at most
 * {@link LOCKSTEP_WAIT_MS} for an answer, and without any answer yet it lands a frame after posting. A
 * side card that sees `follow` without `lockstep` is talking to a runtime-13 page, whose boxes trail
 * the page by one or two frames while it scrolls, and needs to do nothing about it.
 *
 * `name`: a picked element with no words of its own carries `name`, what a person calls it (see
 * `PickTarget`). A side card that sees `lockstep` without `name` names such an element by its image or
 * the words inside it, as before.
 *
 * `clip`: `hidden` rides on `pick-rect` and on a picked target (see {@link HIDDEN_REASONS}). Without
 * `clip`, an element a nested box scrolled out of sight is still reported as a plain box.
 *
 * `route`: the page announces itself again (`ready`, with its new `url`) when it changes its own
 * address without loading — `history.pushState`, `replaceState`, Back or Forward inside a single-page
 * site (acceptance v3 J16) — so the address bar and the pins follow. A fragment alone names no other
 * page and is not announced. Without `route`, a `ready` comes only with a document.
 *
 * Runtime 15 (stage 6 acceptance v5, 30/09/2026; decided by the agent while Brian slept) adds one:
 *
 * `refocus`: while a box is held open (`pick-hold`), the page's own ways of taking the focus do nothing
 * — `focus()` of any element (also through a reference the page kept after the runtime loaded),
 * `window.focus()`, and the `select()` / `setSelectionRange()` of its fields — and when the frame gains
 * the focus anyway (a reference kept from before the runtime loaded) with no press of the person in the
 * frame just before, the page lets go of it and posts `pick-refocus` (page → side card, no fields, to
 * the vouched origin only): the side card puts the focus back in the open box. A side card that sees
 * `route` without `refocus` is talking to a runtime-14 page, which guards `focus()` alone and only
 * through the prototype.
 *
 * Runtime 16 (stage 6 acceptance v5 pick, 30/09/2026; decided by the agent while Brian slept) adds two:
 *
 * `pins60`: a `pick-track` set may hold up to {@link TRACK_LIMITS}`.items` (60) elements. A page that
 * does not name it refuses a set of more than `TRACK_LIMITS.itemsBefore16` (12) whole, so a side card
 * sends it at most that many (acceptance v5 PICK-new-13: the 13th newest comment on a page lost its pin).
 *
 * `wheel`: the page answers `pick-wheel {dx, dy, id?}` (see {@link PICK}) — the wheel over a side card
 * box scrolls the box its element sits in, not only the page (acceptance v5 B04: over a popover that
 * followed a row of a nested list, the wheel scrolled the page 40 px instead of the list). A side card
 * that sees `refocus` without `wheel` is talking to a runtime-15 page and sends `pick-scroll-to`, as
 * before.
 *
 * Runtime 19 (Akemi's edit-mode review E2, 01/10/2026) adds one:
 *
 * `widen`: `pick-level {index}` moves the PICK, not only its outline — the page answers with a fresh
 * `picked` (not `moved`) describing that level, carrying the first pick's `levels` and `level: index`
 * — and `levels` lists every ancestor that draws a box of its own, not only those carrying a mark (see
 * `levelElements` in `src/pick.mjs`). A side card that sees `wheel` without `widen` shows the path but
 * offers no step to press.
 */
export const FEATURES = Object.freeze([
  'pick',
  'track',
  'reveal',
  'text',
  'hold',
  'scroll',
  'follow',
  'lockstep',
  'name',
  'clip',
  'route',
  'refocus',
  'pins60',
  'wheel',
  'widen'
])

/**
 * What a page WITHOUT a picker announces when the site proxy named Tracy's own origin on its script
 * tag (`data-report-origin`, runtime 18; Brian 30/09/2026, EmDash `capiel1647`).
 *
 * `address`: the page says its address (`ready` with `url`, built by the same `pageAddress` a picker
 * page uses — no credentials, no fragment) to that origin exactly, and to no one else. A page the
 * proxy served without the picker — a seat whose session did not reach the site's hostname, a seat
 * that may not edit, a lapsed continuation — used to say nothing but an anonymous `ready`, so a link
 * followed inside the frame left the Browser tab's address bar, the dsh page's `page=` and the
 * Comments view on the page the tab had opened (measured on WordPress, Joomla and EmDash alike).
 * Nothing of the page's content goes out with it, which is why it needs no ticket: the address is
 * the one thing the side card would show for the page anyway.
 *
 * `route`: as for a picker page, the address is said again after `pushState`, `replaceState`, Back
 * or Forward inside a single-page site.
 *
 * Not in {@link FEATURES}: those are what a PICKER page offers, and a side card reads `pick` there to
 * light Comment. A side card that reads only `url` off every `ready` needs nothing new.
 */
export const ADDRESS_FEATURES = Object.freeze(['address', 'route'])

/**
 * The picker's kinds. The side card sends start/stop/level/track; the page sends hover/picked/cancel
 * and rect/lost.
 *
 * `pick-start` puts the page into picking: the pointer outlines the element under it (`pick-hover`),
 * a click fixes it (`picked`), Escape or `pick-stop` leaves (`pick-cancel`). `pick-level` moves the
 * pick to one of the levels the page reported — by index into that list, so the side card still never
 * names an element of the page (outline only before runtime 19; the pick and a fresh `picked` with
 * feature `widen`).
 *
 * Two optional fields ride on what the page sends, both additive (no {@link VERSION} bump):
 * - `url` — the page's own address (at most 2048 characters, else left out) on `pick-hover`,
 *   `picked`, and on `ready` from a page with a picker, which then goes to the vouched origin, not
 *   `'*'`. The side card's address bar does not follow a link clicked inside the frame; this does.
 * - `moved: true` on a `picked` sent again while the element stays picked and the page scrolled or
 *   resized: the same target with its boxes measured anew, at most once per animation frame. It
 *   moves an open pick of that element and must never open one — it can arrive after the side card
 *   closed the pick.
 *
 * TRACKED ELEMENTS (feature `track`, runtime 5). The side card keeps comments on elements already
 * picked; the page, which alone can see them, outlines them and says where they are:
 * - `pick-track {items:[{id, selector, text, state}]}` (side card → page) REPLACES the tracked set;
 *   `items: []` tracks nothing. Validated whole by {@link trackItems}: a message with one bad item is
 *   ignored, never half-applied. `id` is the side card's opaque key, `selector`/`text` are what the
 *   pick reported (`PickTarget.selector` / `.text`), `state` picks the outline's colour.
 * - `pick-rect {id, rect}` (page → side card): where one tracked element is, in the page's viewport
 *   (a `PickRect`). Sent for every found item right after `pick-track` (and after a `pick-start` that
 *   shows a stored set), then again only when its box changed — after a scroll, a resize or a DOM
 *   change, at most once per animation frame for the whole set.
 * - `pick-lost {id, reason}` (page → side card): the element is no longer the one that was picked,
 *   so the page draws nothing for it. `missing`: the selector matches nothing; `many`: it matches
 *   more than one element; `changed`: it matches one, but that element's text no longer starts with
 *   the first {@link TRACK_LIMITS}`.match` characters of `text` (an element whose stored text is empty
 *   is compared by the tag its selector names). The words are checked only for `saved`/`active`
 *   items: once a comment went to the agent (`sent|working|done|failed|asked`) its words are meant to
 *   change, so it is held by its selector alone and is never `changed`; sent again as `saved` or
 *   `active`, it is checked by its words again. A tracked outline is NEVER drawn on another element.
 *   A later `pick-rect` for the same id means the check passes again (a lazily rendered block).
 * Both page replies go to the vouched origin only, and only for an id in the current set.
 *
 * REVEAL (runtime 7). `pick-reveal {id}` (side card → page, built by {@link revealMessage}) shows
 * the person one tracked comment: the page scrolls that element to the middle of its viewport
 * (`scrollIntoView({block:'center'})`, smooth unless the visitor prefers reduced motion), flashes its
 * outline twice in about 600 ms (once, with reduced motion), and reports `pick-rect` for it at once —
 * or `pick-lost`, when it is no longer the element picked. It works in and out of Edit: outside Edit
 * the flash is drawn on a passing outline that goes when it ends. An id not in the current set is
 * ignored, as a late message is. Feature `reveal` announces it; a runtime-5 page has no branch for the
 * kind and ignores it, which costs the person a scroll and nothing else.
 *
 * THE WORDS NOW (runtime 9, stage-5 acceptance F16). `pick-text {id, text}` (page → side card): what
 * one tracked element reads now, by the rule of `PickTarget.text` (the {@link INLINE_TAGS} words,
 * whitespace-collapsed, cut at `LIMITS.text` ending in `…`, empty for a form control, code or a
 * `[data-tracy-private]` subtree). A pick's `text` is frozen at the click; after Tracy changed the
 * element, a reply or a resend quoted the old words as the `find` of the next write. Sent for every
 * element found (never for a `pick-lost` one) right after each `pick-track` — in Edit AND outside it,
 * drawing nothing and reporting no box there — and, in Edit, again whenever the words change (the
 * DOM watch that moves the boxes). The same words are never said twice for one id of one set. To the
 * vouched origin only, and only for an id in the current set. A separate kind, not a field on
 * `pick-rect`: the words must reach the side card outside Edit too, where no box is reported.
 *
 * HOLD (runtime 11, feature `hold`). `pick-hold {on}` (side card → page, built by {@link holdMessage})
 * says a box is open in the side card — a comment popover or a thread card. While `on` is true, the
 * page swallows EVERY press and click (pointerdown, mousedown, click: `preventDefault` and
 * `stopImmediatePropagation` in the window's capture phase, before the picker or the site hear it —
 * no pick, no link, no menu), whatever the picker's state, and reports each click as
 * `pick-outside {x, y}` (page → side card, viewport pixels, to the vouched origin only). The side
 * card decides: close the box, or flash it when words are typed in it. The wheel, scrolling, keys
 * and hover pass untouched — the person keeps scrolling the page while writing. `on: false` lets go;
 * so do `pagehide` and a newer runtime taking over. Runtime 15 (feature `refocus`) also keeps the
 * focus out of the page while held and posts `pick-refocus` (page → side card, no fields) when the
 * frame took it anyway; the side card puts it back in the open box.
 *
 * WHERE THE PAGE IS (runtime 11, feature `scroll`, Brian 29/09/2026). The side card cannot read a cross-origin frame's
 * scroll, and a load it starts itself at a new address — the recovery of a page that came back
 * without its picker — is a new navigation, which the browser opens at the TOP (measured 3085 → 0).
 * - `pick-scroll {x, y}` (page → side card): the document's scroll offset in CSS pixels, whole and
 *   non-negative. Sent right after `ready`, then once the page settles after scrolling (not per
 *   event), and at `pagehide`; never the same place twice in a row. In and out of Edit: it says
 *   nothing about the customer's content, and goes to the vouched origin only.
 * - `pick-scroll-to {x, y}` (side card → page, built by {@link scrollToMessage}): scroll there at
 *   once, and again at `load` when the document was still loading and the person has not scrolled
 *   since (a page whose images are not in yet is too short to reach the place).
 *
 * THE WHEEL OVER A BOX (runtime 16, feature `wheel`). `pick-wheel {dx, dy, id?}` (side card → page,
 * built by {@link wheelMessage}): one wheel step, in the page's CSS pixels, made over a side card box
 * (the popover, a thread card, a pin). The page scrolls the nearest box around that element that can
 * still move that way — a nested list, a drawer — or else the page, in lockstep as its own wheel does.
 * `id` names a tracked item (a thread card, a pin); absent, the open pick (the popover). Only in Edit;
 * an element not found scrolls the page.
 */
export const PICK = Object.freeze({
  start: 'pick-start',
  stop: 'pick-stop',
  level: 'pick-level',
  hover: 'pick-hover',
  picked: 'picked',
  cancel: 'pick-cancel',
  track: 'pick-track',
  rect: 'pick-rect',
  lost: 'pick-lost',
  reveal: 'pick-reveal',
  text: 'pick-text',
  hold: 'pick-hold',
  outside: 'pick-outside',
  scroll: 'pick-scroll',
  scrollTo: 'pick-scroll-to',
  step: 'pick-step',
  drawn: 'pick-drawn',
  refocus: 'pick-refocus',
  wheel: 'pick-wheel'
})

/** How long a page in lockstep waits for `pick-drawn` before it lands a step anyway, in milliseconds. */
export const LOCKSTEP_WAIT_MS = 200

/**
 * The outline colours a tracked element can wear. `saved` a comment kept, not sent · `active` the one
 * whose popover is open (a solid outline, as the live pick) · `sent` / `working` handed to the agent
 * / being worked on · `done` changed · `failed` a write for it failed · `asked` the turn ended without
 * a write for it · `pending` (runtime 7) a comment not sent yet, in a thin grey outline — what the
 * side card sends for an unsent comment from stage 4 on; `saved` keeps its colour for older side
 * cards. Like `saved` and `active`, `pending` is held by its words. There is no `resolved`: a
 * resolved comment is not drawn at all, so a set naming it is refused like any unknown state. A
 * runtime-5 page refuses a set carrying `pending` the same way, whole — send it only to a page whose
 * `ready` names `reveal`.
 */
export const TRACK_STATES = Object.freeze([
  'saved',
  'active',
  'sent',
  'working',
  'done',
  'failed',
  'asked',
  'pending'
])

/** Why a tracked element is not reported where it was (`pick-lost`). */
export const LOST_REASONS = Object.freeze(['missing', 'many', 'changed'])

/**
 * Why an element the page still finds must not be drawn over (runtime 14, feature `clip`; stage 6
 * acceptance v3 B04, B06, B13, PICK-new-4). Rides as `hidden` on a `pick-rect` and on the target of a
 * `picked` (the first one and every `moved` one); absent means the element can be seen.
 * - `clipped`: nothing of it can be seen — it is not laid out (`display:none`, taken out of the page
 *   and not found again), not painted (`visibility:hidden`, transparent), a box between it and the
 *   viewport that scrolls itself or cuts its overflow has it outside its visible area, or it sits in a
 *   fixed box (an offcanvas, a drawer) that slid it out of the viewport. The page draws no outline; the
 *   side card draws no pin, and a popover or thread card for it waits at the frame's top corner with
 *   its words (as for an element a page cannot find) until the element is seen again.
 * - `covered`: the corner a pin points at (the element's top-left) lies under another box of the page
 *   — a fixed bar such as WordPress's admin bar, an open menu. The side card draws no pin there; the
 *   popover and the thread card stay. The page's own outline is painted in the element's stacking
 *   layer, so a fixed bar above the element covers the outline too.
 */
export const HIDDEN_REASONS = Object.freeze(['clipped', 'covered'])

/**
 * Bounds on `pick-track`: at most `items` elements (`itemsBefore16` for a page that does not name
 * `pins60`, runtime 15 and older), an `id` of at most `id` characters, a `selector`
 * of at most `selector`; `match` is how many leading characters of the stored text must still begin
 * the element's text. Separate from {@link LIMITS}, which bound one picked element.
 */
export const TRACK_LIMITS = Object.freeze({ items: 60, itemsBefore16: 12, id: 64, selector: 512, match: 40 })

/**
 * The tracked set a `pick-track` message carries, or null when any part of it is out of bounds.
 * Total: handed whatever a parent posted, it assumes nothing and never throws.
 * @param {unknown} items - the message's `items`.
 * @returns {Array<{ id: string, selector: string, text: string, state: string }> | null}
 */
export function trackItems(items) {
  if (!Array.isArray(items) || items.length > TRACK_LIMITS.items) return null
  const out = []
  const ids = new Set()
  for (const item of items) {
    if (item === null || typeof item !== 'object') return null
    const { id, selector, text, state } = item
    if (typeof id !== 'string' || id === '' || id.length > TRACK_LIMITS.id || ids.has(id)) return null
    if (typeof selector !== 'string' || selector === '' || selector.length > TRACK_LIMITS.selector)
      return null
    if (typeof text !== 'string' || text.length > LIMITS.text) return null
    if (typeof state !== 'string' || !TRACK_STATES.includes(state)) return null
    ids.add(id)
    out.push({ id, selector, text, state })
  }
  return out
}

/**
 * One `pick-track` request, as the side card sends it into a page.
 * @param {unknown} items - the whole set to track; `[]` tracks nothing.
 * @returns {{ channel: string, v: number, kind: 'pick-track', items: Array<{ id: string, selector: string, text: string, state: string }> } | null}
 *   null when {@link trackItems} refuses the set (the page would ignore it).
 */
export function trackMessage(items) {
  const valid = trackItems(items)
  return valid === null ? null : { channel: CHANNEL, v: VERSION, kind: PICK.track, items: valid }
}

/**
 * One `pick-reveal` request, as the side card sends it into a page.
 * @param {unknown} id - a tracked item's id (a non-empty string of at most `TRACK_LIMITS.id`).
 * @returns {{ channel: string, v: number, kind: 'pick-reveal', id: string } | null} null for an id
 *   no tracked item could carry (the page would ignore it).
 */
export function revealMessage(id) {
  if (typeof id !== 'string' || id === '' || id.length > TRACK_LIMITS.id) return null
  return { channel: CHANNEL, v: VERSION, kind: PICK.reveal, id }
}

/**
 * A scroll offset a `pick-scroll-to` may carry, or null: two finite, non-negative numbers, rounded to
 * whole CSS pixels.
 * @param {unknown} x
 * @param {unknown} y
 * @returns {{ x: number, y: number } | null}
 */
export function scrollPoint(x, y) {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
    return null
  if (x < 0 || y < 0) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * One `pick-scroll-to` request, as the side card sends it into a page.
 * @param {unknown} x
 * @param {unknown} y
 * @returns {{ channel: string, v: number, kind: 'pick-scroll-to', x: number, y: number } | null}
 *   null for a place no page could be scrolled to.
 */
export function scrollToMessage(x, y) {
  const at = scrollPoint(x, y)
  return at === null ? null : { channel: CHANNEL, v: VERSION, kind: PICK.scrollTo, ...at }
}

/** The largest wheel step a `pick-wheel` may carry, in CSS pixels either way. */
const WHEEL_MAX = 20000

/**
 * One `pick-wheel` step, as the side card sends it into a page (runtime 16, feature `wheel`).
 * @param {unknown} dx - horizontal step, CSS pixels of the page.
 * @param {unknown} dy - vertical step.
 * @param {unknown} [id] - the tracked item the box belongs to; absent (or null) for the open pick.
 * @returns {{ channel: string, v: number, kind: 'pick-wheel', dx: number, dy: number, id?: string } | null}
 *   null for a step no page would take (not finite, nothing, beyond {@link WHEEL_MAX}) or an id no
 *   tracked item could carry.
 */
export function wheelMessage(dx, dy, id) {
  if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy))
    return null
  const x = Math.round(dx)
  const y = Math.round(dy)
  if ((x === 0 && y === 0) || Math.abs(x) > WHEEL_MAX || Math.abs(y) > WHEEL_MAX) return null
  const message = { channel: CHANNEL, v: VERSION, kind: PICK.wheel, dx: x, dy: y }
  if (id === undefined || id === null) return message
  if (typeof id !== 'string' || id === '' || id.length > TRACK_LIMITS.id) return null
  return { ...message, id }
}

/**
 * How much of the page one picked element may carry out. The page is the customer's; the side
 * card needs enough to name the element and its source, not a copy of the document.
 */
export const LIMITS = Object.freeze({ text: 300, marks: 12, levels: 8, domPath: 8 })

/**
 * How much of a container's subtree text `PickTarget.inside` may carry. Kept out of {@link LIMITS} on
 * purpose: `LIMITS` is emitted into the side card's generated contract, and `inside` is an additive
 * field of the page's report that the side card does not yet read.
 */
export const INSIDE_MAX = 200

/**
 * The tags whose words read as part of the element around them — HTML phrasing content that
 * carries text. `PickTarget.text` is the picked element's own text nodes PLUS the text of these
 * descendants, recursively; any other descendant element (a heading, a paragraph, a list, an image)
 * stands in for one space and its words stay its own. So `<h2><a>Hello</a></h2>` says "Hello",
 * `<p>Some <strong>bold</strong> words</p>` says "Some bold words", and a card `<div><h3>T</h3>
 * <p>P</p></div>` says "" — picking a container never concatenates its blocks. `<br>` is one space,
 * `<wbr>` nothing.
 *
 * By tag, never by computed style: the resolver (`apps/tracy-web/src/sites/content-locate.js`
 * `ownTextOf`) splits STORED HTML by the same list to build what it compares against, and stored
 * HTML has no style. Its copy of this list is held equal by `apps/tracy-web/test/content-locate.test.mjs`.
 */
export const INLINE_TAGS = Object.freeze([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var'
])

/**
 * `pick-hold {on}` (runtime 11): hold every click on the page while a box is open in the side card.
 * @param {boolean} on
 */
export function holdMessage(on) {
  return { channel: CHANNEL, v: VERSION, kind: PICK.hold, on: on === true }
}

/**
 * THE VIEW REPORT (runtime 17). Where the page is: which page, how far it is scrolled, how large its
 * window is and which colour scheme its visitor prefers. Said to the vouched parent origin only, like
 * every pick reply, because an address is the person's own business.
 *
 * WHAT IT IS FOR. The chat beside the Browser tab draws the same page again on the server, at that
 * size and position, and hands the agent the picture beside the customer's message — so "make this
 * bigger" arrives with a "this" (`tracy-site-tools` `view.mjs`). The side card does not read it: no
 * feature name, no fork change, nothing added to what the side card's generated contract emits. The
 * chat finds the frame the message came from and reads it itself ({@link viewFrom}). An older
 * runtime never sends it, and costs the customer the picture and nothing else.
 *
 * `{ channel, v, kind: 'view', url, y, w, h, dark, t }`
 * - `url` — the page's own address, cleaned the way `ready.url` is (no credentials, no `#fragment`,
 *   no secret-looking parameter, at most 2048 characters).
 * - `y` — how far the page is scrolled, in whole CSS pixels; `w` × `h` — the window, in CSS pixels
 *   (at any zoom of the Browser tab: the frame keeps its layout box and the tab only scales it).
 * - `dark` — whether the visitor's browser prefers a dark colour scheme.
 * - `t` — which document this is (its time origin, whole milliseconds). A new one means the page was
 *   loaded again — a link followed, or the tab reloaded after the agent's edit — so a picture of the
 *   old one is no longer the page.
 * Sent once when the page is shown, then after a scroll or a resize, at most once per
 * {@link VIEW}`.gap` milliseconds and only when something above changed.
 */
export const VIEW = Object.freeze({ report: 'view', gap: 250 })

/** The longest page address a view report carries. */
const VIEW_URL_LIMIT = 2048

/**
 * A view report read from what a frame posted, or null when it is not one. Total: it is handed
 * whatever a page posted, so it assumes nothing and never throws. Numbers are checked here for shape
 * only; what a picture is drawn for is the host's decision (`tracy-site-tools` `readViewReport`).
 * @param {unknown} value - the `data` of a received message event.
 * @returns {{ url: string, y: number, w: number, h: number, dark: boolean, t: number } | null}
 */
export function viewFrom(value) {
  if (!isMessage(value, VIEW.report)) return null
  const { url, y, w, h, dark, t } = /** @type {Record<string, unknown>} */ (value)
  if (typeof url !== 'string' || url === '' || url.length > VIEW_URL_LIMIT) return null
  if (!Number.isInteger(y) || /** @type {number} */ (y) < 0) return null
  if (!Number.isInteger(w) || /** @type {number} */ (w) <= 0) return null
  if (!Number.isInteger(h) || /** @type {number} */ (h) <= 0) return null
  if (!Number.isInteger(t) || /** @type {number} */ (t) < 0) return null
  return {
    url,
    y: /** @type {number} */ (y),
    w: /** @type {number} */ (w),
    h: /** @type {number} */ (h),
    dark: dark === true,
    t: /** @type {number} */ (t)
  }
}

/**
 * One picker request, as the side card sends it into a page.
 * @param {string} kind - `pick-start`, `pick-stop` or `pick-level`; anything else is not a request.
 * @param {unknown} [index] - for `pick-level`: which reported level; clamped to a whole number ≥ 0.
 * @returns {{ channel: string, v: number, kind: string, index?: number } | null}
 */
export function pickMessage(kind, index) {
  if (kind === PICK.start || kind === PICK.stop) return { channel: CHANNEL, v: VERSION, kind }
  if (kind === PICK.level) {
    const n = typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0
    return { channel: CHANNEL, v: VERSION, kind, index: n }
  }
  return null
}

/**
 * What a page reports about the element under the pointer or the one picked.
 *
 * `marks` are the provenance stamps found on the element and its ancestors, innermost first, as the
 * CMS printed them (`data-tracy-src`, a `data-tracy-owner` marker, a menu item id). `levels` are the
 * places the person can move the pick to: index 0 is the element itself, every other entry an
 * ancestor carrying a mark or drawing a box of its own (runtime 19), a run of anonymous wrappers kept
 * as its outermost (runtime 20). An ancestor level may say what the page calls it (`name`, runtime 20:
 * its `aria-label`/`aria-labelledby`, else the words of the heading that titles it, capped at 80) and
 * which landmark it is (`landmark`, runtime 20: by tag or ARIA role). `text` (and each level's `text`) is the element's visible words by the
 * {@link INLINE_TAGS} rule, whitespace-collapsed, capped at `LIMITS.text` (ending in `…` when it
 * was cut), and empty for a form control, code, or anything inside a `[data-tracy-private]`
 * subtree. `inside` (optional, additive — no {@link VERSION} bump) is present only when `text` is
 * empty: a container's (card, section) collapsed visible words, the whole subtree's, capped at
 * {@link INSIDE_MAX}, so the agent can tell WHICH container was picked. `name` (optional, additive,
 * runtime 14 feature `name`) is present only when `text` is empty and the page has a plain name for
 * the element — what a person calls it when it has no words of its own, capped at `LIMITS.text`: an
 * icon control's accessible name (`aria-label`, `aria-labelledby`, `title`, an svg's `<title>`), an
 * image's alt or its figure's caption, else `image near "<the heading above it>"`, an embed as
 * `embedded video "<title>" · <host>` (only the host of its address, never the address). `hidden`
 * (optional, runtime 14 feature `clip`): see {@link HIDDEN_REASONS}. Nothing here is resolved: which
 * record a mark means is the server's answer (`content.locate`), not the page's.
 * @typedef {{ x: number, y: number, width: number, height: number }} PickRect
 * @typedef {'header' | 'footer' | 'nav' | 'main' | 'aside' | 'form'} PickLandmark
 * @typedef {{ tag: string, mark: string | null, text: string, rect: PickRect, name?: string, landmark?: PickLandmark }} PickLevel
 * @typedef {{
 *   text: string, inside?: string, name?: string, hidden?: 'clipped' | 'covered', tag: string,
 *   image: { src: string, alt: string } | null,
 *   domPath: string, selector: string, rect: PickRect,
 *   marks: string[], levels: PickLevel[], level: number
 * }} PickTarget
 */
