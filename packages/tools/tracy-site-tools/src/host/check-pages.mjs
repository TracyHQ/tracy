/**
 * WHICH PAGES THE VISUAL CHECK LOOKS AT, AND WHEN THEIR "BEFORE" IS DRAWN (council 20/10/2026).
 *
 * WHY. Staff on real customer sites: "Tracy fixes one place and breaks another". The check
 * (`visual-check.mjs`) compared only the page the customer had open, and only when the Browser tab had
 * a picture ready when the turn began: a chat without the tab, a Voice turn and a comment whose picture
 * was not ready all closed `no-before`, and a shared header changed for one page was never looked at on
 * any other.
 *
 * WHAT.
 * - Q1. A turn with no usable "before" ({@link usableBefore}) has one drawn of the page its FIRST site
 *   write targets, immediately BEFORE that write is sent: the write is held at the write door
 *   (`tools/pre-execute`, every road — `tracy_site`, `tracy_emdash`, a shell, a file tool), at most
 *   {@link BEFORE_HOLD_MS}, one draw per turn. The page is the write's own target ({@link writeReach}):
 *   the record's page, the page a look is written on, the page a comment was pinned on; a record shown
 *   on many pages (a header, footer, menu, module, token) is looked at on the page the conversation last
 *   read, else home. Never a page the agent only read for a record that has a page of its own.
 * - Q1b (23/10/2026). The turn also draws one page as it begins (`EarlyPicture`: the comment's page, else
 *   the page the customer has open, else the one last read, else home), so the hold rarely waits a whole
 *   drawing: a write that names no page, one every page shows, or one on that same page takes it.
 * - Q2. A write to a SHARED element (`consequence.mjs` `shared`/`site`) also draws up to
 *   {@link EXTRA_PAGES_MAX} OTHER pages that show it, before the first such write, inside the same
 *   budget: home (when it is not the page already checked) and the page most different in length among
 *   the ones this conversation read ({@link extraPages}). Only pages the host KNOWS show the element:
 *   for one every page shows (`site` reach) that is any page; for one only some pages show (`some`: a
 *   Joomla module, a WordPress synced pattern or template) the pages it is known to be on
 *   (`usedOn`) — a Joomla module's assignment, read from the contract inspect the agent already made,
 *   from its own `content.get {kind:"moduleAssignment"}`, or else asked once through that same door
 *   inside the budget ({@link holdForBefore} `usage`) — and none when nothing says, never padding.
 *   At turn-stopping they are drawn again and judged with the main pair in ONE model call.
 * - Writes with no single record (follow-up, 20/10/2026): `content.replace` is drawn on the page it
 *   finds its words on (`path`), and is shared when it sweeps the site (`all:true`), names a header,
 *   footer, top bar or drawer (`where`), or the agent's own dryRun of the same call found its places
 *   there; `page.create` is drawn on home, where the menu row it adds shows, as a shared write;
 *   `content.contract` on the page its slots are on, from the contract's own page list; a media write
 *   names no page.
 *
 * 🔒 NEVER A "BEFORE" DRAWN AFTER THE WRITE. The hold races the drawing against what is left of the
 * budget; a drawing that did not finish in time is dropped even if it finishes later (the write went
 * meanwhile), and the check says `no-before` with the reason (`capture-timeout`). Only a write that
 * NAMES its page uses the turn's chance at a main picture: one that cannot (a shell command, a file
 * outside the look, a media upload) draws nothing and leaves the chance to the next write, inside the
 * same budget (the coordinator, 20/10/2026: a shell read before the real write must not cost the check)
 * — unless the turn's early picture is there to take: it was drawn before any write, so it costs nothing.
 *
 * 🔒 NEVER HELD FOR A CALL THE DOOR WILL REFUSE TO ASK FIRST ({@link asksFirst}). A delete, a hide, a
 * change every page shows, a price, a shared record: without `confirm:true` the door answers
 * `CONFIRM_FIRST` and writes nothing, so nothing is drawn for it — the call after the customer's yes is
 * the one held.
 *
 * 🔒 NEVER A REFUSAL. The hold only delays a write; any failure lets it go exactly as before.
 *
 * Pure but for what the caller hands in (`draw`, the clock), so `test/check-pages.test.mjs` holds every
 * rule without docker.
 */
import { consequenceOf, emdashConsequenceOf, lookReachOf } from './consequence.mjs'
import { lookEdit } from './design-drift.mjs'
import { EMDASH_DESTRUCTIVE_TOOLS, normalizeEmdashShape } from './emdash.mjs'
import { canonicalCall } from './site.mjs'
import { tierOf } from './tiers.mjs'
import { commentPage, pageOf, usableBefore } from './visual-check.mjs'

/**
 * The longest one turn's writes are held for their "before" pictures, all draws together.
 * 🔒 LONGER THAN ONE DRAWING (23/10/2026). It was 5 s while one drawing takes about 5–7 s (#1384's own
 * measure): on production every turn from 19/10 to 23/10 that wrote closed `no-before` (42 of 42). The
 * turn's early drawing ({@link EarlyPicture}) now usually ends before the first write; this is what is
 * left for a write that comes sooner, or a page drawn only when the write names it.
 */
export const BEFORE_HOLD_MS = 10_000

/** The most OTHER pages one shared write is looked at on. */
export const EXTRA_PAGES_MAX = 2

/** The window a page is drawn in when the customer's own is not known (no Browser tab). */
export const HOLD_WINDOW = Object.freeze({ w: 1280, h: 800, dark: false })

/** How many pages read one conversation keeps, newest first. */
export const PAGE_READS_KEEP = 6

