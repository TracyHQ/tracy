/**
 * The pure half of `tracy_site`: who the call acts as, what goes to the seat book, and the four
 * actions that run here instead (`media.scan`, `page.look`, `page.text`, `content.find`). No network,
 * no filesystem —
 * `test/site.test.mjs` pins every decision; `index.ts` only carries them.
 */

// A fleet label, as the path fence reads one — reused, not restated.
import { QUICKSTART_DESIGN_RULE } from '../../../tracy-subprocess-docker/src/content-contract.mjs'
import { isLegacyStructureRefusal } from './legacy-refusal.mjs'
import { LABEL } from '../../../tracy-subprocess-docker/src/route.mjs'
// ⚠ A CYCLE, SAFE ONLY WHILE BOTH SIDES READ THE OTHER AT CALL TIME: `emdash.mjs` imports
// `budgetAnswer` from here (a function declaration, bound before any module runs), and this file reads
// `EMDASH_READ_TOOLS` inside `refusalNext` only. One list of EmDash reads, not a second copy here.
import { EMDASH_READ_TOOLS } from './emdash.mjs'
import { loopbackUrl } from './exec.mjs'
import { decodeEntities, entityText, NAMED, tameMarkup } from './html-units.mjs'
import { carriesListSearch, contentReadLists, contentReadType, listSearchCovers } from './list-search.mjs'

/**
 * Actions the seat book's Apply door knows (its APPLY_RULES). Anything else is refused HERE with the list.
 * `files.list`, `file.read` and `files.pack` are not here: tracy-web's APPLY_RULES has none of them,
 * so each call only ever came back `ACTION_NOT_ALLOWED`.
 */
export const RELAY_ACTIONS = Object.freeze([
  'info',
  'content.list',
  'content.get',
  'content.read',
  // Which record printed an element the customer picked in the Browser tab (comment → edit): the
  // seat book answers it from its own value index of content.read, with the `content` toolset.
  'content.locate',
  'extension.list',
  'plugin.list',
  'theme.list',
  'db.tables',
  'core.manifest',
  'content.batch',
  'content.contract',
  'content.update',
  'content.delete',
  // Words a WordPress theme prints at render time (claude-cowork `content.renderedWords`): replacement
  // rules for one page, proven against its rendered HTML; an older plugin answers `unavailable`. Only
  // the replace job calls it (`rendered-words.mjs`), so no surface lists it and planCall refuses it
  // (`ENGINE_ONLY_ACTIONS`).
  'content.renderedWords',
  // Sets a page's language and links its translations together (WordPress: Polylang). A component
  // without this action answers "unknown action" — a readable refusal, and the caller treats it as
  // a warning, not a broken build (08/09, the same path theme.style took).
  'content.language',
  'media.upload',
  'media.delete',
  'apply.list',
  'apply.revert',
  // Operational, added 07/09 so a whole agency job fits in prompts instead of an SSH session.
  // Every one of these was already in the component; `core.upgrade` had been there for weeks with
  // no way to reach it, because a verb has to appear in all three allowlists — component, the seat
  // book's APPLY_RULES, and this list — and nobody had fed the last two.
  'extension.install',
  'extension.enable',
  // The theme half of the same pair. The seat book has allowed these all along (`APPLY_RULES`,
  // tier `code`); this tool simply never listed them, because until builds started dressing sites
  // nothing here installed a look. Adding a name grants nothing: the seat book still asks whether
  // the viewer's role may write code on that site (tasks/todo-build-new-site.md §B2).
  'theme.install',
  'theme.activate',
  // Picks one of the 152 styles of the installed look. A component without this action answers
  // "unknown action" — a readable refusal (08/09, tasks/todo-build-new-site.md §B3).
  'theme.style',
  // Installs a core translation, so WordPress itself speaks the language the page was written in. The
  // component has it since 0.11.0 (22/09/2026); older ones answer "unknown action" — a readable
  // refusal, and the caller treats it as a warning, not a broken build (the path `theme.style` took).
  'language.install',
  // A Joomla template's logo, dark-background and small-screen logos, name, slogan and favicon (Claude Cowork for
  // Joomla 0.23.0); an older component answers "unknown action", a readable refusal like `theme.style` before it.
  'template.siteSettings',
  // Joomla's Global Configuration site name, site description and page-title setting (Claude Cowork for Joomla
  // 0.22.0, `lib/SiteIdentity.php`): recorded under its apply_id, so `apply.revert` puts the old values back.
  // 🔒 WITHOUT IT THE SITE NAME HAD NO RECORDED DOOR (ladder DL14/DL15, dsl2jo, 14/10/2026): asked to change
  // "the home title" on a home with no h1, the agent renamed the site with `php cli/joomla.php config:set` in
  // the shell (the open replace road even named that command). Nothing recorded it, so in the next
  // conversation the customer's "undo the title change" found no such change, and two articles were undone.
  'site.identity',
  'plugin.install',
  'plugin.activate',
  'core.upgrade',
  'db.dump',
  'db.snapshot',
  'db.rollback'
])

/**
 * The actions that never leave the lane: `media.scan` reads image files under the mounted webroot,
 * `page.look` photographs one page of the site with the image's own browser, `page.text` reads that
 * same page back as the words a visitor sees, and `content.find` says which file-backed layer holds a
 * string the customer pointed at.
 *
 * 🔒 `page.text` IS HERE BECAUSE THE AGENT KEPT BUILDING IT BY HAND. Measured across four sessions
 * (17/09): about fifteen bash calls went on `curl` piped into a tag-stripper, and in one session the
 * agent wrote the stripper TWICE — `/tmp/extract.php` and `/tmp/ascii.php` — because nothing carried
 * between calls. The per-turn reminder did point somewhere for this, at `browser_read`, which is
 * registered by no plugin in this repo or in dsh and never appears in a real session: the agent was
 * being sent to a door that is not there, and `curl` was the only thing left. A tool the model has
 * to assemble from a shell is a tool it assembles differently every time.
 */
/**
 * What the WRITE actions actually DO, in the words the agent reads.
 *
 * 🔒 THE DOOR HAS FOUR VERBS AND ITS DESCRIPTION NAMED TWO, for as long as there has been a
 * description. Measured 21/09 against the component in `claude-cowork`, both engines alike:
 * `$id = max(0, (int) ($p['id'] ?? 0))`, and `content.update` with that id at 0 INSERTS, answering
 * `{created:true, id}`. Adding is not a missing action — it is the same call with no id — and an
 * agent asked to add an article had no id to pass and no reason to think 0 meant anything. That
 * leaves it choosing between refusing and going round the door, and the working rules forbid the
 * second.
 *
 * Two more were invisible and worse to guess at: `content.delete` writes the kind's TRASH column
 * (Joomla's -2) instead of purging, which is exactly what keeps it revertable through the same
 * receipt; and on a record that exists, `parent_id`/`move_after` re-hang the node and everything
 * under it rather than writing a column.
 *
 * 🔒 IT LIVES HERE, BESIDE THE ACTION LISTS, SO IT CAN BE TESTED. The description is built in
 * `index.ts`, which no test has ever imported — which is how this drifted from the component in
 * the first place. The action vocabulary is already this file's job; the sentence describing it
 * belongs with it, and `test/site.test.mjs` now holds it to what the component does.
 */
/**
 * 🔒 RELAYED FOR AN ENGINE, NEVER FOR THE MODEL (review 23/10/2026). `content.renderedWords` writes
 * rules over what a page prints; only `content.replace` may call it, after every store it read held
 * none of the words (`replace-wordpress.mjs`). `planCall` refuses it whatever surface list it was
 * given, and with none at all: fail closed, so a conversation whose surface could not be read is no
 * road around those store checks. Not in `KNOWN_ACTIONS`, so no description offers it.
 */
export const ENGINE_ONLY_ACTIONS = Object.freeze(['content.renderedWords'])

export const WRITE_VERBS =
  "content.update {kind, id, fields, apply_id} EDITS one record; the SAME call with id left out (or 0) CREATES one and answers {created:true, id} — so adding, editing and translating are one verb, and apply.revert removes what an insert made. A kind that cannot be created refuses by name. On a record that already exists, parent_id / move_after MOVE it — re-hanging the node and everything under it — rather than writing a column. content.delete {kind, id, apply_id} TRASHES: it writes that kind's own trash column, so the same receipt undoes it and nothing is purged. "

export const LOCAL_ACTIONS = Object.freeze([
  'media.scan',
  'media.draw',
  'page.look',
  'page.text',
  'content.find',
  // The replace job (PR2, action form of D21): answered in the lane by `replace-road.mjs`, whose
  // every write leaves through the same relay as the rest of this tool.
  'content.replace',
  // The look undo (Brian, 29/09/2026, `look-undo.mjs`): puts back the files a look write changed,
  // from the copy the comment fence kept before it; answered in the lane, reaches no door.
  'look.revert',
  // One look change in one call (PR #926, `look-set.mjs`): reads the element's cascade, writes the
  // scoped rule or the token in the site's own theme/template files, keeps a look undo, reads again.
  'look.set',
  // A new page and its menu entry in one call (`page-create.mjs`): answered in the lane, every write
  // through the same relay and guards as `content.replace`'s (an EmDash site's through `tracy_emdash`'s road).
  'page.create'
])

/**
 * Who is looking at this lane, from a `hello` request: the Worker in front restates the viewer's
 * session in `x-tracy-session` and the public origin in `x-forwarded-host`/`x-forwarded-proto`
 * (measured 04/09 by tracy-add-site); a local profile has neither and the raw cookie and Host apply.
 *
 * @param {Record<string, string | string[] | undefined>} headers - request headers.
 * @param {unknown} body - parsed JSON body; `sessionId` is the dsh session the page is on.
 * @returns {{ cookie: string, origin: string, sessionId: string | null } | null} null when nothing identifies a viewer.
 */
