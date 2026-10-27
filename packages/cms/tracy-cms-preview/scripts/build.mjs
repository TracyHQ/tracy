#!/usr/bin/env node
/**
 * Emit the live-preview agent both CMS themes ship, and the contract the side card reads, from one
 * source.
 *
 * `src/runtime.mjs` (with `src/pick.mjs`) is the whole agent; `protocol.mjs` is the whole contract.
 * One run, four files:
 *
 *   WordPress  packages/cms/tracy-wordpress-theme/src/tracy/assets/js/tracy-preview.js
 *   Joomla     packages/cms/tracy-joomla-template/src/tpl_tracy/media/js/tracy-preview.js
 *   Side card  vendor/tracy/dsh-better-sidebar/src/client/preview-protocol.generated.ts
 *   Site proxy apps/tracy-web/src/bar/tracy-preview.generated.js
 *
 * The two theme copies are byte-identical. The side card gets the contract's constants in the
 * language it is written in. The site proxy gets the same bundle as a string, because it injects it
 * inline into a framed page together with the attribute that turns the picker on
 * (`data-parent-origin`), which a theme's own copy never carries.
 *
 * WHY A GATE AND NOT A PAIR OF EYES. The same blindness `cms-motion` documents, one turn worse. The
 * generated files are committed, so a stale copy reviews as a correct one — and this contract has
 * THREE parties in three trees. A channel renamed in `protocol.mjs` and not re-emitted does not
 * throw anywhere: the theme posts on the old name, the side card listens on the new one, and the
 * only symptom is that live preview quietly goes back to being a reload button. `--check` compares
 * every emitted file with a fresh build and exits 1 on any drift.
 *
 * WHY THE VERSION RIDES IN A BANNER. esbuild does not minify a banner, so line 1 of the emitted JS
 * survives as the only readable statement of which contract a customer's site is holding.
 *
 * Usage:  node scripts/build.mjs            # writes into both themes and the side card
 *         node scripts/build.mjs --check    # exits 1 when any emitted file is stale; writes nothing
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import {
  CHANNEL,
  DEFAULT_MODE,
  FEATURES,
  HIDDEN_REASONS,
  LIMITS,
  LOST_REASONS,
  MODES,
  PICK,
  TRACK_LIMITS,
  TRACK_STATES,
  VERSION
} from '../protocol.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(PKG, '..', '..', '..')
const WORDPRESS = path.join(ROOT, 'packages', 'cms', 'tracy-wordpress-theme', 'src', 'tracy')
const JOOMLA = path.join(ROOT, 'packages', 'cms', 'tracy-joomla-template', 'src', 'tpl_tracy')
const SIDECARD = path.join(ROOT, 'vendor', 'tracy', 'dsh-better-sidebar', 'src', 'client')
const WEB = path.join(ROOT, 'apps', 'tracy-web', 'src', 'bar')

/** Every side the build writes into, by the first segment of a planned file's key. */
export const ROOTS = Object.freeze({ wordpress: WORDPRESS, joomla: JOOMLA, sidecard: SIDECARD, web: WEB })

