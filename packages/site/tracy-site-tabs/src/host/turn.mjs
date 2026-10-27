/**
 * What the turn that just ended did to the site — the one question the side card asks this plugin
 * when a conversation goes idle.
 *
 * WHY IT EXISTS. The agent changes a site and the change is live at once, but the Browser tab in the
 * side card keeps showing the page it fetched before: an iframe re-fetches nothing on its own, and
 * until now only the person's own refresh button (or the model calling `browser_reload`) moved it.
 * Measured 16/09 on a Joomla header the agent had just rewritten.
 *
 * THE DECISION LIVES HERE, NOT IN THE BROWSER, because only the session log can answer it. The page
 * knows which tabs are open; the log knows which tools ran. Reading the log is also what keeps the
 * promise "nothing reloads when the turn changed nothing" honest — a turn that only looked leaves no
 * writing call behind, and a reload would then be a flicker with no cause.
 *
 * The reading mirrors `stepBudget` in `tracy-site-tools`' `site-context.mjs`: walk the events
 * backwards to this turn's `turn/start` and judge the `tool/call`s in between, skipping the door
 * calls whose result refused them. It reads the door's OWN tables and readers — `ACTION_CLASSES`,
 * `resultWentThrough`, `canonicalCall`, `EMDASH_READ_TOOLS` — through relative imports that esbuild
 * inlines into this plugin's host bundle (`scripts/build-host.mjs`), so nothing is resolved from
 * `tracy-site-tools` at run time and a rebuild is what carries a change of theirs here.
 */
import path from 'node:path'

// The path fence's own reading of "which site does this session stand in" — reused, not restated.
import { resolveSitesRoot, siteOf } from '../../../../tools/tracy-subprocess-docker/src/route.mjs'
import { recordedSiteKey } from './moment.mjs'
// The door's OWN classification of its actions — one table, read in both packages (see below) —
// and its OWN reading of "did this call go through" (see `refusedCalls`).
import {
  ACTION_CLASSES,
  SET_ONLY_WRITE_ACTIONS,
  contractOperationWrites,
  resultOutcomeUnknown,
  resultWentThrough,
  setOnlyDoorWrites
} from '../../../../tools/tracy-site-tools/src/host/site-context.mjs'
// One reading of a `tracy_site` call (aliases, hoisted `operation`/`dryRun`) and of a `tracy_emdash`
// call (EmDash's own read list, the shape repairs the door applies) — the door's, not a copy.
import { canonicalCall } from '../../../../tools/tracy-site-tools/src/host/site.mjs'
import {
  EMDASH_READ_TOOLS,
  normalizeEmdashShape
} from '../../../../tools/tracy-site-tools/src/host/emdash.mjs'

/**
 * `tracy_site` actions that change nothing: calling them is still looking.
 *
 * 🔒 DERIVED, NOT COPIED. This was a hand-kept list whose comment claimed to be "kept in step with
 * `LOOKING_ACTIONS` in tracy-site-tools" — a name that does not exist there; the real table is
 * `ACTION_CLASS`. Nothing gated the two, and an action added to the door and missed here is read by
 * `callChangedSite` below as a WRITE: the customer's site preview reloads because the agent looked
 * at a page. Reading one table in both places is the only version of this that cannot drift.
 */
const LOOKING_ACTIONS = new Set(
  Object.entries(ACTION_CLASSES)
    .filter(([, kind]) => kind === 'read')
    .map(([action]) => action)
)

/**
 * The file tools that WRITE, and the argument each names its file in — the write half of
 * `FS_TOOL_ARGS` in `tracy-subprocess-docker/src/route.mjs`. `read`, `glob` and `grep` are absent
 * because reading a file changes no page.
 * @type {Record<string, string>}
 */
const WRITING_FILE_TOOLS = { write: 'file_path', edit: 'file_path', str_replace_editor: 'path' }

/** The shells a turn runs its commands through; both reach the site's own container. */
const SHELLS = new Set(['bash', 'pwsh'])

/**
 * The doors that answer with a JSON `ok` — Tracy's own tools. Only their refusals are read as "changed
 * nothing": a door says `{"ok":false,…}` BEFORE it writes. A shell or a file tool has no such answer;
 * one that exits non-zero or errors may already have written, so it counts whatever its result.
 */
const DOOR_TOOLS = new Set(['tracy_site', 'tracy_emdash'])

/**
 * A tool call's arguments as an object, whether the log stored them parsed or as JSON text.
 * @param {{ arguments?: unknown } | undefined} call - a `tool/call` event's data.
 * @returns {Record<string, unknown> | null}
 */