export function viewerFromHello(headers, body) {
  /** @param {string} name */
  const first = (name) => {
    const v = headers[name]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const forwarded = first('x-tracy-session')
  const cookie = forwarded ? `tracy_sess=${forwarded}` : first('cookie')
  const host = first('x-forwarded-host') || first('host')
  const proto = first('x-forwarded-proto') || 'http'
  if (!cookie || !host) return null
  const b = /** @type {Record<string, unknown> | null} */ (body && typeof body === 'object' ? body : null)
  const sid = b && typeof b.sessionId === 'string' ? b.sessionId : null
  return {
    cookie,
    origin: `${proto}://${host}`,
    sessionId: /^session-[a-z0-9-]+$/i.test(sid ?? '') ? sid : null
  }
}

/**
 * The viewer a tool call acts as: the one bound to the agent's session, else the latest, else nobody.
 *
 * `allowLatest` is false on a host dsh: it serves every site on the host, so the latest viewer is
 * whoever last opened ANY session there, and signing a write with that cookie acts as a stranger.
 * @param {Map<string, {cookie:string, origin:string, at:number}>} bySession
 * @param {{cookie:string, origin:string, at:number} | null} latest
 * @param {string | undefined} sessionId
 * @param {boolean} [allowLatest] - whether another session's latest viewer may stand in (a lane).
 * @returns {{ viewer: {cookie:string, origin:string, at:number} | null, bound: boolean }}
 */
export function pickViewer(bySession, latest, sessionId, allowLatest = true) {
  if (sessionId && bySession.has(sessionId)) return { viewer: bySession.get(sessionId) ?? null, bound: true }
  return { viewer: allowLatest ? latest : null, bound: false }
}

/**
 * Validate one tool call. Returns the body to send to the Apply door, or a refusal the agent can act on.
 *
 * `target` names WHICH COPY of this site to write, and it is deliberately a sibling of `action`
 * rather than one of the action's own params: the Apply door reads it off the top of the body, and
 * the component never sees it at all. The seat book decides whether a target is allowed — it accepts
 * only this site's own copies (`<label>.<zone>` or `<label>--<slug>.<zone>`) and refuses a foreign
 * host outright, because the component token follows the URL.
 *
 * It exists because a site imported from a customer's own hosting has its registered endpoint on
 * THAT host: without a target, every call lands on production. Measured on fijitrips 07/09, the
 * expensive way.
 *
 * The tool no longer advertises it: tracy-web's Apply door refuses every non-empty target
 * (`APPLY_TARGET_NOT_ALLOWED`) until it can place a copy's address, so teaching it only taught a
 * call that always fails. It is still carried, so once the door resolves targets only the tool's
 * description and schema need it back.
 *
 * 🔒 THE REFUSAL NAMES THIS SITE'S ACTIONS, NOT ALL 33 (D24). `actions` is the surface the agent was
 * given (`SURFACE_ACTIONS[surface]`, passed by the tool); without it the full list stands. Measured
 * r2: on WordPress the global list offered `content.contract`, and C05 and C24 each tried it five
 * times. An action nobody knows is `BAD_ACTION`.
 *
 * ⚠ A KNOWN ACTION LEFT OFF THE SURFACE IS REFUSED HERE (`NOT_ON_THIS_PLATFORM`), which is NEW with
 * this gate — before it, such a call was relayed. It is P5's contract now (`surface.mjs`, "an action
 * left out is refused, not merely unmentioned"), and each omission there is a decision: `media.upload`
 * on both sealed surfaces, `db.*` on both sealed surfaces, `content.batch` on open Joomla. So every
 * next this file writes names only actions the surface carries (`notOnPlatformNext`, the
 * structural-refusal and missing-picture sentences), or it would send the agent into this refusal.
 *
 * Corrections, each reported in `notes` (only when there is one, so the answer of a clean call keeps
 * its exact shape): the contract's other names (`canonicalCall`), and every key the model put beside
 * `action` — moved into `params` only when `params` does not already say otherwise, and never
 * `siteKey` or `target`, which mean something where they are.
 *
 * @param {unknown} args - the model's arguments.
 * @param {{ actions?: readonly string[] }} [opts] - the surface's actions.
 * @returns {{ ok: true, action: string, params: Record<string, unknown>, local: boolean, target: string | null, siteKey: string | null, notes?: string[] } | { ok: false, code: 'BAD_ACTION' | 'NOT_ON_THIS_PLATFORM', asked: string, what?: string, actions: string[], error: string }}
 */
export function planCall(args, opts = {}) {
  const a = /** @type {Record<string, unknown>} */ (
    args && typeof args === 'object' && !Array.isArray(args) ? args : {}
  )
  const surface = Array.isArray(opts?.actions) ? [...opts.actions] : null
  const offered = (surface ?? [...LOCAL_ACTIONS, ...RELAY_ACTIONS]).filter(
    (x) => !ENGINE_ONLY_ACTIONS.includes(x)
  )
  const asked = typeof a.action === 'string' ? a.action.trim() : ''
  if (asked === '')
    return {
      ok: false,
      code: 'BAD_ACTION',
      asked,
      actions: offered,
      error: "action required: one of this site's actions"
    }
  const call = canonicalCall(a)
  const action = call.action
  const local = LOCAL_ACTIONS.includes(action)
  if (!local && !RELAY_ACTIONS.includes(action))
    return {
      ok: false,
      code: 'BAD_ACTION',
      asked,
      actions: offered,
      error: `unknown action "${asked.slice(0, 60)}"`
    }
  if (ENGINE_ONLY_ACTIONS.includes(action) || (surface !== null && !surface.includes(action)))
    return {
      ok: false,
      code: 'NOT_ON_THIS_PLATFORM',
      asked,
      what: action,
      actions: offered,
      error: `${action} is not one of this site's actions`
    }
  /** @type {string[]} */
  const notes = []
  if (action !== asked) notes.push(`action ${asked.slice(0, 40)} → ${action}`)
  const params = call.params
  const given =
    a.params && typeof a.params === 'object' && !Array.isArray(a.params)
      ? /** @type {Record<string, unknown>} */ (a.params)
      : {}
  for (const key of Object.keys(params))
    if (!(key in given))
      notes.push(
        key === 'operation' && action !== asked
          ? `operation "${params[key]}" (from the action's name)`
          : `${key} moved into params`
      )
  for (const key of Object.keys(a))
    if (!NOT_HOISTED.has(key) && a[key] !== undefined && a[key] !== null && !(key in params)) {
      params[key] = a[key]
      notes.push(`${key} moved into params`)
    }
  const target = typeof a.target === 'string' && a.target.trim() !== '' ? a.target.trim() : null
  // WHICH SITE. Absent means the one this lane serves — the shape every call had before builds
  // started creating sites (tasks/todo-build-new-site.md §B1). A named site is only ever a
  // REQUEST: the seat book still asks whether this viewer holds a seat there, so naming a site
  // grants nothing. What is checked here is the shape alone, because a malformed key would go
  // into a URL, and a URL we should never have asked for is worse than a refusal.
  const askedSite = typeof a.siteKey === 'string' ? a.siteKey.trim() : ''
  const siteKey = SITE_KEY.test(askedSite) ? askedSite : null
  return {
    ok: true,
    action,
    params,
    local,
    target,
    siteKey,
    ...(notes.length > 0 ? { notes } : {})
  }
}

/**
 * The keys beside `action` that stay where they are (TS-3): `action` and `params` are the call's own
 * frame, and `siteKey` and `target` mean something beside `action` (the site asked for, the copy to
 * write). Every OTHER key the model put there is moved into `params`.
 *
 * 🔒 MOVED, NOT DROPPED, SO V0 JUDGES IT. This was a list of 25 keys to move, and anything else beside
 * `action` (`search`, `slug`, `removes` …) vanished without a word — the silent drop the closed-params
 * check (D22) exists to stop: the component answers the unfiltered list and it looks filtered. In
 * `params`, a key the reader does not read is refused by name (`UNKNOWN_PARAM`), and one it does read
 * is sent. `__proto__` is the one key never moved: assigning it would change the object's prototype,
 * not add a parameter.
 */
const NOT_HOISTED = new Set(['action', 'params', 'siteKey', 'target', '__proto__'])

/** A site key as the fleet writes them: lower-case host-ish, no spaces, no path parts. */
const SITE_KEY = /^[a-z0-9][a-z0-9.-]{0,120}$/

/**
 * One call the LANE's own engine asks for, on a site it names (tasks/todo-build-new-site.md §B2).
 *
 * WHY A SEPARATE READER FROM `planCall`. That one parses what the MODEL asked and is forgiving —
 * an absent site means this lane's own. This one parses what the build engine asked, and there a
 * missing site is a bug: the engine dresses a site it created, and falling back to the lane's own
 * would install a theme over the customer's existing site. So: no default, and only actions the
 * tool actually relays.
 *
 * @param {unknown} args
 * @returns {{ ok: true, action: string, siteKey: string, params: Record<string, unknown>, target: string | null } | { ok: false, error: string }}
 */
export function applyRequest(args) {
  const a = /** @type {Record<string, unknown>} */ (args && typeof args === 'object' ? args : {})
  const action = typeof a.action === 'string' ? a.action.trim() : ''
  if (!RELAY_ACTIONS.includes(action))
    return { ok: false, error: `unknown action "${action}"; one of: ${RELAY_ACTIONS.join(', ')}` }
  const asked = typeof a.siteKey === 'string' ? a.siteKey.trim() : ''
  if (!SITE_KEY.test(asked)) return { ok: false, error: 'siteKey required, and must be a site key' }
  const params = /** @type {Record<string, unknown>} */ (
    a.params && typeof a.params === 'object' && !Array.isArray(a.params) ? a.params : {}
  )
  const target = typeof a.target === 'string' && a.target.trim() !== '' ? a.target.trim() : null
  return { ok: true, action, siteKey: asked, params, target }
}

/**
 * The names a model gives the content contract that are not its name, each with the action it
 * means and the operation its suffix carries (`null` when it carries none).
 *
 * 🔒 ONE TABLE, BECAUSE THREE READERS DISAGREED ABOUT THE SAME CALL. Measured on r2 (25/09/2026):
 * 5 calls spelled the contract `content_contract`, `contract.inspect` or `content.contract.apply`
 * (1 more in older sessions). The relay refused them by name, while the step counter
 * (`changesSite`), the parallel-read rule (`actionRunsInParallel`) and the preview reload
 * (`tracy-site-tabs` `callChangedSite`) each read the raw `action` and each drew its own
 * conclusion — an unknown verb is a write to two of them and exclusive to the third.
 * `canonicalCall` is the one reading all three share, so a new spelling is one row here.
 *
 * Null-prototype on purpose: a lookup with `constructor` or `toString` finds nothing instead of
 * Object's own function, so `ACTION_ALIASES[asked]` is safe for any string a model sends.
 */
export const ACTION_ALIASES = Object.freeze(
  Object.assign(/** @type {Record<string, readonly [string, string | null]>} */ (Object.create(null)), {
    content_contract: Object.freeze(['content.contract', null]),
    contract: Object.freeze(['content.contract', null]),
    'contract.inspect': Object.freeze(['content.contract', 'inspect']),
    'content.contract.inspect': Object.freeze(['content.contract', 'inspect']),
    'contract.apply': Object.freeze(['content.contract', 'apply']),
    'content.contract.apply': Object.freeze(['content.contract', 'apply'])
  })
)

/**
 * The keys a model puts beside `action` that `canonicalCall` moves into `params` when `params`
 * does not already carry them. Only the two a classifier reads: `operation` decides whether a
 * contract call reads or writes, and `dryRun` whether a replace writes at all. The wider move of
 * misplaced keys belongs to `planCall`, which relays the call; this helper only reads it.
 */
const CANONICAL_HOIST = Object.freeze(['operation', 'dryRun'])

/**
 * One `tracy_site` call in the form every classifier reads: the action with its alias resolved,
 * and the params the relay sends.
 *
 * 🔒 IT READS THE CALL THE WAY THE RELAY WILL SEND IT, OR A CLASSIFIER JUDGES A CALL THAT NEVER
 * HAPPENS. So the order is the relay's: a `params` value wins; else the top-level key the model
 * put beside `action`; else the operation the alias's suffix carries. `{action:"contract.apply",
 * operation:"inspect"}` is an inspect, because that is what reaches the component. Absent means
 * missing or `null` — JSON's only way to say nothing.
 *
 * `args` is what a `tool/call` event holds: parsed, or the JSON text of it. Pure and total — any
 * other value (garbage text, an array, a number) reads as `{action:'', params:{}}`, the call no
 * classifier treats as a known action. It never throws: its readers are event listeners, and a
 * throw there would stop the turn over a call the relay would simply refuse.
 *
 * @param {unknown} args - the call's arguments, parsed or as JSON text.
 * @returns {{ action: string, params: Record<string, unknown> }} `params` is a new object; `args`
 *   is never mutated.
 */
export function canonicalCall(args) {
  let a = args
  if (typeof a === 'string') {
    try {
      a = JSON.parse(a)
    } catch {
      a = null
    }
  }
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { action: '', params: {} }
  const r = /** @type {Record<string, unknown>} */ (a)
  const asked = typeof r.action === 'string' ? r.action.trim() : ''
  const alias = ACTION_ALIASES[asked]
  const action = alias ? alias[0] : asked
  const raw = r.params
  const params = /** @type {Record<string, unknown>} */ (
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {}
  )
  /** @param {unknown} v */
  const absent = (v) => v === undefined || v === null
  for (const key of CANONICAL_HOIST) if (absent(params[key]) && !absent(r[key])) params[key] = r[key]
  if (alias && alias[1] !== null && absent(params.operation)) params.operation = alias[1]
  // The replace job takes `dry_run` for `dryRun` (`REPLACE_ALIASES`): every reader of "did this call
  // change the site" — the step counter, the preview — reads it the same way (review, 25/09).
  if (action === 'content.replace' && absent(params.dryRun)) {
    const dry = !absent(params.dry_run) ? params.dry_run : r.dry_run
    if (!absent(dry)) {
      params.dryRun = dry
      delete params.dry_run
    }
  }
  // G3 (27/09/2026): "everywhere" sent as a PLACE — `where:"all"` (A1 WP C04, answered BAD_PARAMS) —
  // is `all:true`: `where` names one region, and no region is called that.
  if (action === 'content.replace' && typeof params.where === 'string') {
    const all =
      WHERE_MEANS_ALL[/** @type {keyof typeof WHERE_MEANS_ALL} */ (params.where.trim().toLowerCase())]
    if (all !== undefined) {
      delete params.where
      if (absent(params.all)) params.all = all
    }
  }
  return { action, params }
}

/** `where` values that name no region but a reach: every place, or every place on this page. */
const WHERE_MEANS_ALL = Object.freeze({
  all: true,
  everywhere: true,
  every: true,
  any: true,
  '*': true,
  site: true,
  whole: true,
  page: 'page'
})

/**
 * What the agent tells a Viewer whose ask would change the site (ADR 0028 §3). Measured 08/10/2026:
 * told only that a role with the content toolset was needed, the agent sent a Viewer to the CMS admin
 * ("Menu → …"), which a Viewer cannot open. Exported for the tests.
 */
export const VIEWER_REFUSED_NEXT =
  'This person is a Viewer on this site: they can view it and ask about it, and changes need edit access. Tell them so, and that they can press "Ask for edit access" below the chat box to ask the site\'s owners. Do not suggest the CMS admin or any other tool or way to make the change; do not work around it.'

/**
 * The next step a refusal leaves the model, by the refusal's code. A bare code is a dead end: the
 * model retried, explored, or worked around it.
 *
 * 🔒 EVERY CODE THE APPLY DOOR CAN ANSWER ON THIS PATH NEEDS A CASE, and `check-refusal-next`
 * holds that: it reads the codes out of the door itself (`apps/tracy-web/src/sites/route.js` —
 * the apply handler plus the two helpers it calls) and refuses a code nothing here translates.
 *
 * WHY A GATE AND NOT A REVIEW. Measured 16/09 on "Change Cassiopeia to DavidVipPro": the first
 * call came back `NOT_SIGNED_IN`, this function had no case for it, and the model spent fifteen
 * more steps working around a closed door — reading the CLI, being refused `configuration.php`
 * twice, then writing a PHP script that bootstrapped Joomla's own database API. None of that was
 * the model being wordy. A two-step job became eighteen because one refusal named no way out, and
 * nine of the thirteen codes this door answers were in exactly that state.
 *
 * TWO FAMILIES, AND THE DIFFERENCE IS THE WHOLE POINT. `COMPONENT_NOT_REGISTERED` means this site
 * has NO door — the database may genuinely be the only way, and the working rules say what that
 * owes the customer first (`site-context.mjs`). The auth codes below mean the door is there and
 * THIS CALL carried nobody: that is a session to repair, not a lock to climb, so each one says so.
 *
 * 🔒 THE COMPONENT'S CODE ARRIVES ON `error`, NOT ON `code` (D24). The component answers
 * `{ok:false, error:"bad_params", message}`; tracy-web returns it verbatim, and this function used to
 * switch on `code` alone — so the `bad_params` case written for exactly this (20/09) never ran on a real
 * answer. Measured r2 (25/09/2026): 62 of 62 `bad_params`, 57 of 57 `bad_action`, 17 of 17
 * `write_failed` and 28 of 28 `not_found` answers got "This site answered no" — 172 answers told to
 * stop where one corrected call was the way on. The test that passed `code:'bad_params'` is how it
 * survived. A code on `error` counts only when it IS a code (`bad_params`), never a sentence.
 *
 * Every sentence below the door codes follows the refusal template (T10, V6 §5.2): one call, ready to
 * send, or one instruction; at most 200 characters; it names only actions on the site's own surface
 * (`facts.actions` when the tool passes it). Self-repair measured on r2 was 45 % when a refusal gave
 * the rule and the value received, and 4 % when it gave no cause.
 *
 * @param {unknown} answer - what the Apply door (or this hop) answered.
 * @param {{ platform?: string | null, action?: string | null, actions?: readonly string[] | null, sealed?: boolean | null, tool?: string | null, customerRemoval?: boolean, shrinkAgain?: boolean, asked?: Record<string, unknown> | null, noListSearch?: boolean } | string | null} [given]
 *   what the tool knows about the call: the site's platform and seal, the action asked, the surface,
 *   the params it was sent with (`asked`: for the one sentence that quotes what was sent — a CMS
 *   number given as a content id), and (`BODY_SHRINK` only) whether the customer's latest message asks
 *   for a removal and whether this record was already refused so this turn (`shrinkAgain`), and (a
 *   `content.list` refusal) whether this site's plugin was found within 15 minutes not to read `search`
 *   (`noListSearch`). A bare string is the platform alone — the shape #337's callers use
 *   (`refusalNext(answer, 'wordpress')`).
 * @returns {string | null}
 */
export function refusalNext(answer, given = {}) {
  const facts = typeof given === 'string' || given === null ? { platform: given } : given
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  const contentCode =
    a.error && typeof a.error === 'object' ? /** @type {Record<string, unknown>} */ (a.error).code : a.code
  switch (contentCode) {
    case 'AGENT_DEMO_NOT_GRANTED':
      return 'Open the demo chat assigned to this build and continue through tracy_demo. If the assignment is missing, ask the person to use Retry; do not write through another site or session.'
    case 'AGENT_DEMO_PLAN_REQUIRED':
      return 'Read the frozen demo brief and current structure with tracy_demo, save the grouped content plan through plan.save, then retry the intended Apply action.'
    case 'SLOT_LOCKED_BY_USER':
      return lockedNext(a.lockedBy)
    case 'CONTENT_ADAPTER_UNSUPPORTED':
      // On EmDash the reader is opt-in at image build (#352), so most sites have none, and the
      // administrator has nothing to verify: the words are read through tracy_emdash as before.
      if (facts?.platform === 'emdash')
        return 'This EmDash site has no content map: read the entry with tracy_emdash content_get {collection, id:"<slug>"} ("site" holds the site-wide words).'
      return noContentApiNext(facts)
    case 'CONTENT_SNAPSHOT_EXPIRED':
      return 'Restart the content scan without a cursor, keeping the intended filters. Do not combine pages from different revisions.'
    case 'CONTENT_BAD_QUERY': {
      // Content API v2: the relay refuses `describe` beside any other key, naming it in the message.
      const message = contentMessage(a)
      if (/\bdescribe\b/i.test(message))
        return 'Send content.read {describe: true} alone, with no type, locale, id or cursor; then list with {type, locale}.'
      // Round 7: 12 of 15 refusals were a `fields` key that does not exist, and the sentence below sent
      // the model back to a message that names one key and lists no block key. The keys, and a call.
      if (message.startsWith('fields has no key')) return FIELDS_NEXT
      // The tag the site lists for the language asked (`en` for `en-GB`), or its whole list.
      if (/^locale ".*" is not one of this site's locales/.test(message)) {
        const tag = /; use "([^"]{1,35})"$/.exec(message)?.[1]
        return tag === undefined
          ? 'locale is one of the tags the message lists: send the same call with one of them, or leave locale out for every language.'
          : `Send the same call with locale:"${tag}", the tag this site lists for that language.`
      }
      return "Fix the one field its message names (type, limit 1–100, a locale from site.locales, id alone) and retry once; ids are content.read's own, not CMS ids."
    }
    case 'CONTENT_UNAUTHENTICATED':
    case 'CONTENT_FORBIDDEN':
      return 'Restore the current seat or site credential through the existing sign-in and pairing flow. Do not bypass the read door.'
    case 'CONTENT_NOT_FOUND': {
      // Round 7: five WordPress picks read `{id: 42}` — the post number a pick's mark carries — and were
      // told to "refresh the list"; two of them read the 35k-character describe to do it.
      const cms = cmsNumberOf(facts?.asked)
      return cms === null
        ? 'Refresh the authorized content list. The ID may be missing or outside the current readable scope.'
        : `${cms} is a CMS number, not a content id: those are opaque, as content.read lists them. Find the page by its address, {view:"pages", url:"/…"}; a row's native holds the CMS ids.`
    }
    case 'CONTENT_FIELD_TOO_LARGE':
      return 'The named field cannot fit the reader budget. Report the limit and opaque field identity; do not truncate or silently fall back to a database dump.'
    case 'CONTENT_SOURCE_UNAVAILABLE':
      return sourceUnavailableNext(facts)
    case 'LOCATE_BAD_QUERY':
      return 'Send content.locate again with the field its message names fixed: {url:<the page address>, text:<the element\'s own words> or image:{src}, marks?:[the values of its "marks:" line, split at " | " — never its selector]}, all taken from the <mentioned-element> block as given.'
  }
  if (a.ok !== false) return null
  // 🔒 THE PLUGIN'S OWN WAY ON WINS. A refusal that already names its next step (the WordPress plugin's
  // `apply.revert` conflict since 0.14.7, claude-cowork#71: which apply to revert first) knows more than
  // any sentence here; `withNext` keeps it on the answer, and this keeps it for every other reader.
  if (typeof a.next === 'string' && a.next.trim() !== '') return a.next.trim()
  // 🔒 A REFUSED REVERT IS NEVER "READ IT AGAIN AND SEND IT ONCE MORE" (Brian, 29/09/2026). The revert
  // was refused because a newer change sits on the same words; the same revert gets the same answer.
  // Checked before the per-field and `conflict` sentences, which both say to send the call again.
  if (isRevertConflict(a, facts)) return REVERT_CONFLICT_NEXT
  // Content API v2 (W3): a Claude Cowork plugin that says per field what went wrong is read by field, before
  // any sentence matched on its old `message` (which it still sends, for older hosts).
  const perField = contractErrorsNext(a.errors, facts?.platform)
  if (perField !== null) return perField
  const code =
    typeof a.code === 'string' && a.code !== ''
      ? a.code
      : typeof a.error === 'string' && /^[a-z_]+$/.test(a.error)
        ? a.error
        : undefined
  // The component's sentence is on `message`; a door or host answer that has a `code` keeps its
  // sentence on `error`.
  const message =
    typeof a.message === 'string'
      ? a.message
      : typeof a.code === 'string' && typeof a.error === 'string'
        ? a.error
        : ''
  const ctx = callContext(a, facts)
  // A picture the site does not hold is refused before anything is written. The picture has to
  // exist first: drawn (media.draw), then named by the path it was given.
  // An evidence-required slot takes an invented value too (Lee, 23/09/2026) — declared as one, so the
  // Claude Cowork plugin's record says where it came from. Only the evidence field was missing, never permission.
  const evidenceFor = /Customer evidence required: (\S+)/.exec(String(a.message ?? a.error ?? ''))
  if (evidenceFor)
    return `${evidenceFor[1]} asks where its value comes from. If the customer gave it, pass their words: evidence: {"${evidenceFor[1]}": "<the customer's own text>"}. If you made it up to fit the customer (a photo you drew, a believable name or figure), say so and it is accepted: evidence: {"${evidenceFor[1]}": "Invented by Tracy to fit the customer; not from the brief. Replace it with the real one."} — then tell the customer which slots hold inventions, so they can send the real ones. Apply again with the same changes and that evidence.`
  /**
   * 🔒 media.draw ONLY, NOT media.upload. This refusal comes from a sealed Joomla site, or a bound
   * WordPress one since its image slots (Claude Cowork plugin 0.14.0-rc.4, "…already be in…"). Until
   * ADR 0022 `media.upload` was off every sealed surface and took bytes a sealed agent could not
   * produce; since 27/09/2026 it takes the customer's file by name (`upload.mjs`), but a slot takes
   * only a picture shaped like its demo, which a customer's file rarely is. `media.draw {prompt, slot}`
   * draws to the slot's own demo shape and uploads it, so it stays the one road named here.
   */
  const missingPicture = /Image must already (?:exist|be) in the site media library(?:: (\S+))?/.exec(
    String(a.message ?? a.error ?? '')
  )
  if (missingPicture) {
    const slot = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(missingPicture[1] ?? '')
      ? missingPicture[1]
      : '<the image slot key>'
    return `That picture is not in the site media library yet: tracy_site media.draw {prompt, slot:"${slot}"} draws one to the slot's shape and uploads it; then apply again with the path it returns.`
  }
  // 🔒 A REFUSAL OF STRUCTURE IS A CLOSED DOOR, NEVER A CLOSED SITE (Lee, 26/09/2026; ADR 0022).
  // Quickstart sites lock nothing but direct database writes. Older Claude Cowork plugins and older EmDash
  // templates still refuse a structural write (`legacy-refusal.mjs`); until each is re-released the
  // sentence names the road that does work, and never tells the agent to stop or to tell the customer
  // the site is locked.
  if (isLegacyStructureRefusal(a) || a.code === 'TEMPLATE_GUARD' || a.code === 'STRUCTURE_REFUSED')
    return structureRefusedNext(ctx.platform)
  switch (code) {
    case 'SITE_PROVISIONING':
      return 'The site is still being built; its content door connects when the build ends. Tell the customer, and try again once it is done. Do not edit files or the database meanwhile.'
    case 'COMPONENT_NOT_REGISTERED':
      return "This site's content door is not connected, so tracy_site cannot read or write CMS data. Make the change in files under .webroot/ if it lives there; otherwise tell the customer the site must be connected first."
    case 'TOOLSET_NOT_GRANTED': {
      // A Viewer seat holds no toolset at all (ADR 0028): it reads and asks, and nothing it may reach
      // changes the site, the CMS admin included (its CMS tier is the public pages only). The one road
      // is the request for edit access under the chat box, which the site's Owners answer.
      if (a.role === 'viewer') return VIEWER_REFUSED_NEXT
      const toolset = typeof a.toolset === 'string' && a.toolset !== '' ? a.toolset : 'required'
      return `Tell the customer this needs a role with the ${toolset} toolset; do not work around it.`
    }
    // A comment answer writes a template part, a module or the site's name for any seat that may
    // comment, but only for that person's own comment sent on this site within the last two hours
    // (`apps/tracy-web/src/sites/comment-answer.js`): the numbers named were not.
    case 'COMMENT_NOT_IN_FLIGHT': {
      const ns = Array.isArray(a.comment) ? a.comment.filter((n) => Number.isInteger(n)).slice(0, 12) : []
      const named = ns.length > 0 ? `comment ${ns.join(', ')}` : 'that comment'
      const toolset = typeof a.toolset === 'string' && a.toolset !== '' ? a.toolset : 'required'
      return `This seat may make this write only as the answer to a comment the person sent on this site in the last two hours, and ${named} is not one. Call again with comment set to the number of the comment this turn answers; if there is none, or it was sent earlier, ask the person to send the comment again, or tell them it needs a role with the ${toolset} toolset. Do not work around it.`
    }
    // 29/09/2026: `derive` builds an imported site's contract from its database; import
    // provisioning runs it, and the Apply door refuses it to every seat. The contract is already
    // there: the next step is the words, not the binding.
    case 'CONTRACT_OPERATION_PROVISION_ONLY':
      return 'Deriving the contract is done by import provisioning, never by a seat: do not call it. Change the words through the slots this site already has — content.read or content.locate names them — with content.contract {operation:"apply", changes:{<slotKey>:"<new value>"}}.'
    // A content seat (an editor) applies text, image and link slots of the contract, never another
    // key: the door names the keys it refused, so the words can still go in without them.
    case 'CONTRACT_SLOT_NOT_CONTENT': {
      const slots = Array.isArray(a.slots) ? a.slots.filter((one) => typeof one === 'string').slice(0, 8) : []
      const named = slots.length > 0 ? slots.join(', ') : 'some of these keys'
      return `This seat may change only the words, pictures and links of this site's contract; ${named} is not one of those slots. Apply again without it, using slotKey values content.read marks writable:true. If the customer wants that part changed, tell them it needs a role with the code toolset; do not work around it.`
    }
    /**
     * 🔒 ONE CONVERSATION, ONE SITE, and the other site is a WORKSPACE, not a parameter. Both roads
     * answer this code now — the Apply door for Joomla/WordPress, `emdashSiteOf` for EmDash — so one
     * sentence serves both. It names the other workspace because that is where the customer's
     * change belongs; it does not offer a way to reach it from here, because there is none by
     * design. Measured 20/09/2026: an agent told (by the site context, wrongly) to "pass siteKey"
     * for the site its build had dressed would have been refused right here with a bare code.
     */
    case 'SITE_OUTSIDE_CONVERSATION': {
      const here =
        typeof a.conversationSite === 'string' && a.conversationSite !== '' ? a.conversationSite : 'this site'
      const there = typeof a.siteKey === 'string' && a.siteKey !== '' ? a.siteKey : 'that site'
      return `This conversation is ${here}, and ${there} is its own workspace — nothing here can reach it, and there is no other way in. If the customer wants ${there} changed, tell them to open its workspace and ask there; then carry on with ${here} only.`
    }
    case 'COMPONENT_NOT_ON_FLEET_COPY':
      return fleetCopyNext(a.copyReason, a.transient)
    case 'COWORK_WEB_UNREACHABLE':
      return 'Tracy could not be reached; retry once, then tell the customer.'
    // ── The door is there, it was handed a signature, and it could not read it ───────────────────
    //
    // 🔒 THIS IS NOT THE CUSTOMER'S SESSION, AND SAYING SO WOULD SEND THEM TO A LOGIN SCREEN THAT
    // FIXES NOTHING. A prompter call carries no cookie at all: it carries an assertion this dsh
    // signed a second ago. A 401 on it means the two halves of the fleet hold different
    // `MCP_TRACY_ACTOR_SECRET` values, or their clocks are more than five minutes apart
    // (`verifyActor` accepts `exp` only inside now … now+300). Measured 17/09 on the dev machine:
    // the host dsh was seeded 07/09 with the lane-era secret, `tracy-web` was given its own on
    // 10/09, and nothing on either side ever compared them — so every build that got as far as
    // naming the person who typed died on its next call, for ten days, saying "not signed in" to
    // people who were signed in.
    case 'ACTOR_NOT_ACCEPTED':
      return "Tracy refused this workspace's own signature, so nobody can act on the site from here. This is Tracy's configuration, not the customer's session: reloading the page or signing in again will not change it. Tell the customer the site cannot be reached until an operator pairs this workspace with Tracy, and do not reach the database or the CMS another way in the meantime."
    /**
     * 🔒 THE ONE REFUSAL ON THIS LIST WHOSE REPAIR IS NOT THE CUSTOMER'S AND NOT THE AGENT'S.
     * `NO_TOKEN` (the `tracy_emdash` road, `index.ts`) means the site container holds no readable
     * PAT, so EmDash's own MCP door will not open. The repair runs on the site's HOST — a surface
     * this workspace does not have — so the only true next step names the procedure and the person
     * who can run it. Measured 20/09/2026 on `demoemdash1`: bare, this code sent an agent through
     * ~25 steps of `data.db`, `_emdash_api_tokens` and the `ec_*` schema, 3m52s and 641K tokens,
     * before concluding it was blocked. It stopped in the right place by luck; the next door along
     * that road is hand-editing the site's database, which is the thing this tool exists to prevent.
     *
     * 🔒 AND IT DOES NOT NAME `mint-agent-token.sh`, ON PURPOSE. Since #155 the container reads its
     * token through an EXACT read-only single-file bind, so the container is holding one fixed
     * INODE. On a site under that custody the helper no longer damages it (it writes the one file
     * in place and leaves no `data/` copy — `provision/mint-agent-token.sh`, `PROTECTED_MOUNT`),
     * but it still MINTS A NEW CREDENTIAL, it cannot rebind a stale inode (only a container
     * recreate does), and it creates no mount that is absent; on a site that predates the mount it
     * keeps its legacy `mv`-plus-`data/`-copy behaviour. Advertising it here would send the
     * operator to a command that reports success while `tracy_emdash` keeps refusing. The two repairs that do
     * work are the ones this PR ships, and THE ORDER BETWEEN THEM IS NOT "mount first": running
     * `migrate-token-mount.mjs` on a site whose host token is absent or not accepted returns
     * `recovery-required` (`custody-*`, then `auth-failed`) BEFORE it writes anything
     * (`migrate-token-mount.mjs`, checks `custody` and `authBefore`) — because a mount over a
     * credential nobody can authenticate is custody theatre. So: the migration alone is for a site
     * whose protected token is already valid and whose container merely predates #155; a site
     * missing both starts at the staged recovery in `scripts/provision/emdash/README.md` (stage →
     * write the root-owned 0600 token file IN PLACE, creating it if absent → migrate → authenticate
     * the mounted reader → finalize).
     *
     * ⚠ OUTSIDE `check-refusal-next`'s REACH, deliberately noted. That gate reads the Apply door of
     * `apps/tracy-web`; this code is raised in a dsh plugin, so nothing mechanical keeps this case
     * alive. It is here because the class was measured, and the note is the only guard there is.
     */
    case 'NO_TOKEN': {
      const label = typeof a.label === 'string' && a.label !== '' ? a.label : '<label>'
      return `This site's container holds no readable agent token, so EmDash's own door stays shut — every tracy_emdash call will refuse until it has one. The repair runs on the site's host, which is not a surface you have, and it is a custody procedure rather than a one-line mint: ask someone with host access to follow the agent-token procedure for ${label} in packages/fleet/tracy-fleet-operation/scripts/provision/emdash/README.md. Which half they start at depends on the host token, not on the mount: migrate-token-mount.mjs on its own only installs a missing read-only mount over a token that is already valid, and it refuses with recovery-required before creating anything when that token is absent or not accepted. A site missing both runs the staged recovery in this order — stage the credential, write the root-owned 0600 token file in place (creating it if absent, never replacing an existing inode), run migrate-token-mount.mjs, authenticate the mounted reader, finalize last. Ask them to say when the mounted reader has been authenticated, then make the same call again. Do NOT ask for a re-mint that replaces the token file: this container reads one fixed inode, so a replacement file is never seen. Do NOT read or write the site's database to work around this.`
    }
    // ── The door is there; this call carried nobody it could act as ──────────────────────────────
    case 'NOT_SIGNED_IN':
    case 'NO_VIEWER':
      return "Nobody is signed in behind this call, so the door will not act on the site. This is the session, not the site: ask the customer to reload this site's page so their browser signs in again, then make the same call once more. Do not reach the database or the CMS another way to get around it."
    /**
     * 🔒 SAY IT, THEN STOP — DO NOT POLL. The door holds the lease until the holder stops writing,
     * and a second agent looping on this refusal burns a call every few seconds on the production
     * door while changing nothing. Also: the person waiting is not the agent, it is the customer
     * reading this chat, and the one useful thing they can be told is who has the site and what was
     * about to change — so they can decide whether that is worth waiting for.
     */
    case 'SITE_BUSY':
      return "Another conversation is changing this site right now, so this write was not made. Tell the customer who has it and exactly what you were about to change, then stop and wait for them — do NOT retry in a loop, and do not reach the database or the CMS another way to get around it. Tracy already waited for it; the site frees as soon as the other conversation's turn ends."
    case 'SEAT_NOT_AUTHORIZED':
      return 'The person you are working with holds no seat on this site. Tell them, and do not work around it.'
    // ── A seat key (`Authorization: Bearer trk_…`, the api host) that the door will not act as ────
    case 'KEY_INVALID':
      return 'The API key sent with this call is not one Tracy knows, so the door will not act on the site. Tell the customer to check the key in their Tracy settings (or mint a new one there) and send the same call again; do not reach the site another way.'
    case 'KEY_REVOKED':
      return 'The API key sent with this call was revoked, and a revoked key never comes back. Tell the customer to mint a new key in their Tracy settings; do not reach the site another way meanwhile.'
    case 'KEY_EXPIRED':
      return 'The API key sent with this call has passed its expiry date. Tell the customer to mint a new key in their Tracy settings; do not reach the site another way meanwhile.'
    case 'API_KEYS_NOT_CONFIGURED':
      return 'This Tracy deployment has API keys switched off (no API_KEY_PEPPER), so no key can open this door. Tell the customer; the person running Tracy has to enable keys. Do not reach the site another way.'
    case 'SCOPE_OUTSIDE_ROLE': {
      const toolsets = Array.isArray(a.toolsets) ? a.toolsets.filter((one) => typeof one === 'string') : []
      const named = toolsets.length > 0 ? toolsets.join(', ') : 'some of those toolsets'
      return `A key cannot hold more than the seat it stands on: this seat's role does not grant ${named}. Mint the key with only the toolsets the role grants, or ask an owner for a wider role; do not work around it.`
    }
    /**
     * 🔒 WAIT, DO NOT HAMMER. The answer's Retry-After header (seconds) says when the next fixed
     * window opens; a loop that retries sooner spends calls on the same refusal.
     */
    case 'RATE_LIMITED':
      return 'This key has used its hourly quota of calls on this site, so the call was not made. Tell the customer, wait the number of seconds in the Retry-After header, then send the call again; do not retry in a loop and do not reach the site another way.'
    case 'NOT_SITE_OWNER':
      return 'This needs the owner or an admin of the site. Tell the customer which one, and do not work around it.'
    case 'CONVERSATION_SITE_UNKNOWN':
      return 'Tracy does not know the site this workspace names. Tell the customer, and do not act on any other site.'
    case 'COMPONENT_UNAUTHORIZED':
      return 'The site no longer accepts the token Tracy holds for it, so the door is shut until somebody reconnects the site. Tell the customer that, and do not reach the database or the CMS another way to get around it.'
    // ── The door answered, and what came back was not an answer ──────────────────────────────────
    case 'COMPONENT_UNREACHABLE':
      return "The site's content door did not answer. Retry once; if it still does not answer, tell the customer rather than changing the site another way."
    case 'COMPONENT_BAD_RESPONSE':
      return "The site's content door answered with something that is not an answer, so nothing is known to have happened. Read the site before retrying, then tell the customer if it answers the same way again."
    // ── The call itself was wrong, and the fix is in the call ────────────────────────────────────
    case 'INVALID_REQUEST':
      return "The door could not read this call. Check action and params against this tool's description and call once more; do not reach the site another way."
    case 'INVALID_MEDIA':
      // EmDash media.upload through the Apply door (18/10/2026): `field` names what was missing.
      return 'The media.upload call named no file, a file name with a path in it, or content that is not base64 (`field` says which). Call again with {path: "<file name only>", content_b64: "<the bytes in base64>"}, one picture at a time; do not write the file into the site another way.'
    case 'ACTION_NOT_ALLOWED':
      return 'This door does not carry that action. Use one this tool lists, and do not reach the site another way to do the same thing.'
    case 'ACTION_AGENT_ONLY':
      // content.renderedWords: the Apply door takes it from the agent host's signed actor alone.
      return 'This action is sent by Tracy itself, inside content.replace. Call content.replace with the words to find and replace; do not send this action directly or reach the site another way.'
    /**
     * 🔒 `bad_params` IS THE COMPONENT SPELLING OF "THE FIX IS IN THE CALL", AND IT USED TO FALL
     * THROUGH TO THE OPPOSITE ADVICE. It is raised by the site's own component, so it carries a
     * code the gate above did not know, and `default` told the agent: *"This site answered no, and
     * that is an answer. Do not reach the site another way… tell the customer what was refused."*
     * For a genuine refusal that is right. For a malformed call it is exactly wrong — the site
     * refused nothing, the call was simply missing a field, and the agent is told to stop.
     *
     * Measured 20/09/2026 on `benxeaaa` (WordPress), the fourth question of a build-and-edit run:
     * the door answered `bad_params` with `message: "style required, e.g. airbnb"` — the missing
     * field and an example of it, in the message — and the agent, told not to reach the site
     * another way, went to the shell instead and spent a dozen `bash` calls on what one corrected
     * call would have done.
     *
     * So: name the message as the thing to read, ask for ONE corrected call, and keep the fence up
     * — the cure for a wrong parameter is the right parameter, never a way around the door. The
     * component's own messages that name the fix (T10 fixtures, r2) get that fix as the call.
     */
    case 'bad_params':
      if (ctx.action === 'media.delete' && /current value of an image slot/i.test(message))
        return 'This picture is the current value of a contract image slot. Change that slot first with content.contract, then delete the picture only if it is no longer the slot value. Do not use shell or file tools.'
      return badParamsNext(message, ctx)
    case 'APPLY_TARGET_NOT_ALLOWED':
      return 'This door writes to the site itself and to no copy of it. Drop `target` and call again.'
    case 'COWORK_WEB_BAD_RESPONSE':
      return "Tracy's answer could not be read, so nothing is known to have happened: read the site once before any retry, then tell the customer if it answers the same way."
    // ── Refused HERE, before the door (`planCall`, `normalize.mjs`, `site-call.mjs`) ──────────────
    //
    // ⚠ OUTSIDE `check-refusal-next`'s REACH, like `NO_TOKEN`: these codes are raised in this plugin,
    // not by the Apply door, so the gate cannot see them. `test/site.test.mjs` replays the r2 corpus
    // through every one of them; that test is the guard.
    case 'BAD_ACTION':
      return badActionNext(a, ctx)
    case 'NOT_ON_THIS_PLATFORM':
      return notOnPlatformNext(a, ctx)
    case 'NOT_LISTABLE':
      return /^(term|category|categories|tag|tags|post_tag)$/.test(String(a.kind ?? ''))
        ? 'A term is read one at a time: content.get {kind:"term", key:"category", id:<term id>}.'
        : 'postmeta is read one at a time: content.get {kind:"postmeta", id:<post id>, key:"<meta key>"}.'
    case 'NO_WRITABLE_FIELD':
      return noWritableFieldNext(a)
    case 'ADDRESS_MISSING':
      return addressMissingNext(a, ctx)
    /**
     * 🔒 A PLACE REFUSAL, NOT A STOP. All measured occurrences (4 in r2, 5 in the F4 corpus) came
     * BEFORE any write, while the model was looking around at the start of the task; "say what you
     * found and stop" (F4 §3.7) invited it to end the turn before doing what the customer asked.
     */
    case 'NOTHING_TO_LIST':
      return 'Nothing was written in this conversation yet, so there is no receipt to list: go on with the request (apply.list only answers what an earlier write changed).'
    case 'UNKNOWN_OPERATION':
      return a.asked === ''
        ? 'Same call with operation:"apply": only an apply writes changes.'
        : 'content.contract takes operation "inspect" (reads the slots) or "apply" (changes them); languages: multilingual.retire or multilingual.plan.'
    case 'UNKNOWN_SLOT':
      return 'Slot keys come from the inspect: content.contract {operation:"inspect", match:"<words>"} shows the key holding them.'
    case 'CONTRACT_RULE':
      return a.rule === 'no_changes'
        ? 'An apply carries changes:{"<slot key>":"<text>"}: content.contract {operation:"inspect", match:"<words>"} shows the keys.'
        : 'Read error: it names the slot and the rule. Change that value and apply once more, or tell the customer why it cannot change.'
    case 'INSPECT_FIRST':
      return 'content.contract {operation:"inspect", match:"<words>"} first; then apply with the revision it answers.'
    case 'UNKNOWN_PARAM':
      return unknownParamNext(a, ctx)
    // 30/09/2026: a `content.list {search}` reached a site whose Claude Cowork plugin does not read it —
    // the relay's guard (`route.js`), this host's own check of the answer, or its memory of either for
    // 15 minutes (`normalize.mjs` `listSearch`). The roads are the ones a search key the door did not
    // read has always been sent to, said again here: the listing that takes a language, and the words.
    // Never `search` again: the plugin has just shown it does not read one.
    case 'LIST_SEARCH_UNSUPPORTED':
      return listWithoutSearchNext({ ...ctx, action: 'content.list' })
    case 'BODY_SHRINK':
      return bodyShrinkNext(a, facts)
    // A WordPress block write by position whose body changed since its read (01/10/2026, `wp-blocks.mjs`
    // `revOf`): the host's check or the plugin's own, inside its lock. Each answer carries its own next with
    // the record's address; this is the fallback when one does not.
    case 'REVISION_STALE':
    case 'revision_stale':
      return 'The page changed since your read: content.get {kind, id or key, outline:true} numbers its blocks as they are now; send your change again with the rev it answers.'
    // A registered pattern inserted by name (`blocks:{"+<i>":{pattern}}`, 01/10/2026, `wp-patterns.mjs`).
    case 'PATTERN_NOT_FOUND':
      return 'content.list {kind:"pattern", search:"<a word for what it shows>"} lists the patterns this site has; insert one of those names, never a guessed one.'
    // `{attrs}` on a block whose saved HTML holds the attribute too (01/10/2026, `wp-blocks.mjs`): changed in
    // the comment alone, the editor calls the block invalid or the page does not change.
    case 'ATTRS_IN_HTML':
      return 'Read that block with content.get {kind, id, block:<i>}; send its markup as blocks:{"<i>":"<markup>"} with the rev it answers, the change made in both its comment and its HTML.'
    case 'PATTERNS_UNSUPPORTED':
      return 'Build the section as block markup: content.update {kind, id, rev, blocks:{"+<i>":"<markup>"}}.'
    // 🔒 THE SLIP IS IN THE MARKUP, SO THE NEXT NAMES THE GRAMMAR (site-call.mjs `blockMarkupProblem`).
    // PR1 bench C45: every `/-->` of a menu retyped `/>`; WordPress read the body as no blocks.
    case 'BLOCK_MARKUP':
      return 'Every block comment closes with "-->" ("/-->" when it has no closing tag) and keeps its attributes as one JSON object: send the body again as content.get gave it, with only your words changed.'
    case 'PARAMS_NOT_JSON':
      return paramsNotJsonNext(a)
    // F1.1 (28/09): a JSON column written as a FEW KEYS replaces the column, so nothing was written.
    // The way on is the column as it stands, with the change in it — which means reading it first.
    case 'PARAMS_WHOLE_COLUMN':
      return paramsWholeColumnNext(a)
    // 03/10/2026 (leemood, module 93): a stored JSON text re-typed as a string inside `{patch}` dropped a key
    // (`site-call.mjs` `mergeJsonField`, `merge-patch.mjs` `KeysLost`). The road that cannot slip is the
    // one key, sent as an object: Tracy opens the text, merges, and writes it back whole.
    case 'PARAMS_KEYS_LOST':
      return paramsKeysLostNext(a)
    // F3 (27/09): an EmDash entry in several languages is asked about once. F3.2 (30/09): and the same
    // call, confirmed, removes every language (`emdash-call.mjs` `removeOtherLanguages`) — the agent
    // walked 40 rows with a call each when this said "for each id in entries". F4 (30/09): a call that
    // named ONE language (`otherLanguages`: how many stay online) says so, and that the same call
    // without a locale asks about them all.
    case 'CONFIRM_FIRST':
      // 09/10/2026: typed words are no choice, and opened nothing; the same next again sent the agent round
      // other roads (an unpublish) instead of asking once more for the one thing the door reads.
      if (a.typed === true)
        return 'The customer typed words instead of choosing, which opens nothing: ask_user_question with this ask once more (id as given), asking them to pick an option; still none: tell them nothing changed.'
      if (a.confirmationMissing === true)
        return 'No recorded yes for this exact call; confirm:true is not consent. Use ask_user_question with this ask (id unchanged, options in order); wait for the customer, then retry with confirm:true.'
      if (typeof a.languages === 'number' && a.languages > 1)
        return "ask_user_question with this answer's ask (id as given, options in order, customer's words); one answer covers every language: on the first, the same call with confirm:true removes them all"
      if (typeof a.otherLanguages === 'number' && a.otherLanguages > 0)
        return "ask_user_question with this answer's ask (id as given, options in order, customer's words); on the first, the same call with confirm:true removes this language only. Without locale it asks about all."
      return "ask_user_question with this answer's ask (id as given, options in order, customer's words); on the first, the same call with confirm:true"
    // `media.upload {file}` (27/09/2026, `upload.mjs`; F5 in `normalize.mjs`): the customer's picture is
    // named and the host reads it. Every way on names the Files tab, where the customer puts a file so
    // it lands in this site's folder — never bytes typed by the model. Since 29/09/2026 a picture the
    // customer sent in the chat is named too (`attachment`), so a way on names that road wherever the
    // picture may be in the chat rather than in the folder.
    case 'UPLOAD_NEEDS_FILE':
      return 'media.upload {file:"<name>"}: its name in the Files tab; a picture sent in this chat: {attachment:"<its name or sha256>"}. Tracy reads the bytes — never type base64.'
    case 'FILE_NOT_FOUND':
      return 'No such picture in this site\'s folder. Sent in this chat? media.upload {attachment:"<its name>"}. Else ask the customer to put it in the Files tab, then media.upload {file:"<its name there>"}.'
    case 'FILE_OUTSIDE_SITE':
      return 'media.upload reads this site\'s folder only: a picture kept elsewhere, the customer puts in the Files tab; then media.upload {file:"<its name there>"}.'
    case 'FILE_SECRET':
      return "That file holds this site's secrets and never leaves the server: media.upload takes pictures only. Tell the customer, if they asked for it."
    case 'FILE_TOO_LARGE':
      return 'One upload carries at most 8 MiB (8,388,608 bytes): ask the customer for a smaller copy of the picture (Files tab or this chat), then media.upload with its name.'
    case 'NOT_A_PICTURE':
      return 'media.upload takes a PNG, JPEG or WebP picture: ask the customer for the picture in one of those formats, in the Files tab or this chat.'
    // `media.upload {attachment}` (29/09/2026, `upload.mjs` `readChatPicture`): the model chooses among
    // the pictures this conversation holds; a refusal lists them (`attached`), so the way on is a name
    // from that list — or the Files tab when the store cannot give the picture back.
    case 'NO_ATTACHMENT':
      return 'No picture was attached in this conversation: ask the customer to attach it here, then media.upload {attachment:"<its name>"}, or to put it in the Files tab, then {file:"<its name>"}.'
    case 'ATTACHMENT_NOT_FOUND':
      return 'media.upload {attachment:"<an id from attached>"}: one of the pictures sent in this chat, as this answer lists them; a picture in the Files tab goes by {file:"<its name>"}.'
    case 'ATTACHMENT_AMBIGUOUS':
      return 'Several pictures sent in this chat answer to that: media.upload {attachment:"<its id from attached>"} for the one meant; ask the customer only if the list cannot tell.'
    case 'ATTACHMENT_UNREADABLE':
      return 'That chat picture cannot be read back here: ask the customer to put it in the Files tab, then media.upload {file:"<its name there>"}. Never type its bytes.'
    case 'UPLOAD_TWO_SOURCES':
      return 'media.upload takes one picture per call: {file:"<its name in the Files tab>"} or {attachment:"<its name or sha256 from this chat>"}.'
    /**
     * 🔒 E3.2 (P12): the identical call was refused earlier in this turn and nothing changed since.
     * `site-call.mjs` / `emdash-call.mjs` answer it with the EARLIER refusal's own next attached, so
     * this sentence is only the fallback when that next is missing. It never says "again": the one
     * way on is a different call, or the customer.
     */
    case 'SAME_CALL_REFUSED':
      return 'Change what the earlier refusal named, or tell the customer why it cannot be done: this exact call gets the same answer until the site or the request changes.'
    /**
     * 🔒 E2.2 (P12): the call was sent and its answer was lost, so it MAY HAVE LANDED — never
     * "nothing was written". A Joomla contract apply re-sent once may still be running in PHP (the
     * door gives up at 170 s, the component does not), so the check is an inspect a little later; a
     * write with a receipt is checked on that receipt. Repeating the call is what this code exists to
     * stop: a create or a delete sent twice is two.
     */
    case 'OUTCOME_UNKNOWN': {
      if (a.recheck === 'inspect')
        return 'The first send may still land: content.contract {operation:"inspect", match:"<your new words>"} in about 30 s shows whether it did. Do not repeat the call.'
      const id = typeof a.apply_id === 'string' && a.apply_id !== '' ? a.apply_id.slice(0, 60) : ''
      return id !== ''
        ? `apply.list {apply_id:"${id}"} shows whether it landed; do not repeat the call.`
        : 'It may have landed: read what it would have changed before anything else; do not repeat the call, and tell the customer if that cannot be told.'
    }
    case 'EMDASH_SITE':
      return emdashSiteNext(ctx.action)
    // ── EmDash (`tracy_emdash`, `emdash-call.mjs`): refused here or by EmDash's own MCP door ────────
    case 'NO_RECEIPTS_ON_EMDASH':
      return "EmDash keeps no receipts: a write's own answer is its receipt; undo is revision_list {collection, id} then revision_restore."
    case 'EMDASH_ULID_REQUIRED':
      return ctx.tool === 'content_publish'
        ? 'content_update {collection, id, _rev, data, status:"published"} changes and publishes in one call; else content_get {collection, id:"<slug>"} for the 26-character id.'
        : `${ctx.tool ?? 'This tool'} takes no locale: content_get {collection, id:"<slug>"} answers the entry's 26-character id; make the same call with that id.`
    case 'EMDASH_LOCALE_REQUIRED': {
      const served = Array.isArray(a.served) ? a.served.filter((x) => typeof x === 'string').slice(0, 6) : []
      // 🔒 A CUT LIST SAYS IT IS CUT. "This site serves uk, tr, th, ta, sv, sr" was six of 40, in the
      // database's order (PR1 bench, benchemdash01): read as the whole list, it hid the language the
      // site shows. Only a template whose default is not served is refused now (`localePlan`).
      const count = Number.isInteger(a.servedCount) ? Number(a.servedCount) : served.length
      if (served.length > 0)
        return count > served.length
          ? `This site serves ${count} languages (${served.join(', ')}, …): make the same call with locale:"<the language of the page meant>".`
          : `This site serves ${served.join(', ')}: make the same call with locale:"<one of them>" (the language of the page meant).`
      // `languages:'unread'` (emdash-call.mjs): the served locales could not be read just now, so
      // "several languages" would be a claim nobody measured.
      return a.languages === 'unread'
        ? 'This site\'s languages could not be read just now: make the same call with locale:"<the language of the page meant>".'
        : 'This site serves several languages: make the same call with locale:"<the language of the page meant>".'
    }
    // 🔒 THE WAY ON IS NAMED. `emdash-call.mjs` lets `confirm:true` through only after the customer
    // answered; a next that said "ask" and stopped there led back into this same refusal.
    case 'PENDING_DRAFT':
      return 'Ask the customer (ask_user_question) whether the unpublished change waiting on this entry should go live; if they say yes, the same call with confirm:true.'
    case 'WOULD_UNPUBLISH':
      return 'Leave status out to stage a draft, or content_unpublish to take the page offline: status:"draft" on a live entry takes it off the site.'
    case 'REV_MISSING':
      return "content_get {collection, id} answers the entry's _rev: make the same call with it."
    case 'BAD_CALL':
      return 'Call {tool, arguments}: tool is an EmDash tool name such as content_get or content_update; a page as visitors read it is tracy_site page.text.'
    case 'TOOL_FAILED':
      return emdashFailedNext(a, ctx)
    case 'NOT_EMDASH':
      return 'This site does not run EmDash: its content door is tracy_site.'
    case 'SITE_REFUSED':
    case 'NOT_MCP':
      return emdashDoorFailedNext(a, ctx)
    // ── The COMPONENT's own codes, which arrive on `error` (see above) ──────────────────────────────
    case 'bad_action':
      return badActionComponentNext(message, ctx)
    case 'too_large':
      if (ctx.action === 'media.delete') {
        const total =
          typeof a.totalBytes === 'number' ? ` (${a.totalBytes.toLocaleString('en-US')} bytes)` : ''
        return `This picture exceeds the 8 MiB undo-copy cap${total}; nothing was deleted. Report that this picture cannot be deleted through Tracy with an undo copy. Do not use shell or file tools.`
      }
      return defaultNext('too_large', message)
    case 'write_failed':
      if (ctx.action === 'media.delete')
        return 'The delete failed and was rolled back; nothing was deleted. Report the refusal to the customer. Do not use shell or file tools.'
      return writeFailedNext(message)
    case 'not_found':
      if (ctx.action === 'media.delete')
        return 'This picture was not found; nothing was deleted. Tell the customer and do not guess another id or path. Do not use shell or file tools.'
      return notFoundNext(message, ctx)
    case 'contract_failed':
      return contractFailedNext(message)
    case 'batch_failed':
      return 'Nothing in the batch was written: read the rows again, then send one new batch with the values they hold now.'
    case 'revert_failed':
      return 'The undo did not finish: tell the customer which change could not be put back; do not undo it another way.'
    case 'writer_busy':
      return writerBusyNext(a, message)
    case 'conflict':
      return /language job|demo trim/i.test(message)
        ? 'A language job holds this site (the message names it): tell the customer it must finish or be taken back first; do not work around it.'
        : 'Someone changed the site since your read: read it again (inspect or content.get), then make the call once with what it holds now.'
    case 'read_failed':
    case 'list_failed':
      // A list that carried a `search` has a road when the read fails twice: the same list without it, paged.
      return ctx.action === 'content.list' && carriesListSearch(ctx.asked)
        ? 'The component could not read that (the message says why): make the same call once more; if it fails again, leave search out and page with offset and limit.'
        : 'The component could not read that (the message says why): make the same call once more; if it fails again, tell the customer.'
    case 'dump_failed':
      return /doesn't exist|does not exist/i.test(message)
        ? 'That table does not exist: db.tables lists the real names, prefix included; then db.dump {table:"<one of them>"}.'
        : 'The component could not dump that table (the message says why): make the same call once more; if it fails again, tell the customer.'
    case 'unavailable':
      return "This site's component lacks that part (the message names it): tell the customer; do not reach the site another way."
    case 'unsupported':
      return "This site's component does not support that (the message says why): tell the customer; do not work around it."
    case 'contract_unavailable':
    case 'contract_unbound':
      return 'The contract door is not ready on this site (the message says why): tell the customer; do not change the site another way.'
    case 'unauthorized':
      return "The site no longer accepts Tracy's token: tell the customer it must be reconnected; do not reach the site another way."
    // ── Anything the COMPONENT refused, one hop further out than the door ─────────────────────────
    default:
      /**
       * 🔒 THE DOOR IS NOT THE ONLY THING THAT REFUSES. tracy-web returns the component's own answer
       * verbatim (`sites/route.js`, `return json(c, result)`), so "this component version does not
       * carry that action" and "that parameter shape is wrong" arrive with a code the gate above
       * cannot know and no `next` at all — and the working rules used to excuse themselves exactly
       * there, binding only on a refusal that HAS a `next`.
       *
       * Measured 16/09: three of them in one turn (`content.language`, `extension.install`,
       * `content.contract`). Each was read as a closed door rather than an answer, and each sent the
       * agent off the door — to the CLI, to the database, to the platform's own source. The last of
       * those installed a language pack by CLI, which is the one change in that turn that left no
       * receipt `apply.revert` can undo.
       *
       * 🔒 THE DEFAULT IS CHOSEN BY CLASS, NOT ONE SENTENCE FOR ALL (D24). "This site answered no, and
       * that is an answer" was the default for every code nobody wrote a case for — on r2 that meant
       * 172 malformed calls told to stop. It stays for a POLICY refusal only; a code whose message
       * names a parameter is a SHAPE to fix; a failure is a STATE to read before one retry; anything
       * else says to read the message.
       */
      return defaultNext(code, message)
  }
}