/**
 * Which copy of the runtime this is — not which contract (`VERSION`). Bump it whenever the emitted
 * runtime changes behaviour: a page that includes two copies keeps the higher one, and the first
 * release (the refresh-only agent still in the themes) has no number at all. 5 adds tracked elements
 * (feature `track`: `pick-track` → `pick-rect` / `pick-lost`). 6 adds `inside`: a picked container
 * with no words of its own reports the words below it. It is 6 and not a second 5 because a copy
 * with `inside` and a copy without must never tie. 7 keeps `inside` and adds `pick-reveal` and the
 * tracked state `pending` (feature `reveal`) — two branches each took 6, so the copy holding both
 * is 7, and never ties with either. 8 reports the image a picked text-less wrapper holds when it
 * holds exactly one `<img>` (a card's image link picks the `<a>`, which had no `image`); the pick
 * itself stays the wrapper. A page carrying a 7 keeps working — its picks just say no image there.
 * 9 says what each tracked element reads now (`pick-text`, feature `text`, stage-5 acceptance F16),
 * so a reply or a resend quotes the page as it is; beside an 8 the side card sends the words from
 * pick time, as before. 11 carries two features that were each drafted as "runtime 10" on separate
 * branches (neither shipped as 10): it answers `pick-hold` (feature `hold`, Brian 29/09 23:08) —
 * while the side card has a box open, the page swallows every click and reports it as
 * `pick-outside`, and the wheel still scrolls; beside a 9 the side card shields the frame itself, as
 * before — and it says where the page is scrolled to (`pick-scroll`) and goes back there on
 * `pick-scroll-to` (feature `scroll`, Brian 29/09/2026): the recovery of a lapsed picker reloads at
 * a new address, which opened at the top; beside a 9 it still does. The side card detects each by
 * `ready.features`, never by the number. 12 keeps every outline on its element while the page
 * scrolls (feature `follow`, Brian 30/09/2026): an element that moves with the page is outlined in the
 * page's coordinates, so the compositor scrolls outline and element in one frame, where 11's viewport
 * outline trailed a scroll step behind; beside an 11 the side card changes nothing. 13 picks the
 * smallest box WITH CONTENT under the pointer — words, an image, a control — looking under a
 * transparent layer when nothing on top has any (stage 6 acceptance v2, K01/K04, 30/09/2026): an
 * empty wrapper or a CSS icon span no longer takes the pick and hands the side card a tag with no
 * words. Nothing on the wire changes, so there is no new feature name; beside a 12 the side card
 * changes nothing. 14 (stage 6 acceptance v3, 30/09/2026) keeps the side card's boxes on their elements
 * while the page scrolls (feature `lockstep`: in Edit the page takes the wheel and `pick-scroll-to`,
 * posts where every reported element will be, and scrolls one frame later), names an element with no
 * words (`name`), says when an element must not be drawn over (`clip`: `hidden` on `pick-rect` and
 * picked targets), picks iframes, disabled controls, the link or button around an icon, never an
 * invisible slide or Tracy's own badge, reads open shadow roots and reports a shorter selector.
 * 15 (stage 6 acceptance v5, 30/09/2026) keeps the typing in an open box (feature `refocus`: the page's
 * `focus()` — also through a kept reference — `window.focus()`, `select()` and `setSelectionRange()` do
 * nothing while held, and a frame that took the focus anyway asks for it back with `pick-refocus`),
 * hears presses and clicks by window listeners added once at load (a page listener added later cannot
 * get in front of them after Interactive → Edit), cuts a box's overflow at its padding box, and counts
 * `clip-path`, `clip`, `content-visibility: hidden` and a one-pixel box as not shown. Still 15 (V5S-2,
 * 30/09/2026): every refresh now fetches the page's own stylesheets again past the browser's cache, so a
 * look change shows at once. Nothing on the wire changed, and a tie between a 15 with it and a 15
 * without goes to the site proxy's inline copy — it runs while the page is parsed, before the theme's
 * deferred one — which is the one deployed first.
 * 16 (stage 6 acceptance v5 pick, 30/09/2026) picks content AT the pointer — a line of the element's own
 * words holding the point, an image, a control — and never `html`, `body` or a wrapper as big as the
 * page (empty space picked `<body>` "Skip to content"); keeps every press, click, double-click and
 * text selection from the page between a pick and the side card's hold; takes up to 60 tracked
 * elements (feature `pins60`); scrolls the box an element sits in on the wheel over a side card box
 * (feature `wheel`, `pick-wheel`); and finds a re-rendered element whose id went by its words.
 * 17 adds the view report (`VIEW` in `protocol.mjs`), drafted as 8 on another branch beside this
 * branch's 8: with a picker the page says which address it is, how far it is scrolled, how large its
 * window is and which colour scheme its visitor prefers, so the chat can draw the same page beside the
 * customer's message. Not a feature: the side card reads nothing new. Still 17 (verify6 L3, 30/09/2026):
 * an inline tag the page lays out as a block (`display: block`, `flex`…) is set apart by a space in
 * `text`, so a T4 mega-menu link reads "Newsletter Digest email template", not "NewsletterDigest…".
 * Nothing on the wire changed, and a tie goes to the site proxy's inline copy, as with 15.
 * Still 18 (Akemi 01/10/2026): the element under the pointer is outlined 1px solid at 70% with a faint
 * fill instead of 2px dashed, and a picked one stays 2px solid with its fill. A look only: nothing on
 * the wire changed, and a tie goes to the site proxy's inline copy, as with 15.
 * 19 (Akemi's edit-mode review E2, 01/10/2026) moves the pick on `pick-level` (feature `widen`): the page
 * reports the chosen level as a fresh `picked` with the first pick's levels and `level: index`, and
 * `levels` holds every ancestor with a box of its own, not only marked ones, so the side card's path
 * line ("Section › Block › Heading") has steps on a page without marks. Behaviour and the levels list
 * change, the contract (`VERSION`) does not; beside an 18 the side card shows the path without steps.
 * Still 19 (01/10/2026, before 19 left its branch): a reveal outside Edit whose flash was still running
 * when Edit came on left its passing outline up, where the element stood when the flash began, and it
 * read as a stray terracotta box after a resize; Edit coming on, and every later flash step, now take it
 * down. A fix only: nothing on the wire changed, and no copy of 19 without it was ever served.
 * 20 (Akemi 01/10/2026, the kinetic hero's path read "Block › Block › Block › Block › Heading") names
 * the levels and thins them: an ancestor level carries what the page calls it (`name`: its aria label,
 * else the heading that titles it among its siblings) and the landmark it is (`landmark`: header,
 * footer, nav, main, aside, form, by tag or role), and a run of anonymous wrappers is one level, the
 * outermost (`levelElements` in `src/pick.mjs`). Both fields are optional: no feature, no `VERSION`
 * change; a side card before them names by tag, and one with them collapses a 19 page's runs itself.
 */
