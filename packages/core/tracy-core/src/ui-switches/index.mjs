/**
 * Which pieces of the customer's dsh page are shown — the operator's switches from `/ops` ›
 * User Interface (`tasks/plan-ui-switches.md`).
 *
 * ONE LIST, ONE READ. `catalogue.json` beside this file is the only list of switches: plugins read
 * it here, `apps/tracy-web` copies it into its image for the `/api/ui` door. Every plugin on a page
 * shares one read of that door, like `tracyConfig()`.
 *
 * 🔒 ONE READ FOR EVERY BUNDLE COPY. Each plugin bundles its own copy of this module (14 on one dsh
 * page, measured 25/10/2026), so the read and its answer live on the page's `globalThis`
 * (`PAGE_READ`), not in a module variable. A copy first asked after the answer landed starts FROM the
 * answer, never from the code defaults: before this, My Sites' copy, first asked when the toolbar's
 * More menu opened, drew it with `site-sync-to-live` at its default (off) although `/ops` had it on,
 * and its first mark wrote the defaults back onto `<html>` until its own read returned. The shape on
 * `globalThis` is a contract between versions of this module: `{ hidden, done }` as `PageRead` says.
 *
 * TWO WAYS A PLUGIN HIDES A PIECE, both through this module:
 * - CSS: the ids that are off ride on `<html data-tracy-hide="id id …">`, so a rule reads
 *   `:root[data-tracy-hide~="model-picker"] <selector> { display: none }`. The attribute is
 *   written SYNCHRONOUSLY with the code defaults the moment the module is first asked, so a piece
 *   hidden by default never paints before the door answers.
 * - Render: `isShown(id)` for a slot or a row, with `subscribe` to render again once the door's
 *   answer lands (plugin `apply()` is synchronous, so nothing can wait for it).
 *
 * ROOT-ABSOLUTE, NOT `dshUrl()`. `/api/ui` lives at the host's bare root, never under a plugin's
 * `<base href>` mount — the same rule `/api/config` and `/auth/me` follow.
 *
 * NEVER THROWS ON THE DOOR. Offline, a 404 (a local lane has no root door), a 5xx or a body of the
 * wrong shape all keep the code defaults — neither "show everything" nor "hide everything".
 * Asking about an id the catalogue does not list DOES throw: a typo must fail a test, not quietly
 * decide what a customer sees.
 */
import catalogue from './catalogue.json' with { type: 'json' }

/**
 * @typedef {object} UiSwitch
 * @property {string} id
 * @property {string} group
 * @property {string} label
 * @property {string} hint
 * @property {'dsh' | 'Tracy'} drawnBy
 * @property {boolean} defaultOn
 * @property {readonly string[]} [tabs] Better Sidebar tab types this switch governs.
 * @property {string} [warning] What an operator must know before turning it off.
 * @property {string} [parent] A switch whose piece sits inside this one's: turning the parent off hides it too.
 * @property {string} [locked] Why this switch cannot be pressed: it stays at `defaultOn` whatever the door
 *   answers, because the piece it governs is not there to show (its plugin is off).
 */

/**
 * @typedef {object} UiSwitches
 * @property {Promise<void>} ready Settles once the door has answered or failed; never rejects.
 * @property {(id: string) => boolean} isShown
 * @property {(ids: readonly string[]) => string[]} keepShown Registration ids minus those switched
 *   off; an id the catalogue does not list is not Tracy's to hide and passes.
 * @property {(listener: () => void) => () => void} subscribe Called once, when the door's answer lands;
 *   never when it had landed before this copy was first asked (that copy reads the answer from the start).
 * @property {() => TabPolicy} tabPolicy The right-column switches as Better Sidebar's tab policy.
 * @property {(sidebar: { setTabPolicy?: (policy: TabPolicy) => () => void }) => () => void} followTabPolicy
 *   Install that policy on a side card now, replace it when the door answers, remove it on dispose.
 *   A side card older than feature `setTabPolicy` gets nothing and nothing throws.
 */

/**
 * What Better Sidebar asks about a tab type (`service.setTabPolicy`, fork 0.21.1-tracy.13).
 * @typedef {object} TabPolicy
 * @property {(tabId: string) => boolean} isAllowed Off: the type does not exist for customers —
 *   no menu entry, no deep link, and the customer cannot switch it back on (a `tab-*` switch).
 * @property {(tabId: string) => boolean} isListed Off: the type is left out of the + menu and the
 *   Start guide, and still opens from its own entry points (a `launch-*` switch).
 */