/**
 * The address a pairing probe signs for.
 *
 * It is nobody, and it must stay nobody: the probe asks whether the SIGNATURE reads, and a real
 * address in it would turn a boot-time diagnostic into a call made in a person's name. `.invalid`
 * is reserved by RFC 2606 precisely so that it can never be anybody's.
 */
export const PAIRING_PROBE_EMAIL = 'actor-check@tracy.invalid'

/**
 * What one answer from `/auth/actor-check` proves.
 *
 * ⚠ ONLY TWO STATUSES MEAN ANYTHING. 200 is a signature Tracy read; 401 is one it could not. Every
 * other answer is about something else entirely — a proxy in the way, a deploy mid-flight, a
 * gateway page — and reading it as "unpaired" would put a false alarm in the log during every
 * rollout, which is the fastest way to teach everyone to ignore this line.
 * @param {number} status - the HTTP status the probe got back.
 * @returns {'paired' | 'unpaired' | 'unknown'}
 */
export function pairingVerdict(status) {
  if (status === 200) return 'paired'
  if (status === 401) return 'unpaired'
  return 'unknown'
}

/**
 * The refusal as it should read for the route the call actually went out on.
 *
 * `NOT_SIGNED_IN` is the Apply door's one word for "I could not name anybody behind this call", and
 * on the VIEWER route it is exactly right — a cookie went stale, the person reloads and it works.
 * On the PROMPTER route the same word is false in a way that costs a person their afternoon: no
 * cookie was ever sent, so nothing about their browser can be at fault. What was refused is the
 * assertion this dsh signed, and only an operator can repair that.
 *
 * Two answers, two words, and the words decide what everyone downstream does next: `refusalNext`
 * sends the agent to the customer instead of to the login screen, and the build stops asking a
 * person to retry a step that cannot succeed until a secret is changed on a server.
 *
 * @param {'prompter' | 'viewer'} as - which route the call went out on.
 * @param {unknown} answer - what the Apply door answered, as `relay` read it.
 * @param {string | null} [origin] - where the call went, named in the sentence when it is known.
 * @returns {unknown}
 */
export function relayRefusal(as, answer, origin = null) {
  const a = /** @type {Record<string, unknown>} */ (answer && typeof answer === 'object' ? answer : {})
  if (as !== 'prompter' || a.ok !== false || a.code !== 'NOT_SIGNED_IN') return answer
  const where = typeof origin === 'string' && origin !== '' ? origin : 'Tracy'
  return {
    ...a,
    code: 'ACTOR_NOT_ACCEPTED',
    error: `${where} did not accept the signed assertion this workspace acts with. The two sides hold different actor secrets, or their clocks are more than five minutes apart. Nobody's sign-in is at fault.`
  }
}

/**
 * What to do when a site's door refused a structural write: the roads that work, per platform.
 * Exempt from T10's 200 characters: it is the whole map, said once, where the agent needs it.
 * @param {string | null} platform `joomla` · `wordpress` · `emdash` · null
 */
export function structureRefusedNext(platform = null) {
  const keep = QUICKSTART_DESIGN_RULE
  if (platform === 'emdash')
    return `This site's template is an older release whose guard refuses that tool over tracy_emdash. The change is still possible: the look, layout and code are files under /app (a colour is a token in src/styles/tokens.css) — edit them, then tracy_site_build_emdash request site.rebuild; words go through tracy_emdash content_update; menus and settings can also be changed by the owner in the admin. Never write the database directly. ${keep}`
  const cli =
    platform === 'wordpress'
      ? 'wp-cli in the shell (`wp menu`, `wp post`, `wp option`, `wp theme`)'
      : platform === 'joomla'
        ? "Joomla's own CLI in the shell (`php cli/joomla.php`), or template files and overrides under .webroot/templates/"
        : "the CMS's own CLI in the shell (`wp …` on WordPress, `php cli/joomla.php` on Joomla)"
  const build =
    platform === 'wordpress'
      ? 'tracy_site_build_wordpress'
      : platform === 'joomla'
        ? 'tracy_site_build_joomla'
        : 'the Build tool of this CMS (tracy_site_build_joomla or tracy_site_build_wordpress)'
  // media.draw on both, each into its own folder (WordPress since Claude Cowork plugin 0.14.0-rc.4, #382).
  const pictures =
    platform === 'wordpress'
      ? 'pictures into an image slot through media.draw {prompt, slot}, which uploads into wp-content/uploads/tracy-content/'
      : platform === 'joomla'
        ? 'pictures through media.draw, which uploads into images/tracy-content/'
        : 'pictures through media.draw {prompt, slot} (Joomla: images/tracy-content/, WordPress: wp-content/uploads/tracy-content/)'
  return `This site's content door is an older release that refuses structural writes. The change is still possible another way: words through content.contract (operation inspect, then apply), ${pictures}; structure — menus, modules, pages, extensions, styles — through ${cli}. Languages: to hide the ones the customer did not ask for, content.contract with operation multilingual.retire, keep: [the language tags to keep, e.g. "en-GB", "vi-VN"] and an apply_id starting with mlang-, repeated until status is completed; to add one, ${build} request language.add. Never write the database directly (no SQL). ${keep}`
}

/** What a refused `apply.revert` leaves the model when the plugin names no way on itself. */
const REVERT_CONFLICT_NEXT =
  'This change cannot be undone alone: revert the newer change first (apply.list shows it), or tell the person the words were changed since. Never repeat this revert.'

/**
 * Whether a refusal is an `apply.revert` blocked by a newer change: the action asked says so, or the
 * component's own revert message does — Joomla's and WordPress's "Later content exists; revert the
 * latest …", and WordPress's span refusals, which all end "nothing was reverted".
 * @param {Record<string, unknown>} a
 * @param {unknown} facts
 */
function isRevertConflict(a, facts) {
  const code = typeof a.code === 'string' ? a.code : typeof a.error === 'string' ? a.error : ''
  const conflict =
    /^conflict$/i.test(code) ||
    (Array.isArray(a.errors) &&
      a.errors.some((e) => e !== null && typeof e === 'object' && e.code === 'CONFLICT'))
  if (!conflict) return false
  const f = /** @type {Record<string, unknown>} */ (facts && typeof facts === 'object' ? facts : {})
  if (f.action === 'apply.revert' || a.action === 'apply.revert') return true
  const message = typeof a.message === 'string' ? a.message : typeof a.error === 'string' ? a.error : ''
  return /\bLater content exists; revert the latest\b|\bnothing was reverted\b/i.test(message)
}

/**
 * A Content API refusal's sentence: `error.message` (the relay's shape), else the answer's own `message`.
 * @param {Record<string, unknown>} a
 */
function contentMessage(a) {
  const e = a.error && typeof a.error === 'object' ? /** @type {Record<string, unknown>} */ (a.error) : a
  return typeof e.message === 'string' ? e.message : ''
}

/**
 * `fields` refused because every key it named does not exist (`content-read-fields.mjs` drops the
 * ones that do not when others are valid): the keys it takes, and one call that works. Every key named
 * here is in the relay's list (`test/normalize-content-read.test.mjs` holds it), 199 characters.
 */
export const FIELDS_NEXT =
  'fields takes: title, slug, url, revision, images, blocks.key, blocks.role, blocks.fields.value, blocks.fields.slotKey (ids always come). E.g. fields:"title,blocks.fields.slotKey,blocks.fields.value".'

/**
 * The CMS number a `content.read {id}` carried — `42`, `"441"` — when it is one: a content id is an
 * opaque string (`content_…`, `c5fc…`), never a whole number, so a whole number is a post, module or
 * menu item the model took from a pick's mark or a `native` list. Null for anything else.
 * @param {unknown} asked - the call's params.
 * @returns {string | null}
 */
function cmsNumberOf(asked) {
  const id =
    asked !== null && typeof asked === 'object' ? /** @type {Record<string, unknown>} */ (asked).id : null
  if (typeof id === 'number') return Number.isInteger(id) && id > 0 && id < 1e12 ? String(id) : null
  return typeof id === 'string' && /^\d{1,12}$/.test(id.trim()) ? id.trim() : null
}

/**
 * The answer with its refusal's next step attached as `next`; unchanged when there is none, or when
 * the answer already carries its own.
 * @param {unknown} answer
 * @param {Parameters<typeof refusalNext>[1]} [facts] - passed on to {@link refusalNext}.
 * @returns {unknown}
 */
export function withNext(answer, facts = {}) {
  const next = refusalNext(answer, facts)
  if (next === null || 'next' in /** @type {object} */ (answer)) return answer
  return { .../** @type {Record<string, unknown>} */ (answer), next }
}

// ── The sentences `refusalNext` builds, one family per function ─────────────────────────────────────

/**
 * What a sentence may know about the call: from the tool's facts first, the answer second.
 * @param {Record<string, unknown>} a
 * @param {unknown} facts
 */
function callContext(a, facts) {
  const f = /** @type {Record<string, unknown>} */ (facts && typeof facts === 'object' ? facts : {})
  /** @param {unknown} v */
  const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  return {
    platform: text(f.platform) ?? text(a.platform),
    action: text(f.action) ?? text(a.action),
    actions: Array.isArray(f.actions) ? /** @type {string[]} */ (f.actions) : null,
    sealed:
      typeof f.sealed === 'boolean'
        ? f.sealed
        : typeof a.sealed === 'boolean'
          ? /** @type {boolean} */ (a.sealed)
          : null,
    tool: text(a.tool) ?? text(f.tool),
    // What the call was sent with (a `content.list` names its `kind` and may carry a `search`), and whether
    // this site's plugin was found within 15 minutes not to read `search` (call-memory `noListSearch`).
    asked:
      f.asked !== null && typeof f.asked === 'object'
        ? /** @type {Record<string, unknown>} */ (f.asked)
        : null,
    noListSearch: f.noListSearch === true
  }
}

/** @typedef {ReturnType<typeof callContext>} CallContext */

/**
 * `CONTENT_ADAPTER_UNSUPPORTED` on WordPress or Joomla: this site has no Content API — its Claude
 * Cowork plugin predates the reader, or the site was never opted in (a site built before 25/09/2026
 * until tracy-host's start-up pass reaches it, `apps/tracy-host/src/content-identity.js`). Nothing
 * the agent sends changes that, so the sentence says so and names the two roads that work without it.
 *
 * Measured 27/09/2026 on the local stand: the old sentence sent the model to "ask the site
 * administrator", and it called `content.locate` again on nearly every Comment turn — 13 refused
 * calls in 24 bench cases, each one a step the customer waited for.
 * @param {unknown} facts
 */
function noContentApiNext(facts) {
  const { actions } = callContext({}, facts)
  /** @param {string} action */
  const offered = (action) => actions === null || actions.includes(action)
  const roads = [
    offered('page.text') ? 'Read with page.text {path, match}' : null,
    offered('content.replace') ? 'change words with content.replace {find, replace, path}' : null
  ].filter((road) => road !== null)
  const lead =
    'This site has no Content API: content.read and content.locate always refuse here; do not call them again.'
  return roads.length === 0 ? lead : `${lead} ${roads.join('; ')}.`
}

/**
 * `CONTENT_SOURCE_UNAVAILABLE`: the reader failed inside the site (503), with its cause masked.
 *
 * 🔒 NO ADMINISTRATOR, NO BINDING (issue #722). This said "ask the administrator to check source
 * availability and contract binding", and customers got that sentence back from the agent. Read at the
 * pinned Claude Cowork plugins (Joomla 0.24.4 `EngineFactory::answerContent`, WordPress 0.14.9/0.15.3
 * `ContentDoor`): an UNBOUND site no longer lands here — it answers 501 `CONTENT_ADAPTER_UNSUPPORTED`
 * (claude-cowork#96, `tests/engine-factory-unbound.php`); this 503 is every other throw inside the reader —
 * a profile the plugin cannot load, two reads overlapping on one site (`content-locate.js`
 * `createSerialGate`), a database fault. Nobody the agent can reach fixes any of those mid-conversation.
 * `page.text` reads the page as served (`page.mjs`) and `content.replace` writes through the contract
 * apply or the record doors (`replace-road.mjs`); neither calls the reader, so those are the roads, each
 * named only where this surface offers it.
 * @param {{ actions?: readonly string[] | null } | null | undefined} facts
 */
function sourceUnavailableNext(facts) {
  const { actions } = callContext({}, facts)
  /** @param {string} action */
  const offered = (action) => actions === null || actions.includes(action)
  const roads = [
    offered('page.text') ? 'page.text {path, match} reads' : null,
    offered('content.replace') ? 'content.replace {find, replace, path} writes words' : null
  ].filter((road) => road !== null)
  const lead = "The site's content list is down: skip content.read and content.locate now."
  return `${lead}${roads.length === 0 ? '' : ` ${roads.join('; ')}.`} Tell the customer only in plain words.`
}