export const RUNTIME_VERSION = 20

/**
 * Line 1 of the emitted JS. One space, no `v`, no trailing punctuation: the same shape
 * `tracy-motion` uses, so one reader greps both.
 * @param {number} version
 */
export function banner(version) {
  return `// tracy-preview ${String(version)}`
}

/**
 * The side card's copy of the contract.
 *
 * It is TypeScript rather than a copy of `protocol.mjs` for one reason: the side card is a fork of
 * someone else's plugin and must keep building as that plugin builds. A `.mjs` reached across three
 * package boundaries would make Tracy's CMS package a build dependency of a vendored plugin, which
 * is the coupling ADR 0006 exists to refuse. A generated, self-contained module has no such edge —
 * and the gate is what keeps it honest.
 * @param {{ channel: string, version: number, modes: readonly string[], defaultMode: string,
 *   features?: readonly string[], pick?: Record<string, string>, limits?: Record<string, number>,
 *   trackStates?: readonly string[], lostReasons?: readonly string[],
 *   trackLimits?: Record<string, number>, hiddenReasons?: readonly string[] }} parts
 */
export function protocolModule({
  channel,
  version,
  modes,
  defaultMode,
  features = FEATURES,
  pick = PICK,
  limits = LIMITS,
  trackStates = TRACK_STATES,
  lostReasons = LOST_REASONS,
  trackLimits = TRACK_LIMITS,
  hiddenReasons = HIDDEN_REASONS
}) {
  return `${[
    '/* GENERATED by packages/cms/tracy-cms-preview/scripts/build.mjs — do not edit.',
    '   The cms-preview gate compares this file byte-for-byte with a fresh build. */',
    '',
    '/** The `channel` field every message on the live-preview contract carries. */',
    `export const PREVIEW_CHANNEL = ${JSON.stringify(channel)}`,
    '',
    '/** The contract version; a page announcing another one is left alone. */',
    `export const PREVIEW_VERSION = ${String(version)}`,
    '',
    '/** What a page can be asked to do, cheapest first. */',
    `export const PREVIEW_MODES = ${JSON.stringify(modes)} as const`,
    '',
    '/** The mode used for anything the side card cannot classify. */',
    `export const PREVIEW_DEFAULT_MODE = ${JSON.stringify(defaultMode)}`,
    '',
    '/** One mode on the contract. */',
    'export type PreviewMode = (typeof PREVIEW_MODES)[number]',
    '',
    '/**',
    ' * One refresh request, as the side card sends it into a page.',
    ' * @param mode - the mode to ask for; an unknown one is sent as the default.',
    ' * @returns the message to post.',
    ' */',
    'export function previewRefreshMessage(mode: string): { channel: string; v: number; kind: string; mode: string } {',
    '  const known = (PREVIEW_MODES as readonly string[]).includes(mode)',
    "  return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: 'refresh', mode: known ? mode : PREVIEW_DEFAULT_MODE }",
    '}',
    '',
    '/**',
    ' * Whether a received value is a message on this contract, of one kind.',
    ' *',
    ' * Total and dull on purpose: it is handed whatever a framed page posted, so it assumes nothing',
    ' * about the value and never throws.',
    ' * @param value - the `data` of a received message event.',
    ' * @param kind - the kind the reader is willing to act on.',
    ' * @returns whether the value is that message.',
    ' */',
    'export function isPreviewMessage(value: unknown, kind: string): boolean {',
    "  if (value === null || typeof value !== 'object') return false",
    '  const message = value as { channel?: unknown; v?: unknown; kind?: unknown }',
    '  return message.channel === PREVIEW_CHANNEL && message.v === PREVIEW_VERSION && message.kind === kind',
    '}',
    '',
    '/** What a page can do beyond refreshing; a side card lights a feature only when the page names it. */',
    `export const PREVIEW_FEATURES = ${JSON.stringify(features)} as const`,
    '',
    '/** The picker kinds: the side card sends start/stop/level/track/reveal, the page sends hover/picked/cancel/rect/lost/text. */',
    `export const PREVIEW_PICK = ${JSON.stringify(pick)} as const`,
    '',
    '/** How much of the page one picked element may carry out. */',
    `export const PREVIEW_PICK_LIMITS = ${JSON.stringify(limits)} as const`,
    '',
    "/** A box in the framed page's viewport, in CSS pixels. */",
    'export interface PreviewPickRect {',
    '  x: number',
    '  y: number',
    '  width: number',
    '  height: number',
    '}',
    '',
    '/** One place the pick can move to: the element itself (index 0) or an ancestor a person can tell apart. */',
    'export interface PreviewPickLevel {',
    '  tag: string',
    '  mark: string | null',
    '  text: string',
    '  rect: PreviewPickRect',
    "  /** Runtime 20: what the page calls this ancestor, its label or its title heading's words (optional). */",
    '  name?: string',
    '  /** Runtime 20: the landmark this ancestor is, by tag or role (optional). */',
    "  landmark?: 'header' | 'footer' | 'nav' | 'main' | 'aside' | 'form'",
    '}',
    '',
    '/**',
    ' * What a page reports about the element under the pointer or the one picked. `marks` are the',
    " * provenance stamps the CMS printed, innermost first; which record they mean is the server's",
    " * answer (`content.locate`), not the page's.",
    ' */',
    'export interface PreviewPickTarget {',
    '  text: string',
    "  /** A container's own words when it has none: its subtree's text, capped (optional, additive). */",
    '  inside?: string',
    '  /** Runtime 14 (`name`): what a person calls an element with no words of its own (optional). */',
    '  name?: string',
    '  /** Runtime 14 (`clip`): why the element must not be drawn over (optional; absent = it can be seen). */',
    '  hidden?: PreviewHidden',
    '  tag: string',
    '  image: { src: string; alt: string } | null',
    '  domPath: string',
    '  selector: string',
    '  rect: PreviewPickRect',
    '  marks: string[]',
    '  levels: PreviewPickLevel[]',
    '  level: number',
    '}',
    '',
    '/**',
    ' * One picker request, as the side card sends it into a page.',
    ' * @param kind - start, stop or level; anything else is not a request.',
    ' * @param index - for a level request, which reported level; clamped to a whole number of at least 0.',
    ' * @returns the message to post, or null.',
    ' */',
    'export function previewPickMessage(kind: string, index?: unknown): { channel: string; v: number; kind: string; index?: number } | null {',
    '  if (kind === PREVIEW_PICK.start || kind === PREVIEW_PICK.stop) return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind }',
    '  if (kind === PREVIEW_PICK.level) {',
    "    const n = typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0",
    '    return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind, index: n }',
    '  }',
    '  return null',
    '}',
    '',
    '/** The outline colours a tracked element can wear (`pick-track` items). */',
    `export const PREVIEW_TRACK_STATES = ${JSON.stringify(trackStates)} as const`,
    '',
    "/** One tracked element's outline colour. */",
    'export type PreviewTrackState = (typeof PREVIEW_TRACK_STATES)[number]',
    '',
    '/** Why a page says a tracked element is gone (`pick-lost`). */',
    `export const PREVIEW_LOST_REASONS = ${JSON.stringify(lostReasons)} as const`,
    '',
    '/** One reason a tracked element is gone. */',
    'export type PreviewLostReason = (typeof PREVIEW_LOST_REASONS)[number]',
    '',
    '/** Why an element the page still finds must not be drawn over (`hidden`, runtime 14 feature `clip`). */',
    `export const PREVIEW_HIDDEN_REASONS = ${JSON.stringify(hiddenReasons)} as const`,
    '',
    '/** One reason an element must not be drawn over. */',
    'export type PreviewHidden = (typeof PREVIEW_HIDDEN_REASONS)[number]',
    '',
    '/** Bounds on `pick-track`; `match` is how many leading characters of `text` must still begin the element. */',
    `export const PREVIEW_TRACK_LIMITS = ${JSON.stringify(trackLimits)} as const`,
    '',
    '/** One element the side card asks a page to keep outlined and report (`pick-track`). */',
    'export interface PreviewTrackItem {',
    '  id: string',
    '  selector: string',
    '  text: string',
    '  state: PreviewTrackState',
    '}',
    '',
    '/**',
    ' * One `pick-track` request: the WHOLE tracked set, replacing the last one (`[]` tracks nothing).',
    ' * Refuses exactly what the page refuses — a set it would ignore is never sent.',
    ' * @param items - the set to track.',
    ' * @returns the message to post, or null when any item is out of bounds.',
    ' */',
    'export function previewTrackMessage(items: unknown): { channel: string; v: number; kind: string; items: PreviewTrackItem[] } | null {',
    '  if (!Array.isArray(items) || items.length > PREVIEW_TRACK_LIMITS.items) return null',
    '  const out: PreviewTrackItem[] = []',
    '  const ids = new Set<string>()',
    '  for (const item of items as unknown[]) {',
    "    if (item === null || typeof item !== 'object') return null",
    '    const { id, selector, text, state } = item as Record<string, unknown>',
    "    if (typeof id !== 'string' || id === '' || id.length > PREVIEW_TRACK_LIMITS.id || ids.has(id)) return null",
    "    if (typeof selector !== 'string' || selector === '' || selector.length > PREVIEW_TRACK_LIMITS.selector) return null",
    "    if (typeof text !== 'string' || text.length > PREVIEW_PICK_LIMITS.text) return null",
    "    if (typeof state !== 'string' || !(PREVIEW_TRACK_STATES as readonly string[]).includes(state)) return null",
    '    ids.add(id)',
    '    out.push({ id, selector, text, state: state as PreviewTrackState })',
    '  }',
    '  return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.track, items: out }',
    '}',
    '',
    '/**',
    ' * One `pick-reveal` request: scroll one tracked element into view, flash it, report its rect. Only a',
    ' * page whose `ready` names `reveal` answers it; an id outside the tracked set is ignored.',
    ' * @param id - a tracked item id.',
    ' * @returns the message to post, or null for an id no tracked item could carry.',
    ' */',
    'export function previewRevealMessage(id: unknown): { channel: string; v: number; kind: string; id: string } | null {',
    "  if (typeof id !== 'string' || id === '' || id.length > PREVIEW_TRACK_LIMITS.id) return null",
    '  return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.reveal, id }',
    '}',
    '',
    '/**',
    ' * `pick-hold {on}` (runtime 11, feature `hold`): while `on`, the page swallows every click and answers',
    ' * `pick-outside {x, y}` instead; the wheel, scrolling and keys pass.',
    ' * @param on - a box is open in the side card.',
    ' */',
    'export function previewHoldMessage(on: boolean): { channel: string; v: number; kind: string; on: boolean } {',
    '  return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.hold, on: on === true }',
    '}',
    '',
    '/** Where a page is scrolled to, in whole CSS pixels (`pick-scroll`, and what `pick-scroll-to` asks). */',
    'export interface PreviewScroll {',
    '  x: number',
    '  y: number',
    '}',
    '',
    '/**',
    ' * One `pick-scroll-to` request: put the page back at a scroll offset. Only a page whose `ready` names',
    ' * `scroll` answers it.',
    ' * @param x - the horizontal offset, CSS pixels.',
    ' * @param y - the vertical offset, CSS pixels.',
    ' * @returns the message to post, or null for a place no page could be scrolled to.',
    ' */',
    'export function previewScrollToMessage(x: unknown, y: unknown): { channel: string; v: number; kind: string; x: number; y: number } | null {',
    "  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null",
    '  if (x < 0 || y < 0) return null',
    '  return { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.scrollTo, x: Math.round(x), y: Math.round(y) }',
    '}',
    '',
    '/**',
    ' * One `pick-wheel` step (runtime 16): the wheel over a side card box, for the box its element sits',
    ' * in. Only a page whose `ready` names `wheel` answers it.',
    ' * @param dx - horizontal step, CSS pixels of the page.',
    ' * @param dy - vertical step.',
    ' * @param id - the tracked item the box belongs to; undefined or null for the open pick.',
    ' * @returns the message to post, or null for a step or an id the page would refuse.',
    ' */',
    'export function previewWheelMessage(dx: unknown, dy: unknown, id?: unknown): { channel: string; v: number; kind: string; dx: number; dy: number; id?: string } | null {',
    "  if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy)) return null",
    '  const x = Math.round(dx)',
    '  const y = Math.round(dy)',
    '  if ((x === 0 && y === 0) || Math.abs(x) > 20000 || Math.abs(y) > 20000) return null',
    '  const message = { channel: PREVIEW_CHANNEL, v: PREVIEW_VERSION, kind: PREVIEW_PICK.wheel, dx: x, dy: y }',
    '  if (id === undefined || id === null) return message',
    "  if (typeof id !== 'string' || id === '' || id.length > PREVIEW_TRACK_LIMITS.id) return null",
    '  return { ...message, id }',
    '}'
  ].join('\n')}\n`
}