/** @param {unknown} v */
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
/** @param {unknown} v */
const text = (v) => (typeof v === 'string' ? v.trim() : '')
/** @param {unknown} v */
const positiveId = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * @typedef {{ page: string | null, shared: 'site' | 'some' | null, sentence: string, module?: number,
 *   usedOn?: string[] }} Reach
 *   `page`: the page the write's own record or look is on, when the host can name it; `shared`: the
 *   write changes an element `site` (every page) or `some` (only some pages) show; `sentence`: what the
 *   customer is asked before such a write (`consequence.mjs`), the scope the comparison is told they
 *   agreed to; `module`: the Joomla module a `some` write changes, whose assignment says where it is;
 *   `usedOn`: the pages a `some` element is known to be on.
 * @typedef {{ all: boolean, pages: string[] }} Usage
 *   Where an element shows: every page (`all`), or these pages.
 */

/** The regions of a page every page shares (`html-units.mjs` `Region`). */
const CHROME_REGIONS = new Set(['topbar', 'header', 'footer', 'drawer'])

/** The key one `content.replace` call is known by, its `dryRun` and `expect` aside. @param {Record<string, unknown>} p */
export function replaceKeyOf(p) {
  const path = text(p.path) || '/'
  return JSON.stringify([
    p.find ?? null,
    p.replace ?? null,
    p.changes ?? null,
    path,
    p.where ?? null,
    p.all ?? false,
    p.at ?? null
  ])
}

/**
 * WordPress post types other pages show, and how far (`consequence.mjs` `WORDPRESS_SHARED_TYPES`).
 * @type {Readonly<Record<string, 'site' | 'some'>>}
 */
const WORDPRESS_SHARED = Object.freeze({
  wp_template_part: 'site',
  wp_navigation: 'site',
  wp_global_styles: 'site',
  wp_template: 'some',
  wp_block: 'some'
})

/** Joomla kinds every page shows (a menu, the template's style) — a module only where assigned. */
const JOOMLA_SITE_KINDS = new Set(['menu', 'menuItem', 'template', 'templateStyle'])

/** `tracy_site` actions that write the whole site's look or identity. */
const SITE_ACTIONS = new Set(['theme.style', 'site.identity', 'template.siteSettings'])

/** EmDash tools that write one entry, named by `collection` and `id`. */
const EMDASH_ENTRY_TOOLS = new Set([
  'content_update',
  'content_publish',
  'content_unpublish',
  'content_delete',
  'content_schedule',
  'content_restore'
])

/** @param {import('./consequence.mjs').Consequence | null} c @param {string} fallback */
const sentenceOf = (c, fallback) => (c !== null ? c.sentence : fallback)

/**
 * What one write call reaches: its own page, and whether it changes something other pages show.
 * Read from the call as it will be sent (`canonicalCall`, `normalizeEmdashShape`), never from the
 * answer. `known` is what the host already learned: the WordPress post type a read showed
 * (`postTypeOf`), the address of an EmDash entry ({@link createRecordPages}).
 * `replaceRegions`: the regions the agent's own dryRun of the same replace found its places in;
 * `contractReach`: where a contract apply's slots are, from the contract's page list.
 * @param {{ name?: unknown, arguments?: unknown }} call
 * @param {{ postTypeOf?: (id: number) => string | null, emdashPageOf?: (collection: string, id: string) => string | null,
 *   replaceRegions?: (params: Record<string, unknown>) => readonly string[] | null,
 *   contractReach?: (params: Record<string, unknown>) => Reach | null }} [known]
 * @returns {Reach}
 */
export function writeReach(call, known = {}) {
  const none = /** @type {Reach} */ ({ page: null, shared: null, sentence: '' })
  const name = typeof call?.name === 'string' ? call.name : ''
  if (name === 'tracy_site') {
    const { action, params } = canonicalCall(call.arguments)
    const p = /** @type {Record<string, unknown>} */ (params)
    if (action === 'look.set') {
      const path = text(p.path).startsWith('/') ? text(p.path) : '/'
      const scope = text(p.scope).toLowerCase()
      if (scope === 'site')
        return {
          page: path,
          shared: 'site',
          sentence: sentenceOf(consequenceOf('', 'look.set', p), 'This changes how every page looks.')
        }
      // An element write the customer said yes to: its reach question was the header or footer
      // (`lookReachOf` — the only question an element write asks), which every page shows.
      if (scope === 'element' && p.confirm === true)
        return {
          page: path,
          shared: 'site',
          sentence: sentenceOf(lookReachOf({ scope, everyPage: true, paints: null }), '')
        }
      return { page: path, shared: null, sentence: '' }
    }
    if (SITE_ACTIONS.has(action))
      return {
        page: null,
        shared: 'site',
        sentence: sentenceOf(consequenceOf('', action, p), 'This changes every page of the site.')
      }
    if (action === 'content.replace') {
      const path = text(p.path).startsWith('/') ? text(p.path) : '/'
      const found = known.replaceRegions?.(p) ?? []
      const chrome = CHROME_REGIONS.has(text(p.where)) || found.some((r) => CHROME_REGIONS.has(r))
      return p.all === true || chrome
        ? { page: path, shared: 'site', sentence: 'This changes the words wherever they show on the site.' }
        : { page: path, shared: null, sentence: '' }
    }
    // A new page has no "before"; the menu row it adds shows on every page, home first.
    if (action === 'page.create')
      return { page: '/', shared: 'site', sentence: 'This adds a page and a link to it in the site menu.' }
    if (action === 'content.contract') return known.contractReach?.(p) ?? none
    if (action !== 'content.update' && action !== 'content.delete') return none
    const kind = text(p.kind)
    const id = positiveId(p.id)
    if (kind === 'templatePart')
      return {
        page: null,
        shared: 'site',
        sentence: sentenceOf(consequenceOf('wordpress', 'content.update', p), '')
      }
    if (kind === 'option')
      return {
        page: null,
        shared: 'site',
        sentence: 'This changes a setting of the whole site, like its name.'
      }
    if (kind === 'post' || kind === 'postmeta') {
      if (id === 0) return none
      const postType = known.postTypeOf?.(id) ?? null
      const reach =
        postType !== null && Object.hasOwn(WORDPRESS_SHARED, postType) ? WORDPRESS_SHARED[postType] : null
      if (reach !== null && postType !== null)
        return {
          page: null,
          shared: reach,
          sentence: sentenceOf(consequenceOf('wordpress', 'content.update', p, { postType }), '')
        }
      // WordPress answers `?p=<id>` with the record's own address, a page's too (`redirect_canonical`).
      return { page: `/?p=${id}`, shared: null, sentence: '' }
    }
    if (kind === 'article')
      return id === 0
        ? none
        : { page: `/index.php?option=com_content&view=article&id=${id}`, shared: null, sentence: '' }
    if (kind === 'module')
      return id === 0
        ? none
        : {
            page: null,
            shared: 'some',
            sentence: sentenceOf(consequenceOf('joomla', 'content.update', p), ''),
            module: id
          }
    if (JOOMLA_SITE_KINDS.has(kind))
      return {
        page: null,
        shared: 'site',
        sentence: 'This changes a menu or the look every page of the site shows.'
      }
    return none
  }
  if (name === 'tracy_emdash') {
    const shape = /** @type {{ ok?: boolean, tool?: string, args?: Record<string, unknown> }} */ (
      normalizeEmdashShape(call.arguments)
    )
    if (shape.ok !== true || typeof shape.tool !== 'string') return none
    const args = /** @type {Record<string, unknown>} */ (isRecord(shape.args) ? shape.args : {})
    const consequence = emdashConsequenceOf(shape.tool, args)
    const collection = text(args.collection)
    if (shape.tool === 'menu_set_items' || shape.tool === 'settings_update' || collection === 'site')
      return { page: null, shared: 'site', sentence: sentenceOf(consequence, '') }
    const id = text(args.id)
    if (EMDASH_ENTRY_TOOLS.has(shape.tool) && collection !== '' && id !== '')
      return { page: known.emdashPageOf?.(collection, id) ?? null, shared: null, sentence: '' }
    return none
  }
  // A file tool or a shell command that writes a served look file (a stylesheet, `theme.json`): every
  // page loading it shows it (`lookEdit`, the same reading as the look-drift measure).
  if (lookEdit(name, call.arguments, { isError: false }) !== null)
    return { page: null, shared: 'site', sentence: 'This changes a stylesheet the pages of the site load.' }
  return none
}