/**
 * Whether the call's site writes through a bound contract, as the tool knows it: sealed Joomla, or a
 * sealed WordPress site whose surface offers `content.contract` (`wordpress-contract`, #337). A
 * WordPress call with no surface (`actions` null) is not assumed to have one.
 * @param {CallContext} ctx
 */
function contractRoad(ctx) {
  if (ctx.sealed !== true) return false
  if (ctx.platform === 'joomla') return true
  return ctx.platform === 'wordpress' && ctx.actions !== null && ctx.actions.includes('content.contract')
}

/**
 * The three calls that matter on this platform's surface, as one sentence — what `BAD_ACTION` and a
 * missing action point at. Each names only actions every surface of that platform carries (a sealed
 * site's `content.update` is not named unless the seal is known to be open).
 * @param {CallContext} ctx
 */
function doorsOf(ctx) {
  if (ctx.platform === 'wordpress' && contractRoad(ctx))
    return 'page.text {path, match} reads a page; content.contract {operation:"inspect", page:"home", match} finds its slots; one apply changes them.'
  if (ctx.platform === 'wordpress')
    return 'page.text {path, match} reads a page; content.get {kind:"post", id} reads a post; content.update {kind, id, fields} changes it.'
  if (ctx.platform === 'joomla' && ctx.sealed === true)
    return 'page.text {path, match} reads a page; content.contract {operation:"inspect", page:"home", slots:"text", match} finds its slots; one apply changes them.'
  if (ctx.platform === 'joomla' && ctx.sealed === false)
    return 'page.text {path, match} reads a page; content.list {kind:"article"} lists articles; content.update {kind, id, fields} changes one.'
  if (ctx.platform === 'emdash')
    return 'EmDash content goes through tracy_emdash: content_get {collection, id:"<slug>"} reads a page; content_update changes it.'
  return 'page.text {path, match} reads a page; content.list {kind} lists records; content.get {kind, id} reads one.'
}

/** Words for "what can you do", which no door answers (TS-4; r2: 1 `help`). */
const HELP_WORDS = new Set(['help', 'capabilities', 'actions', 'list_actions', 'list'])
/** Words for a restart, which nothing here needs (TS-5; r1: 1 `site.restart`). */
const RESTART_WORDS = new Set([
  'site.restart',
  'restart',
  'cache.clear',
  'cache.clean',
  'cache:clean',
  'site.reload'
])

/**
 * `BAD_ACTION` (TS-4, TS-5, TS-6).
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function badActionNext(a, ctx) {
  const asked = typeof a.asked === 'string' ? a.asked.trim() : ''
  if (RESTART_WORDS.has(asked))
    return 'Nothing to restart or clear: a write through this door is live on the next request, and the component clears the caches itself.'
  if (asked === '' || HELP_WORDS.has(asked)) return `Call {action, params}. ${doorsOf(ctx)}`
  return `No action "${asked.slice(0, 24)}" here. ${doorsOf(ctx)}`
}

/**
 * `NOT_ON_THIS_PLATFORM`: an action or a kind this platform does not have, and where that thing lives.
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function notOnPlatformNext(a, ctx) {
  const what =
    typeof a.what === 'string' && a.what !== ''
      ? a.what
      : (ctx.action ?? /^([a-z]+\.[a-z.]+) /.exec(typeof a.error === 'string' ? a.error : '')?.[1] ?? '')
  /** @param {string} action */
  const offered = (action) => ctx.actions === null || ctx.actions.includes(action)
  if (what === 'content.renderedWords')
    return 'Send the words or link the theme prints with content.replace {find, replace, path}: it checks every store first and calls content.renderedWords itself.'
  if (ctx.platform === 'emdash') return emdashSiteNext(what)
  if (ctx.platform === 'wordpress' && what === 'content.contract')
    return 'Read with page.text {path, match}; change a page with content.update {kind:"post", id, fields:{post_content}}.'
  // Tracy names every content write's apply_id, one per write (WP-27, J-6): the sentence asks for none.
  if (
    (ctx.platform === 'wordpress' || (ctx.platform === 'joomla' && ctx.sealed !== true)) &&
    what === 'content.batch' &&
    offered('content.update')
  )
    return 'One content.update per record: content.update {kind, id, fields}; each write gets an apply_id of its own from Tracy, so apply.revert undoes that write alone.'
  // A surface list without media.upload (none of `SURFACE_ACTIONS` since 27/09/2026; P5 left it off both
  // sealed surfaces): the picture road it does carry.
  if (what === 'media.upload' && offered('media.draw'))
    // A sealed site with a contract door (Joomla, bound WordPress) takes a picture into an image slot.
    return ctx.sealed === true && (ctx.platform === 'joomla' || offered('content.contract'))
      ? 'A picture comes in through media.draw {prompt, slot:"<the image slot key>"}: it draws one to that slot\'s shape and uploads it; then apply the path it answers.'
      : 'A picture comes in through media.draw {prompt, like:"<a picture on this site>"}: it draws one to that shape and uploads it; then write the path it answers.'
  // Where that thing lives, unless the road it names is one this surface refuses (a bound WordPress
  // site has no content.language, #337): then the sealed sentence below.
  if (
    typeof a.instead === 'string' &&
    a.instead !== '' &&
    [...RELAY_ACTIONS, ...LOCAL_ACTIONS].every(
      (x) =>
        offered(x) || !new RegExp(`(^|[^\\w.])${x.replace('.', '\\.')}(?![\\w.])`).test(String(a.instead))
    )
  )
    return `Use ${a.instead.slice(0, 150)}.`
  if (contractRoad(ctx))
    return 'Words on this site change through content.contract {operation:"inspect", match} then one apply; structure changes through the CMS\'s own CLI in the shell (never SQL).'
  return `${what.slice(0, 24) || 'That'} is not on this site. ${doorsOf(ctx)}`
}

/**
 * The rule `quotesCustomer` (`site-call.mjs`) holds a `removes` to, in the words a next can carry:
 * at least three words, copied from the customer's latest message, one of them the removal verb.
 */
const REMOVES_RULE = 'removes:"<3+ customer words verbatim, verb included>"'

/**
 * `NO_WRITABLE_FIELD` (WP-22, 23, 24, 29): the fields a record takes, and where the words are.
 *
 * 🔒 W1 (c) — EACH NEXT NAMES THE CORRECTED CALL. The after-final bench C47 (benchwp01, 25/09) was
 * refused 4 times here: twice `{kind:"post", id, removes:"Careers"}` with no fields (as if `removes`
 * removed something itself), twice `fields:{removes:"Careers"}`; the nexts said "fields holding what
 * changes" and "only the fields listed in allowed", and neither said where `removes` goes. An option
 * or a postmeta was told a page's words are in post_content; it takes `value` alone.
 * @param {Record<string, unknown>} a
 */
function noWritableFieldNext(a) {
  const conflict = /** @type {Record<string, unknown> | undefined} */ (a.conflict)
  if (conflict && typeof conflict.real === 'string') return `Send one spelling: fields.${conflict.real} only.`
  const part = a.kind === 'templatePart'
  const address = part ? 'kind:"templatePart", key' : 'kind:"post", id'
  const body = part ? 'content' : 'post_content'
  const given = Array.isArray(a.given) ? a.given.map(String) : []
  if (a.hint === 'removes' && (part || a.kind === 'post' || a.kind === undefined))
    return given.length === 0
      ? `removes writes nothing: it lets a shorter body through. Same call with fields:{${body}:"<every block kept>"} beside it.`
      : `removes goes beside fields, never in them: content.update {${address}, ${REMOVES_RULE}, fields:{${body}}}.`
  if (a.needs === 'string') {
    const field = typeof a.field === 'string' ? a.field : 'post_content'
    return field === 'post_content'
      ? 'Same call with fields.post_content as one string: the whole block markup, as content.get answered it.'
      : `Same call with fields.${field} as one string.`
  }
  if (a.needs === 'content')
    return 'content.get {kind:"templatePart", key} first; then content.update {kind:"templatePart", key, fields:{content:"<the whole markup>"}}.'
  if (a.kind === 'option' || a.kind === 'postmeta')
    return `${a.kind === 'option' ? 'An option' : 'A postmeta'} takes one field: the same call with fields:{value:"<text>"} only.`
  // The post and part forms only for a post or a part: a term or any other kind is told the
  // generic rule, never a call that would write another kind of record (review, 26/09).
  const bodied = part || a.kind === 'post' || a.kind === undefined
  if (given.length === 0)
    return bodied
      ? `Same call with fields holding what changes: content.update {${address}, fields:{${body}:"<every block>"}}${part ? ' (or title)' : ' (or post_title, post_excerpt, post_status)'}.`
      : 'Same call with fields holding what changes (the fields listed in allowed).'
  if (a.hint === 'slot' || a.hint === 'replace')
    return 'Those are not fields: the words live inside post_content. content.get {kind:"post", id}, then send the whole post_content with only those words changed.'
  if (a.hint === 'probe')
    return 'The fields this kind takes are listed in allowed: write one of them (the words are in post_content); do not probe for others.'
  return part
    ? 'Same call with only content (the whole markup), title or area in fields: content.update {kind:"templatePart", key, fields:{content}}.'
    : 'Same call with only fields from allowed (post_title, post_content, post_excerpt, post_status…); the words of a page are in post_content.'
}

/**
 * `ADDRESS_MISSING`: the call names no record the component can find, and never gets one guessed.
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function addressMissingNext(a, ctx) {
  const needs = typeof a.needs === 'string' ? a.needs : ''
  const kind = typeof a.kind === 'string' ? a.kind : ''
  const action = ctx.action ?? ''
  const error = typeof a.error === 'string' ? a.error : ''
  /**
   * 🔒 A WRITE'S ADDRESS IS NEVER SWAPPED FOR ANOTHER ONE. This used to name the LAST post the
   * conversation read whatever the call said: `content.update {id:42, fields:{post_content}}` after
   * reading Home (42) then Contact (39) was told "Same call with kind:"post" and id:39 (Contact)", and
   * following it writes Home's body over Contact — longer than Contact's, so BODY_SHRINK passes it; for
   * `content.delete` it named the wrong post to trash. So: an id the call carries is kept; a read post
   * is named only when it is the ONE this conversation read; several are listed for the model to
   * choose from, never chosen for it.
   */
  if ((action === 'content.update' || action === 'content.delete') && needs.startsWith('kind')) {
    const given = Number(a.id)
    if (Number.isInteger(given) && given > 0)
      return `Same call with kind:"post" (a page or a post is kind "post"); keep id:${given}. Nothing was written.`
    const read = (Array.isArray(a.candidates) ? a.candidates : [])
      .map((c) => /** @type {Record<string, unknown>} */ (c && typeof c === 'object' ? c : {}))
      .filter((c) => Number.isInteger(Number(c.id)) && Number(c.id) > 0)
    if (read.length === 1)
      return `Same call with kind:"post" and id:${Number(read[0].id)} (${String(read[0].title ?? '').slice(0, 40)}) if that is the page meant — the one page this conversation read. Nothing was written.`
    if (read.length > 1)
      return fitList(
        'Same call with kind:"post" and the id of the page meant; this conversation read ',
        read.map((c) => `${Number(c.id)} (${String(c.title ?? '').slice(0, 24)})`),
        '. Nothing was written.'
      )
    return 'content.get {kind:"post", id} the page first; then the same call with kind:"post" and that id. Nothing was written.'
  }
  // A present id that is not a whole number: the component casts it with PHP `(int)` ("42abc" → 42),
  // so it is never read as "no id", which would CREATE (normalize.mjs, wpWrite).
  if (needs === 'id' && error.startsWith('an id is a number'))
    return `id is a whole number: the same call with the record's own id, e.g. id:42${kind === '' || kind === 'post' ? ' (content.list {kind:"post"} shows each one)' : ''}. Nothing was written.`
  /**
   * AL-3: `apply.revert` with no `apply_id` undoes nothing until the model names one — the receipts of
   * THIS conversation are listed, never picked (an undo is destructive). The component's own answer to
   * it was `bad_params "apply_id required"`, whose next asked for "a short name for this change".
   */
  if (action === 'apply.revert' && needs === 'apply_id') {
    const ids = (Array.isArray(a.candidates) ? a.candidates : [])
      .filter((x) => typeof x === 'string' && x !== '')
      .map((x) => `"${String(x).slice(0, 40)}"`)
    // A change made in an EARLIER conversation is found by the site's recent changes (`apply.list` with no
    // apply_id in a conversation that wrote nothing, ladder DL15): its id is read there, never guessed.
    return ids.length === 0
      ? "apply.revert takes the apply_id a write answered, and this conversation has written nothing: apply.list {} lists this site's recent changes with their apply_id; if none is the one meant, ask the customer; never guess an id."
      : fitList(
          'Same call with the apply_id of the change to undo; this conversation wrote ',
          ids,
          ' (newest last).'
        )
  }
  if (action === 'content.language')
    return 'content.language {id:<post id>, lang:"vi", translations:{en:<the other post id>}}.'
  if (/extension_id|extensionParams/.test(error))
    return 'extension.list gives each extension\'s number: content.get {kind:"extensionParams", id:<that number>}.'
  if (kind === 'postmeta' || /postmeta/.test(error))
    return action === 'content.update'
      ? 'content.update {kind:"postmeta", id:<post id>, key:"<meta key>", fields:{value}}: a postmeta needs both.'
      : 'content.get {kind:"postmeta", id:<post id>, key:"<meta key>"}: a postmeta needs both.'
  if (kind === 'term' || /\bterm\b/.test(error))
    return action === 'content.update'
      ? 'content.update {kind:"term", key:"category", id:<term id>, fields:{name}}: a term needs its taxonomy as key.'
      : 'content.get {kind:"term", key:"category", id:<term id>}: a term needs its taxonomy and its id.'
  if (/\boption\b/.test(error) || kind === 'option')
    return 'content.update {kind:"option", key:"blogname", fields:{value}}: an option is named by key.'
  if (/template part/.test(error))
    return 'A template part is named by its slug: {kind:"templatePart", key:"header"} or key:"footer".'
  if (/two posts/.test(error))
    return 'Two posts share that slug: content.get {kind:"post", id} with one of the candidate ids.'
  if (needs === 'kind and key')
    return `A name is read with kind and key, e.g. content.get {kind:"option", key:"${String(a.got ?? 'blogname').slice(0, 40)}"}.`
  return `Same call with ${needs || "the record's id"}.`
}

/**
 * One sentence naming a list, within T10's 200 characters: as many items as fit, then how many more
 * the answer's own list holds.
 * @param {string} head @param {string[]} items @param {string} tail
 */
function fitList(head, items, tail) {
  for (let n = items.length; n > 0; n -= 1) {
    const more = items.length - n
    const text = `${head}${items.slice(0, n).join(', ')}${more > 0 ? ` and ${more} more in candidates` : ''}${tail}`
    if (text.length <= 200) return text
  }
  return `${head.trimEnd()} the ids in candidates${tail}`.slice(0, 200)
}

/** Keys a model reaches for to FIND words — a search the component does not have. */
const SEARCH_KEYS = /^(search|s|q|query|text|match|filter|find|title|contains)$/i
const SLUG_KEYS = /^(key|slug|post_name|name)$/i
const LANG_KEYS = /^(lang|language|locale|languages)$/i
const ID_SPELLINGS = /^(applyId|apply-id|requestId|request-id|expectedRevision|expected-revision|revision)$/

/**
 * `UNKNOWN_PARAM` (V0, D22): the key the component would have dropped, and the nearest road that
 * does what it was meant to do.
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function unknownParamNext(a, ctx) {
  const given = Array.isArray(a.given) ? a.given.map(String) : []
  const allowed = Array.isArray(a.allowed) ? a.allowed.map(String).join(', ') : ''
  const action = ctx.action ?? ''
  const operation = typeof a.operation === 'string' ? a.operation : ''
  if (action === 'content.contract' && operation === 'apply')
    return given.some((k) => ID_SPELLINGS.test(k))
      ? 'Leave apply_id and request_id out: Tracy makes a new pair for every apply.'
      : 'An apply takes changes, expected_revision and evidence: content.contract {operation:"apply", expected_revision, changes:{"<slot key>":"<text>"}}.'
  if (action === 'content.contract')
    return 'An inspect takes page, slots, entity, match and offset: content.contract {operation:"inspect", page:"home", slots:"text", match:"<words>"}.'
  const { words, titles: listing } = findingRoads(ctx)
  const titles = action === 'content.list' ? listing : null
  if (given.some((k) => SEARCH_KEYS.test(k))) {
    // 🔒 A SEARCH-LIKE KEY ON A LIST IS POINTED AT `search` (30/09/2026, the plugin releases that read it
    // exist) — where it would be read and would not be refused: a kind it covers, a site not found (15
    // minutes) to ignore it. A call that already carries one is not told to send one: the stray key is
    // the fault, and the sentence at the end of this function says which.
    const carries = action === 'content.list' && carriesListSearch(ctx.asked)
    if (!carries) {
      if (action !== 'content.list') return `${words}.`
      return listSearchOpen(ctx)
        ? listSearchNext(ctx)
        : listWithoutSearchNext(
            ctx,
            given.find((k) => SEARCH_KEYS.test(k))
          )
    }
  }
  if (given.some((k) => LANG_KEYS.test(k)))
    return titles !== null
      ? `content.list has no language filter: every language is listed; ${titles} (native holds the CMS id).`
      : 'content.list has no language filter: every language is listed; page.text {path:"/<language>/…"} reads a page in one language.'
  if (ctx.platform === 'wordpress' && given.some((k) => SLUG_KEYS.test(k)))
    return 'content.list {kind:"post", name:"<slug>"} finds a post by its slug and answers its id.'
  if (action === 'content.update' && given.some((k) => /^(post_|title$|content$|value$)/.test(k)))
    return 'Put what changes inside fields: content.update {kind, id, fields:{post_content}}.'
  return `Same call without ${given.slice(0, 3).join(', ')}: ${action || 'this action'} takes ${allowed || 'no parameter'} here.`.slice(
    0,
    200
  )
}

/**
 * The two roads a refusal names to what a model was looking for: where WORDS on a page are found, and —
 * where the surface carries `content.read` (`facts.actions`; null = unknown = assumed) AND `content.read`
 * lists what this call lists (`contentReadLists`: an article, a menu item, a module; not a banner, a language,
 * a category…) — the listing that takes a language, whose rows carry the CMS id.
 * @param {CallContext} ctx
 * @returns {{ words: string, titles: string | null }}
 */
function findingRoads(ctx) {
  const words =
    ctx.platform === 'joomla' && ctx.sealed === true
      ? 'content.contract {operation:"inspect", match:"<words>"} finds the slot holding words; page.text {path, match} reads a page.'
      : 'page.text {path, match} finds words on a page'
  // 🔒 A RECORD IS FOUND BY ITS TITLE IN ONE LANGUAGE'S LIST, NOT BY PAGING THE WHOLE ONE. `content.list`
  // lists every language, and a plugin older than the release that reads `search` reads no filter: on a
  // 44-language Joomla site the model paged a 1,900-article list five times (13 wasted calls, round 7) to
  // find the copies of one article. `content.read {type, locale}` is the list that takes a language, and
  // its rows carry the CMS id.
  // 🔒 THE TYPE IS NAMED, NEVER LEFT AS `{type}` (09/10/2026): a bare placeholder was filled with the CMS's
  // own word (`type:"post"`, refused), a step lost on every such read of bench hb (`contentReadType`).
  const type = contentReadType(ctx.platform, ctx.asked)
  const titles =
    (ctx.actions === null || ctx.actions.includes('content.read')) &&
    contentReadLists(ctx.platform, ctx.asked)
      ? `content.read {${type === null ? 'type' : `type:"${type}"`}, locale, fields:"title,slug"} lists one language's records by title`
      : null
  return { words, titles }
}

/**
 * Whether a refusal may point a `content.list` at `search`: the kind is one the plugin's search covers, and
 * this site was not found (15 minutes, `noListSearch`) to have a plugin that ignores it.
 * @param {CallContext} ctx
 */
function listSearchOpen(ctx) {
  return ctx.noListSearch !== true && listSearchCovers(ctx.platform, ctx.asked?.kind)
}

/**
 * The road to a record known by its title, as a next (30/09/2026): `search` on the list, and — because an
 * older plugin refuses it (`LIST_SEARCH_UNSUPPORTED`) — what is left then: the listing that takes a language
 * where `content.read` lists this kind, else the same call paged; then the words. At most 200 characters
 * (T10) on every surface: a surface with no `content.read` is told the words road instead.
 * @param {CallContext} ctx
 */
function listSearchNext(ctx) {
  const road =
    ctx.platform === 'wordpress'
      ? 'content.list {search:"<part of the title>"} finds a post by title or slug'
      : 'content.list {kind, search:"<part of the title>"} finds a record by title or alias'
  // 🔒 `content.read` lists an article, a menu item, a module — not a category, a banner, a language…: a
  // refusal that named it for those would send the model to a type the relay refuses. The road that works
  // for every kind is the list itself, paged.
  if (!contentReadLists(ctx.platform, ctx.asked))
    return `${road}; if refused, the same call without search lists this kind a page at a time.`
  const { titles } = findingRoads(ctx)
  if (titles !== null)
    return `${road}; else ${titles.replace(" one language's records by title", ' titles')}; page.text {path, match} finds words.`
  return `${road}; ${
    ctx.platform === 'joomla' && ctx.sealed === true
      ? 'content.contract {operation:"inspect", match:"<words>"} finds the slot holding words'
      : 'page.text {path, match} finds words'
  }.`
}

/**
 * The road to every kind of list, whatever the plugin reads: the same call without the key that was refused
 * (`search`, or a stray spelling of it), a page at a time. The key is a model's own word, so it is bounded.
 * @param {string} dropped
 */
function pagedWithout(dropped) {
  return `Same call without ${dropped.slice(0, 30)}: content.list {kind, offset, limit} lists this kind a page at a time.`
}

/**
 * The roads to a record known by its title when `content.list` has no `search` for THIS call — the plugin
 * ignored one a moment ago (`LIST_SEARCH_UNSUPPORTED`), the kind is not one it searches, or a stray key was
 * sent to a site found not to read it. Where `content.read` lists the kind: the listing that takes a
 * language, then the words, and on WordPress the exact slug (`name`, read by every plugin that lists posts by
 * name). Where it does not (a Joomla category, banner or language, a custom post type): the same call paged —
 * never `content.read`, and never "no search" said of a kind the plugin refuses by name on a site that has it.
 * @param {CallContext} ctx
 * @param {string} [dropped] - the key the call sent that is not read: `search`, or a stray spelling of it.
 */
function listWithoutSearchNext(ctx, dropped = 'search') {
  if (!contentReadLists(ctx.platform, ctx.asked)) return pagedWithout(dropped)
  const { words, titles } = findingRoads(ctx)
  // 🔒 ONE CALL, READY TO SEND (09/10/2026). This next used to offer three roads — a slug lookup that needs
  // the slug the model is looking for, the listing with `{type}` left open, the words on a page — and the
  // model took the open one with its CMS's own type word (refused), or the 15k page map (bench hb, 16 of 16
  // LIST_SEARCH_UNSUPPORTED answers on WordPress and Joomla; 1–3 steps each). The listing with its type
  // filled in answers each record's title and the CMS id the next call takes.
  if (titles !== null)
    return `No search here: ${titles}; native {kind, id} is the id content.get or content.delete takes.`
  return ctx.platform === 'wordpress'
    ? `${words}; content.list {kind:"post", name:"<slug>"} finds a post by its slug.`
    : `${words}.`
}

/**
 * `PARAMS_NOT_JSON` (F1, `site-call.mjs` `jsonFieldProblem`): the field, the nested key and the
 * character where JSON.parse stopped — the one spot to fix — then the whole field again (the column
 * is written whole). The model usually copies the value from a `content.get`, so a site that already
 * holds it broken (a write from before this check, bench V5-chat-01) is named too: the fixed value
 * repairs it, or the write that stored it is undone. A WordPress global-styles post (`site-call.mjs`
 * `globalStylesProblem`, v6 WP L4-02) is refused the same way, plus one case of its own: JSON that
 * dropped `isGlobalStylesUserThemeJSON` (`flag`), which WordPress ignores as a whole.
 * @param {Record<string, unknown>} a
 */
function paramsNotJsonNext(a) {
  const field = typeof a.field === 'string' && a.field !== '' ? a.field.slice(0, 20) : 'params'
  if (typeof a.flag === 'string' && a.flag !== '')
    return `${field} keeps "${a.flag.slice(0, 40)}": true at its top level, as content.get gave it: send the whole ${field} again with it. Nothing was written.`
  if (a.ends === true)
    return `${field} ends before its JSON closes: a } or ] is missing where an object or list ends inside it. Send the whole ${field} as content.get gave it, with only your change. Nothing was written.`
  if (a.notObject === true)
    return `${field} holds one JSON object ({"<key>":"<value>", …}): send the whole ${field} as one. Nothing was written.`
  const named = typeof a.key === 'string' && a.key !== '' ? `${field}["${a.key.slice(0, 30)}"]` : field
  const at = Number.isInteger(a.offset) ? Number(a.offset) : 0
  return `${named} stops being JSON at char ${at}: fix it, send the whole ${field} again. Already stored broken? This repairs it, or apply.revert {apply_id} of that write.`
}

/**
 * `PARAMS_WHOLE_COLUMN` (F1.1, `site-call.mjs` `jsonFieldPatch`): a Joomla JSON column was sent as an
 * object of a few keys. The column is stored as one text, so those keys ARE the column once written —
 * every other parameter of that record would be gone. The next names the only road that keeps them:
 * read the record, change the one value in the text it answered, send that text back whole. On a CREATE
 * (F3) only a `patch` object beside other keys, or a lone `patch` that is not an object, is refused, and the next
 * says which two forms are meant.
 * @param {Record<string, any>} a
 */
function paramsWholeColumnNext(a) {
  const field = typeof a.field === 'string' && a.field !== '' ? a.field.slice(0, 20) : 'params'
  // F3 (30/09): a create has no stored column to read; what was refused is a `patch` mixed with own keys, or a
  // lone `patch` that is not an object.
  if (a.create === true)
    return `Send fields.${field} as {patch:{"<key>":<value>}} alone, or as the column's own keys without "patch". Nothing was written.`
  const kind = typeof a.kind === 'string' && a.kind !== '' ? a.kind.slice(0, 20) : 'record'
  const id = Number.isInteger(a.id) && Number(a.id) > 0 ? ` id:${String(a.id)}` : ''
  return `Send fields.${field}:{patch:{"<key>":<value>}} — Tracy merges it into the stored ${field} (null removes a key) — or content.get {kind:"${kind}"${id}} and send fields.${field} as the WHOLE text (a string, not an object). Nothing was written.`
}

/**
 * `PARAMS_KEYS_LOST`: a key the stored column keeps as JSON text (`jatools-config`) was sent as a new
 * string that drops one of its keys. The next is the object form, with the key's own name in it.
 * @param {Record<string, any>} a
 */
function paramsKeysLostNext(a) {
  const field = typeof a.field === 'string' && a.field !== '' ? a.field.slice(0, 20) : 'params'
  const key = typeof a.key === 'string' && a.key !== '' ? a.key.split('.')[0].slice(0, 40) : '<key>'
  return `Never re-type a JSON text: send only what changes, as an object — fields.${field}:{patch:{"${key}":{"<inner key>":<new value>}}}. Tracy merges it and keeps every other key. Nothing was written.`
}