/** Every switch an operator can flip, in catalogue order. @type {readonly UiSwitch[]} */
export const UI_SWITCHES = Object.freeze(catalogue.switches.map((s) => Object.freeze({ ...s })))

const DEFAULTS = new Map(UI_SWITCHES.map((s) => [s.id, s.defaultOn]))
const LOCKED = new Set(UI_SWITCHES.filter((s) => s.locked !== undefined).map((s) => s.id))

/**
 * Every tab type a `launch-*` switch names, in catalogue order: the kinds dsh's + launcher may offer
 * (`sidebarRight.registerLauncher`). The launcher shows the ones that also have a LISTED guide entry,
 * so the switches decide through `tabPolicy().isListed` and this list only has to be complete.
 * @type {readonly string[]}
 */
export const LAUNCHER_TABS = Object.freeze([
  ...new Set(UI_SWITCHES.filter((s) => s.id.startsWith('launch-')).flatMap((s) => s.tabs ?? []))
])

/** Tab type → the switches that govern it, split by what they decide. */
const TAB_SWITCHES = { allowed: new Map(), listed: new Map() }
for (const s of UI_SWITCHES) {
  const kind = s.id.startsWith('tab-') ? 'allowed' : s.id.startsWith('launch-') ? 'listed' : null
  if (kind === null) continue
  for (const tab of s.tabs ?? []) TAB_SWITCHES[kind].set(tab, s.id)
}
const UI_DOOR = '/api/ui'
const HIDE_ATTRIBUTE = 'data-tracy-hide'

/** @type {UiSwitches | null} */
let page = null

/**
 * The page's one read of the door, shared by every bundle copy of this module.
 * @typedef {object} PageRead
 * @property {readonly string[] | null | undefined} hidden The door's hidden ids once it answered,
 *   null when it gave no readable answer, undefined while the read is on its way.
 * @property {Promise<readonly string[] | null>} done Settles with `hidden`; never rejects.
 * @property {unknown} [fetch] The page's `fetch` the read went through, and
 * @property {unknown} [document] its `document`: a read is the page's only while both are the same
 *   objects (a test that stands up a new page swaps them, and gets a read of its own).
 */
const PAGE_READ = Symbol.for('@tracy/core/ui-switches#page-read')

/**
 * The page's read, started by the first copy that asks.
 * @param {typeof globalThis.fetch} call
 * @returns {PageRead}
 */
function pageRead(call) {
  const held = /** @type {Record<symbol, PageRead | undefined>} */ (/** @type {unknown} */ (globalThis))
  const known = held[PAGE_READ]
  const here = { fetch: globalThis.fetch, document: globalThis.document }
  if (
    known !== undefined &&
    typeof known === 'object' &&
    typeof known.done?.then === 'function' &&
    known.fetch === here.fetch &&
    known.document === here.document
  )
    return known
  /** @type {PageRead} */
  const read = {
    ...here,
    hidden: undefined,
    done: readHidden(call).then((hidden) => {
      read.hidden = hidden === null ? null : Object.freeze([...hidden])
      return read.hidden
    })
  }
  held[PAGE_READ] = read
  return read
}

/**
 * The page's switches: one shared instance, unless a test injects its own doubles.
 * @param {{ fetch?: typeof globalThis.fetch, root?: Element | null }} [options] Injection seam
 *   for tests: `root` is the element that carries the attribute (`null` for none).
 * @returns {UiSwitches}
 */
export function uiSwitches(options = {}) {
  if (options.fetch !== undefined || options.root !== undefined) return create(options, null)
  page ??= create({}, pageRead(globalThis.fetch.bind(globalThis)))
  return page
}

/**
 * @param {{ fetch?: typeof globalThis.fetch, root?: Element | null }} options
 * @param {PageRead | null} shared The page's read, or null for a test's own instance.
 * @returns {UiSwitches}
 */