function argsOf(call) {
  let args = call?.arguments
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return null
    }
  }
  return args !== null && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : null
}

/**
 * Whether a path names something inside a site's webroot — the folder whose files a visitor gets.
 * Everything else in a site folder (AgentSetting, SiteContent, TracyWork, docs) is the team's notes:
 * writing there changes no page, so it must not reload one.
 * @param {unknown} value - a tool call's path argument.
 * @returns {boolean}
 */
function insideWebroot(value) {
  if (typeof value !== 'string' || value.trim() === '') return false
  const normalized = value.replace(/\\/g, '/')
  return normalized.includes('/.webroot/') || normalized.startsWith('.webroot/')
}

/**
 * Whether a `tracy_emdash` call wrote. 🔒 ONE READ LIST, NOT TWO: this used to be a verb heuristic of
 * its own (`get`/`list`/`compare`/`translations`), "because there is no table to read". There is one
 * now — `EMDASH_READ_TOOLS`, EmDash 0.38's own `readOnlyHint` set, pinned by a fixture test — and the
 * two readings agreed on all 59 tools, so this removes a second definition, not a behaviour. The call
 * is read through the door's own shape repair (`content.update` IS content_update), and what the
 * door refuses or answers elsewhere — a bad name, `{list: true}`, a `page.text` asked of it — reached
 * no EmDash tool.
 * @param {unknown} args
 */
function emdashWrote(args) {
  const shape = normalizeEmdashShape(args)
  if (!shape.ok || shape.list === true || shape.route !== undefined) return false
  return !EMDASH_READ_TOOLS.has(shape.tool)
}

/**
 * Whether a `tracy_site` call asked to change the site, read the way the relay sends it
 * (`canonicalCall`: an alias such as `contract.apply` is the contract; a top-level `operation` or
 * `dryRun` is the call's own).
 * - A `dryRun` of `content.replace` writes nothing — the replace job's locate answer (IX2) is a look.
 *   🔒 ONLY THERE: it is the one action that reads `dryRun`. An action with no `ALLOWED_PARAMS` row is
 *   relayed with every key (`normalize.mjs`), so `theme.activate` or `extension.enable` carrying
 *   `dryRun: true` still writes — read as a look, it ran beside the seal (review of #1026). The step
 *   counter reads it the same way (`site-context.mjs`).
 * - `content.contract` reads unless its operation writes — the step counter's own reading,
 *   `contractOperationWrites` (`site-context.mjs`): absent is an inspect, as the component reads it,
 *   and a `*.plan` or `*.verify` pass only reads too (claude-cowork `Engine.php:1186-1214`), so a
 *   language plan does not reload the customer's preview.
 * - Any other action: not a looking one.
 * @param {unknown} args
 */
function siteCallWrote(args) {
  const { action, params } = canonicalCall(args)
  if (action === '') return false
  if (action === 'content.replace' && params.dryRun === true) return false
  if (action === 'content.contract') return contractOperationWrites(params.operation)
  if (SET_ONLY_WRITE_ACTIONS.has(action)) return setOnlyDoorWrites(params)
  return !LOOKING_ACTIONS.has(action)
}

/**
 * Whether one logged tool call changed the site.
 *
 * Four shapes, and each is the narrowest reading that stays true:
 * - a shell command (`bash`, `pwsh`): it lands inside the site's own container, where wp-cli and the
 *   Joomla CLI do most real work. What it did is not readable from the log, so it counts.
 * - a writing file tool whose path is inside `.webroot/`: that is the live site (ADR 0014 mounts it
 *   read-write). The same tool aimed at a notes folder is not.
 * - `tracy_site` with an action that is not a looking one (`siteCallWrote`: a `dryRun` and a contract
 *   inspect look). A call with no readable action was refused before it reached the CMS.
 * - `tracy_emdash` naming an EmDash tool that is not a read. It is the one door an EmDash site is
 *   written through — measured 23/09: a turn that added a service to the home page wrote with
 *   `content_update` + `content_publish` and nothing else, so reading only the three shapes above
 *   answered "changed nothing" and the preview never reloaded. `{list: true}` lists tools.
 * Whether a door call then went through is its RESULT's to say: `turnRefreshMode` skips a
 * `tracy_site`/`tracy_emdash` call whose result refused it.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call - a `tool/call` event's data.
 * @returns {boolean}
 */
export function callChangedSite(call) {
  const name = typeof call?.name === 'string' ? call.name : ''
  if (SHELLS.has(name)) return true
  const pathArg = WRITING_FILE_TOOLS[name]
  if (pathArg !== undefined) return insideWebroot(argsOf(call)?.[pathArg])
  if (name === 'tracy_emdash') return emdashWrote(call?.arguments)
  if (name !== 'tracy_site') return false
  return siteCallWrote(call?.arguments)
}