/**
 * `BODY_SHRINK` (D6′ (a)).
 *
 * 🔒 D6′'s NEXT, UNCHANGED, UNLESS THE CUSTOMER ASKED FOR A REMOVAL. The `removes` escape used to be
 * offered on every refusal — to exactly the model that was cutting the page, which then quoted any
 * three words of the request ("Change the hero headline") and passed C33's truncation. It is named
 * only when the customer's latest message holds a removal verb (`facts.customerRemoval`, set by the
 * guard in `site-call.mjs`), and the guard accepts only a quote that carries that verb.
 *
 * 🔒 W1 — THE RULE IS SAID WHERE IT IS BROKEN, NOT IN THE DESCRIPTION. The after-final bench C47
 * (benchwp01, 25/09): 16 steps, 15 refusals, 9 of them BODY_SHRINK — the next said
 * `removes:"<their words>"` and never what the guard checks, nor that padding is no way on. The
 * `content.update` block of the description is already over T12's 700 (806 chars), so the exact
 * rule ({@link REMOVES_RULE}) and "never padded" live here. The second length-judged refusal of one
 * record in a turn (`facts.shrinkAgain`, counted by `CallMemory.shrinkRefused`) stops the
 * rewriting: only the customer can say what may go, and a `removes` quotes their next message.
 *
 * F6 (27/09/2026): the removal next names the block drop WITHOUT `removes`. The guard now passes a
 * block edit whose dropped blocks are the whole of its shrink, in any language; `removes` is left for
 * a whole-body write and a theme-file part.
 * @param {Record<string, unknown>} a
 * @param {unknown} facts
 */
function bodyShrinkNext(a, facts) {
  const part = a.kind === 'templatePart'
  const field = part ? 'content' : 'post_content'
  if (a.conversation === false)
    return 'Tracy cannot tie this call to a conversation, so a whole-body write cannot be checked against a read: tell the customer; do not write the page another way.'
  // A Joomla body field or an EmDash field (09/10/2026): the refusal names its field; WordPress's never does.
  if (typeof a.field === 'string' && a.field !== '') return fieldShrinkNext(a, facts)
  const address = part ? `key:"${String(a.key ?? '<slug>').slice(0, 40)}"` : `id:${Number(a.id) || '<id>'}`
  const kind = `kind:"${part ? 'templatePart' : 'post'}", ${address}`
  const get = `content.get {${kind}}`
  // W2: the blocks meant, by their position — the host reads the body itself and keeps the rest. A
  // position comes with the rev of the read that numbered it (01/10/2026, `wp-blocks.mjs` `revOf`).
  const blocks = `Only the blocks meant: content.update {${kind}, rev, blocks:{"<i>":"<markup>"}}`
  if (a.read === false) return `${blocks}; a whole ${field} needs ${get} first.`
  // A part the site stores no copy of, whose theme file could not be read: nothing to check against.
  if (a.theme === 'unread')
    return 'Tell the customer this part cannot be changed safely here right now; do not write it another way.'
  const f = /** @type {Record<string, unknown>} */ (facts && typeof facts === 'object' ? facts : {})
  const themed = typeof a.theme === 'string' && a.theme !== ''
  if (themed && f.sealed === true)
    return 'This part is served from the theme, whose files are not read from here: tell the customer it cannot be changed here.'
  if (f.shrinkAgain === true)
    return 'Refused twice on this record this turn: stop writing it. End your reply asking the customer what may be removed; quote their answer in removes. Never pad the body.'
  const removal = f.customerRemoval === true
  // 🔒 THE BASE IS THE THEME'S FILE, NOT A READ: the markup to keep is in that file, which a
  // `content.get` of the part does not return (not stored), so the next names the file itself.
  if (themed)
    return removal
      ? `Read .webroot/${String(a.theme).slice(0, 70)}; send all its markup, only your words changed, never padded; ${REMOVES_RULE}.`
      : `Read .webroot/${String(a.theme).slice(0, 70)}, then send all its markup with only your words changed, never padded.`
  // 🔒 "IF IT CHANGED SINCE, READ IT AGAIN." The length judged against is what THIS conversation
  // read; an undo or a build since may have changed the site, and without this sentence the only way
  // on was to pad the body (review, 25/09).
  // A removal the customer asked for is a block dropped (W1, W2). Since F6 (27/09) a block dropped by
  // position needs no `removes`: the guard passes it when the drop is the whole of the shrink.
  if (removal)
    return `To remove, drop its blocks: content.update {${kind}, rev, blocks:{"<i>":null}}: no removes needed, apply.revert undoes it; never padded.`
  return `${blocks}; a whole ${field} keeps every block, never padded; content.get again if it changed.`
}

/**
 * `BODY_SHRINK` of one field that a Joomla `content.update` or an EmDash `content_update` replaces whole
 * (09/10/2026; the guard is `judgeWholeBody` in `site-call.mjs`). The roads WordPress's next names
 * where they exist here — the read first, the whole field with only the change, never padded, the
 * customer's words in `removes` for a removal they asked for, the customer asked after a second
 * refusal — and, where WordPress names its blocks, the job that changes words without re-sending
 * the field: `content.replace`.
 * @param {Record<string, unknown>} a
 * @param {unknown} facts
 */
function fieldShrinkNext(a, facts) {
  const field = String(a.field).slice(0, 40)
  const emdash = a.tool === 'content_update'
  const get = emdash
    ? `tracy_emdash content_get {collection:"${String(a.collection ?? '<collection>').slice(0, 40)}", id:"${String(a.id ?? '<id>').slice(0, 40)}"}`
    : `content.get {kind:"${String(a.kind ?? '<kind>').slice(0, 20)}", id:${Number(a.id) || '<id>'}}`
  const replace = emdash ? 'tracy_site content.replace {find, replace}' : 'content.replace {find, replace}'
  const answered = emdash ? 'content_get answered it' : 'content.get answered it'
  if (a.read === false)
    return `${get} first; then send the whole ${field} as it answered, only your change made. Words alone: ${replace}.`
  const f = /** @type {Record<string, unknown>} */ (facts && typeof facts === 'object' ? facts : {})
  if (f.shrinkAgain === true)
    return 'Refused twice on this record this turn: stop writing it. End your reply asking the customer what may be removed; quote their answer in removes. Never pad the body.'
  if (f.customerRemoval === true)
    return `Send ${field} as ${answered}, minus only what the customer asked to remove, never padded; ${REMOVES_RULE}.`
  return `${field} is the whole field: send all of it as ${answered}, only your change made, never padded; words alone: ${replace}; read it again if it changed.`
}

/**
 * `SITE_REFUSED` / `NOT_MCP` from `tracy_emdash`, by what the call was (E2.4): a read the site did not
 * answer (`NOT_MCP`, or an HTTP status ≥ 500) was asked once more by Tracy; a read the site refused
 * with a lower status was not; a WRITE is never asked twice, because it may have landed before the
 * answer was lost. The old sentence said "Tracy already retried a read once" for all three.
 * A tool missing from `EMDASH_READ_TOOLS` is read as a write — the safe direction, as there.
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function emdashDoorFailedNext(a, ctx) {
  if (ctx.tool === null)
    return "EmDash's own door answered with an error: tell the customer what failed; do not change the site another way."
  if (!EMDASH_READ_TOOLS.has(ctx.tool))
    return "EmDash's own door failed this write, and Tracy never sends a write twice (it may have landed): tell the customer it may not be saved; do not send it again or change the site another way."
  const status =
    typeof a.httpStatus === 'number'
      ? a.httpStatus
      : Number(/HTTP (\d{3})/.exec(String(a.error ?? ''))?.[1] ?? Number.NaN)
  return a.code === 'NOT_MCP' || status >= 500
    ? "EmDash's own door failed this read twice (Tracy asked once more): tell the customer; do not change the site another way."
    : "EmDash's own door refused this read (the error says why): tell the customer; do not change the site another way."
}

/**
 * `EMDASH_SITE`: `tracy_site` asked of an EmDash site. The road is `tracy_emdash`, named per action so
 * the model does not rediscover it (r2: 1 `apply.list`; hist: 2).
 * @param {string | null} action
 */
function emdashSiteNext(action) {
  if (action === 'apply.list' || action === 'apply.revert')
    return "EmDash keeps no receipts: a write's own answer is its receipt; undo is tracy_emdash revision_list {collection, id} then revision_restore."
  if (action === 'content.update' || action === 'content.delete' || action === 'content.batch')
    return 'tracy_emdash content_get {collection, id:"<slug>"}, then content_update {collection, id, _rev, data, status:"published"}.'
  return 'This site runs EmDash: tracy_emdash {tool, arguments} reaches it; content_get {collection, id:"<slug>"} reads a page ("site" holds the site-wide words).'
}

/**
 * `COMPONENT_NOT_ON_FLEET_COPY`: an imported site writes to its hosted copy, and the Apply door
 * could not verify that copy, so it refused rather than write to the customer's live site. Its
 * `copyReason` (tracy-web `route.js` `FleetCopyWhy`) decides the sentence. Measured 30/09/2026 on a
 * local stand: a freshly imported large WordPress site (tracy.ai, 2,482 posts) refused three writes
 * minutes after the import because its first check ran past 30 s on a cold copy — and the old
 * sentence ("do not write, tell the customer") ended the request over a copy that answered in
 * half a second a moment later. A cold copy is now a retry; an answer that will not change by
 * waiting names who can repair it. Never "write another way": the live site is not the fallback.
 * @param {unknown} why
 * @param {unknown} [transient] - tracy-web's `transient`: false once the copy has failed for long.
 * @returns {string}
 */
function fleetCopyNext(why, transient) {
  const untouched = 'nothing was written and the live site was not touched'
  switch (why) {
    case 'timeout':
    case 'unreachable':
      // A copy that has not answered for a long while is not warming up (tracy-web `FLEET_COPY_WARM_MS`).
      if (transient === false)
        return `The hosted copy of this imported site has not answered for a long while; ${untouched}. Do not retry: tell the customer the copy is not answering and needs checking by Tracy's team; do not write another way.`
      return `The hosted copy of this imported site is still warming up; ${untouched}. Retry the same call in a moment; if it is refused again, tell the customer the copy is not answering yet.`
    case 'unauthorized':
      return `The hosted copy of this imported site does not accept the token Tracy holds for it; ${untouched}. Tell the customer its Claude Cowork plugin needs pairing again; do not write another way.`
    case 'platform_mismatch':
      return `The hosted copy answers as a different CMS than this site was imported as; ${untouched}. Tell the customer the import needs checking; do not write another way.`
    case 'no_registered_component':
    case 'no_copy_address':
      return `This imported site has no usable Claude Cowork plugin registration; ${untouched}. Tell the customer the site must be connected again first; do not write another way.`
    default:
      return `The hosted copy of this imported site could not be verified; ${untouched}. Retry once in a moment; if it is refused again, tell the customer the copy needs checking.`
  }
}

/**
 * What `tracy_site` says on an EmDash site (`EMDASH_SITE`'s `error`), instead of the seat book's
 * `COMPONENT_NOT_REGISTERED`; the call to make is `emdashSiteNext`'s.
 *
 * 🔒 NEVER "{list: true} FIRST" (D29): that sentence, in four texts, sent 32 of 33 r2 EmDash turns to a
 * 49,977-character catalogue. `tracy_emdash`'s own description names the calls a content change needs,
 * and this answer's next gives the one for the action asked. Exported so the one-fact test reads the
 * text the model receives, not the source it is written in.
 */
export const EMDASH_ROAD =
  'This site runs EmDash, which has no Cowork component and needs none: its own MCP tools, through tracy_emdash, are the door. ' +
  // cd4a12e58 (ADR 0020): the build's own writes have a journal, read and undone through the build
  // tool, not through tracy_emdash — the one road this answer cannot infer from the site.
  'What Tracy wrote at the build is read and undone through the build tool: tracy_site_build_emdash ' +
  'request site.inspect, then site.revert {applyId}.'

/**
 * `TOOL_FAILED`: EmDash's own refusal, by its code (`[CODE] message`) or the class its text shows.
 * @param {Record<string, unknown>} a
 * @param {CallContext} ctx
 */
function emdashFailedNext(a, ctx) {
  const text = String(a.error ?? a.message ?? '')
  const tool = ctx.tool ?? ''
  const sub =
    typeof a.emdash === 'string' && a.emdash !== ''
      ? a.emdash
      : (/^\s*\[([A-Z_]+)\]/.exec(text)?.[1] ??
        (/-32602|Input validation|Invalid arguments/i.test(text)
          ? 'VALIDATION'
          : /_rev is required/.test(text)
            ? 'REV_MISSING'
            : /tool .* not found|Method not found/i.test(text)
              ? 'UNKNOWN_TOOL'
              : ''))
  if (sub === 'CONFLICT')
    return tool === 'content_publish' || tool === 'content_unpublish'
      ? 'content_update {…, status:"published"} changes and publishes in one call; to publish now: content_get for the current _rev, then content_publish once.'
      : 'content_get {collection, id} for a fresh _rev, then the same write once; do not loop on the old _rev.'
  // `COLLECTION_NOT_FOUND` is EmDash 1.0.1's word for a collection the site lacks (`content_list`; the
  // stand said `NOT_FOUND`): it had no sentence and fell to "tell the customer … do not change the site
  // another way" — the one instruction that stops a model from naming the right collection.
  if (sub === 'NOT_FOUND' || sub === 'COLLECTION_NOT_FOUND') {
    if (tool.startsWith('menu_'))
      return "menu_list {locale} names this site's menus; then menu_get {name} with one of them."
    if (tool.startsWith('taxonomy_'))
      return 'taxonomy_list names the taxonomies; then the same call with one of them.'
    // 🔒 AN ENTRY THE COLLECTION LACKS is not a wrong collection: the collection answered, and the slug or
    // id asked for is not in it. Round 7: `content_get {collection:"services", id:"services"}` — a slug
    // the model did not have — was told a page is a collection, which it already knew, and read the page
    // twice more. The list of the collection is where its slugs are.
    const collection =
      typeof a.collection === 'string' && /^[\w-]{1,30}$/.test(a.collection) ? a.collection : null
    if (collection !== null && sub === 'NOT_FOUND' && /Content item not found/i.test(text))
      return `No entry with that id or slug in ${collection}: content_list {collection:"${collection}"} lists its entries with their slugs and titles.`
    return 'A page is the collection named after it: content_get {collection:"<page>", id:"<slug>"}; schema_list_collections lists the collections.'
  }
  // A cursor is opaque (EmDash writes it from the last row's order value and id): a model that made one
  // up — `eyJvIjo3fQ==`, base64 of {"o":7} — was refused and told "tell the customer".
  if (sub === 'INVALID_CURSOR')
    return 'A cursor is never made by hand: send the nextCursor an earlier answer gave, exactly as it came; with none, the same call without cursor answers one (limit:<fewer rows> if it came cut).'
  if (tool === 'media_upload') {
    const upload = emdashUploadNext(text, sub)
    if (upload !== null) return upload
  }
  if (sub === 'VALIDATION' || sub === 'VALIDATION_ERROR')
    return `The message names the wrong argument: {list:true, tools:["${tool.slice(0, 40) || '<tool>'}"]} gives the schema; then the corrected call once.`
  if (sub.startsWith('INSUFFICIENT'))
    return "This site's agent token does not carry that right: tell the customer; do not work around it."
  if (sub === 'UNKNOWN_TOOL')
    return 'Not a tool this site publishes: {list:true} names them; a page as visitors read it is tracy_site page.text.'
  if (sub === 'REV_MISSING')
    return "content_get {collection, id} answers the entry's _rev: make the same call with it."
  return 'EmDash answered no: tell the customer what was refused and why; do not change the site another way.'
}

/**
 * EmDash's own `media_upload` refusals (`api/handlers/media-upload.ts`, pinned 0.37.0), by what they
 * say; null for one the general classes answer (a missing scope, an unknown refusal).
 *
 * 🔒 THE WAY ON IS THE HOST'S READ, NOT ANOTHER SPELLING OF THE SAME CALL. Measured 27/09/2026 on the
 * local stand: an agent handed a customer's picture looped 24–40 steps — its URL refused by EmDash's
 * SSRF guard ("URL not allowed: Hostname resolved to no addresses"), its own base64 "Invalid base64
 * data" — and every one of those refusals was answered "the same call with contentType". The bytes
 * are the host's to read: `tracy_site media.upload {file}` (`upload.mjs`), or `{attachment}` for a
 * picture the customer sent in the chat (29/09/2026) — the case v5 measured (cause O).
 * @param {string} text - EmDash's message.
 * @param {string} sub - its code (`[CODE]` prefix, or the class `emdashFailedNext` read).
 * @returns {string | null}
 */
function emdashUploadNext(text, sub) {
  const limit = /maximum size of ([\d.,]+\s*[KMGT]?i?B)/i.exec(text)?.[1]
  if (sub === 'PAYLOAD_TOO_LARGE' || limit !== undefined)
    return `The picture is over this site's upload limit${limit ? ` of ${limit}` : ''}: ask the customer for a smaller copy; tracy_site media.upload {file} carries up to 8 MiB.`
  if (/contentType is required/i.test(text))
    return 'media_upload wants contentType beside base64; but a picture the customer gave goes by tracy_site media.upload {file} or, sent in this chat, {attachment}, and Tracy reads its bytes.'
  if (
    sub === 'VALIDATION' ||
    sub === 'VALIDATION_ERROR' ||
    sub === 'FETCH_ERROR' ||
    /Invalid base64|URL not allowed|Failed to fetch file/i.test(text)
  )
    return 'A picture the customer gave goes by tracy_site media.upload {file:"<its name in the Files tab>"}, or {attachment:"<its name>"} if sent in chat: Tracy reads the bytes — never type base64 or a URL.'
  return null
}

/**
 * `bad_params`, by the component's message (T10 fixtures G3, G9, G26; measured r2: 62).
 * @param {string} message
 * @param {CallContext} ctx
 */
function badParamsNext(message, ctx) {
  // `content.list {search}` (30/09/2026), refused by `normalize.mjs` `listSearch` or by the plugin itself, in
  // the words of `joomla-v0.20.0` (`SearchNeedle`) and `wordpress-v0.16.0` (`Engine::searchNeedle`): the value
  // is not text, is over 200 characters, or is not UTF-8.
  if (
    /^search (?:must be (?:text|a string|valid UTF-8)|is (?:\d+|at most \d+|limited to \d+) characters)/.test(
      message
    )
  )
    return 'Same call with search as one piece of text of at most 200 characters, or without search.'
  // …or is asked of a kind the plugin does not search (a user, a redirect, a template part), or of a site
  // whose writer cannot search: the plain list, a page at a time, is the road.
  if (
    /^(?:search does not cover kind|content\.list cannot search kind|this site cannot filter a list by search)/.test(
      message
    )
  )
    return pagedWithout('search')
  // The refused kind, in either wording a released plugin sends (`contentList`): `wordpress-v0.14.9` says
  // `serves kind "post" only; "<kind>"`, `wordpress-v0.15.3`/`0.16.0` `serves kinds "post", "templatePart" and
  // "template"; "<kind>"` (B1, 02/10/2026: matched on the first alone, every live site got the generic next).
  const listed = /content\.list serves kinds? [^;]*; "([^"]*)" is not listed/.exec(message)
  if (listed) {
    const kind = listed[1]
    if (kind === 'page' || kind === 'pages')
      return 'content.list {kind:"post", post_type:"page"} lists the pages.'
    if (/^(templatePart|template_part|wp_template_part|part)$/.test(kind))
      return 'content.list {kind:"post", post_type:"wp_template_part"}; or read one: content.get {kind:"templatePart", key:"header"}.'
    if (/^(menuItem|menu|menus|navigation|wp_navigation)$/.test(kind))
      return 'content.list {kind:"post", post_type:"wp_navigation", include_body:true} lists the menus with their links.'
    if (kind === 'option' || kind === 'options')
      return 'No door lists options: content.get {kind:"option", key:"blogname"} reads one ("blogdescription" is the tagline).'
    return 'content.list {kind:"post", post_type:"page"}; option, postmeta and templatePart are read one at a time: content.get {kind, key}.'
  }
  if (/^kind must be one of: post\b/.test(message))
    return 'Same call with kind added: a page, a post or a wp_navigation menu is kind "post".'
  if (/^kind must be one of: article\b/.test(message))
    return 'Same call with a kind from that list: the words of a page are kind "article" or "module".'
  if (/id or key required to name which templatePart/.test(message))
    return 'content.get {kind:"templatePart", key:"header"} (or key:"footer"): a template part is named by its slug.'
  if (message.startsWith('id or key required'))
    return 'Same call with id (a number) or key (a name); content.list {kind:"post"} gives the ids.'
  if (
    /request_id required|apply_id must start with "contract-"|apply_id, request_id and 1–100 operations required/.test(
      message
    )
  )
    return 'Leave apply_id and request_id out: Tracy makes a new pair for every apply. Make the same call once more.'
  // A receipt is named by the id a write ANSWERED (`normalized` shows it), never a new one: a made-up
  // name for an undo matches nothing, or someone else's change.
  // `apply.list` with no id reaches the plugin only through a door older than the site's recent changes
  // (`recent-changes.js` in tracy-web): no list of earlier conversations' changes can be had there.
  if (message.startsWith('apply_id required'))
    return ctx.action === 'apply.list'
      ? "apply.list takes the apply_id a write of this conversation answered, and this site's door cannot list earlier changes: ask the customer which change they mean; never guess an id."
      : ctx.action === 'apply.revert'
        ? 'apply.revert takes the apply_id a write of this conversation answered (its answer or normalized shows it); never a new name. No write, nothing to undo.'
        : 'Same call with apply_id: a short name for this change.'
  if (message.startsWith('fields required'))
    return 'Same call with fields holding what changes, e.g. {post_content} for a page or {content} for a template part.'
  if (message.startsWith('table required'))
    return 'db.tables lists the tables; then db.dump {table:"<one of them>"}.'
  if (/^id required$/.test(message)) return 'Same call with id: the number content.list shows for that row.'
  return "The door's message names the wrong parameter: correct the call and make it once more. Do not repeat the identical call, and do not reach the database or the CMS another way."
}

/**
 * `bad_action` from the component: the action is not on this component. r2: 57 — 50 of them
 * `content.contract` on WordPress, 7 `content.batch`.
 * @param {string} message
 * @param {CallContext} ctx
 */
function badActionComponentNext(message, ctx) {
  const action = /unknown action: (\S+)/.exec(message)?.[1] ?? ctx.action ?? ''
  if (action === 'media.delete')
    return "This site's Claude Cowork plugin does not support deleting pictures yet; it needs updating. Report this refusal; do not delete with shell or file tools."
  if (action === 'content.contract' || action === 'content.batch')
    return notOnPlatformNext({ what: action }, { ...ctx, platform: ctx.platform ?? 'wordpress' })
  return `This site's component has no ${action.slice(0, 24) || 'such action'}; another spelling will not help. ${doorsOf(ctx)}`.slice(
    0,
    200
  )
}

/**
 * `write_failed`, by the component's message (T10 G17; measured r2: 17).
 * @param {string} message
 */
function writeFailedNext(message) {
  // A post's featured image is postmeta, not a post field (local stand 24/10/2026: five posts refused this way).
  if (/no writable field for kind post; given [^;]*(?:featured|thumbnail)/i.test(message))
    return 'A post\'s featured image is its postmeta _thumbnail_id: content.update {kind:"postmeta", id:<the post id>, key:"_thumbnail_id", fields:{value:<the image\'s attachment id>}}.'
  if (/no writable field for kind post/.test(message))
    return 'The words live inside post_content (block markup): content.get the post, then send the whole post_content with only those words changed.'
  if (/postmeta needs a key/.test(message))
    return 'Same call with key: the meta key, e.g. content.update {kind:"postmeta", id, key:"<meta key>", fields:{value}}.'
  if (/postmeta needs the id/.test(message)) return 'Same call with id: the post the meta hangs off.'
  if (/templatePart needs a content field/.test(message))
    return 'content.update {kind:"templatePart", key:"<slug>", fields:{content:"<the whole block markup>"}}: content.get the part first.'
  if (/templatePart needs a key/.test(message))
    return 'A template part is written by its slug: key:"header" or key:"footer".'
  if (/takes one field: value/.test(message))
    return 'Same call with fields:{value:"<the new value>"}: one field, named value.'
  if (/term needs a key/.test(message)) return 'Same call with key: the taxonomy, e.g. key:"category".'
  if (/not writable/.test(message))
    return 'That option is protected by the component (it would take the site away): tell the customer; do not work around it.'
  if (/rolled back/.test(message))
    return 'Nothing was kept: the component rolled the change back. Make the same call once more; if it fails again, tell the customer.'
  return 'Nothing was written. The message names what the component refused: fix that in the call once, or tell the customer why it cannot change.'
}

/**
 * `not_found`, by what was asked (T10 G7; measured r2: 28 — 21 of them C13 guessing ids 1…24).
 * @param {string} message
 * @param {CallContext} ctx
 */
function notFoundNext(message, ctx) {
  const wp = /^no (\w+) at id (\d+), key "([^"]*)"/.exec(message)
  if (wp) {
    const [, kind, , key] = wp
    if (kind === 'post')
      return key !== ''
        ? 'content.list {kind:"post", post_type:"page"} lists the pages with their real slugs and ids; then content.get {kind:"post", id}.'
        : 'No post has that id: content.list {kind:"post", post_type:"page"} lists them with their ids; do not try ids one by one.'
    if (kind === 'templatePart')
      return 'A template part is named by its slug: content.get {kind:"templatePart", key:"header"} or key:"footer".'
    if (kind === 'option')
      return 'No option by that name: content.get {kind:"option", key:"blogname"} reads the site title; "blogdescription" the tagline.'
    if (kind === 'postmeta')
      return 'That post has no meta under that key: content.get {kind:"post", id} reads the post itself.'
    if (kind === 'term')
      return 'No such term: content.get {kind:"term", key:"category", id} needs a term id this site has.'
    return `No ${kind} there: read the page first with page.text {path, match} to see what it holds.`
  }
  if (message.startsWith('no page or post with slug'))
    return 'content.list {kind:"post", post_type:"page"} lists the pages with their real slugs and ids.'
  const joomla = /^no (\w+) with id/.exec(message)
  if (joomla) return `content.list {kind:"${joomla[1]}"} lists the rows with their ids; do not guess ids.`
  return ctx.platform === 'wordpress'
    ? 'Nothing has that address here: content.list {kind:"post", post_type:"page"} gives the ids to use.'
    : 'Nothing has that address here: content.list {kind} lists the records with their ids.'
}

/**
 * 🔒 F1 (27/09/2026): THE CONTRACT'S "Syntax error" IS A STORED JSON VALUE IT CANNOT READ, AND AN UNDO
 * FIXES IT. It is PHP's `json_last_error_msg()`, raised while the contract reads the page — measured on
 * the bench (V5-chat-01, benchjoomla01): module 442's `params` written with its nested `jatools-config`
 * one `}` short, after which every apply on the home page answered `contract_failed "Syntax error"`,
 * marked `unrecoverable`, and the next said to tell the customer. The refusal names no record, so the
 * write is named by what the model did: a `content.update` of params, undone newest first (an earlier
 * write may have stored the same slip). `site-call.mjs` now refuses such a value before it is sent
 * (`PARAMS_NOT_JSON`); this is for a site that already holds one.
 */
const STORED_JSON_BROKEN_NEXT =
  '"Syntax error": a stored JSON value on this page no longer parses, usually params a content.update wrote: apply.revert {apply_id} of that write (newest first), then apply again.'

/**
 * `contract_failed`, one line per component message (claude-cowork 2aa7840, `QuickstartContract.php`
 * `:538-572` and `Engine.php:1209-1240`). The evidence and missing-picture messages are answered above
 * the switch.
 * @param {string} message
 */