/** The kinds that say which CMS a `tracy_site` record is on, for the consequence it asks. */
const WORDPRESS_KINDS = new Set(['post', 'postmeta', 'templatePart', 'option', 'term'])

/**
 * Whether the door will refuse this call `CONFIRM_FIRST` — a destructive action, or a write whose
 * consequence the customer sees (`consequence.mjs`), sent without `confirm:true` — so it writes
 * nothing and is not held for a drawing. A call that carries `confirm:true` comes after the customer's
 * yes and is held as any write. A refusal decided inside a door from what it reads first (a replace's
 * count, a look's reach) is not foreseen here: such a call is held, and a refused one drew in vain.
 * @param {{ name?: unknown, arguments?: unknown }} call
 * @param {{ postTypeOf?: (id: number) => string | null }} [known]
 * @returns {boolean}
 */
export function asksFirst(call, known = {}) {
  const name = typeof call?.name === 'string' ? call.name : ''
  if (name === 'tracy_site') {
    const raw = isRecord(call.arguments) ? /** @type {Record<string, unknown>} */ (call.arguments) : {}
    const { action, params } = canonicalCall(call.arguments)
    const p = /** @type {Record<string, unknown>} */ (params)
    if (p.confirm === true || raw.confirm === true) return false
    if (tierOf(action, p) === 'destructive') return true
    const kind = text(p.kind)
    const platform = WORDPRESS_KINDS.has(kind) ? 'wordpress' : kind !== '' ? 'joomla' : ''
    const postType = kind === 'post' ? (known.postTypeOf?.(positiveId(p.id)) ?? '') : ''
    const find = typeof p.find === 'string' ? p.find : ''
    const replace = typeof p.replace === 'string' ? p.replace : ''
    return consequenceOf(platform, action, p, { postType, find, replace }) !== null
  }
  if (name === 'tracy_emdash') {
    const shape =
      /** @type {{ ok?: boolean, tool?: string, args?: Record<string, unknown>, confirm?: boolean }} */ (
        normalizeEmdashShape(call.arguments)
      )
    if (shape.ok !== true || typeof shape.tool !== 'string' || shape.confirm === true) return false
    const args = /** @type {Record<string, unknown>} */ (isRecord(shape.args) ? shape.args : {})
    return EMDASH_DESTRUCTIVE_TOOLS.has(shape.tool) || emdashConsequenceOf(shape.tool, args) !== null
  }
  return false
}

/**
 * The page a turn's main "before" is drawn of: the page a comment was pinned on (the only page a
 * comment turn is judged on), else the write's own page, else — for a shared element — the page the
 * conversation last read, else — for one known to be on some pages only — home if it is one of them,
 * else the first of them, else home. Null: nothing names the page.
 * @param {Reach} reach
 * @param {{ comment: string | null, lastRead: string | null }} known
 * @returns {string | null}
 */
export function beforePage(reach, { comment, lastRead }) {
  if (comment !== null) return comment
  if (reach.page !== null) return reach.page
  if (reach.shared === null) return null
  if (lastRead !== null) return lastRead
  const on = reach.shared === 'some' ? (reach.usedOn ?? []) : []
  if (on.length > 0) return on.includes('/') ? '/' : on[0]
  return '/'
}

/**
 * The OTHER pages a shared write is looked at on, at most {@link EXTRA_PAGES_MAX}: home when it is not
 * the page already checked, then, of the pages this conversation read (`reads`, newest first), the one
 * whose length differs most from the checked page's (or from the mean of the others when that is not
 * known). An element only some pages show (`some`) is looked at only on the pages it is known to be on
 * (`usedOn`): home if it is one, then the one most different in length among those read, else the
 * first of them; none when nothing says where it is.
 * @param {Reach} reach
 * @param {{ main: string, reads: readonly { path: string, chars: number | null }[] }} known
 * @returns {string[]}
 */