function create(options, shared) {
  const shown = new Map(DEFAULTS)
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const call = options.fetch ?? globalThis.fetch.bind(globalThis)
  const root =
    options.root !== undefined
      ? options.root
      : typeof document === 'undefined'
        ? null
        : document.documentElement
  const mark = () => {
    const hidden = [...shown].filter(([, on]) => !on).map(([id]) => id)
    root?.setAttribute(HIDE_ATTRIBUTE, hidden.join(' '))
  }
  /** @param {Iterable<string>} ids */
  const apply = (ids) => {
    const hidden = new Set(ids)
    for (const [id, on] of DEFAULTS) shown.set(id, LOCKED.has(id) ? on : !hidden.has(id))
  }
  const landed = shared?.hidden
  if (Array.isArray(landed)) apply(landed)
  mark()

  const ready =
    landed !== undefined
      ? Promise.resolve()
      : (shared?.done ?? readHidden(call)).then((hidden) => {
          if (hidden === null || hidden === undefined) return
          apply(hidden)
          mark()
          for (const listener of listeners) listener()
        })

  /** @param {() => void} listener */
  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  /** @returns {TabPolicy} A tab type no switch names is not Tracy's to hide: it passes both. */
  const tabPolicy = () => {
    const ask = (map, tabId) => (map.has(tabId) ? shown.get(map.get(tabId)) !== false : true)
    return {
      isAllowed: (tabId) => ask(TAB_SWITCHES.allowed, tabId),
      isListed: (tabId) => ask(TAB_SWITCHES.listed, tabId)
    }
  }

  return {
    ready,
    isShown(id) {
      const on = shown.get(id)
      if (on === undefined) throw new Error(`ui-switches: "${id}" is not in catalogue.json`)
      return on
    },
    tabPolicy,
    followTabPolicy(sidebar) {
      if (typeof sidebar?.setTabPolicy !== 'function') return () => {}
      let remove = sidebar.setTabPolicy(tabPolicy())
      const unsubscribe = subscribe(() => {
        remove?.()
        remove = sidebar.setTabPolicy(tabPolicy())
      })
      return () => {
        unsubscribe()
        remove?.()
      }
    },
    keepShown(ids) {
      return ids.filter((id) => shown.get(id) !== false)
    },
    subscribe
  }
}

/**
 * The operator's switches as a dsh HOST plugin reads them: Tracy's `/api/ui` at `origin` (the lane's
 * `MCP_TRACY_ORIGIN`). For the roads a page cannot govern — an agent tool, the rules the agent is
 * sent — that must follow the same switch the page hides a piece by (`chat-design-system`).
 *
 * 🔒 NO ANSWER IS NO ANSWER. The page keeps the code defaults when the door does not answer; this
 * answers `null` instead, and the caller decides. A road an operator closed must not open because
 * Tracy was slow, so every caller of a switch that closes a road treats `null` as off.
 * @param {string | null | undefined} origin - Tracy's origin, e.g. `https://tracy.ai`.
 * @param {{ fetch?: typeof globalThis.fetch, timeoutMs?: number }} [options]
 * @returns {Promise<((id: string) => boolean) | null>} Whether one switch is on (throws for an id the
 *   catalogue does not list; a locked switch is its default), or null when Tracy gave no readable answer.
 */
export async function switchesAtTracy(origin, options = {}) {
  if (typeof origin !== 'string' || origin.trim() === '') return null
  const base = origin.trim().replace(/\/+$/, '')
  const call = options.fetch ?? globalThis.fetch.bind(globalThis)
  const timeoutMs = options.timeoutMs ?? 3000
  const hidden = await readHidden((url, init) =>
    call(`${base}${url}`, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  )
  if (hidden === null) return null
  return (id) => {
    const fallback = DEFAULTS.get(id)
    if (fallback === undefined) throw new Error(`ui-switches: "${id}" is not in catalogue.json`)
    return LOCKED.has(id) ? fallback : !hidden.has(id)
  }
}

/**
 * One read of the door.
 * @param {typeof globalThis.fetch} call
 * @returns {Promise<Set<string> | null>} The hidden ids, or null when there was no readable answer.
 */
async function readHidden(call) {
  try {
    const res = await call(UI_DOOR, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    if (!res.ok) return null
    const body = await res.json()
    if (body === null || typeof body !== 'object' || !Array.isArray(body.hidden)) return null
    return new Set(body.hidden.filter((id) => typeof id === 'string'))
  } catch {
    return null
  }
}