/**
 * The tools that only READ — they change no file of the site and no CMS content, whatever their
 * arguments: dsh's file readers and searches, its planning and question tools, the web, the job
 * readers, and Tracy's two read-only inspectors (`@tracy/dsh-webroot-read`). A name not here is
 * treated as a possible write.
 */
const READ_ONLY_TOOLS = new Set([
  'read',
  'read_image',
  'glob',
  'grep',
  'skill',
  'todo_write',
  'ask_user_question',
  'exit_plan_mode',
  'web_search',
  'web_fetch',
  'job_list',
  'job_output',
  'tracy_site_profile',
  'tracy_find_definition'
])

/**
 * Whether a tool call, about to run, MAY change the site — the calls that wait for the turn's open
 * (`writeReady`, `turn-record.mjs`) so the seal of what was dirty before the turn lands first.
 *
 * 🔒 WRONG ONLY IN THE SAFE DIRECTION. A call answered "no" runs beside the seal, so "no" is given only
 * to what cannot write: a {@link READ_ONLY_TOOLS} tool, a `tracy_site` action of the door's own read
 * class (`siteCallWrote`: a `dryRun`, a contract inspect or plan, an action with no name the door
 * refuses), a `tracy_emdash` call naming one of EmDash's own read tools (`emdashWrote`). Everything
 * else waits — a shell (what it does is unreadable), every file write wherever its path points (unlike
 * {@link callChangedSite}, no path is trusted to be outside the webroot), a `prepare` action such as
 * `db.snapshot`, a build or design tool, a subagent, a tool nobody listed. Waiting costs a write at
 * most the rest of the open's budget, once per turn; a write let through early could land before the
 * seal and be sealed as "outside Tracy".
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call - the call's name and parsed arguments.
 * @returns {boolean}
 */
export function callMayWriteSite(call) {
  const name = typeof call?.name === 'string' ? call.name : ''
  if (name === 'tracy_site') return siteCallWrote(call?.arguments)
  if (name === 'tracy_emdash') return emdashWrote(call?.arguments)
  return !READ_ONLY_TOOLS.has(name)
}

/**
 * The calls of this log whose own result said no. 🔒 A REFUSED DOOR CALL CHANGED NOTHING, SO IT
 * RELOADS NOTHING. Asking is not doing: r2's EmDash turns alone carried 32 refused calls
 * (`CONFIRM_FIRST`, `PENDING_DRAFT`, …), and a WordPress turn could hold a streak of 19.
 *
 * 🔒 READ BY THE STEP COUNTER'S OWN FUNCTION, NOT A SECOND COPY. dsh 0.1.7 logs every result in
 * session format V4 — a tool-role message, `{role:'tool', toolCallId, content:[{type:'text', text}],
 * isError?}`, the flag on the message (until 0.1.6 the blocks sat one level down, inside a
 * `tool-result` part: all 1,381 results of r2's 99 sessions) — and a Tracy refusal carries
 * `isError:false`. The first version of this read only a top-level `part.text` of the old shape,
 * found none, and so reloaded after every refused call (review of P4, 25/09: a nested
 * `CONFIRM_FIRST` answered 'full'); it also matched `"ok":false` anywhere in the text, so an
 * `"ok":false` inside a site's own content would have read as a refusal.
 * `resultWentThrough` (`site-context.mjs`) reads the text wherever dsh nested it and lets the
 * answer's own top-level `ok` decide — the one reading of "did it go through" for both.
 * A result that cannot be read counts as went-through, the direction that reloads.
 *
 * 🔒 AND A REFUSAL THAT DOES NOT KNOW WHETHER THE CALL RAN COUNTS AS WENT-THROUGH. The relay's 180 s
 * timeout, the component unreachable, a `writer_busy` that is not the lock miss (the component
 * wrapping an escaped error), EmDash's `SITE_UNREACHABLE` on a write, a 502/503/504: each answers
 * `ok:false` after a write that may have landed, and reading them as "wrote nothing" left the
 * customer's preview on the old page (P4, review 25/09). `resultOutcomeUnknown` is the door's own
 * reading of that set (`outcomeUnknown`, `site.mjs`).
 * @param {readonly { type?: string, data?: unknown }[]} events
 * @returns {Set<string>} callIds
 */
function refusedCalls(events) {
  const refused = new Set()
  for (const event of events) {
    if (event?.type !== 'tool/result') continue
    const data = /** @type {any} */ (event.data)
    const id = data?.message?.source?.callId ?? data?.callId
    if (typeof id !== 'string') continue
    if (!resultWentThrough(data) && !resultOutcomeUnknown(data)) refused.add(id)
  }
  return refused
}