export function extraPages(reach, { main, reads }) {
  if (reach.shared !== 'site' && reach.shared !== 'some') return []
  const checked = pageOf(main)
  const on = reach.shared === 'some' ? (reach.usedOn ?? []).map(pageOf).filter((p) => p !== null) : null
  if (on !== null && on.length === 0) return []
  /** @param {string | null} page */
  const mayShow = (page) => page !== null && (on === null || on.includes(page))
  /** @type {string[]} */
  const out = []
  if (checked !== '/' && mayShow('/')) out.push('/')
  const others = reads.filter((r) => {
    const page = pageOf(r.path)
    return page !== null && page !== checked && page !== '/' && typeof r.chars === 'number' && mayShow(page)
  })
  if (others.length > 0) {
    const own = reads.find((r) => pageOf(r.path) === checked && typeof r.chars === 'number')?.chars
    const ref =
      typeof own === 'number'
        ? own
        : others.reduce((sum, r) => sum + /** @type {number} */ (r.chars), 0) / others.length
    let best = others[0]
    for (const r of others)
      if (
        Math.abs(/** @type {number} */ (r.chars) - ref) > Math.abs(/** @type {number} */ (best.chars) - ref)
      )
        best = r
    const page = /** @type {string} */ (pageOf(best.path))
    if (!out.includes(page)) out.push(page)
  } else if (on !== null) {
    const first = on.find((page) => page !== checked && page !== '/')
    if (first !== undefined) out.push(/** @type {string} */ (first))
  }
  return out.slice(0, EXTRA_PAGES_MAX)
}

/**
 * @typedef {{ path: string, y: number, w: number, h: number, dark: boolean }} View
 * @typedef {{ view: View, jpeg: Buffer, y: number | null, loaded: boolean, takenAt: number, startedAt: number, epoch: number }} Drawn
 * @typedef {{ ok: true, jpeg: Buffer, y: number | null, loaded: boolean } | { ok: false, code: string }} Capture
 * @typedef {{ spentMs: number, main: boolean, shared: boolean, pending: Promise<unknown> | null }} Hold
 * @typedef {{ turn: number, text: string, comment: boolean, before: any, checked: boolean,
 *   missing?: string, extras?: Drawn[], agreed?: string[], hold?: Hold, fallback?: Drawn }} HeldAsk
 *   `fallback`: the early picture a write that named no page waited for — the "before" only when the
 *   turn ends with no other ({@link EarlyPicture}).
 * @typedef {{ path: string, picture: Promise<Drawn | string> }} EarlyPicture
 *   The page drawn as the turn began, before anything was written (the host's step listener): the page
 *   the comment was pinned on, else the one the customer has open, else the one last read, else home.
 *   `picture` is why there is none instead (`capture-<code>`, `before-not-loaded`, `written-first`: the
 *   site was written before it was done), and never rejects.
 */

/**
 * The window a turn's early picture is drawn in: the page the comment was pinned on, else the page the
 * customer has open (in their window and scroll), else the page last read, else home — in the customer's
 * window when it is known, else {@link HOLD_WINDOW}.
 * @param {{ comment: string | null, open: View | null, lastRead: string | null }} known
 * @returns {View}
 */
export function earlyView({ comment, open, lastRead }) {
  const path = comment ?? open?.path ?? lastRead ?? '/'
  if (open !== null && pageOf(open.path) === pageOf(path)) return { ...open, path }
  const window = open ?? HOLD_WINDOW
  return { path, y: 0, w: window.w, h: window.h, dark: window.dark }
}

/**
 * Start the turn's early picture ({@link EarlyPicture}) of `view`, now — before any write of the turn.
 * 🔒 ONLY A PICTURE OF THE SITE AS IT WAS. A drawing the site was written under (by this turn, whose
 * first write `wroteAt` marks once it is let go, or by anyone, `lastWrite`) is `written-first`, never a
 * "before"; a hold waiting for it gets the same answer and the write goes.
 * @param {{ view: View, draw: (view: View) => Promise<Capture>, lastWrite: () => number | null,
 *   wroteAt: () => number | undefined, now?: () => number }} job
 * @returns {EarlyPicture}
 */
export function earlyPicture({ view, draw, lastWrite, wroteAt, now = Date.now }) {
  const startedAt = now()
  const picture = Promise.resolve()
    .then(() => draw(view))
    .then(
      (got) => {
        if (!got.ok) return `capture-${got.code}`
        if (!got.loaded) return 'before-not-loaded'
        const last = lastWrite()
        if (wroteAt() !== undefined || (last !== null && last >= startedAt)) return 'written-first'
        return /** @type {Drawn} */ ({
          view,
          jpeg: got.jpeg,
          y: got.y,
          loaded: true,
          takenAt: now(),
          startedAt,
          epoch: -1
        })
      },
      () => 'capture-ERROR'
    )
  return { path: view.path, picture }
}

/**
 * Race a promise against a clock: null when the clock wins — and a drawing that lost is never used,
 * since the write it was holding went meanwhile. A promise that fails answers `failed`.
 * @template T
 * @param {Promise<T>} promise @param {number} ms @param {T} failed
 * @returns {Promise<T | null>}
 */
function within(promise, ms, failed) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.max(0, ms))
    promise.then(
      (got) => {
        clearTimeout(timer)
        resolve(got)
      },
      () => {
        clearTimeout(timer)
        resolve(failed)
      }
    )
  })
}