function contractFailedNext(message) {
  const slot = /: (\S+)$/.exec(message)?.[1] ?? '<slot>'
  if (/^Syntax error\b/.test(message)) return STORED_JSON_BROKEN_NEXT
  if (message.startsWith('Unknown contract operation'))
    return 'content.contract takes operation "inspect" (reads the slots) or "apply" (changes them).'
  if (/apply_id|request_id/.test(message))
    return 'Leave apply_id and request_id out: Tracy makes a new pair for every apply. Make the same apply once more.'
  if (message.startsWith('Content changed; inspect again'))
    return 'Someone changed the site since your inspect: content.contract {operation:"inspect", match} again, check your slots, then apply with its revision.'
  if (message.startsWith('Expected 1–1500 scalar content changes'))
    return 'changes is {"<slot key>": "<text>"} with 1 to 1,500 entries.'
  if (message.startsWith('Unknown content slot or non-string value'))
    return 'Slot keys come from the inspect (e.g. module-441.1) and values are text: content.contract {operation:"inspect", match:"<words>"} shows the key.'
  if (message.startsWith('Content cannot remove an occupied slot'))
    return `${slot} must keep words in this design: ask the customer what it should say, or tell them it cannot be removed. A two-line heading keeps both slots.`
  if (message.startsWith('Content cannot activate an empty slot'))
    return `${slot} is empty in this quickstart's design, so the content door cannot fill it. To show it, change the layout through the CMS (its CLI or template files), keeping the quickstart's style.`
  if (message.startsWith('Markup and control characters are not content'))
    return `Plain text only in ${slot}: line breaks and emphasis belong to the template. Send the words without tags.`
  if (message.startsWith('Joomla plugin directives are not content'))
    return `No {…} directives in ${slot}: send plain words.`
  if (message.startsWith('Content too long'))
    return `${slot} holds only so many characters (the inspect shows max): shorten it, or split it across its sibling slot.`
  if (message.startsWith('Unsupported CTA URL'))
    return `${slot} takes https://…, mailto:…, tel:+digits, /path, index.php?Itemid=N or #anchor.`
  if (/^Image aspect ratio|^Image escapes|^Image must be a png/.test(message))
    return 'media.draw {prompt, slot:"<image slot key>"} draws to the slot\'s shape; apply the path it returns.'
  if (message.startsWith('Split the revision'))
    return 'Split the changes into two applies, each with its own revision.'
  // A bound WordPress site's own messages (#337; claude-cowork `wordpress/cowork/lib/QuickstartContract.php`
  // `plan()` and `checkValue()`, Claude Cowork plugin 0.13.2).
  if (message.startsWith('Unknown content slot: '))
    return `${slot} is not a slot of this site: content.contract {operation:"inspect", match:"<words>"} shows the keys; another language's copy is "<edition>::<key>".`
  if (message.startsWith('An option has no edition'))
    return `${slot.split('::').pop()} is one for every language: send it without an edition prefix.`
  if (/^No \S+ edition of |edition has no block for /.test(message))
    return `That language's copy of the page has no such block, so ${/(\S+)$/.exec(message)?.[1] ?? slot} cannot change there: tell the customer.`
  if (message.startsWith('Unsupported link'))
    return `${slot} takes https://…, mailto:…, tel:+digits, /path or #anchor.`
  if (message.startsWith('Template directives are not content'))
    return `No {…} directives in ${slot}: send plain words.`
  return 'Read the message: it names the slot and the rule. Change that value and apply once more, or tell the customer why it cannot change.'
}

/**
 * 🔒 CONTENT API v2 (W3): A CONTRACT REFUSAL FROM A CLAUDE COWORK PLUGIN THAT SAYS WHAT WENT WRONG, FIELD BY FIELD
 * (Joomla Claude Cowork plugin rc.5, WordPress rc.2): `errors: [{code, message, field:{slotKey, contentId},
 * severity, limit?, actual?, current?}]`. The first `unrecoverable` one decides (nothing the model
 * can send fixes it: stop and tell the customer), else the first `recoverable` one (one call, or one
 * instruction). Several errors are counted and their slots named (≤ 10), so one corrected apply
 * fixes them all. The answer keeps its `errors[]`: the model reads every limit there.
 *
 * Outside `check-refusal-next`'s reach — the codes are the Claude Cowork plugin's, not the Apply door's — so
 * `test/site.test.mjs` holds one case per code.
 * @param {unknown} errors
 * @param {string | null} [platform] - the site's CMS, when the tool knows it: a picture's folder differs.
 * @returns {string | null}
 */
export function contractErrorsNext(errors, platform) {
  if (!Array.isArray(errors)) return null
  const list = errors.filter(
    (e) => e !== null && typeof e === 'object' && typeof e.code === 'string' && e.code !== ''
  )
  if (list.length === 0) return null
  const first = list.find((e) => e.severity === 'unrecoverable') ?? list[0]
  const sentence = contractErrorSentence(first, platform)
  if (list.length === 1) return sentence
  const slots = [...new Set(list.map((e) => fieldOf(e).slotKey).filter((k) => k !== ''))]
  const named = slots.length > 10 ? `${slots.slice(0, 10).join(', ')}, …` : slots.join(', ')
  return `${list.length} errors${named !== '' ? ` (${named})` : ''}; each is in errors[]. ${sentence}`
}

/** @param {Record<string, any>} e */
const fieldOf = (e) => {
  const f = e.field !== null && typeof e.field === 'object' ? e.field : {}
  return {
    slotKey: typeof f.slotKey === 'string' ? f.slotKey.slice(0, 80) : '',
    contentId: typeof f.contentId === 'string' ? f.contentId.slice(0, 80) : ''
  }
}

/**
 * Content API v2 E9 (Lee, 26/09/2026): a record open in the CMS editor is never overwritten; the
 * Claude Cowork plugin refuses (`SLOT_LOCKED_BY_USER`) and names who holds it. There is no flag that writes
 * anyway, so the only next step is the person.
 * @param {unknown} lockedBy
 */
function lockedNext(lockedBy) {
  const held =
    lockedBy !== null && typeof lockedBy === 'object' ? /** @type {Record<string, unknown>} */ (lockedBy) : {}
  const who = typeof held.name === 'string' && held.name !== '' ? held.name.slice(0, 60) : 'someone'
  return `${who} has this open in the CMS editor: ask the customer to have it saved and closed, then apply again. Never write over it.`
}

/**
 * `SLOT_IMAGE_INVALID`: the component's own words say which rule broke, and each rule has its own way on.
 *
 * 🔒 THE OLD SENTENCE ("media.draw … draws a picture to this slot's shape; apply the path it returns")
 * NAMED ONE ROAD AND HID THE OTHER. A slot takes ANY picture already in the library whose shape fits —
 * that is what "replace it with the picture of the project below" is — but the only way the model was
 * told to fill one was to draw. Five WordPress runs of round 7 were refused for writing the path as
 * `content.read` shows it (`/wp-content/uploads/…`, the form a browser needs), read the sentence, and
 * one of them concluded that a slot cannot take an existing picture and rewrote the block's markup
 * (137 s). So the sentence names the form the slot takes, and that an existing picture is fine.
 *
 * 🔒 THE SHAPE REFUSAL IS ALSO WHAT A CUSTOMER'S OWN PHOTO MEETS (adversarial review of round 7, PD-1). The
 * Files-tab notice sends "use the picture I uploaded" to `media.upload {file}`, whose receipt puts the file
 * in its slot, and a customer's file rarely has the slot demo's shape (0.02 tolerance): the refusal then
 * offered only another library picture or a DRAWN one, so the likely outcome was an AI picture in the hero
 * and the customer's real photo never used, unsaid. Nothing here crops the file (`cutToAspect` runs on the
 * draw road only), so the way on for their photo is theirs to give: tell them and ask for another, and never
 * draw one in its place unasked.
 * @param {Record<string, any>} e
 * @param {string} slotKey
 * @param {string | null | undefined} platform
 */
function imageInvalidNext(e, slotKey, platform) {
  const key = slotKey || '<image slot key>'
  const draw = `media.draw {prompt, slot:"${key}"}`
  const message = typeof e.message === 'string' ? e.message : ''
  if (/aspect ratio/i.test(message))
    return `${key} needs the slot's shape: another library picture, or ${draw}. The customer's own photo does not fit: tell them and ask for another; never draw one unasked.`
  if (/must already (?:exist|be) in the site media library|escapes/i.test(message))
    return `${key}: no such picture in the library. media.upload {file} puts the customer's in and answers its path; ${draw} makes a new one.`
  const folder =
    platform === 'joomla'
      ? 'images/<file>'
      : platform === 'wordpress'
        ? 'wp-content/uploads/<file>'
        : 'wp-content/uploads/<file> or images/<file>'
  // Develop's imported-site wording (a web address is no library picture; the customer's own file goes in by
  // media.upload) and the path form in one sentence: it must stay within the 200-character next limit.
  return `${key} takes a library picture: ${folder}, no leading "/" or web address. media.upload the customer's, or ${draw}.`
}

/**
 * `PRESENTATION_DRIFT` as an error, per platform (see its case in {@link contractErrorSentence}).
 * @param {string | null | undefined} platform
 */
function presentationDriftNext(platform) {
  const stop = 'Do not resend it: tell the customer that part cannot change this way.'
  if (platform === 'joomla')
    return `This apply's own change would have altered the page's design, so all of it was undone. ${stop}`
  if (platform === 'wordpress')
    return `A slot here no longer matches what it was bound to (errors[] says which), so it was refused before anything was written. ${stop}`
  return `Nothing was written: the change would have altered the design, or a slot no longer matches what it was bound to (errors[] says which). ${stop}`
}

/**
 * One W3 error's next step.
 * @param {Record<string, any>} e
 * @param {string | null | undefined} [platform]
 */
function contractErrorSentence(e, platform) {
  const { slotKey, contentId } = fieldOf(e)
  const slot = slotKey || 'That slot'
  const read = contentId !== '' ? `content.read {id:"${contentId}"}` : 'content.read {id} of that content'
  const num = (/** @type {unknown} */ v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  switch (e.code) {
    case 'REVISION_STALE': {
      const now = typeof e.current === 'string' && e.current !== '' ? ` (now ${e.current.slice(0, 40)})` : ''
      return `That content changed since your read${now}: ${read} again, check your words still fit, then apply again.`
    }
    case 'REVISION_REQUIRED':
      return `The apply must be based on a read of that content: ${read}, then apply again.`
    case 'SLOT_TOO_LONG': {
      const limit = num(e.limit)
      const actual = num(e.actual)
      return `${slot} takes at most ${limit ?? 'its maxCharacters'} characters${actual !== null ? ` (yours: ${actual})` : ''}: shorten it and apply again.`
    }
    case 'SLOT_EVIDENCE_REQUIRED':
      return `${slot} needs the customer's own words: ask the customer, put their words into evidence["${slotKey || '<slotKey>'}"], then apply again.`
    case 'SLOT_NOT_CONTENT':
      return `${slot} takes plain words only: no markup, line-break tags or {…} directives. Send the words alone and apply again.`
    case 'SLOT_LINK_UNSUPPORTED':
      return `${slot} takes https://…, mailto:…, tel:+digits, /path or #anchor: fix the link and apply again.`
    // A slot takes only a picture already in the site's media library, never a web address (an
    // imported site's derived slots too, 29/09/2026): the customer's own file goes in by media.upload.
    case 'SLOT_IMAGE_INVALID':
      return imageInvalidNext(e, slotKey, platform)
    // A derived slot whose stored value no longer holds the leaf it names (the row changed shape).
    case 'SLOT_UNWRITABLE':
      return `${slot} cannot be written where it is stored now: ${read} again and apply to the slotKey it gives those words; if none does, tell the customer that part cannot change here.`
    case 'SLOT_LOCKED_BY_USER':
      return lockedNext(e.lockedBy)
    case 'WRITER_BUSY':
    case 'CONFLICT':
      return 'The site was busy with another change: wait a few seconds and send the same apply once more; if refused again, tell the customer.'
    case 'SLOT_UNKNOWN':
      return `${slot} is not a slot of this site: use only the slotKeys content.read shows; if none holds these words, tell the customer they cannot change here.`
    case 'SLOT_EMPTY_STATE':
      return `${slot} is empty in this quickstart's design, so the content door cannot fill it. To show it, change the layout through the CMS (its CLI or template files), keeping the quickstart's style.`
    case 'SLOT_EDITION_MISSING':
      return `That language's copy of the page has no ${slotKey || 'such slot'}, so it cannot change there: tell the customer.`
    case 'CHANGES_INVALID':
      return 'The Claude Cowork plugin cannot take these changes as sent (errors[] says why): do not resend them; tell the customer what cannot change.'
    // 🔒 NOT A LOCKED SITE (ADR 0022). At the pinned Claude Cowork plugins a site that already differs from
    // its quickstart's design gets this code as a WARNING beside an apply that went through (`warnings[]`,
    // never read here). As an ERROR it means one of two things, and in neither was anything written:
    // Joomla 0.24.4 (`QuickstartContract::settleDrift`) refuses a difference the apply's OWN write made and
    // rolls the whole apply back; WordPress 0.14.9/0.15.3 (`QuickstartContract::plan`) refuses before the
    // first write when a slot no longer matches what it was bound to (a bound entity moved, the installed
    // profile changed). The old sentence said the site's layout no longer matched "its presentation lock,
    // so nothing can be written" — true of no site at these versions.
    case 'PRESENTATION_DRIFT':
      return presentationDriftNext(platform)
    case 'CONTRACT_FAILED':
      // F1: marked unrecoverable, yet the one road is an undo — see STORED_JSON_BROKEN_NEXT.
      if (/^Syntax error\b/.test(typeof e.message === 'string' ? e.message : ''))
        return STORED_JSON_BROKEN_NEXT
      return 'The contract refused this apply (errors[] says why): tell the customer what could not change.'
  }
  return e.severity === 'unrecoverable'
    ? 'The Claude Cowork plugin refused this apply (errors[] says why): tell the customer what could not change.'
    : 'errors[] names the slot and the rule: fix that value and apply again.'
}

/** The component's lock miss, word for word (`JoomlaSiteWriter.php:290`) — the one `writer_busy` that
 * proves nothing was written (D10′). */
export const WRITER_LOCK_MESSAGE = 'another writer is changing this site'

/**
 * The codes after which a call may or may not have run: the answer never came back whole
 * (`relayRaw`'s two transport codes, the door's two for the component, EmDash's `SITE_UNREACHABLE`),
 * and `OUTCOME_UNKNOWN` — what `site-call.mjs` answers when its own re-send or check could not tell
 * (E2.2, P12). Without it here the receipts would read that write as refused (D9 would mint a new id
 * where the component could replay the old one), and the preview would not reload.
 */
export const UNKNOWN_OUTCOME_CODES = Object.freeze([
  'COMPONENT_UNREACHABLE',
  'COMPONENT_BAD_RESPONSE',
  'COWORK_WEB_UNREACHABLE',
  'COWORK_WEB_BAD_RESPONSE',
  'SITE_UNREACHABLE',
  'OUTCOME_UNKNOWN'
])

/**
 * Whether a refusal leaves open whether the call ran — ONE reading for every reader that must not
 * take "no answer" for "no change": the receipts (D9 reuses an id only then), and the preview reload
 * (tracy-site-tabs `turn.mjs`), which after such a call must reload, since the site may have changed.
 *
 * 🔒 `writer_busy` IS TWO ANSWERS. Word for word {@link WRITER_LOCK_MESSAGE} it is the lock miss,
 * taken before anything is read or written; any other message is the component wrapping an error it
 * did not expect (`Engine.php:142`), after which something may have been written. A gateway status
 * (502/503/504) is the same: the request may have reached the site before the reply was lost.
 * @param {unknown} answer
 * @returns {boolean}
 */
export function outcomeUnknown(answer) {
  if (answer === null || typeof answer !== 'object' || Array.isArray(answer)) return false
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (a.ok !== false) return false
  const code = typeof a.code === 'string' && a.code !== '' ? a.code : a.error
  if (typeof code === 'string' && UNKNOWN_OUTCOME_CODES.includes(code)) return true
  if ([502, 503, 504].includes(Number(a.httpStatus))) return true
  return code === 'writer_busy' && String(a.message ?? '').trim() !== WRITER_LOCK_MESSAGE
}

/**
 * `writer_busy` (D10′). Only the lock miss proves nothing ran: the component wraps every escaped
 * error in the same code (`Engine.php:142`), and after one of those something may be written.
 * @param {Record<string, unknown>} a
 * @param {string} message
 */
function writerBusyNext(a, message) {
  if (message.trim() !== WRITER_LOCK_MESSAGE)
    return 'Something may have been written before this error: read the record (inspect or content.get) before any retry.'
  return Number(a.retried) > 0
    ? 'Another request on this site is still running: nothing from this call was written. Tell the customer and offer to try again.'
    : 'Nothing was written: the site was busy. Make the same call once more in a few seconds; if it answers the same, tell the customer.'
}

/**
 * The next for a code nobody wrote a case for, chosen by its class (D24, T10).
 * @param {string | undefined} code
 * @param {string} message
 */
function defaultNext(code, message) {
  const c = code ?? ''
  if (/^(refused|forbidden|denied|not_allowed|protected|locked)$|_(DENIED|FORBIDDEN|NOT_ALLOWED)$/i.test(c))
    return 'This site answered no, and that is an answer: tell the customer what was refused; do not reach the site another way.'
  if (/^[a-z_]+$/.test(c)) {
    if (/\b(required|must be|must start|invalid|not valid|needs?|takes|expected)\b/i.test(message))
      return 'Read the message: fix that parameter and make the call once more. Do not repeat the identical call, or reach the site another way.'
    if (c === 'too_large')
      return 'Too large for one call: send less (fewer rows, a smaller file) and make the call once more.'
    if (c.endsWith('_failed'))
      return 'The component could not finish it (the message says why): read what it names, then make the call once more; if it fails again, tell the customer.'
  }
  return 'Read the error: if it names a parameter, fix it and make the call once more; otherwise tell the customer what was refused. Do not reach the site another way.'
}

/**
 * Which page `page.text`/`page.look` reads, and where the request is issued FROM: inside the site's
 * own web container, against `http://127.0.0.1:<port>` (#154). Only a path is accepted — never a
 * host — so the browser can be pointed at this site and nothing else. Returns the loopback URL the
 * in-container probe/browser hits, and the container to `docker exec` into.
 * `origin` is the loopback origin the final rendered document MUST match: the browser refuses to
 * return the text or picture of anything whose final URL leaves it (a JS/meta or 30x navigation off
 * this site), so it is passed alongside the url rather than re-derived downstream.
 * @param {string} label - the site label.
 * @param {unknown} asked - `params.path`; absent or empty means the home page.
 * @returns {{ ok: true, path: string, url: string, origin: string, container: string } | { ok: false, error: string }}
 */
export function lookTarget(label, asked, port = 80) {
  if (typeof label !== 'string' || !LABEL.test(label)) return { ok: false, error: 'no site label to look at' }
  const pagePath = asked === undefined || asked === null || asked === '' ? '/' : asked
  if (typeof pagePath !== 'string' || !/^\/[^\s]*$/.test(pagePath) || pagePath.startsWith('//'))
    return {
      ok: false,
      error: 'path must be a path on this site, starting with a single "/" and without spaces'
    }
  const url = loopbackUrl(port, pagePath)
  return { ok: true, path: pagePath, url, origin: new URL(url).origin, container: `${label}-web-1` }
}

/**
 * Where a redirect off this site's container actually goes — and whether it is still this site.
 *
 * 🔒 A CMS SERVED UNDER A NAME IT DOES NOT KNOW REDIRECTS TO THE ONE IT DOES, AND WORDPRESS DOES IT
 * BY PORT. `lookTarget` dials the container (`<label>-web-1`, port 80) because that is the only
 * address reachable from this workspace. WordPress's `redirect_canonical` keeps the host it was asked
 * for and pastes on the port from `home_url()` — so on any deployment whose public address carries a
 * port, every page of every WordPress site answers `301 → http://<label>-web-1:<public port>/`, an
 * address nothing listens on inside the docker network.
 *
 * Measured 19/09 on `demowp` (public address `http://demowp.tracy.test:51710`): `page.text` refused
 * every path `REDIRECTED_OFF_SITE` and `page.look` refused `SITE_UNREACHABLE`, so both of the agent's
 * eyes were shut for the whole session and it went reading PHP source instead. It does not show on
 * production, where the public address is 443 and `redirect_canonical` drops the port — which is why
 * it survived: it is invisible everywhere except the machine every developer works on.
 *
 * 🔒 HOSTNAME, NOT AUTHORITY, IS WHAT MAKES IT THIS SITE. Comparing the full authority read a
 * port-only redirect as another host's page; comparing only the hostname still refuses a redirect to
 * a DIFFERENT name, which is the hole the refusal exists for — a site configured to redirect off-host
 * must not have another host's page returned as this one's text.
 *
 * 🔒 A SCHEME CHANGE IS REFUSED, NOT BRIDGED. `http` → `https` on the same host is the site asking to
 * be served over TLS; the only address reachable from here is the container's plain-`http` loopback
 * service, and following the redirect would mean either failing the TLS handshake or DISABLING
 * certificate validation to reach a loopback port — which #154 does not do for any site. So a scheme
 * change reads as "not reachable as this site here" (`same:false`) and the caller refuses cleanly
 * rather than rendering an error page or turning validation off. The one exception is decided
 * elsewhere and by the host's configuration, not by this function: a redirect to the site's own
 * public origin ({@link publicOriginOf}) is served over the same loopback with that public `Host`
 * ({@link publicTarget}).
 *
 * This is wired into the live path (#154): the in-container probe stops at the first host/port/scheme
 * change and hands `from`/`location` here; the host then knows whether to refuse or to point the
 * browser at the canonical authority ({@link canonicalTarget}).
 *
 * @param {string} from - the address that was asked.
 * @param {string} location - the `Location` header that came back.
 * @returns {{ same: boolean, authority: string|null }} `authority` is the host:port the site wants to
 *   be addressed as, when that differs from the one dialled; null when no remapping is needed.
 */
export function redirectStaysOnSite(from, location) {
  // A 3xx with no `Location` is a misconfigured site, not a same-site redirect. The old check read it
  // as one (`new URL('', base)` is the base), so the browser was sent back to the address that had
  // just redirected, got the same 3xx, and rendered its own error page — the "picture of its own
  // failure" the probe above exists to refuse.
  if (typeof location !== 'string' || location.trim() === '') return { same: false, authority: null }
  let to
  try {
    to = new URL(location, from)
  } catch {
    return { same: false, authority: null }
  }
  const asked = new URL(from)
  if (to.hostname !== asked.hostname) return { same: false, authority: null }
  // A scheme change cannot be followed to a plain-http loopback service without disabling TLS — refuse.
  if (to.protocol !== asked.protocol) return { same: false, authority: null }
  if (to.host === asked.host) return { same: true, authority: null }
  return { same: true, authority: to.host }
}

/**
 * Tell the browser to address the site by the name it wants while still dialling the container.
 *
 * 🔒 THE RULE IS NOT OPTIONAL POLISH — WITHOUT IT THE BROWSER PHOTOGRAPHS ITS OWN ERROR PAGE. Chrome
 * follows the redirect, cannot connect to the public port from inside the network, renders
 * `ERR_CONNECTION_REFUSED` and exits 0. Measured 19/09 on `demowp`: `--dump-dom` with no rule
 * returned `<title>demowp-web-1</title>` and Chrome's own stylesheet; with the rule, the site. So
 * merely accepting a port-only redirect would have handed that error page back as the page's prose,
 * which is worse than the refusal it replaced.
 *
 * `--host-resolver-rules` maps the authority in the URL to the one to connect to, so the request
 * carries the `Host` the CMS is waiting for (which `fetch` cannot set — undici drops a `host` header)
 * and every absolute subresource URL on the page, all of which carry the public authority, lands back
 * on the container too.
 *
 * @param {string} authority - host:port the page is addressed as.
 * @param {string} connect - host:port to actually connect to.
 * @returns {string} one Chrome argument.
 */
export function hostResolverRule(authority, connect) {
  return `--host-resolver-rules=MAP ${authority} ${connect}`
}

/**
 * ONE controlled virtual hostname the browser addresses this site's page by, when a canonical public
 * port is in play.
 *
 * 🔒 WHY A NAME AND NOT `127.0.0.1`. The connection must stay pinned to the container's own loopback
 * service, so a same-host/other-port redirect has to be routed back with `--host-resolver-rules`. But
 * Chromium's host-resolver rules act on host NAMES, not on literal IP addresses — a `MAP 127.0.0.1:...`
 * is not reliably honoured, so a numeric authority would let Chrome connect straight to the public
 * port (nothing listens there inside the network) and render its own error page. Addressing the page
 * by a name we own means the rule is name-based, so it is honoured, and the name resolves to nothing
 * else: it is not a real domain, so without the rule it does not connect anywhere at all.
 *
 * It carries no dot-less ambiguity and is not `localhost` (which Chrome treats specially): a plain
 * reserved-looking label the resolver rule fully controls.
 */
export const VIRTUAL_SITE_HOST = 'tracy-site.probe.invalid'

/**
 * Where the browser is pointed when the site answered its own loopback with a canonical-public-PORT
 * redirect (WordPress `redirect_canonical` on a deployment whose public address carries a port).
 *
 * 🔒 THE CONNECTION STAYS PINNED TO THIS CONTAINER. The browser is addressed as
 * `http://<virtual host>:<canonical port>/<path>` — the same hostname it is asked with, at the port
 * the site wants — so `redirect_canonical` sees the port it expects and serves the page instead of
 * redirecting again. `resolverRule` maps EXACTLY that one authority back onto `127.0.0.1:<internal>`
 * (this site's own web port), and nothing else: a redirect to any OTHER port or name has no mapping,
 * does not resolve, and cannot reach a different local service. The `origin` the final document must
 * match is that same virtual authority, so no origin check is loosened — the authority is restricted
 * to one bounded, routed value rather than widened to "same host, any port".
 *
 * `canonicalPort` is the port learned from the probe's redirect (a number, never a string spliced into
 * a flag); `internalPort` is this site's real loopback port ({@link sitePort}).
 *
 * @param {string} label - the site label.
 * @param {string} path - the already-validated page path (from {@link lookTarget}).
 * @param {number} internalPort - the port this site's web container actually listens on.
 * @param {number} canonicalPort - the public port the site redirected to.
 * @returns {{ ok: true, path: string, url: string, origin: string, container: string, authority: string, connect: string, resolverRule: string } | { ok: false, error: string }}
 */
export function canonicalTarget(label, path, internalPort, canonicalPort) {
  if (typeof label !== 'string' || !LABEL.test(label)) return { ok: false, error: 'no site label to look at' }
  if (!Number.isInteger(canonicalPort) || canonicalPort <= 0 || canonicalPort > 65535)
    return { ok: false, error: 'the site asked to be served on something that is not a port' }
  const connectPort = Number.isInteger(internalPort) && internalPort > 0 ? internalPort : 80
  const authority = `${VIRTUAL_SITE_HOST}:${canonicalPort}`
  const connect = `127.0.0.1:${connectPort}`
  const url = `http://${authority}${path}`
  return {
    ok: true,
    path,
    url,
    // 🔒 The origin is what the browser checks the final document against, so it must read as the
    // browser reads it: `URL.origin` DROPS a default port, so a canonical port 80 makes the authority
    // `<host>:80` but the origin `http://<host>` (no port). Spelling `http://${authority}` here would
    // hand back `http://<host>:80`, which never equals the browser's own `http://<host>` — a false
    // off-site on every implicit-80 redirect. Deriving it from the URL keeps the two in step.
    origin: new URL(url).origin,
    container: `${label}-web-1`,
    authority,
    connect,
    resolverRule: hostResolverRule(authority, connect)
  }
}

/**
 * The public origin this host serves a site at, or null when the host was not told its domain.
 *
 * 🔒 THE AUTHORITY IS THE HOST'S OWN CONFIGURATION, NEVER THE REDIRECT AND NEVER THE SITE FOLDER. A
 * fleet site is served publicly as `https://<label>.<SITE_DOMAIN>` (Cloudflare → cloudflared → the
 * container over plain http with `X-Forwarded-Proto: https`; `provision.sh` installs WordPress with
 * that same `SITE_URL`), so from its own loopback it answers every page with
 * `301 → https://<its public host>/…` — measured 24/09/2026 on `qc-hano-wp-0923-01`, where
 * `page.text {"path":"/"}` came back REDIRECTED_OFF_SITE for its own home page.
 *
 * Whether that target is THIS site is decided here from two things the site cannot change: its label
 * (the container and folder name dsh already resolved) and the domain the deployment gives dsh
 * (`TRACY_SITE_DOMAIN`, from `SITE_DOMAIN` in `deploy/compose.yml`). Not from the `Location` header,
 * which the site (or anything it proxies) controls, and not from `.tracy/site.json`: that folder is
 * owned by www-data, so the site and the agent can both rewrite it.
 *
 * A site served elsewhere (an imported site kept at the customer's own domain) is not derivable from
 * the label, so its redirect stays off-site — refused, never guessed.
 *
 * What the origin buys is bounded on purpose: it only lets the page be asked for with that public
 * `Host` on a connection still pinned to this container's loopback service ({@link publicTarget}).
 *
 * @param {string} label - the site label.
 * @param {unknown} siteDomain - the deployment's site domain, e.g. `tracy.site`.
 * @returns {string | null} `https://<label>.<siteDomain>`, or null.
 */
export function publicOriginOf(label, siteDomain) {
  if (typeof label !== 'string' || !LABEL.test(label)) return null
  const domain = typeof siteDomain === 'string' ? siteDomain.trim() : ''
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(domain)) return null
  return `https://${label}.${domain}`
}