/**
 * The site proxy's copy: the bundle as one string constant.
 *
 * A module and not a `.js` asset the proxy reads at request time, so the bytes the gate compares
 * are the bytes that ship — there is no path to resolve on the server and nothing to go missing
 * from an image. The proxy writes it inside `<script>`, so the bundle must never contain `</script`
 * or `<!--` (held by a test).
 * @param {string} js - the minified bundle.
 */
export function webModule(js) {
  return `${[
    '/* GENERATED by packages/cms/tracy-cms-preview/scripts/build.mjs — do not edit.',
    '   The cms-preview gate compares this file byte-for-byte with a fresh build. */',
    '',
    '/**',
    ' * The live-preview runtime, as the site proxy injects it inline into a framed page:',
    ' * `<script data-tracy-preview="pick" data-parent-origin="<origin>">${TRACY_PREVIEW_JS}</script>`.',
    ' * Without `data-parent-origin` it refreshes only and never offers the picker.',
    ' */',
    `export const TRACY_PREVIEW_JS = ${JSON.stringify(js)}`
  ].join('\n')}\n`
}

/**
 * The minified runtime.
 * @param {{ runtimeVersion?: number }} [options] - tests build a "newer" copy to hold the
 *   two-generations rule; the shipped bundle always uses {@link RUNTIME_VERSION}.
 */