/**
 * Hold one write of a turn until the pictures its check needs from BEFORE it are drawn, or the budget
 * is gone. Mutates `ask`: `before` (the main page), `extras` (other pages of a shared element),
 * `missing` (why no main page was drawn), `agreed` (the scope the customer was asked about), `hold`.
 * At most one main draw and one round of extra pages per turn; a second write sent while the first is
 * held waits for the same drawing. Never throws.
 * @param {{
 *   ask: HeldAsk,
 *   reach: Reach,
 *   reads: readonly { path: string, chars: number | null }[],
 *   window?: { w: number, h: number, dark: boolean },
 *   draw: (view: View) => Promise<Capture>,
 *   early?: EarlyPicture,
 *   usage?: (reach: Reach) => Promise<Usage | null>,
 *   now?: () => number,
 *   budgetMs?: number
 * }} job
 *   `usage`: where a `some` element shows, asked only when its write is held and only within the
 *   budget (a Joomla module's assignment).
 *   `early`: the turn's early drawing — the main "before" of a write that names no page, of a write
 *   every page shows, and of a write on that same page, waited for within the budget instead of a draw.
 * @returns {Promise<{ heldMs: number, drew: string[], missing: string | null }>}
 */
export async function holdForBefore(job) {
  const now = job.now ?? Date.now
  const started = now()
  const { ask } = job
  const hold = (ask.hold ??= { spentMs: 0, main: false, shared: false, pending: null })
  const had = ask.missing
  /** Why no main page was drawn, said once: by the call that found it. */
  const missing = () => (ask.missing !== undefined && ask.missing !== had ? ask.missing : null)
  try {
    // A write sent beside one already held waits for that drawing, then asks again what it needs.
    while (hold.pending !== null) await hold.pending
    const run = drawFor(job, hold)
    hold.pending = run
    const drew = await run.finally(() => {
      hold.pending = null
    })
    return { heldMs: now() - started, drew, missing: missing() }
  } catch {
    return { heldMs: now() - started, drew: [], missing: missing() }
  }
}

/**
 * The drawing itself, once the turn's earlier hold is done.
 * @param {Parameters<typeof holdForBefore>[0]} job @param {Hold} hold
 * @returns {Promise<string[]>} the pages drawn.
 */
async function drawFor(job, hold) {
  const now = job.now ?? Date.now
  const { ask } = job
  const needMain = !hold.main && !usableBefore(ask)
  const needShared = !hold.shared && job.reach.shared !== null
  if (!needMain && !needShared) return []
  const budget = (job.budgetMs ?? BEFORE_HOLD_MS) - hold.spentMs
  const started = now()
  // 🔒 A read that timed out spent the budget. The timer runs on its own clock while `now` counts whole
  // ms, so right after a timeout the clock can still read 1 ms left, and that ms must not draw a page.
  let spent = false
  const left = () => (spent ? 0 : budget - (now() - started))
  /**
   * A read inside the budget: `failed` when it fails, null when the budget ran out first (and then
   * nothing else is drawn).
   * @template T
   * @param {Promise<T>} promise @param {T} failed
   * @returns {Promise<T | null>}
   */
  const inBudget = async (promise, failed) => {
    const got = await within(promise, left(), failed)
    if (got === null) spent = true
    return got
  }
  /** @type {string[]} */
  const drew = []
  try {
    let reach = job.reach
    // Where an element only some pages show is, asked once, inside the budget.
    if (reach.shared === 'some' && reach.usedOn === undefined && job.usage !== undefined && left() > 0) {
      const usage = await inBudget(job.usage(reach), false)
      if (usage === false || usage === null) reach = job.reach
      else if (usage.all === true) reach = { ...reach, shared: 'site' }
      else reach = { ...reach, usedOn: usage.pages }
    }
    /** @type {string | null} */
    let main = null
    let fromEarly = false
    if (needMain) {
      main = beforePage(reach, {
        comment: ask.comment ? commentPage(ask.text) : null,
        lastRead: job.reads[0]?.path ?? null
      })
      // 🔒 THE PAGE DRAWN AS THE TURN BEGAN (23/10/2026). A stylesheet every page loads is looked at on
      // the page the customer has open, drawn before anything was written, and so is a write on that same
      // page. A write that names ANOTHER page is still drawn on that page. A write that names no page (a
      // template file, a shell command — a shell READ counts as a write here) keeps it only as the turn's
      // FALLBACK, and leaves the chance at a main picture to the next write that names its page.
      const early = job.early
      /** @type {string | null} */
      let why = null
      if (early !== undefined && left() > 0) {
        const fits = main === null || reach.shared === 'site' || pageOf(main) === pageOf(early.path)
        const wanted = main === null ? ask.fallback === undefined : fits
        if (wanted) {
          const got = await inBudget(early.picture, /** @type {Drawn | string} */ ('capture-ERROR'))
          if (got === null || typeof got === 'string') why = got ?? 'capture-timeout'
          else if (main === null) {
            ask.fallback = got
            drew.push(got.view.path)
          } else {
            ask.before = got
            delete ask.missing
            drew.push(got.view.path)
            fromEarly = true
            main = null
          }
        }
      }
      // A write that names no page leaves the turn's chance to the next one (and so does its shared round:
      // other pages are judged beside a main pair only).
      if (main === null && !fromEarly) {
        if ((ask.before === null || ask.before === undefined) && ask.fallback === undefined)
          ask.missing = why ?? 'no-target'
        return drew
      }
    }
    // Only a write that names its page uses the turn's one chance at each.
    if (needMain) hold.main = true
    if (needShared) {
      hold.shared = true
      if (reach.sentence !== '')
        ask.agreed = [...new Set([...(ask.agreed ?? []), reach.sentence])].slice(0, 3)
    }
    const checked = main ?? (usableBefore(ask) ? String(ask.before.view.path) : null)
    const extras =
      needShared && checked !== null ? extraPages(reach, { main: checked, reads: job.reads }) : []
    const pages = [
      ...(main !== null ? [{ path: main, main: true }] : []),
      ...extras.map((path) => ({ path, main: false }))
    ]
    const window = job.window ?? HOLD_WINDOW
    for (const page of pages) {
      const view = { path: page.path, y: 0, w: window.w, h: window.h, dark: window.dark }
      if (left() <= 0) {
        if (page.main) ask.missing = 'capture-timeout'
        break
      }
      const at = now()
      const got = await inBudget(job.draw(view), /** @type {Capture} */ ({ ok: false, code: 'ERROR' }))
      if (got === null) {
        if (page.main) ask.missing = 'capture-timeout'
        break
      }
      if (!got.ok || !got.loaded) {
        if (page.main) {
          ask.missing = got.ok ? 'before-not-loaded' : `capture-${got.code}`
          break
        }
        continue
      }
      /** @type {Drawn} */
      const shot = { view, jpeg: got.jpeg, y: got.y, loaded: true, takenAt: now(), startedAt: at, epoch: -1 }
      if (page.main) {
        ask.before = shot
        delete ask.missing
      } else ask.extras = [...(ask.extras ?? []), shot].slice(0, EXTRA_PAGES_MAX)
      drew.push(page.path)
    }
  } finally {
    hold.spentMs += now() - started
  }
  return drew
}