/**
 * Where the probe and the browser are pointed when the site redirected its loopback to its OWN
 * own public origin ({@link publicOriginOf}).
 *
 * 🔒 THE CONNECTION NEVER LEAVES THE CONTAINER, AND NO TLS IS SPOKEN. The page is asked for as
 * `<public origin><path>` — so the site sees the `Host` it serves and `X-Forwarded-Proto` for the
 * scheme it expects, the two headers cloudflared adds, and answers the page instead of redirecting
 * again — but every byte is carried over plain http to `127.0.0.1:<internal port>` (`via`). The probe
 * does it with node's `http` (undici's `fetch` drops a `Host` header); the browser does it by serving
 * each request to that origin from `via` through CDP, so it never opens a connection to the public
 * name at all. `resolverRule` makes the public name resolve to NOTHING in the browser, so anything the
 * interception did not catch fails instead of reaching the real site.
 *
 * Only a redirect whose target origin is EXACTLY that one qualifies: another host, the same host on
 * another port, or the other scheme is not where this host serves the site, and stays off-site.
 *
 * @param {string} label - the site label.
 * @param {string} path - the already-validated page path (from {@link lookTarget}).
 * @param {number} internalPort - the port this site's web container actually listens on.
 * @param {string | null} publicOrigin - from {@link publicOriginOf}.
 * @param {string} from - the address that redirected.
 * @param {string} location - the `Location` it answered with.
 * @returns {{ ok: true, path: string, url: string, origin: string, container: string, via: string, resolverRule: string } | { ok: false }}
 */
export function publicTarget(label, path, internalPort, publicOrigin, from, location) {
  if (typeof label !== 'string' || !LABEL.test(label)) return { ok: false }
  if (typeof publicOrigin !== 'string' || publicOrigin === '') return { ok: false }
  if (typeof location !== 'string' || location.trim() === '') return { ok: false }
  let to
  let origin
  try {
    to = new URL(location, from)
    origin = new URL(publicOrigin)
  } catch {
    return { ok: false }
  }
  if (to.origin !== origin.origin) return { ok: false }
  const connectPort = Number.isInteger(internalPort) && internalPort > 0 ? internalPort : 80
  return {
    ok: true,
    path,
    url: `${origin.origin}${path}`,
    origin: origin.origin,
    container: `${label}-web-1`,
    via: `127.0.0.1:${connectPort}`,
    resolverRule: `--host-resolver-rules=MAP ${origin.hostname} ~NOTFOUND`
  }
}

/**
 * The port this site's own web container listens on.
 *
 * 🔒 NOT EVERY SITE IS PORT 80. Joomla and WordPress run php-apache and answer there; EmDash is an
 * Astro server on **4321** (`provision/emdash/deploy-quickstart.sh`: `PORT: "4321"`, and the compose
 * file publishes `127.0.0.1:<host>:4321`). Everything that offered an EmDash agent a way to see its
 * own site — `page.look`, the `curl` line, and an address given for a `browser_read` that turned out
 * not to be registered anywhere at all — pointed at 80, so none of them worked, and an agent with no
 * working way to look is an agent that goes reading files instead. `page.text` is the door now.
 * Reported 16/09, on a request to add a language.
 * @param {string} platform
 * @returns {number}
 */
export function sitePort(platform) {
  return platform === 'emdash' ? 4321 : 80
}

/**
 * Elements whose contents are never words a visitor reads.
 *
 * `head` is here for a reason the first version of this missed: `<title>` lives in it, so without
 * this the document title appeared BOTH as `title` and again as the first line of `text`, and an
 * agent counting occurrences of a word on a page would have counted it twice.
 */
const NOT_PROSE = /<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi
/** Where a line break is part of the meaning rather than part of the markup. */
const BLOCK =
  /<\/?(p|div|section|article|header|footer|nav|main|aside|h[1-6]|li|tr|br|hr|blockquote|figcaption|option|label|legend|td|th|dt|dd)\b[^>]*>/gi

// ONE entity table for every reader: html-units.mjs (27/09/2026 — the copy that lived here matched
// `[a-z]+`, so `&sup2;` and `&frac12;` stayed as written in page.text while the replace job decoded
// them, and `&#12ab;` read as decimal 12). Re-exported under the names this module's callers use.
export { NAMED }
export const decodeEntity = entityText

/**
 * One page of HTML as the three things an agent keeps reconstructing from it by hand.
 *
 * 🔒 THE SHAPE IS TAKEN FROM WHAT THE SESSIONS ACTUALLY RAN, not from what a reader might want.
 * Measured 17/09 across four sessions: `grep -o -E '<html[^>]*>'` for the language the page declares
 * (asked four times in one session), the document title, and the visible prose — the last through a
 * PHP `strip_tags` pipeline the agent wrote from scratch twice in one turn. Answering all three at
 * once is what makes this ONE call rather than three.
 *
 * Deliberately not a parser. It removes what is never prose, keeps the line breaks that carry
 * meaning, decodes the entities a CMS page actually emits, and collapses the rest. A page whose
 * markup defeats it is a page the agent can still photograph with `page.look`.
 *
 * @param {string} html - one page as the server sent it.
 * @returns {{ lang: string | null, title: string | null, text: string }}
 */
export function readablePage(html) {
  // Tamed first (html-units): linear on unclosed or hostile markup, whoever calls this — only
  // page.mjs's parsePage tamed before (2.9 s at 120 KB of unclosed tags, measured there).
  const source = tameMarkup(typeof html === 'string' ? html : '')
  const langMatch = /<html\b[^>]*\blang\s*=\s*["']?([^"'\s>]+)/i.exec(source)
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(source)
  const text = decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(NOT_PROSE, ' ')
      .replace(BLOCK, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
  return {
    lang: langMatch === null ? null : langMatch[1],
    title: titleMatch === null ? null : decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() || null,
    text
  }
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|avif)$/i
/** Thumbnails and derivatives a CMS makes — never the picture the customer means. */
const DERIVATIVE = /(-\d{2,4}x\d{2,4}|_thumb|-thumb|\/thumbs?\/|\/cache\/|\/resized\/)/i

/** @param {string} name */
export function isCandidateImage(name) {
  return IMAGE_EXT.test(name) && !DERIVATIVE.test(name)
}

/**
 * Where a platform keeps the images an editor uploaded.
 *
 * 🔒 EMDASH HAS NO WEBROOT, AND THAT IS THE POINT OF ITS ENTRY HERE. Its provision script sets
 * `PLATFORM_NEEDS_WEBROOT=0` and creates `$SITE_DIR/{data,uploads}` beside the container: the
 * Astro app lives INSIDE the image, and the only site state on the host is a SQLite file and an
 * upload directory. So the media root is `uploads`, not a path under a document root — and a
 * scan that assumed one would walk an empty tree and answer "no images" for a site full of them.
 *
 * ⚠ AND IT IS STILL RESOLVED UNDER `.webroot/`, because that is where the container mounts it
 * (`walk(path.join(root, r))`, with `root` the webroot). "No document root" never meant "no
 * `.webroot/`" — that reading escaped into the agent's own context and had it looking for `data/`
 * beside AGENTS.md until 20/09. This code was right the whole time; only the sentences were not.
 *
 * @param {string} platform - `joomla` · `wordpress` · `emdash` · anything else.
 * @returns {string[]}
 */
export function mediaRoots(platform) {
  if (platform === 'wordpress') return ['wp-content/uploads']
  if (platform === 'joomla') return ['images']
  if (platform === 'emdash') return ['uploads']
  return ['images', 'wp-content/uploads', 'uploads']
}

/**
 * Width and height from the first bytes of a PNG, JPEG or WebP; null for anything else.
 * @param {Uint8Array} b - at least the first 64 KB of the file.
 * @returns {{ width: number, height: number } | null}
 */
export function imageSize(b) {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: readU32BE(b, 16), height: readU32BE(b, 20) }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1
        continue
      }
      const marker = b[i + 1]
      // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
      }
      const len = (b[i + 2] << 8) | b[i + 3]
      if (len < 2) return null
      i += 2 + len
    }
    return null
  }
  if (
    b.length >= 30 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45
  ) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (chunk === 'VP8 ')
      return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff }
    if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
      return {
        width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16))
      }
    }
  }
  return null
}

/**
 * @param {Uint8Array} b
 * @param {number} o
 */
function readU32BE(b, o) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
}

/**
 * The largest images first, capped. Pure: the caller walked the tree and read the headers.
 * @param {{ path: string, bytes: number, width?: number|null, height?: number|null }[]} entries
 * @param {number} limit
 */
export function rankMedia(entries, limit = 20) {
  return [...entries].sort((x, y) => y.bytes - x.bytes).slice(0, Math.max(1, Math.min(limit, 100)))
}

/**
 * WHERE A FILE-BACKED STRING LIVES, as the five-layer model names it.
 *
 * 🔒 THE LAYER IS THE ANSWER, NOT THE PATH. Measured 17/09 across four sessions, about twenty bash
 * calls went on one question — "which record and field holds this word I can see?" — and the shape
 * was always the same: `grep -rn "You are here" language/en-GB/*.ini`, then `grep -n "Text::_("
 * modules/mod_login/tmpl/default.php`, then the module's source, then Joomla's own `Language.php`.
 * The greps found the string; what they could not find was WHICH DOOR CHANGES IT, and that is the
 * step the agent kept re-deriving. So a hit says its layer and its door, and the path is evidence
 * rather than the answer.
 *
 * @param {string} platform
 * @param {string} relative - path under the webroot, with `/` separators.
 * @returns {{ layer: string, door: string } | null} null when the file is not one of the layers.
 */
export function layerOfFile(platform, relative) {
  const p = relative.replace(/\\/g, '/')
  if (platform === 'joomla') {
    if (/^(administrator\/)?language\/overrides\/[^/]+\.ini$/.test(p))
      return { layer: 'PHRASES', door: 'this site already overrides this key here — edit the same line' }
    if (/^(administrator\/)?language\/[^/]+\/[^/]+\.ini$/.test(p))
      return {
        layer: 'PHRASES',
        door: `a language override: add one KEY="value" line to ${p.startsWith('administrator/') ? 'administrator/' : ''}language/overrides/<tag>.override.ini — never edit this shipped file`
      }
    if (/^templates\/[^/]+\/html\//.test(p))
      return { layer: 'PRESENTATION', door: 'this template override is already yours to edit' }
    if (/^(modules|components|plugins)\//.test(p))
      return {
        layer: 'PHRASES',
        door: 'this is the extension that RENDERS the string; the wording itself is the language key it passes to Text::_() — override that key, do not edit this file'
      }
    return null
  }
  if (platform === 'wordpress') {
    if (/\.(po|pot)$/.test(p))
      return {
        layer: 'PHRASES',
        door: 'a translation entry — change it in the language files or with a gettext filter, never in a shipped .po'
      }
    if (p.startsWith('wp-content/themes/'))
      return {
        layer: 'PRESENTATION',
        door: "a theme template; change it in the theme this site runs (its child theme's first, when one runs), never in a plugin or core"
      }
    if (p.startsWith('wp-content/plugins/'))
      return {
        layer: 'PHRASES',
        door: 'a plugin renders this; override its text with a gettext filter rather than editing the plugin'
      }
    return null
  }
  return null
}

/**
 * One `KEY="value"` line of a language file, or null when the line is not one.
 * @param {string} line
 * @returns {{ key: string, value: string } | null}
 */
export function iniEntry(line) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"([\s\S]*)"\s*$/.exec(line)
  return m === null ? null : { key: m[1], value: m[2] }
}

/**
 * Which directories a `content.find` walk may open, per platform.
 *
 * Deliberately NOT the whole webroot. A recursive walk of a Joomla tree is tens of thousands of
 * files and the answer would arrive after the agent had given up; these are the places the measured
 * sessions actually grepped, and nothing else earned a place by being plausible.
 *
 * @param {string} platform
 * @returns {string[]}
 */
export function findRoots(platform) {
  if (platform === 'joomla')
    return [
      'language',
      'administrator/language',
      'templates',
      'modules',
      'administrator/modules',
      'components',
      'administrator/components'
    ]
  if (platform === 'wordpress') return ['wp-content/languages', 'wp-content/themes', 'wp-content/plugins']
  return []
}

/**
 * Whether one line of a file is a hit for a phrase, and what to report about it.
 *
 * 🔒 IN A LANGUAGE FILE ONLY THE VALUE IS WHAT A VISITOR READS. `COM_USERS_LOGIN_HOME="Trang chủ"`
 * matches "home" in its KEY and not in its words, and a grep cannot tell those apart — which is most
 * of why the measured greps were long: `grep -rn "Home" language/en-GB/*.ini` returns a page of key
 * names, and the agent reads all of them. Filtering on the value is the whole difference between
 * this and the shell command it replaces.
 *
 * The phrase is lowercased HERE rather than trusted to arrive that way. A caller that forgets does
 * not get an error, it gets a search that quietly stops being case-insensitive — and the customer
 * quotes what they saw on the page, capitals and all.
 *
 * @param {string} line - one line, as read.
 * @param {string} needle - the phrase to look for, in any case.
 * @returns {{ key: string, value: string } | { text: string } | null}
 */
export function findMatch(line, needle) {
  const lower = String(needle).toLowerCase()
  if (lower === '' || !line.toLowerCase().includes(lower)) return null
  const entry = iniEntry(line)
  if (entry === null) return { text: line.trim().slice(0, 200) }
  return entry.value.toLowerCase().includes(lower) ? entry : null
}

/**
 * How much of a page's text one answer carries by default.
 *
 * 🔒 THIS NUMBER IS MEASURED, NOT CHOSEN. The 31 bash calls this door replaces returned a MEDIAN OF
 * 303 CHARACTERS and 17,004 in total, because the agent always narrowed at the shell — `| head -20`,
 * `| sed -n '2,12p'`, `grep -o -E '.{0,80}Home.{0,80}'`. A door that answers with a whole page
 * instead would be read back on every later step of the turn and would cost MORE than the pipeline
 * it replaced. Replacing a narrow answer with a wide one is not an improvement.
 */
export const PAGE_TEXT_DEFAULT_CHARS = 2000

/** Lines of context kept either side of a match, as `grep -C 2` gives. */
const CONTEXT_LINES = 2

/**
 * The part of a page's text worth sending back.
 *
 * With `match`, the lines carrying it and their neighbours — the answer to "where on this page do
 * these words appear", which is what the measured `grep -o -E '.{0,80}X.{0,80}'` calls were asking.
 * Without it, the top of the page up to `maxChars`.
 *
 * @param {string} text - the whole page's visible text.
 * @param {string | null} match - words to narrow to, or null for the top of the page.
 * @param {number} [maxChars] - the cap; the measured default when absent or not a positive integer.
 * @returns {{ text: string, truncated: boolean, chars: number, matched: number | null }}
 */
export function excerpt(text, match, maxChars) {
  const whole = typeof text === 'string' ? text : ''
  const cap =
    typeof maxChars === 'number' && Number.isInteger(maxChars) && maxChars > 0
      ? maxChars
      : PAGE_TEXT_DEFAULT_CHARS
  const needle = typeof match === 'string' && match.trim() !== '' ? match.trim().toLowerCase() : null
  if (needle === null)
    return { text: whole.slice(0, cap), truncated: whole.length > cap, chars: whole.length, matched: null }

  const lines = whole.split('\n')
  /** @type {Set<number>} */
  const keep = new Set()
  let matched = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].toLowerCase().includes(needle)) continue
    matched += 1
    for (let j = Math.max(0, i - CONTEXT_LINES); j <= Math.min(lines.length - 1, i + CONTEXT_LINES); j += 1)
      keep.add(j)
  }
  // A gap between kept runs is SHOWN, so the agent never reads two distant parts of a page as
  // adjacent — a mistake a `grep -C` pipeline cannot make and a naive join can.
  const out = []
  let previous = -2
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (previous >= 0 && i > previous + 1) out.push('…')
    out.push(lines[i])
    previous = i
  }
  const joined = out.join('\n')
  return { text: joined.slice(0, cap), truncated: joined.length > cap, chars: joined.length, matched }
}

/**
 * A bound WordPress site's inspect (#337, Claude Cowork plugin 0.12+) in the shape {@link narrowInspect} narrows.
 *
 * The WordPress Claude Cowork plugin answers `slots` as a MAP of key → current words (claude-cowork
 * `wordpress/cowork/lib/QuickstartContract.php` `inspect()`, `$slotValues`) where Joomla's is a list
 * of slot records, and it names its pages as entities (`page-<route>`, kind `page`) where Joomla's
 * carries `pages` with routes and modules. Each slot becomes `{key, entity, current}`: its page when
 * the key's first part names one (`home.hero.heading` → `page-home`), else the pseudo-entity `site`,
 * marked `siteIdentity` — the options the contract maps (`site.*`; `identity.*` from wp7 1.2.0) are
 * printed on every page and ride with every narrowed words inspect, as Joomla's Site identity block
 * does. No `type`, `label` or `max`: the answer carries none, and none is made up.
 * @param {Record<string, any>} a - an `ok` inspect whose `slots` is an object.
 * @returns {Record<string, any>}
 */
function wordpressInspectShape(a) {
  const entities = Array.isArray(a.entities) ? a.entities : []
  const pages = new Set(
    entities
      .filter((e) => e && typeof e.key === 'string' && e.key.startsWith('page-') && e.kind !== 'option')
      .map((e) => String(e.key))
  )
  // Picture slots (Claude Cowork plugin 0.14.0-rc.4+) are named with the demo each replaces; every other slot
  // carries no type — words or a link. An older Claude Cowork plugin sends no `imageSlots`, so it has none.
  const { imageSlots, ...rest } = a
  const pictures = imageSlots && typeof imageSlots === 'object' ? imageSlots : {}
  const slots = Object.entries(a.slots).map(([key, current]) => {
    const page = `page-${key.split('.')[0]}`
    const words = typeof current === 'string' ? current : String(current ?? '')
    if (pages.has(page) && typeof pictures[key] === 'string')
      return { key, entity: page, type: 'image', current: words, sample: pictures[key] }
    return pages.has(page)
      ? { key, entity: page, current: words }
      : { key, entity: 'site', siteIdentity: true, current: words }
  })
  return {
    ...rest,
    slots,
    pages: [...pages].map((entity) => ({ route: entity.slice('page-'.length), entity }))
  }
}

/**
 * A derived contract's slot key (claude-cowork `DerivedMap::slot`): `<kind>-<id>.<column>.<10 hex of the
 * leaf path's sha1>` — the same shape `apps/tracy-web/src/sites/content-locate.js` reads.
 */
const DERIVED_SLOT_KEY = /^[A-Za-z]+-[^.\s]+\.[^\s]+\.[0-9a-f]{10}$/

/**
 * Whether an inspect answer is an IMPORTED copy's derived contract (01/10/2026): the WordPress plugin says
 * `mode: "derived"` and names `derived/<label>`; the Joomla one names `derived/<label>` too (measured on a
 * real copy, 02/10/2026) but says no `mode`, and its keys are the derived shape, which is read as a fallback.
 * Read so a derived answer is never taken for a quickstart's — on WordPress that read every
 * slot as Site identity (`wordpressInspectShape`: no `page-<route>` entity), so every narrowed words
 * inspect answered the whole map.
 * @param {Record<string, any>} a
 */
function derivedInspect(a) {
  if (a.mode === 'derived' || (typeof a.contract === 'string' && a.contract.startsWith('derived/')))
    return true
  const first = Array.isArray(a.slots)
    ? a.slots.find((s) => s && typeof s.key === 'string')?.key
    : a.slots && typeof a.slots === 'object'
      ? Object.keys(a.slots)[0]
      : undefined
  return typeof first === 'string' && DERIVED_SLOT_KEY.test(first)
}

/**
 * A derived inspect read into slot records, on both platforms: the WordPress plugin's `slotDetails`
 * (or the Joomla one's `slots` list) give each slot its entity (`post-42`, `module-17`), type and limit.
 * A derived map has no page routes and no Site identity, so it answers none rather than inventing them;
 * `match` and `entity` narrow it.
 * @param {Record<string, any>} a - an `ok` derived inspect.
 * @returns {Record<string, any>}
 */
function derivedInspectShape(a) {
  // 🔒 NOT THE ENTITY LIST NOR THE ID MAP. The WordPress plugin sends both beside the slots: 539,000 and
  // 129,000 chars on a real imported copy (6,726 entities), against a cap of INSPECT_BUDGET_CHARS for the whole
  // answer. Kept, they left no room for a single slot: every `match` or `entity` call answered `slots: []`
  // and the unfiltered index was bigger than dsh's spill. Each slot already names its entity.
  const {
    slotDetails,
    imageSlots: _imageSlots,
    slots: listed,
    pages: _pages,
    entities: _entities,
    ids: _ids,
    ...rest
  } = a
  const source = Array.isArray(slotDetails) ? slotDetails : Array.isArray(listed) ? listed : []
  const slots = source
    .filter((s) => s && typeof s.key === 'string')
    .map((s) => ({
      key: s.key,
      entity: String(s.entity ?? ''),
      ...(typeof s.type === 'string' ? { type: s.type } : {}),
      current: typeof s.current === 'string' ? s.current : String(s.current ?? ''),
      // A picture slot's yardstick for `media.draw {slot}` is its sample. A derived map has no demo: the
      // plugin's own sample is the leaf's current words, so the picture the slot holds is the shape to draw to
      // (WordPress's `slotDetails` carries none, which left the slot unresolvable).
      ...(s.type === 'image'
        ? { sample: typeof s.sample === 'string' && s.sample !== '' ? s.sample : String(s.current ?? '') }
        : {}),
      ...(Number.isInteger(s.maxCharacters) ? { maxCharacters: s.maxCharacters } : {})
    }))
  return { ...rest, slots, pages: [] }
}

/** The position Joomla gives the 404 page's blocks, on every page (tracy-business `error-page`). */
const ERROR_PAGE_POSITION = 'error-page'

/**
 * A lean inspect's label (J2): the block's name once, then only each slot's own tail. A slot whose
 * label has the same block part as the slot listed just above it reads `…/ <tail>` (`…` when the
 * label has no tail); the first slot of every block — and the first of every answer or page of one —
 * keeps its whole label, so no line depends on a slot the answer did not carry.
 * @param {Record<string, any>} slot
 * @param {Record<string, any> | null} above - the slot listed just before it, or null.
 * @returns {string | undefined}
 */
function groupedLabel(slot, above) {
  if (typeof slot.label !== 'string') return slot.label
  /** @param {string} label */
  const split = (label) => {
    const at = label.lastIndexOf(' / ')
    return at < 0 ? { block: label, tail: '' } : { block: label.slice(0, at), tail: label.slice(at + 3) }
  }
  const own = split(slot.label)
  if (above === null || typeof above.label !== 'string' || String(above.entity) !== String(slot.entity))
    return slot.label
  if (split(above.label).block !== own.block) return slot.label
  return own.tail === '' ? '…' : `…/ ${own.tail}`
}

/**
 * A `content.contract` inspect answer cut to what the agent asked for.
 *
 * 🔒 THE WHOLE ANSWER DOES NOT FIT A CONTEXT. Tracy Business answers 2.1 MB — 3622 slots, the
 * languages' own included — and dsh spilled it to a file; the agent could not open it on a sealed
 * site, tried Grep, then Bash, then guessed module ids for five minutes (j-ee6vsk, 23/09/2026). So:
 * - `slots` ("image", "text", "url", or a list), `entity` ("module-444", or a list) and `page` (a
 *   route such as "home", or its menu item) answer only the matching slots, and only the SOURCE's —
 *   a picture reaches every language on its own (Claude Cowork plugin 0.16.16), words go through the language
 *   job, so a language's own slot is never the one to write;
 * - `match` (Tracy's own: the component has no search) keeps the slots whose current words carry it,
 *   and `offset` starts after that many picked slots — both answered from this turn's snapshot;
 * - a picked text or url slot says its `max` characters and, when its demo value is empty, `empty`;
 * - a filtered answer is capped at {@link INSPECT_BUDGET_CHARS}, cut at a slot, with the next page named;
 * - with no filter, an answer larger than `limit` becomes an index (counts, blocks, pages) and the
 *   sentence that says how to narrow it. A small contract is answered whole, as it always was. The
 *   index is not capped: its `pages` map is what the model narrows with.
 *
 * 🔒 `limit` DEFAULTS TO THE SAME BUDGET AS A FILTERED ANSWER. It was 60,000, so an unfiltered answer
 * under that came back whole and uncapped: the stand's home fixture (`test/fixtures/contract/home.json`,
 * 226 slots) answered all 56,377 chars (60,380 bytes) — past dsh's 50,000-byte spill, whose file the
 * model could not use (grep 0 of 34 on r2). A bare inspect is now the index once it is over
 * {@link INSPECT_BUDGET_CHARS}, as the site context assumes (16,489 chars on r2's home site, whole).
 *
 * 🔒 A BOUND WORDPRESS SITE (#337) ANSWERS ANOTHER SHAPE, AND IS NARROWED THE SAME WAY. Its `slots` is
 * a map of key → current words ({@link wordpressInspectShape} reads it into slot records), its pages
 * are its `page-<route>` entities, and its site-wide slots ride like Joomla's Site identity block.
 * `page` and `match` narrow it as they narrow Joomla's; it has no picture slot, so `slots:"image"`
 * answers none; an unfiltered answer within `limit` comes back as the Claude Cowork plugin sent it.
 * @param {unknown} answer - what the Claude Cowork plugin answered.
 * @param {Record<string, unknown>} params - the call's params.
 * @param {number} [limit] - the size above which an unfiltered answer is indexed instead.
 */