export async function bundle({ runtimeVersion = RUNTIME_VERSION } = {}) {
  const js = await esbuild.build({
    entryPoints: [path.join(PKG, 'src', 'runtime.mjs')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2019',
    banner: { js: banner(VERSION) },
    define: { __TRACY_RUNTIME__: String(runtimeVersion) },
    write: false,
    outfile: 'tracy-preview.js'
  })
  return js.outputFiles[0].text
}

/** Build every emitted file in memory, keyed by `<side>/<path within that side>`. */
export async function plan() {
  const js = await bundle()
  const files = new Map([
    ['wordpress/assets/js/tracy-preview.js', js],
    ['joomla/media/js/tracy-preview.js', js],
    ['web/tracy-preview.generated.js', webModule(js)],
    [
      'sidecard/preview-protocol.generated.ts',
      protocolModule({ channel: CHANNEL, version: VERSION, modes: MODES, defaultMode: DEFAULT_MODE })
    ]
  ])
  return { files, version: VERSION }
}

/** @param {string} key @param {Record<string, string>} roots */
function target(key, roots) {
  const [side, ...rest] = key.split('/')
  return path.join(roots[side], ...rest)
}

/**
 * Planned files that are missing or differ on disk.
 * @param {Map<string, string>} files
 * @param {Record<string, string>} roots
 */
export function stale(files, roots) {
  const report = []
  for (const [key, content] of files) {
    const abs = target(key, roots)
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== content) report.push(key)
  }
  return report
}

async function main() {
  const check = process.argv.includes('--check')
  const roots = ROOTS
  const { files, version } = await plan()
  if (check) {
    const report = stale(files, roots)
    if (report.length > 0) {
      for (const key of report) console.error(`build: ${key} is stale`)
      console.error('build: run `pnpm --filter @tracy/cms-preview build`.')
      process.exit(1)
    }
    console.log(`build: preview contract ${String(version)}, every generated file matches the source.`)
    return
  }
  for (const [key, content] of files) {
    const abs = target(key, roots)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  console.log(`build: preview contract ${String(version)} → ${String(files.size)} generated files.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