// ── what the host already knows of pages ──────────────────────────────────────────────────────────

/**
 * The pages a `page.text` or `page.look` answer read, each with the length of its text (null when the
 * answer carries none — a look). Only the pages that answered.
 * @param {Record<string, unknown>} params - the call's params.
 * @param {unknown} answer
 * @returns {{ path: string, chars: number | null }[]}
 */
export function pageReadsOf(params, answer) {
  const a = isRecord(answer) ? /** @type {Record<string, unknown>} */ (answer) : null
  if (a === null || a.ok !== true) return []
  /** @param {unknown} v */
  const chars = (v) => (typeof v === 'string' ? v.length : null)
  if (Array.isArray(a.pages))
    return a.pages
      .filter((p) => isRecord(p) && typeof p.path === 'string' && p.path.startsWith('/') && p.ok !== false)
      .map((p) => ({ path: String(p.path), chars: chars(p.text) }))
  const path = typeof params?.path === 'string' && params.path.startsWith('/') ? params.path : '/'
  return [{ path, chars: chars(a.text) }]
}

/**
 * The pages each conversation read, newest first, with their lengths (bounded: {@link PAGE_READS_KEEP}
 * per conversation, `keep` conversations, the least recently used dropped first).
 * @param {{ keep?: number }} [opts]
 */
export function createPageReads({ keep = 200 } = {}) {
  /** @type {Map<string, { path: string, chars: number | null }[]>} */
  const by = new Map()
  return {
    /** @param {string} key @param {readonly { path: string, chars: number | null }[]} reads */
    note(key, reads) {
      if (typeof key !== 'string' || key === '' || reads.length === 0) return
      const kept = [...reads, ...(by.get(key) ?? [])]
      /** @type {{ path: string, chars: number | null }[]} */
      const out = []
      for (const r of kept) {
        const page = pageOf(r.path)
        if (page === null || out.some((o) => pageOf(o.path) === page)) continue
        out.push(r)
      }
      by.delete(key)
      by.set(key, out.slice(0, PAGE_READS_KEEP))
      while (by.size > keep) by.delete(/** @type {string} */ (by.keys().next().value))
    },
    /** @param {string} key */
    of: (key) => by.get(key) ?? []
  }
}

/** The biggest answer text read for addresses. */
const LEARN_MAX_TEXT = 400_000

/**
 * The page a Joomla menu item is: home at `/`, any other at `/index.php?Itemid=<id>` — the address
 * Joomla serves a menu item's page at whatever its SEF routes and language prefixes are.
 * @param {number} id @param {boolean} home
 */
const joomlaItemPage = (id, home) => (home ? '/' : `/index.php?Itemid=${id}`)

/**
 * Where a Joomla module shows, from its `#__modules_menu` rows as the component answers
 * `content.get {kind:"moduleAssignment"}` (`menuids`, a JSON list): `0` is every page, a negative id
 * every page but that one (still more pages than the host could name), positive ids those pages only,
 * none no page. Null when the answer is not such a list.
 * @param {unknown} menuids @param {(id: number) => boolean} isHome
 * @returns {Usage | null}
 */
export function usageOfMenuIds(menuids, isHome) {
  let ids = menuids
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids)
    } catch {
      return null
    }
  }
  if (!Array.isArray(ids) || !ids.every((n) => Number.isInteger(Number(n)))) return null
  const nums = ids.map(Number)
  if (nums.some((n) => n <= 0)) return { all: true, pages: [] }
  return { all: false, pages: [...new Set(nums.map((n) => joomlaItemPage(n, isHome(n))))] }
}

/**
 * What the host learns of addresses from the answers the agent already asked for, per site:
 * - EmDash: each collection's `urlPattern` (`schema_list_collections`, `schema_get_collection`) and
 *   each entry's slug (`content_get`, `content_list`). An entry's page is its collection's pattern
 *   with the slug in it, or the pattern itself when it has none (that collection IS a page: `/about`).
 * - Joomla: the contract inspect's page list (each page's menu item and the modules assigned to it,
 *   `all`/`include`/`exclude`), its slots' records, the menu items read as home, and each module's
 *   `moduleAssignment` read.
 * - The regions a replace's own dryRun found its places in (`would[].where`), per conversation.
 * Nothing is asked of the site for any of it here. Bounded.
 * @param {{ keep?: number }} [opts]
 */