/**
 * The path a writing file tool aimed at, or null when the call is not one.
 * @param {{ name?: unknown, arguments?: unknown } | undefined} call - a `tool/call` event's data.
 * @returns {string | null}
 */
function writtenPath(call) {
  const name = typeof call?.name === 'string' ? call.name : ''
  const pathArg = WRITING_FILE_TOOLS[name]
  if (pathArg === undefined) return null
  const value = argsOf(call)?.[pathArg]
  return typeof value === 'string' ? value : null
}

/**
 * How the page showing this site should be refreshed after the turn that just ended, or null when
 * the turn changed nothing.
 *
 * 🔒 WHY A MODE AND NOT JUST "YES". A reload throws away the page the person is reading — their
 * scroll position, the menu they had open. A stylesheet change does not need one: the side card can
 * ask Tracy's preview agent to swap the sheets in place, and the page repaints without moving. That
 * is most of what an agent does to a site, so getting this answer right is the difference between a
 * preview that feels live and one that jumps.
 *
 * 🔒 AND WHY IT ERRS TOWARDS `full`. Only one shape is safe to call cheap: a turn whose every
 * changing call was a file write, every one of them to a `.css` file. A shell command or a
 * `tracy_site` action is OPAQUE — the log says it ran, never what it touched — so it is a full
 * refresh, always. Guessing `style` on a turn that rewrote a template would leave the customer
 * looking at the old page believing it was the new one, which is worse than any flicker.
 *
 * Read newest first and stop at `turn/start`, for the reason {@link siteChangedInTurn} gives.
 * @param {readonly { type?: string, data?: unknown }[] | undefined} events - the session's events, oldest first.
 * @returns {'style' | 'full' | null}
 */
export function turnRefreshMode(events) {
  if (!Array.isArray(events)) return null
  const refused = refusedCalls(events)
  let sawChange = false
  let styleOnly = true
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]
    if (event?.type === 'turn/start') break
    if (event?.type !== 'tool/call') continue
    const call = /** @type {any} */ (event.data)
    if (!callChangedSite(call)) continue
    // Only a door's refusal is known to have written nothing (`DOOR_TOOLS`).
    if (DOOR_TOOLS.has(call?.name) && typeof call?.callId === 'string' && refused.has(call.callId)) continue
    sawChange = true
    const path = writtenPath(call)
    if (path === null || !/\.css$/i.test(path.trim())) styleOnly = false
  }
  if (!sawChange) return null
  return styleOnly ? 'style' : 'full'
}

/**
 * Whether the LAST turn in this log changed the site.
 *
 * Read newest first and stop at `turn/start`: everything after it belongs to the turn that just
 * ended, and a change made three turns ago has already been shown. A log with no `turn/start` at all
 * (a session that has never run) simply finds no changing call.
 *
 * Derived from {@link turnRefreshMode} rather than walking the events a second time: two walks over
 * one list, with two copies of "where does this turn begin", is the shape that drifts.
 * @param {readonly { type?: string, data?: unknown }[] | undefined} events - the session's events, oldest first.
 * @returns {boolean}
 */
export function siteChangedInTurn(events) {
  return turnRefreshMode(events) !== null
}

/**
 * The site a session stands in, named the way `/api/sites` names it, or null when it stands in none.
 *
 * A lane dsh serves one site and carries its key in the gateway settings. The host's one dsh (ADR
 * 0014) serves every site, so the answer is the folder the session's cwd is in — the same reading
 * the moment takes, and the same one `tracy_site` acts on. A folder with no readable `site.json`
 * answers with its label, which is what the address of a fleet-born site is built from.
 * @param {object} input
 * @param {unknown} input.cwd - the session's `header.cwd`, written by dsh, never by the model.
 * @param {string | null} input.laneSiteKey - `MCP_TRACY_SITE_KEY`, or null on the host's one dsh.
 * @param {Record<string, string | undefined>} [input.env] - where `TRACY_SITES_ROOT` is read.
 * @returns {Promise<string | null>}
 */
export async function sessionSiteKey({ cwd, laneSiteKey, env = process.env }) {
  if (laneSiteKey !== null) return laneSiteKey
  let sitesRoot
  let label
  try {
    sitesRoot = resolveSitesRoot(undefined, env)
    label = siteOf(String(cwd ?? ''), sitesRoot).label
  } catch {
    return null
  }
  return (await recordedSiteKey(path.join(sitesRoot, label))) ?? label
}