export function narrowInspect(answer, params, limit = INSPECT_BUDGET_CHARS) {
  const raw = /** @type {any} */ (answer)
  if (!raw || raw.ok !== true || (params?.operation ?? 'inspect') !== 'inspect') return answer
  const derived = raw.slots !== null && typeof raw.slots === 'object' && derivedInspect(raw)
  const wordpress =
    !derived && raw.slots !== null && typeof raw.slots === 'object' && !Array.isArray(raw.slots)
  if (!derived && !wordpress && !Array.isArray(raw.slots)) return answer
  const a = derived ? derivedInspectShape(raw) : wordpress ? wordpressInspectShape(raw) : raw
  /** @param {unknown} v @returns {string[] | null} */
  const list = (v) =>
    v === undefined || v === null || v === '' ? null : (Array.isArray(v) ? v : [v]).map(String)
  const types = list(params.slots)
  const entities = list(params.entity)
  const pages = list(params.page)
  // `match` is Tracy's own filter (the component has no search): a case-folded substring of the
  // slot's current words — "where does this text live" in one call, on its own or with the others.
  const match =
    typeof params.match === 'string' && params.match.trim() !== '' ? params.match.trim().toLowerCase() : null
  const offset = Number.isInteger(params.offset) && Number(params.offset) > 0 ? Number(params.offset) : 0
  const { slots: rawSlots, pages: rawPages, ...rest } = a
  /** @type {Record<string, any>[]} */
  const slots = rawSlots
  /** @type {Record<string, any>[]} */
  const pageList = rawPages ?? []
  if (!types && !entities && !pages && match === null) {
    if (JSON.stringify(raw).length <= limit) return answer
    if (wordpress)
      return {
        ...rest,
        slotCount: slots.length,
        pages: pageList.map((p) => `${p.route} (${p.entity})`),
        next:
          'The full slot list is too large to answer at once. Ask for what you need: content.contract {operation:"inspect", page:"home"} for one page, ' +
          'or {operation:"inspect", match:"<words>"} wherever they are. The site-wide slots (site.*, identity.*) come with either.'
      }
    /** @type {Record<string, number>} */
    const byType = {}
    const blocks = new Map()
    for (const s of slots) {
      if (String(s.key).includes('::')) continue
      byType[s.type] = (byType[s.type] ?? 0) + 1
      if (!blocks.has(s.entity)) blocks.set(s.entity, String(s.label ?? '').split(' / ')[0])
    }
    // The block list is the one part that grows with the contract; it stops at half the budget
    // and says how many it left out, rather than becoming the thing it replaced.
    const shown = []
    let size = 0
    for (const [entity, label] of blocks) {
      const line = `${entity} ${label}`
      if (size + line.length > limit / 2) break
      shown.push(line)
      size += line.length + 3
    }
    return {
      ...rest,
      slotCount: Object.values(byType).reduce((n, v) => n + v, 0),
      byType,
      blocks: shown,
      ...(shown.length < blocks.size ? { blocksNotListed: blocks.size - shown.length } : {}),
      pages: pageList.map((p) => `${p.route} (${p.entity})`),
      // A derived map has no pages to name: its slots are found by their words or their record, and
      // content.read gives a page's own fields with their slotKeys and no inspect at all.
      next: derived
        ? 'The full slot list is too large to answer at once. Read the page with content.read: its fields carry each slotKey. Or ask content.contract {operation:"inspect", match:"<words>"} wherever they are, or {operation:"inspect", entity:"<kind>-<id>"} for one record.'
        : 'The full slot list is too large to answer at once. Ask for what you need: content.contract {operation:"inspect", slots:"image"} for every picture, ' +
          '{operation:"inspect", page:"home"} for one page, or {operation:"inspect", entity:"module-444"} for one block. Write to the source slots it returns — a picture reaches every language on its own.'
    }
  }
  // 🔒 SITE IDENTITY IS ON EVERY PAGE AND ASSIGNED TO NONE. 1.2.0's `[Tracy] Site identity` block
  // prints nothing itself: its values reach every page as `{site.*}`/`{contact.*}` tokens, so no
  // page's `assignedModules` names it (stand 25/09: page:"home" 220 slots, page:"contact" 210, the
  // block in neither). The contract marks it `siteIdentity: true` (content-map.json); the stand's
  // inspect answer showed the label, so either one names it.
  const identity = new Set(
    slots
      .filter((s) => s.siteIdentity === true || String(s.label ?? '').startsWith('[Tracy] Site identity'))
      .map((s) => String(s.entity))
  )
  /**
   * 🔒 AND IT RIDES WITH EVERY NARROWED TEXT INSPECT, WHATEVER `page` OR `match` SAY. A filter on
   * the page or on the words cannot find it: the page shows "Hotline: 8 800 550-67-90" from a module
   * whose text is "Hotline: {contact.phone}", so `match:"Hotline"` hits that module, the slot that
   * holds the number reads "8 800 550-67-90" under the label "…/ phone", and a request named by its
   * printed label ("Hotline", "Email") or by the token saw no slot it could write (PR1 bench C20:
   * 42 inspects, 30 steps, 260 s, "has no door"). The block is small and the same on every page —
   * 13 slots in tracy-business/j6 1.2.0 (8 text, 5 social-link url) — so it is listed whole, at the
   * head, where a budget cut cannot drop it. Its 1,590 chars are what moved INSPECT_BUDGET_CHARS from
   * 28,000 to 30,000: the call the site context prescribes still fits whole with headroom on 1.2.0.
   * The url slots come with a `slots:"text"` call: that is
   * the call the site context prescribes, and it names the social links as identity slots.
   * Not with `entity` (the blocks were named — `entity:"module-4369"` still reaches it) nor with a
   * type filter that asks for neither text nor url (a picture call).
   */
  const withIdentity =
    identity.size > 0 && !entities && (!types || types.includes('text') || types.includes('url'))
  /** @type {string[]} */
  const notes = []
  /** @type {string[]} */
  const unknownPages = []
  /**
   * 🔒 J2 — A WORDS INSPECT WITHOUT `match` IS THE PAGE LISTED WHOLE, SO IT IS LISTED LEAN. The
   * prescribed `{page:"home", slots:"text"}` answered 24,714 chars on the after-final Joomla bench,
   * and every later step of the turn reads it again. Without `match` or `entity` (either answers a
   * few slots, as it did): no `type` on a slot of the one type asked for; `max` only on a slot
   * whose words are at least half of it; a block's name said once, each later slot of it keeping its
   * label's tail (`…/ phone`); and the 404 page's blocks, which Joomla assigns to every page at
   * position `error-page`, left out of a `page` call and named in `normalized`. NOT cut: any label,
   * any language (CONTRACT_LANGUAGE_RULE writes a fact in every language the inspect lists), the Site
   * identity block (listed whole, as below), or the budget (D26).
   */
  const lean = match === null && !entities
  /** @type {Set<string>} */
  const errorPage = new Set()
  let onPages = null
  if (pages) {
    onPages = new Set()
    const routes = [...new Set(pageList.map((p) => String(p.route)))]
    // 🔒 A PAGE IS A ROUTE, AND THE PATH page.text TAKES NAMES ONE. "/", "/en/", "/en/contact" and
    // "Home" were 150 empty answers in 31 of 32 cases (PR1 bench, 25/09): read them as the route,
    // and name the routes when nothing matches instead of answering an empty list.
    /** @param {string} v */
    const resolve = (v) => {
      if (pageList.some((p) => String(p.route) === v || String(p.entity) === v)) return v
      const segs = v.trim().toLowerCase().split('/').filter(Boolean)
      if (segs.length > 0 && /^[a-z]{2}(-[a-z]{2})?$/.test(segs[0]) && !routes.includes(segs.join('/')))
        segs.shift()
      const r = segs.length === 0 ? 'home' : segs.join('/')
      return routes.includes(r) ? r : null
    }
    for (const v of pages) {
      const r = resolve(v)
      if (r === null) {
        unknownPages.push(v)
        continue
      }
      if (r !== v) notes.push(`page "${v}" read as "${r}"`)
      for (const p of pageList)
        if (String(p.route) === r || String(p.entity) === r) {
          onPages.add(String(p.entity))
          for (const m of p.assignedModules ?? [])
            if (lean && m?.position === ERROR_PAGE_POSITION) errorPage.add(String(m.entity))
            else onPages.add(String(m.entity))
        }
    }
    if (unknownPages.length > 0 && unknownPages.length === pages.length)
      return {
        ...rest,
        slots: [],
        // A derived map has no page routes to name; its slots are found by their words or their record.
        next:
          routes.length === 0
            ? `No page ${unknownPages.map((v) => JSON.stringify(v)).join(', ')}: this contract has no page routes. Find a slot by its words with match:"<words>", or one record with entity:"<kind>-<id>"; content.read gives a page's own fields with each slotKey.`
            : `No page ${unknownPages.map((v) => JSON.stringify(v)).join(', ')} in this contract. page is a route: ${routes.join(', ')} (or its ${wordpress ? 'entity' : 'menu item'}, e.g. ${String(pageList[0]?.entity ?? 'menuItem-599')}). To look on every page, leave page out and pass match.`
      }
    for (const e of identity) onPages.add(e)
    // A block the page also shows somewhere else than its 404 page stays.
    for (const e of onPages) errorPage.delete(e)
    const left = [...errorPage].filter((e) => slots.some((s) => String(s.entity) === e))
    if (left.length > 0)
      notes.push(`404-page blocks left out: ${left.slice(0, 3).join(', ')}; entity:"<block>" reads one`)
  }
  const source = slots.filter((s) => !String(s.key).includes('::'))
  /** @param {Record<string, any>} s */
  const isIdentity = (s) => identity.has(String(s.entity))
  const chosen = [
    ...(withIdentity ? source.filter(isIdentity) : []),
    ...source
      .filter((s) => !(withIdentity && isIdentity(s)))
      // A WordPress slot carries no type unless it is a picture: words or a link otherwise.
      .filter(
        (s) =>
          !types ||
          (s.type === undefined
            ? types.includes('text') || types.includes('url')
            : types.includes(String(s.type)))
      )
      .filter((s) => !entities || entities.some((e) => s.entity === e || String(s.key).startsWith(`${e}.`)))
      .filter((s) => !onPages || onPages.has(String(s.entity)))
      .filter(
        (s) =>
          match === null ||
          String(s.current ?? '')
            .toLowerCase()
            .includes(match) ||
          (isIdentity(s) &&
            String(s.label ?? s.key ?? '')
              .toLowerCase()
              .includes(match))
      )
  ]
  const onlyText = lean && types !== null && types.length === 1 && types[0] === 'text'
  /** @type {Record<string, any> | null} */
  let above = null
  const window = (offset > 0 ? chosen.slice(offset) : chosen).map((s) => {
    // J2: the Site identity block is listed whole; every other slot lean without `match` or `entity`.
    const full = !lean || isIdentity(s)
    const label = full ? s.label : groupedLabel(s, above)
    above = s
    return {
      key: s.key,
      // 🔒 NO `undefined` IN A TOOL ANSWER. A WordPress slot has no type and no label; `type:
      // s.type` wrote both as undefined, and dsh refuses a tool result that changes under a JSON
      // round-trip ("value is not lossless JSON", the media.scan failure of 05/09 again). Measured
      // 25/09/2026 on capiwp1333 (666baf095): every `{page:"home"}` and `{match}` inspect refused, three
      // calls, and the eyebrow change could not be made at all. Omit the keys instead.
      ...(s.type === undefined || (!full && onlyText && s.type === 'text') ? {} : { type: s.type }),
      ...(label === undefined ? {} : { label }),
      current: s.current,
      ...(s.type === 'image' && s.sample !== undefined ? { sample: s.sample } : {}),
      // 🔒 THE TWO RULES AN APPLY IS REFUSED BY MOST, SHOWN WHERE THE SLOT IS READ. The component
      // checks the length in code points against `maxCharacters` and refuses to fill a slot whose
      // demo value is empty (`QuickstartContract.php:538-562`); the narrowed answer used to drop both,
      // so the model learned each limit from a refused apply, 12–20 s later (r1: 13, r2: 3).
      // J2 keeps it in a lean answer too: the "Content too long" refusal sends the model to this
      // field, and a lean answer without it re-opened that loop (review of #harness-flows, 26/09).
      ...(s.type !== 'image' && Number.isInteger(s.maxCharacters) ? { max: s.maxCharacters } : {}),
      ...(s.type !== 'image' && s.sample === '' ? { empty: true } : {}),
      ...(s.requiresEvidence ? { requiresEvidence: true } : {})
    }
  })
  const narrowed = {
    ...rest,
    slots: window,
    ...(offset > 0 ? { offset } : {}),
    ...(notes.length > 0 ? { normalized: notes } : {}),
    ...(unknownPages.length > 0
      ? {
          next: `No page ${unknownPages.map((v) => JSON.stringify(v)).join(', ')} in this contract; the others are answered.`
        }
      : {})
  }
  /**
   * 🔒 CAPPED AT {@link INSPECT_BUDGET_CHARS}, ABOVE THE CALL THE SITE CONTEXT PRESCRIBES (D26 as
   * corrected). The prescribed `{page:"home", slots:"text"}` answers 23,712 chars on the stand's
   * Business site once each slot says its `max` (22,151 before; 14 r2 calls; 42 of 123 inspects were
   * over 16,000) and 25,301 on a 1.2.0 site with the Site identity block at its head, so a 16,000 cap
   * would have cut the very call the rules ask for. Past the cap, whole
   * slots from the head and a `next` naming `match` (the component has no search; this is Tracy's
   * filter) and `offset` — both served from this turn's snapshot, no relay.
   */
  /** @param {number} from @param {number} to @param {number} total */
  const pageOn = (from, to, total) =>
    `Slots ${from}–${to} of ${total}: add match:"<words you look for>", or the same call with offset:${to} for the next ones (no wait).`
  // Measured with the longest numbers the sentence can carry, so the real one never pushes past the cap.
  const cut = /** @type {Record<string, any>} */ (
    budgetAnswer(narrowed, {
      maxChars: INSPECT_BUDGET_CHARS,
      listKey: 'slots',
      next: pageOn(99999, 99999, 99999)
    })
  )
  if (cut !== narrowed && cut.truncated)
    cut.next = pageOn(offset + 1, offset + Number(cut.truncated.shown), offset + Number(cut.truncated.total))
  return cut
}

/**
 * The largest inspect answered whole, narrowed or not (D26, corrected 25/09).
 *
 * 🔒 30,000, NOT THE PLAN'S 24,000: MEASURED HEADROOM. With `max` and `empty` on each picked slot the
 * prescribed `{page:"home", slots:"text"}` answers 23,712 chars on `test/fixtures/contract/home.json`
 * — 288 chars (1.2 %) under 24,000, so a real site whose customer text is a little longer than the
 * demo samples would get a cut answer and one more step for the call the rules prescribe. 28,000 gave
 * that call 15 % headroom until the Site identity block began riding every narrowed words inspect
 * (25/09): on a 1.2.0 site the same call also carries the block's 13 slots — 25,301 chars (home.json
 * plus the block as 1.2.0's `content-map.json` declares it, 1,590 chars), 90.4 % of 28,000, under the
 * 10 % headroom the tests keep. At 30,000 it is 84.3 %, and the index of r2's home site (16,489
 * chars, blocks listed up to half the budget) stays whole, where 24,000 dropped 48 of its 294 blocks.
 * Both stay far under dsh's 50,000-byte spill: the 1.2.0 call is 27,322 bytes with half its slots in
 * Cyrillic.
 */
export const INSPECT_BUDGET_CHARS = 30_000

/**
 * The contract's language rule, as the one sentence every text that needs it quotes: the sealed
 * site's context (what this site holds) and the `content.contract` description (how the door
 * writes).
 *
 * 🔒 ONE SENTENCE, BECAUSE TWO DISAGREED. The door's description said "write to source slots only
 * … words reach them through the language job"; the site context said a fact changes "in every
 * language listed". Checked 25/09/2026 against the component (claude-cowork `origin/main` 2aa7840:
 * `joomla/cowork/lib/QuickstartContract.php` `plan()`, which `Engine.php`'s contract apply calls):
 * every slot the inspect lists is a key of its own, a language's own copies included, and
 * `changeRow` writes each key into its own row only. Nothing carries a changed text into another
 * language — only an image slot is copied to every language, in the same function. Tracy Business
 * ships its languages as separate modules: of the 1,800 slots on the stand's Joomla site (24/09),
 * 752 are labelled "(en)", 752 "(ru)" and 296 name no language. So a phone changed in one
 * language's slot stays old in the other, and this sentence is the one the component bears out.
 *
 * ⚠ `narrowInspect` leaves out the `::` slots — the copies a language job adds. On a site that
 * gained a language that way, "every language the inspect lists" is only the languages it shipped
 * with, and the added one keeps the old fact. Raised with this change; not decided here.
 */
export const CONTRACT_LANGUAGE_RULE =
  'Each slot is one language — its label or text says which: words change in the language of the page meant, a fact (phone, e-mail, address, hours) in every language the inspect lists.'

/**
 * The same rule on a BOUND WordPress site (#337), where the inspect lists one language only: the
 * source edition's slots, keyed `<page>.<block>`. Every other language is a Polylang copy of the page
 * that the archive ships, written by prefixing the key with its edition (`vi::home.hero.heading`,
 * claude-cowork `wordpress/cowork/lib/QuickstartContract.php` `plan()`), and never listed — its words
 * are read off the page itself. Options (`site.*`, and `identity.*` from `tracy-business/wp7` 1.2.0)
 * have no edition: the Claude Cowork plugin refuses `vi::site.name` ("An option has no edition") and writes the
 * site name into Polylang's string translation of every language itself (Claude Cowork plugin 0.13.2). Which
 * editions are live is the inspect's `multilingual.live` once the build retired the others.
 *
 * 🔒 ONE SENTENCE FOR THE TWO TEXTS THAT NEED IT, as `CONTRACT_LANGUAGE_RULE` is for Joomla: the
 * sealed WordPress context's row and the WordPress `content.contract` block both quote it.
 */
export const WORDPRESS_CONTRACT_LANGUAGE_RULE =
  'A slot key is the source language\'s; the same page in another language is "<edition>::<key>" (e.g. "vi::home.hero.heading"), never listed — page.text of that page reads it: words change in the language of the page meant, a fact (phone, e-mail, address, hours) in every live edition (the inspect\'s multilingual.live); site.* and identity.* are one for every language.'

/**
 * An answer cut, on arrival, to a size the model can use — with the door's own narrowing call as
 * the way to the rest.
 *
 * 🔒 THE CAP BELONGS IN TRACY, NOT IN dsh's SPILL. On r2 (25/09/2026) 101 Tracy answers went over
 * dsh's 50,000-byte spill: the model got a head and a tail cut mid-string, plus a file it could not
 * use — the answers are one-line JSON, `read` cuts a line at 2,000 chars, and grep on a sealed site
 * worked 0 times in 34. Here the cut lands on a record boundary, the JSON stays valid, and `next`
 * names the call that narrows the door itself. Simulated on the same r2 steps with the per-action
 * table: −28.4 % cacheRead, −21.1 % of the bill.
 *
 * - At or under `maxChars` (as `JSON.stringify` counts): the SAME answer back, byte for byte.
 * - `answer[listKey]` an array: whole records from its head while the JSON stays within
 *   `maxChars`; every other key stays whole — an inspect index's `pages` is the map the model
 *   narrows with, so it is never the part that goes. When the other keys alone are over, no record
 *   is shown.
 * - Any other object: keys kept whole, smallest first, while they fit; a key left out keeps its
 *   place as one line saying what it holds (`(not shown: 26847 chars; keys post_title, …)`), and
 *   keys past even that are dropped.
 * - An array answer is itself the list, and comes back as `{items, …}`; any other value as
 *   `{answer: "(not shown: N chars)", …}`.
 *
 * A cut answer carries `truncated: {shown, total, chars}` — records (or keys) shown whole, how many
 * there were, and the size of the whole answer — then `next`: the caller's, or the answer's own
 * when the caller gives none.
 *
 * Never throws and never mutates. An answer that cannot be measured (not JSON), or a budget that is
 * not a positive number, comes back as it came. An answer this function already cut is not cut
 * again: its `total` and `chars` describe the original, and a second cut would overwrite them with
 * the numbers of the cut.
 *
 * @param {unknown} answer
 * @param {{ maxChars: number, listKey?: string, next?: string }} opts
 * @returns {unknown}
 */
export function budgetAnswer(answer, opts) {
  const o = /** @type {Record<string, unknown>} */ (opts && typeof opts === 'object' ? opts : {})
  const max = o.maxChars
  if (typeof max !== 'number' || !(max > 0)) return answer
  const whole = jsonOf(answer)
  if (whole === null || whole.length <= max || alreadyCut(answer)) return answer
  const chars = whole.length
  const next = typeof o.next === 'string' && o.next !== '' ? o.next : undefined
  if (Array.isArray(answer)) return cutList({ items: answer }, 'items', answer, max, chars, next)
  if (!isPlainRecord(answer))
    return Object.fromEntries([['answer', `(not shown: ${chars} chars)`], ...tailOf(0, 1, chars, next)])
  const a = /** @type {Record<string, unknown>} */ (answer)
  const key = typeof o.listKey === 'string' && !CUT_KEYS.has(o.listKey) ? o.listKey : null
  const list = key !== null && Object.hasOwn(a, key) && Array.isArray(a[key]) ? a[key] : null
  const ownNext = next ?? a.next
  return key !== null && list !== null
    ? cutList(a, key, list, max, chars, ownNext)
    : cutKeys(a, max, chars, ownNext)
}

/** The two keys `budgetAnswer` writes; an answer's own are replaced, never kept beside them. */
const CUT_KEYS = new Set(['truncated', 'next'])

/**
 * `JSON.stringify(v)`, or null when `v` has no JSON text (undefined, a function) or cannot be
 * serialised (a cycle, a BigInt).
 * @param {unknown} v
 * @returns {string | null}
 */
function jsonOf(v) {
  try {
    const s = JSON.stringify(v)
    return typeof s === 'string' ? s : null
  } catch {
    return null
  }
}

/** @param {unknown} v @returns {boolean} */
function isPlainRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Whether an answer already carries the `truncated` record this function writes.
 * @param {unknown} answer
 */
function alreadyCut(answer) {
  if (!isPlainRecord(answer)) return false
  const t = /** @type {Record<string, unknown>} */ (answer).truncated
  if (!isPlainRecord(t)) return false
  const r = /** @type {Record<string, unknown>} */ (t)
  return Number.isInteger(r.shown) && Number.isInteger(r.total) && Number.isInteger(r.chars)
}

/**
 * The entries every cut answer ends with.
 * @param {number} shown @param {number} total @param {number} chars @param {unknown} next
 * @returns {Array<[string, unknown]>}
 */
function tailOf(shown, total, chars, next) {
  /** @type {Array<[string, unknown]>} */
  const tail = [['truncated', { shown, total, chars }]]
  if (next !== undefined) tail.push(['next', next])
  return tail
}

/**
 * The answer's own keys in their own order, with some values replaced or left out, then the tail.
 * Built through entries so a key such as `__proto__` stays an ordinary key, as `JSON.parse` made it.
 * @param {Record<string, unknown>} a
 * @param {Map<string, unknown>} replace - key → new value; `DROP` leaves the key out.
 * @param {Array<[string, unknown]>} tail
 */
function rebuild(a, replace, tail) {
  /** @type {Array<[string, unknown]>} */
  const entries = []
  for (const k of Object.keys(a)) {
    if (CUT_KEYS.has(k)) continue
    if (!replace.has(k)) entries.push([k, a[k]])
    else if (replace.get(k) !== DROP) entries.push([k, replace.get(k)])
  }
  return Object.fromEntries([...entries, ...tail])
}

const DROP = Symbol('drop')

/**
 * Whole records from the head of `list` while the answer stays within `max`.
 *
 * The size is counted, not re-serialised per record: the answer with an empty list, plus the digits
 * `shown` can grow to, is an upper bound, and each record adds its own JSON plus one comma. That
 * bound can be a digit or two high, so the records it turned away are then tried against the exact
 * size — the cut keeps every record that fits, not every record the estimate allowed.
 * @param {Record<string, unknown>} a
 * @param {string} key
 * @param {unknown[]} list
 * @param {number} max
 * @param {number} chars
 * @param {unknown} next
 */
function cutList(a, key, list, max, chars, next) {
  const total = list.length
  /** @param {number} n */
  const withFirst = (n) => rebuild(a, new Map([[key, list.slice(0, n)]]), tailOf(n, total, chars, next))
  let size = (jsonOf(withFirst(0)) ?? '').length + String(total).length - 1
  let shown = 0
  for (const record of list) {
    const add = (jsonOf(record) ?? 'null').length + (shown === 0 ? 0 : 1)
    if (size + add > max) break
    size += add
    shown += 1
  }
  let out = withFirst(shown)
  while (shown < total) {
    const more = withFirst(shown + 1)
    if ((jsonOf(more) ?? '').length > max) break
    out = more
    shown += 1
  }
  return out
}

/**
 * What a value holds, in one line, for a key `cutKeys` could not show whole.
 * @param {unknown} v
 * @param {number} size - the value's JSON length.
 */
function summaryOf(v, size) {
  if (Array.isArray(v)) return `(not shown: ${size} chars; ${v.length} items)`
  if (isPlainRecord(v)) {
    const names = Object.keys(/** @type {object} */ (v))
    const shown = names.slice(0, 5).map((n) => n.slice(0, 40))
    return `(not shown: ${size} chars; keys ${shown.join(', ')}${names.length > 5 ? ', …' : ''})`
  }
  return `(not shown: ${size} chars)`
}

/**
 * An object with no list to cut: its keys kept whole, smallest first, while they fit; the rest
 * summarised in place, and dropped from the end when even the summaries do not fit.
 *
 * Sizes are counted as `JSON.stringify` writes an object — `{`, each `"key":value`, a comma
 * between, `}` — with the tail's `shown` written as `total`, so the result is within `max` whenever
 * it can be.
 * @param {Record<string, unknown>} a
 * @param {number} max
 * @param {number} chars
 * @param {unknown} next
 */
function cutKeys(a, max, chars, next) {
  /** @type {Array<{ k: string, json: string, summary: string, whole: number, brief: number, mode: 'whole' | 'summary' | 'drop' }>} */
  const items = []
  for (const k of Object.keys(a)) {
    if (CUT_KEYS.has(k)) continue
    const json = jsonOf(a[k])
    if (json === null) continue // JSON drops it too.
    const name = (jsonOf(k) ?? '').length + 1
    const summary = summaryOf(a[k], json.length)
    const whole = name + json.length
    const brief = name + (jsonOf(summary) ?? '').length
    items.push({ k, json, summary, whole, brief, mode: whole <= brief ? 'whole' : 'summary' })
  }
  const total = items.length
  const tail = tailOf(total, total, chars, next).map(
    ([k, v]) => (jsonOf(k) ?? '').length + 1 + (jsonOf(v) ?? '').length
  )
  /** @param {(typeof items)[number]} it */
  const cost = (it) => (it.mode === 'whole' ? it.whole : it.brief)
  const commas = items.length + tail.length - 1
  let size = 2 + tail.reduce((n, c) => n + c, 0) + items.reduce((n, it) => n + cost(it), 0) + commas
  // Each entry dropped takes its comma with it; the tail always stays, so there is one to take.
  for (let i = items.length - 1; i >= 0 && size > max; i--) {
    size -= cost(items[i]) + 1
    items[i].mode = 'drop'
  }
  const waiting = items.filter((it) => it.mode === 'summary').sort((x, y) => x.json.length - y.json.length)
  for (const it of waiting) {
    const delta = it.whole - it.brief
    if (size + delta > max) continue
    size += delta
    it.mode = 'whole'
  }
  const replace = new Map()
  for (const it of items)
    if (it.mode === 'summary') replace.set(it.k, it.summary)
    else if (it.mode === 'drop') replace.set(it.k, DROP)
  const shown = items.filter((it) => it.mode === 'whole').length
  return rebuild(a, replace, tailOf(shown, total, chars, next))
}