export function createRecordPages({ keep = 2000 } = {}) {
  /** @type {Map<string, string>} label\0collection → urlPattern */
  const patterns = new Map()
  /** @type {Map<string, string>} label\0collection\0id → slug */
  const slugs = new Map()
  /**
   * label → the contract's pages: menu item id, home or not, the article it shows, its modules.
   * @type {Map<string, { item: number, home: boolean, article: number, modules: Map<string, string> }[]>}
   */
  const contractPages = new Map()
  /** @type {Map<string, string>} label\0slotKey → its record (`module-428`); `identity` marks a site identity slot */
  const slotEntities = new Map()
  /** @type {Map<string, string>} label\0moduleId → its `menuids` */
  const assignments = new Map()
  /** @type {Map<string, string>} label\0menuItemId → '1' when it is a home */
  const homes = new Map()
  /** @type {Map<string, string>} sessionId\0replaceKey → the regions its dryRun found, comma-joined */
  const replaces = new Map()
  /** @param {Map<string, any>} map @param {string} key @param {any} value */
  const put = (map, key, value) => {
    map.delete(key)
    map.set(key, value)
    while (map.size > keep) map.delete(/** @type {string} */ (map.keys().next().value))
  }
  /**
   * @param {string} label @param {unknown} value @param {string} collection @param {number} depth
   */
  const walk = (label, value, collection, depth) => {
    if (depth > 6) return
    let v = value
    if (typeof v === 'string') {
      const s = v.trim()
      if (s.length > LEARN_MAX_TEXT || !(s.startsWith('{') || s.startsWith('['))) return
      try {
        v = JSON.parse(s)
      } catch {
        return
      }
    }
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 500)) walk(label, item, collection, depth + 1)
      return
    }
    if (!isRecord(v)) return
    const o = /** @type {Record<string, unknown>} */ (v)
    const slug = text(o.slug)
    const pattern = text(o.urlPattern)
    if (slug !== '' && pattern.startsWith('/')) put(patterns, `${label}\0${slug}`, pattern)
    const id = text(o.id)
    const of = text(o.type) || text(o.collection) || collection
    if (slug !== '' && id !== '' && of !== '' && pattern === '') put(slugs, `${label}\0${of}\0${id}`, slug)
    for (const [key, inner] of Object.entries(o))
      if (
        key !== 'data' &&
        key !== 'seo' &&
        (isRecord(inner) || Array.isArray(inner) || typeof inner === 'string')
      )
        walk(label, inner, collection, depth + 1)
  }
  /**
   * The `menuids` a moduleAssignment read answered, wherever the answer carries it (`item`, `result`).
   * @param {unknown} v @param {number} depth @returns {unknown}
   */
  const menuIdsIn = (v, depth) => {
    if (depth > 3 || !isRecord(v)) return undefined
    const o = /** @type {Record<string, unknown>} */ (v)
    if (o.menuids !== undefined) return o.menuids
    for (const inner of Object.values(o)) {
      const found = menuIdsIn(inner, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  /** @param {string} label @param {number} id */
  const isHome = (label, id) =>
    homes.has(`${label}\0${id}`) || (contractPages.get(label) ?? []).some((p) => p.item === id && p.home)
  /**
   * Learn a contract inspect: its `pages` (when it lists them) and its slots' records.
   * @param {string} label @param {unknown} value @param {number} depth
   */
  const walkContract = (label, value, depth) => {
    if (depth > 4 || !isRecord(value)) return
    const o = /** @type {Record<string, unknown>} */ (value)
    if (Array.isArray(o.pages) && o.pages.some((pg) => isRecord(pg) && Array.isArray(pg.assignedModules))) {
      let homeSeen = false
      const pages = []
      for (const pg of o.pages.slice(0, 500)) {
        if (!isRecord(pg)) continue
        const m = /^menuItem-(\d+)$/.exec(text(pg.entity))
        if (m === null) continue
        const home = text(pg.route) === 'home' && !homeSeen
        if (home) homeSeen = true
        const link = text(pg.link)
        const article = /[?&]view=article\b/.test(link) ? positiveId(/[?&]id=(\d+)/.exec(link)?.[1]) : 0
        /** @type {Map<string, string>} */
        const modules = new Map()
        for (const mod of Array.isArray(pg.assignedModules) ? pg.assignedModules.slice(0, 500) : [])
          if (isRecord(mod) && text(mod.entity) !== '')
            modules.set(text(mod.entity), text(mod.assignmentMode) || 'include')
        pages.push({ item: Number(m[1]), home, article, modules })
      }
      if (pages.length > 0) put(contractPages, label, pages)
    }
    if (Array.isArray(o.slots))
      for (const slot of o.slots.slice(0, 5000)) {
        if (!isRecord(slot) || text(slot.key) === '') continue
        const identity = slot.siteIdentity === true || text(slot.label).startsWith('[Tracy] Site identity')
        const entity = identity ? 'identity' : text(slot.entity)
        if (entity !== '') put(slotEntities, `${label}\0${text(slot.key)}`, entity)
      }
    for (const key of ['answer', 'result', 'value'])
      if (isRecord(o[key])) walkContract(label, o[key], depth + 1)
  }
  /**
   * Where a Joomla record of the contract shows, or null when the host knows nothing of it.
   * @param {string} label @param {string} entity @returns {Usage | null}
   */
  const usageOfEntity = (label, entity) => {
    if (entity === 'identity') return { all: true, pages: [] }
    const pages = contractPages.get(label) ?? []
    const item = /^menuItem-(\d+)$/.exec(entity)
    if (item !== null) {
      const id = Number(item[1])
      return { all: false, pages: [joomlaItemPage(id, isHome(label, id))] }
    }
    const article = /^article-(\d+)$/.exec(entity)
    if (article !== null) {
      const id = Number(article[1])
      const shown = pages.filter((p) => p.article === id).map((p) => joomlaItemPage(p.item, p.home))
      return {
        all: false,
        pages: shown.length > 0 ? shown : [`/index.php?option=com_content&view=article&id=${id}`]
      }
    }
    const post = /^post-(\d+)$/.exec(entity)
    if (post !== null) return { all: false, pages: [`/?p=${post[1]}`] }
    if (entity.startsWith('templatePart-')) return { all: true, pages: [] }
    const module = /^module-(\d+)$/.exec(entity)
    if (module === null) return null
    const on = pages.filter((p) => p.modules.has(entity))
    if (on.some((p) => p.modules.get(entity) !== 'include')) return { all: true, pages: [] }
    if (on.length > 0) return { all: false, pages: on.map((p) => joomlaItemPage(p.item, p.home)) }
    const menuids = assignments.get(`${label}\0${module[1]}`)
    return menuids === undefined ? null : usageOfMenuIds(menuids, (id) => isHome(label, id))
  }
  return {
    /**
     * One `tracy_site` answer, as the agent got it (or the full inspect the host kept of it): a
     * contract inspect, a module's assignment, menu items read as home, a replace's dryRun.
     * @param {string | null} label @param {string | null} sessionId @param {unknown} args @param {unknown} answer
     */
    learnSite(label, sessionId, args, answer) {
      if (typeof label !== 'string' || label === '' || !isRecord(answer)) return
      const a = /** @type {Record<string, unknown>} */ (answer)
      try {
        const { action, params } = canonicalCall(args)
        const p = /** @type {Record<string, unknown>} */ (params)
        if (action === 'content.contract') walkContract(label, a, 0)
        if ((action === 'content.get' || action === 'content.list') && a.ok !== false) {
          const kind = text(p.kind)
          const items = [a.item, ...(Array.isArray(a.items) ? a.items : [])].filter(isRecord)
          if (kind === 'moduleAssignment' && action === 'content.get') {
            const id = positiveId(p.id)
            const menuids = menuIdsIn(a, 0)
            if (id > 0 && menuids !== undefined)
              put(
                assignments,
                `${label}\0${id}`,
                typeof menuids === 'string' ? menuids : JSON.stringify(menuids)
              )
          }
          if (kind === 'menuItem')
            for (const it of items.slice(0, 1000)) {
              const row = /** @type {Record<string, unknown>} */ (it)
              const id = positiveId(row.id)
              if (id > 0 && (row.home === 1 || row.home === '1' || row.home === true))
                put(homes, `${label}\0${id}`, '1')
            }
        }
        if (
          action === 'content.replace' &&
          p.dryRun === true &&
          typeof sessionId === 'string' &&
          a.ok === true
        ) {
          const regions = new Set()
          for (const w of Array.isArray(a.would) ? a.would.slice(0, 500) : [])
            for (const r of text(/** @type {any} */ (w)?.where).split(','))
              if (r.trim() !== '') regions.add(r.trim())
          put(replaces, `${sessionId}\0${replaceKeyOf(p)}`, [...regions].join(','))
        }
      } catch {
        // an answer this cannot read teaches nothing
      }
    },
    /**
     * The regions the conversation's own dryRun of this replace found its places in, or null.
     * @param {string} sessionId @param {Record<string, unknown>} params @returns {string[] | null}
     */
    replaceRegions(sessionId, params) {
      const kept = replaces.get(`${sessionId}\0${replaceKeyOf(params)}`)
      return kept === undefined ? null : kept.split(',').filter((r) => r !== '')
    },
    /**
     * Where a Joomla module shows, from what the host learned, or null when nothing says.
     * @param {string} label @param {number} id @returns {Usage | null}
     */
    moduleUsage: (label, id) => usageOfEntity(label, `module-${id}`),
    /**
     * Where one contract apply's slots are: the first page they are on, shared when they are on every
     * page (a module assigned to all, the site identity) or on more than one. Null when no slot's
     * record is known.
     * @param {string} label @param {Record<string, unknown>} params @returns {Reach | null}
     */
    contractReach(label, params) {
      const changes = params?.changes
      const keys = Array.isArray(changes)
        ? changes.map((c) => text(/** @type {any} */ (c)?.key ?? /** @type {any} */ (c)?.slot))
        : isRecord(changes)
          ? Object.keys(/** @type {Record<string, unknown>} */ (changes))
          : []
      let all = false
      /** @type {string[]} */
      const pages = []
      let known = false
      for (const key of keys.filter((k) => k !== '').slice(0, 200)) {
        const entity = slotEntities.get(`${label}\0${key}`) ?? key.split(/[.:]/)[0]
        const usage = usageOfEntity(label, entity)
        if (usage === null) continue
        known = true
        if (usage.all) all = true
        for (const page of usage.pages) if (!pages.includes(page)) pages.push(page)
      }
      if (!known) return null
      const sentence = 'This changes words or pictures of a part other pages show too.'
      if (all) return { page: pages[0] ?? null, shared: 'site', sentence }
      if (pages.length > 1) return { page: pages[0], shared: 'some', sentence, usedOn: pages }
      return { page: pages[0] ?? null, shared: null, sentence: '' }
    },
    /**
     * One `tracy_emdash` answer, as the agent got it.
     * @param {string | null} label @param {unknown} args @param {unknown} answer
     */
    learnEmdash(label, args, answer) {
      if (typeof label !== 'string' || label === '') return
      const shape = /** @type {{ ok?: boolean, args?: Record<string, unknown> }} */ (
        normalizeEmdashShape(args)
      )
      const inner =
        shape.ok === true && isRecord(shape.args) ? /** @type {Record<string, unknown>} */ (shape.args) : {}
      const collection = text(inner.collection)
      try {
        walk(label, answer, collection, 0)
      } catch {
        // an answer the walk cannot read teaches nothing
      }
    },
    /**
     * The page an entry is shown on, or null when the host never saw its collection's address (or,
     * for an address with `{slug}`, the entry's slug).
     * @param {string} label @param {string} collection @param {string} id
     * @returns {string | null}
     */
    emdashPageOf(label, collection, id) {
      const pattern = patterns.get(`${label}\0${collection}`)
      if (pattern === undefined) return null
      if (!pattern.includes('{')) return pattern
      const slug = slugs.get(`${label}\0${collection}\0${id}`)
      if (slug === undefined) return null
      const page = pattern.replace('{slug}', encodeURIComponent(slug)).replace('{id}', encodeURIComponent(id))
      return page.includes('{') ? null : page
    }
  }
}
