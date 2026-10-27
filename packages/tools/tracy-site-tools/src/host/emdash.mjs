/**
 * EmDash speaks for itself.
 *
 * WordPress and Joomla need a Tracy component installed on the customer's site, and every write
 * goes through the Apply door as `{ action, params }` — a vocabulary Tracy invented because those
 * two CMSs had no agent surface of their own. EmDash has one: a Model Context Protocol server at
 * `/_emdash/api/mcp`, 59 typed tools on 0.37, its own scopes, its own optimistic locking (`_rev`).
 *
 * So the tool names and argument shapes are EmDash's. The model names an EmDash tool
 * (`content_create`, `menu_set_items`, `schema_update_field`) and passes EmDash's own arguments;
 * Tracy decides WHICH site the call reaches and attaches the token that authorises it. Borrowing the
 * component's verbs would mean maintaining a mapping that can only ever be a subset of what EmDash
 * already documents — and every tool added upstream would be one this door cannot reach until
 * someone updates a table.
 *
 * Nothing is translated, with stated exceptions, each measured on r2 (25/09/2026, 33 EmDash cases):
 * a missing locale is filled with the one this site serves, and a slug is refused where EmDash
 * cannot scope it (a slug with no locale names the alphabetically first language's row: 8 refused
 * `content_publish {id:"home"}`); the answers are parsed and shaped (EmDash's pretty JSON re-escaped
 * inside Tracy's JSON was 33–44 % of every answer, and a 40-locale `content_list` 362,302 chars); a
 * few shapes the model gets wrong are repaired and said so in `normalized` (arguments nested twice,
 * a dotted tool name, a snake-case `orderBy`, a `_rev` with a stray `=`); and a delete asks the
 * customer first (D34).
 *
 * This module is pure: no fetch, no fs. The host wires it up; `emdash-call.mjs` holds the flow.
 */

import { COMMENT_PARAMETER } from './comment-echo.mjs'
import { isLegacyStructureRefusal } from './legacy-refusal.mjs'
import { mediaView, menuSetReceipt } from './receipt-echo.mjs'
import { budgetAnswer } from './site.mjs'

/**
 * EmDash tool names as the server publishes them: one lower-case word, then `_`-joined parts
 * (`content_list`, `taxonomy_create_term`). Checked because the name goes into a JSON-RPC call
 * whose failure mode, on a typo, is a 200 with an error object the model then has to interpret.
 */
const TOOL = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/**
 * What the model asked for, validated. Native shape: the tool's own name and its own arguments.
 *
 * @param {unknown} args - the model's arguments.
 * @returns {{ ok: true, tool: string, args: Record<string, unknown>, siteKey: string | null }
 *   | { ok: false, error: string }}
 */
export function planEmdashCall(args) {
  const a = /** @type {Record<string, unknown>} */ (args && typeof args === 'object' ? args : {})
  const tool = typeof a.tool === 'string' ? a.tool.trim() : ''
  if (tool === '') return { ok: false, error: 'tool required — an EmDash MCP tool name, e.g. content_list' }
  if (!TOOL.test(tool)) return { ok: false, error: `not an EmDash tool name: "${tool}"` }

  // `arguments` is EmDash's own word for it (MCP's `tools/call` params), kept rather than renamed:
  // a model that has read EmDash's docs should be able to use them unchanged.
  const raw = a.arguments
  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const siteKeyAsked = typeof a.siteKey === 'string' ? a.siteKey.trim() : ''
  // Shape only. Whether this viewer may touch that site is the seat book's decision, made where
  // the label is resolved — naming a site here grants nothing.
  const siteKey = /^[a-z0-9][a-z0-9.-]{0,120}$/.test(siteKeyAsked) ? siteKeyAsked : null
  return { ok: true, tool, args: /** @type {Record<string, unknown>} */ (raw ?? {}), siteKey }
}

/**
 * The JSON-RPC envelope MCP expects. `id` is caller-supplied so a test can assert on it and a
 * caller can correlate; MCP requires it present and non-null.
 *
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {number} [id]
 */
export function mcpToolCall(tool, args, id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: args } }
}

/** The same envelope for the catalogue, so a model can ask what this site's EmDash offers. */
export function mcpToolsList(id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/list', params: {} }
}

/**
 * 🔒 EMDASH ANSWERS MCP AS AN EVENT STREAM, EVEN FOR ONE REPLY. The endpoint negotiates
 * `text/event-stream` and frames a single JSON-RPC response as `event: message\ndata: {…}` —
 * `JSON.parse(body)` on it throws on the first character, and a caller that only handled JSON
 * would read every successful call as a transport failure. Measured against 0.37 all through
 * 10/09. Plain JSON is accepted too: the negotiation depends on the `accept` header the caller
 * sent, and one parser that takes both cannot be wrong about which it got.
 *
 * @param {string} body - the raw response body.
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function parseMcpBody(body) {
  const text = String(body ?? '').trim()
  if (text === '') return { ok: false, error: 'empty response from the site' }
  // SSE: take the LAST data: line. A stream may carry progress notifications before the result,
  // and the response is the final one.
  const dataLines = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter((l) => l !== '')
  const payload = dataLines.length > 0 ? dataLines[dataLines.length - 1] : text
  try {
    return { ok: true, value: JSON.parse(payload) }
  } catch {
    return { ok: false, error: `the site did not answer JSON-RPC: ${payload.slice(0, 120)}` }
  }
}

/**
 * A JSON-RPC reply, read the way a caller cares about it.
 *
 * ⚠ TWO KINDS OF FAILURE, AND ONLY ONE OF THEM IS AN ERROR OBJECT. A refused scope or a bad
 * argument comes back as `result.isError === true` with the reason in `content`, HTTP 200 and no
 * `error` member at all — MCP's own convention for "the tool ran and said no". Reading only
 * `error` would report those as successes.
 *
 * @param {unknown} reply
 * @returns {{ ok: true, result: unknown } | { ok: false, error: string }}
 */
export function readMcpReply(reply) {
  const r = /** @type {Record<string, unknown>} */ (reply && typeof reply === 'object' ? reply : {})
  const err = /** @type {Record<string, unknown> | undefined} */ (r.error)
  if (err && typeof err === 'object') {
    const message = typeof err.message === 'string' ? err.message : 'unknown JSON-RPC error'
    return { ok: false, error: message }
  }
  const result = /** @type {Record<string, unknown> | undefined} */ (r.result)
  if (!result || typeof result !== 'object') return { ok: false, error: 'no result in the reply' }
  if (result.isError === true) {
    return { ok: false, error: textOf(result.content) || 'the tool refused' }
  }
  return { ok: true, result }
}

/**
 * The text an MCP tool answered with. Content is a list of typed parts; the text ones are what a
 * person or a model reads.
 * @param {unknown} content
 */
export function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((p) => p && typeof p === 'object' && /** @type {any} */ (p).type === 'text')
    .map((p) => String(/** @type {any} */ (p).text ?? ''))
    .join('\n')
    .trim()
}

// The MCP endpoint URL, request headers, and the agent-token shape check all live in the container
// now (#154/#155): the call is built and made INSIDE the site's own web container by `exec.mjs`'s
// `MCP_SCRIPT` (`EMDASH_MCP_LOOPBACK`, its inline `authorization`/`accept`/`X-EmDash-Request`
// headers, and its `^ec_pat_…$` token regex). dsh no longer builds a URL, headers, or holds a token
// to validate — so `mcpUrl`/`mcpHeaders`/`isAgentToken` (and the PAT regex) are gone from here.

/** The fleet label a site key names: `site-abc.tracy.test` → `site-abc`. */
const LABEL = /^[a-z0-9][a-z0-9-]*$/

/**
 * The label a site key names, VALIDATED: `site-abc.tracy.test` → `site-abc`, or null when the value
 * is absent, malformed, or names no usable label. Config read off disk (`laneSiteKey`) and a value a
 * caller typed (`siteKey`) both pass through here, so an empty or junk string is treated as "no site
 * named" rather than becoming a label nobody can reach.
 * @param {unknown} siteKey
 * @returns {string | null}
 */
function labelOfKey(siteKey) {
  if (typeof siteKey !== 'string') return null
  const label = siteKey.split('.')[0] ?? null
  return label !== null && LABEL.test(label) ? label : null
}

/**
 * The site a cwd is TRUSTED to stand in, or null. Not mere prefix parsing: a `.` or `..` segment can
 * keep the label at the front of the string while the kernel resolves the path into another site — or
 * out of the sites root entirely — so a cwd that does not lie plainly at `<root>/<label>[/…]` derives
 * NOTHING and confers no authority. This mirrors `subprocess-docker`'s `siteOf`, which refuses a `..`
 * segment rather than normalizing it: neither module does I/O, so neither can tell a symlink from a
 * directory, and refusing is the safe reading.
 * @param {string} cwd - already stripped of trailing slashes.
 * @param {string} root - the sites root, stripped of trailing slashes.
 * @returns {string | null}
 */
function ownSiteOf(cwd, root) {
  if (root === '' || cwd === '' || cwd === root || !cwd.startsWith(`${root}/`)) return null
  const segments = cwd
    .slice(root.length + 1)
    .split('/')
    .filter((s) => s !== '' && s !== '.')
  if (segments.includes('..')) return null
  const label = segments[0] ?? null
  return label !== null && LABEL.test(label) ? label : null
}

/**
 * Which site an EmDash call reaches, and the fence around it.
 *
 * 🔒 THE SESSION'S OWN SITE, NOTHING ELSE — AND A CALLER-NAMED siteKey GRANTS NO SITE. `tracy_site`
 * reaches a site through Tracy's seat book, which checks the viewer's seat there. This door goes
 * straight to the site's container with the SITE'S OWN admin token, so the seat book never sees the
 * call. The only thing between a model and another customer's site is which site this resolves to —
 * so authority may come only from a TRUSTED source: the site this session is rooted in
 * (`/site/<label>`), or the legacy lane a single-site lane was configured with (`laneSiteKey`). A
 * `siteKey` the caller passed is NOT a source; it may only CONFIRM an identity those establish, never
 * supply one. Without a trusted source the call is refused BEFORE any filesystem, exec, or token read
 * — a named `siteKey` on an unrooted host session reaches nothing. Any disagreement among the rooted
 * site, the configured lane, and an explicit request is refused rather than guessed. `tracy-subprocess-docker`
 * keeps the same rooted-cwd rule for shell commands.
 *
 * @param {{ siteKey: string | null, sessionCwd?: string | null, laneSiteKey?: string | null, sitesRoot?: string }} input
 * @returns {{ ok: true, label: string, container: string, origin: string }
 *   | { ok: false, code: string, error: string, siteKey?: string | null, conversationSite?: string }}
 */
export function emdashSiteOf({ siteKey, sessionCwd = null, laneSiteKey = null, sitesRoot = '/site' }) {
  const root = String(sitesRoot ?? '').replace(/\/+$/, '')
  const cwd = typeof sessionCwd === 'string' ? sessionCwd.replace(/\/+$/, '') : ''

  // The two TRUSTED identities. `own` comes from where the session actually stands; `lane` from the
  // env the lane was created with. `asked` is only a claim the caller makes about which of those it
  // means — it can match one, but it cannot be one.
  const own = ownSiteOf(cwd, root)
  const lane = labelOfKey(laneSiteKey)
  const asked = labelOfKey(siteKey)

  // Two trusted sources that name different sites: refuse rather than pick one. On a host dsh `lane`
  // is empty and this cannot fire; on a single-site lane the session stands in its own site, so this
  // guards a misconfiguration, not a normal call.
  if (own !== null && lane !== null && own !== lane)
    return {
      ok: false,
      code: 'SITE_MISMATCH',
      error: `This session is rooted on ${own} but the lane is configured for ${lane}; refusing rather than guess which site to reach.`
    }

  const authority = own ?? lane
  if (authority === null)
    return {
      ok: false,
      code: 'NO_SITE',
      // 🔒 Honest: a `siteKey` alone does NOT open a site — saying "provide siteKey" here would send an
      // unrooted caller to ask for exactly the thing that grants nothing.
      error:
        'This session is not opened on a site, so there is no site to reach. Open a session on the site (its folder is /site/<label>) — naming a siteKey does not by itself grant access to a site.'
    }

  // 🔒 ONE CONVERSATION, ONE SITE — the same fence the Apply door holds for Joomla and WordPress
  // (`sites/route.js` `conversationSite`: `SITE_OUTSIDE_CONVERSATION`, 403), under the SAME name.
  // EmDash never crosses that door — this road talks to the site's own MCP — so the fence has to
  // stand here, and until 21/09/2026 it stood under a name of its own (`SITE_MISMATCH`) that no
  // `refusalNext` case knew: a bare code, on the one road where the agent had just been TOLD, by the
  // site context, to name another site. One name means one next step for both roads, and one
  // sentence the working rules can point at. It covers BOTH trusted authorities — a rooted cwd and
  // a configured lane — because from the caller's side they are the same refusal: the site named is
  // not the site this conversation is.
  if (asked !== null && asked !== authority)
    return {
      ok: false,
      code: 'SITE_OUTSIDE_CONVERSATION',
      siteKey: siteKey,
      conversationSite: authority,
      error: `This conversation is the site ${authority}; ${asked} is another workspace and cannot be reached from here.`
    }

  const label = authority
  // origin is loopback: the MCP call is made INSIDE `container` (#154), where the site answers
  // itself at 127.0.0.1:4321. It is here for the message the model reads, not for a socket dsh opens.
  return { ok: true, label, container: `${label}-web-1`, origin: 'http://127.0.0.1:4321' }
}

/**
 * A tools/list answer, kept to what a model needs to call a tool: name, what it does, and the
 * argument schema. Everything else EmDash publishes (titles, annotations) is dropped — the list
 * is read on every turn it is asked for.
 * @param {unknown} result
 * @returns {Array<{ name: string, description: string, inputSchema: unknown }>}
 */
export function toolsOf(result) {
  const list = /** @type {{ tools?: unknown }} */ (result && typeof result === 'object' ? result : {}).tools
  if (!Array.isArray(list)) return []
  return list
    .filter(
      (t) => t && typeof t === 'object' && typeof (/** @type {{ name?: unknown }} */ (t).name) === 'string'
    )
    .map((t) => {
      const tool = /** @type {{ name: string, description?: unknown, inputSchema?: unknown }} */ (t)
      return {
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        inputSchema: tool.inputSchema ?? {}
      }
    })
}

/**
 * 🔒 THE TOOLS THAT ONLY READ, AS EMDASH ITSELF DECLARES THEM (`annotations.readOnlyHint` on 0.38's
 * tools/list — 22 of 59). dsh's scheduler runs a tool call in parallel only on an exact `true`, so this
 * is the list that lets "ask every read in ONE step" actually overlap. A tool missing here is a barrier,
 * the safe direction: an upstream read added later costs a serial step, never a race.
 * Pinned against test/fixtures/emdash/tools-0.38.json.
 * @type {ReadonlySet<string>}
 */
export const EMDASH_READ_TOOLS = new Set([
  'content_list',
  'content_get',
  'content_compare',
  'content_list_trashed',
  'content_translations',
  'byline_list',
  'byline_get',
  'byline_translations',
  'schema_list_collections',
  'schema_get_collection',
  'media_list',
  'media_get',
  'search',
  'taxonomy_list',
  'taxonomy_get',
  'taxonomy_list_terms',
  'taxonomy_term_translations',
  'menu_list',
  'menu_get',
  'menu_translations',
  'revision_list',
  'settings_get'
])

/**
 * 🔒 THE TOOLS EMDASH ITSELF MARKS DESTRUCTIVE (`annotations.destructiveHint: true` on 0.38's
 * tools/list — 10 of 59), which `tracy_emdash` asks the customer about before it forwards one.
 * `tracy_emdash` forwards any tool the site publishes, so until this list existed one unconfirmed
 * call could delete a whole collection (`schema_delete_collection {slug, force}`) with nothing in
 * between. The r2 suite made 0 deletes in 99 cases, so asking first costs no measured step.
 *
 * Only the EXPLICIT marks. MCP's default for a tool that is neither read-only nor marked is
 * "destructive", and 22 tools on 0.38 carry no annotation at all — `content_update`,
 * `content_publish`, `menu_set_items`, `settings_update` among them. Reading the default would make
 * every word change ask first; EmDash's own `true` names exactly the deletes and the draft discard.
 * Pinned against test/fixtures/emdash/tools-0.38.json, both ways.
 * @type {ReadonlySet<string>}
 */
export const EMDASH_DESTRUCTIVE_TOOLS = new Set([
  'content_delete',
  'content_permanent_delete',
  'content_discard_draft',
  'byline_delete',
  'schema_delete_collection',
  'schema_delete_field',
  'media_delete',
  'taxonomy_delete',
  'taxonomy_delete_term',
  'menu_delete'
])

/** Tracy's own tools that ask first like EmDash's marked deletes (not in EmDash's own catalogue). */
export const TRACY_DESTRUCTIVE_TOOLS = new Set(['redirect_delete'])

/**
 * 🔒 THE REDIRECT DOOR — Tracy-side tools over EmDash's REST redirect store (`/_emdash/api/redirects`,
 * middleware order "pre"; no MCP tool exists for it). A redirect written there is live at once, so it
 * costs no code edit and no `site.rebuild` (v6 bench: 338 s of rebuilds for four redirects). They ride
 * the same container exec, token custody, fence and answer shape as the MCP tools. The agent PAT
 * (scope `admin`) admits the route: no `SCOPE_RULES` entry matches it, so EmDash falls back to `admin`
 * (`astro/middleware/auth.ts` `enforceTokenScope`), and the token's user needs `redirects:manage`
 * (ADMIN) — read on 0.37 sources; the running sites are 0.38.
 * @type {ReadonlySet<string>}
 */
export const EMDASH_REDIRECT_TOOLS = new Set(['redirect_list', 'redirect_create', 'redirect_delete'])

const REDIRECT_PATH = /^\/(?!\/)\S*$/

/** @param {unknown} v */
const pathOf = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * A redirect call's arguments checked before any exec: source and destination are site paths (EmDash
 * takes no other), they differ, and the type is 301 or 302. A bare refusal (`BAD_CALL`) or null.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @returns {{ ok: false, code: 'BAD_CALL', tool: string, error: string } | null}
 */
export function validateRedirectArgs(tool, args) {
  /** @param {string} error */
  const bad = (error) => ({
    ok: /** @type {const} */ (false),
    code: /** @type {const} */ ('BAD_CALL'),
    tool,
    error
  })
  if (tool === 'redirect_create') {
    const source = pathOf(args.source)
    const destination = pathOf(args.destination)
    if (!REDIRECT_PATH.test(source) || source.includes('..'))
      return bad('source must be a path on this site starting with one /, e.g. /old-page.')
    if (!REDIRECT_PATH.test(destination) || destination.includes('..'))
      return bad('destination must be a path on this site starting with one /, e.g. /new-page.')
    if (source === destination)
      return bad(`source and destination are both ${source}: a page redirected to itself.`)
    if (args.type !== undefined && ![301, 302].includes(Number(args.type)))
      return bad('type must be 301 or 302.')
  }
  if (tool === 'redirect_delete' && !ULID.test(pathOf(args.id)))
    return bad('redirect_delete needs id: the id redirect_list answers for that redirect.')
  return null
}

/**
 * The REST request a redirect tool makes, from arguments `validateRedirectArgs` passed.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @returns {{ method: 'GET' | 'POST' | 'DELETE', path: string, body: string }}
 */
export function emdashRedirectRequest(tool, args) {
  if (tool === 'redirect_create') {
    const body = {
      source: pathOf(args.source),
      destination: pathOf(args.destination),
      type: args.type === undefined ? 301 : Number(args.type),
      ...(typeof args.enabled === 'boolean' ? { enabled: args.enabled } : {})
    }
    return { method: 'POST', path: '', body: JSON.stringify(body) }
  }
  if (tool === 'redirect_delete') return { method: 'DELETE', path: `/${pathOf(args.id)}`, body: '' }
  const q = new URLSearchParams()
  if (typeof args.cursor === 'string' && /^[A-Za-z0-9+/=_-]{1,300}$/.test(args.cursor))
    q.set('cursor', args.cursor)
  if (
    Number.isInteger(args.limit) &&
    /** @type {number} */ (args.limit) >= 1 &&
    /** @type {number} */ (args.limit) <= 100
  )
    q.set('limit', String(args.limit))
  if (typeof args.search === 'string' && args.search.trim() !== '')
    q.set('search', args.search.trim().slice(0, 100))
  const qs = q.toString()
  return { method: 'GET', path: qs === '' ? '' : `?${qs}`, body: '' }
}

/**
 * EmDash's REST envelope (`{success, data}` | `{success:false, error:{code, message}}`, whatever the
 * HTTP status) in the shape an MCP call answers with, so the rest of the flow — `parsedOf`, `refused`
 * (which reads the `[CODE]` prefix as `emdash`), the budget — is the one the other tools use.
 * @param {number} status
 * @param {string} body
 * @param {string} [fallback] - the class of a refusal EmDash sent without one (the form door's is FORMS_ERROR).
 * @returns {{ ok: true, result: { content: Array<{ type: 'text', text: string }> } } | { ok: false, code: 'TOOL_FAILED', error: string }}
 */
export function emdashRedirectReply(status, body, fallback = 'REDIRECT_ERROR') {
  let parsed = null
  try {
    parsed = JSON.parse(String(body ?? ''))
  } catch {
    // not JSON: falls to the refusal below
  }
  if (isRecord(parsed) && parsed.success === true)
    return { ok: true, result: { content: [{ type: 'text', text: JSON.stringify(parsed.data ?? null) }] } }
  const err = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null
  const code = typeof err?.code === 'string' && /^[A-Z_]+$/.test(err.code) ? err.code : fallback
  const message = typeof err?.message === 'string' ? err.message : `HTTP ${String(status)}`
  return { ok: false, code: 'TOOL_FAILED', error: `[${code}] ${clip(message, 140)}` }
}

/**
 * 🔒 THE FORM DOOR — Tracy-side tools over the forms plugin's admin routes (`/_emdash/api/plugins/emdash-forms/`,
 * no MCP tool exists for them), riding the redirect door's container exec, token custody and fence. A template's
 * contact form keeps its demo words in the plugin's own storage, which no content tool reaches: in local round 18
 * (25/10/2026) a bakery build's form still asked for a "Construction quote", and the agent replaced the form with
 * a static block in the template's code, so a visitor could no longer write at all.
 *
 * WORDS ONLY: `form_words` changes the words a visitor reads — labels, placeholders, help texts, option labels,
 * page titles, the submit / next / previous labels and the thank-you message. A field's id, name, type, required
 * flag and validation, an option's value and the count of options, the recipients, the webhook and the redirect
 * stay as they are: Tracy reads the form and sends it back with only those words changed.
 * @type {ReadonlySet<string>}
 */
export const EMDASH_FORM_TOOLS = new Set(['form_list', 'form_words'])

const FORM_FIELD_WORDS = ['label', 'placeholder', 'helpText']
const FORM_SETTING_WORDS = ['submitLabel', 'nextLabel', 'prevLabel', 'confirmationMessage']
/** @param {unknown} v @param {number} max */
const formText = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max

/**
 * A form as `form_list` answers it: its words, by field id, and nothing a visitor does not read.
 * @param {any} form
 */
export function formWordsOf(form) {
  const settings = isRecord(form?.settings) ? form.settings : {}
  return {
    id: form?.id,
    name: form?.name,
    slug: form?.slug,
    pages: (Array.isArray(form?.pages) ? form.pages : []).map((/** @type {any} */ page) => ({
      ...(typeof page?.title === 'string' ? { title: page.title } : {}),
      fields: (Array.isArray(page?.fields) ? page.fields : []).map((/** @type {any} */ field) => ({
        id: field?.id,
        type: field?.type,
        ...Object.fromEntries(
          FORM_FIELD_WORDS.filter((k) => typeof field?.[k] === 'string').map((k) => [k, field[k]])
        ),
        ...(Array.isArray(field?.options)
          ? { options: field.options.map((/** @type {any} */ o) => o?.label) }
          : {})
      }))
    })),
    ...Object.fromEntries(
      FORM_SETTING_WORDS.filter((k) => typeof settings[k] === 'string').map((k) => [k, settings[k]])
    )
  }
}

/** The form door's own tools as `{list:true, tools:[…]}` answers them (`schemasOf`); EmDash's catalogue has none. */
export const FORM_TOOL_SCHEMAS = [
  {
    name: 'form_list',
    description:
      "This site's forms (id, name, slug); with id, that form's words: pages, fields (id, type, label, placeholder, helpText, option labels), submit label.",
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: false }
  },
  {
    name: 'form_words',
    description:
      'Change the words a visitor reads on one form: labels, placeholders, help texts, option labels in their order (same count), page titles, submit / next / previous labels, thank-you message. Fields, names, types, recipients and webhook stay.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        fields: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              placeholder: { type: 'string' },
              helpText: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } }
            },
            additionalProperties: false
          }
        },
        pages: { type: 'array', items: { type: 'string' } },
        submitLabel: { type: 'string' },
        nextLabel: { type: 'string' },
        prevLabel: { type: 'string' },
        confirmationMessage: { type: 'string' }
      },
      additionalProperties: false
    }
  }
]

/**
 * A `form_words` call checked before any exec: an id, at least one word to change, each word a non-empty string.
 * @param {Record<string, unknown>} args
 * @returns {{ ok: false, code: 'BAD_CALL', tool: string, error: string } | null}
 */
export function validateFormWordsArgs(args) {
  /** @param {string} error */
  const bad = (error) => ({
    ok: /** @type {const} */ (false),
    code: /** @type {const} */ ('BAD_CALL'),
    tool: 'form_words',
    error
  })
  if (typeof args.id !== 'string' || !/^[0-9A-Za-z_-]{1,64}$/.test(args.id))
    return bad('form_words needs id: the id form_list answers for that form.')
  const fields = args.fields === undefined ? {} : args.fields
  if (!isRecord(fields))
    return bad('fields is {<field id>: {label?, placeholder?, helpText?, options?: [labels]}}.')
  for (const [id, words] of Object.entries(fields)) {
    if (!isRecord(words)) return bad(`fields.${id} is {label?, placeholder?, helpText?, options?: [labels]}.`)
    for (const [key, value] of Object.entries(words)) {
      if (FORM_FIELD_WORDS.includes(key)) {
        if (!formText(value, 1000))
          return bad(`fields.${id}.${key} is the words a visitor reads, 1–1000 characters.`)
      } else if (key === 'options') {
        if (!Array.isArray(value) || !value.every((o) => formText(o, 200)))
          return bad(`fields.${id}.options is the option labels in their order, each 1–200 characters.`)
      } else
        return bad(
          `fields.${id}.${key} is not a word of a field: only label, placeholder, helpText and options change.`
        )
    }
  }
  if (args.pages !== undefined && (!Array.isArray(args.pages) || !args.pages.every((t) => formText(t, 200))))
    return bad('pages is the page titles in their order, each 1–200 characters.')
  for (const key of FORM_SETTING_WORDS)
    if (args[key] !== undefined && !formText(args[key], 2000))
      return bad(`${key} is the words a visitor reads.`)
  const asked =
    Object.keys(fields).length +
    (args.pages === undefined ? 0 : 1) +
    FORM_SETTING_WORDS.filter((k) => args[k] !== undefined).length
  if (asked === 0)
    return bad('form_words changes nothing: name the words to change (fields, pages, submitLabel, …).')
  return null
}

/**
 * The `forms/update` body for a `form_words` call that passed `validateFormWordsArgs`: the form as it is, with only
 * the words asked changed. A field id the form does not have, or an option list of another length, is refused.
 * @param {any} form - the form as `forms/list` answered it.
 * @param {Record<string, unknown>} args
 * @returns {{ ok: true, body: Record<string, unknown> } | { ok: false, code: 'BAD_CALL', tool: string, error: string }}
 */
export function formWordsUpdate(form, args) {
  /** @param {string} error */
  const bad = (error) => ({
    ok: /** @type {const} */ (false),
    code: /** @type {const} */ ('BAD_CALL'),
    tool: 'form_words',
    error
  })
  const fields = /** @type {Record<string, Record<string, unknown>>} */ (args.fields ?? {})
  const pages = structuredClone(Array.isArray(form?.pages) ? form.pages : [])
  const seen = new Set()
  for (const page of pages)
    for (const field of Array.isArray(page?.fields) ? page.fields : []) {
      const words = fields[field?.id]
      if (!words) continue
      seen.add(field.id)
      for (const key of FORM_FIELD_WORDS) if (typeof words[key] === 'string') field[key] = words[key]
      const labels = words.options
      if (Array.isArray(labels)) {
        /** @type {any[]} */
        const options = Array.isArray(field.options) ? field.options : []
        if (labels.length !== options.length)
          return bad(
            `fields.${field.id}.options has ${labels.length} labels; the field has ${options.length} options. Keep their count: one label per option, in order.`
          )
        field.options = options.map((o, i) => ({ ...o, label: labels[i] }))
      }
    }
  const unknown = Object.keys(fields).filter((id) => !seen.has(id))
  if (unknown.length)
    return bad(
      `${unknown.join(', ')}: no such field on form ${String(form?.id)}; form_list answers its field ids.`
    )
  if (Array.isArray(args.pages)) {
    if (args.pages.length !== pages.length)
      return bad(`pages has ${args.pages.length} titles; the form has ${pages.length} pages.`)
    args.pages.forEach((title, i) => (pages[i].title = title))
  }
  const settings = Object.fromEntries(
    FORM_SETTING_WORDS.filter((k) => typeof args[k] === 'string').map((k) => [k, args[k]])
  )
  return { ok: true, body: { id: form.id, pages, ...(Object.keys(settings).length ? { settings } : {}) } }
}

/**
 * How words change on an EmDash site, in the one sentence both texts that teach it quote verbatim:
 * the site context's WORDS row and the `tracy_emdash` description.
 *
 * 🔒 PRELOADED, BECAUSE THE SKILL WAS BEING LOADED FOR THIS ALONE. On r2 (25/09/2026) 30 of the 33
 * EmDash cases loaded the 3,894-char `emdash-site` skill at step 1 just to learn this road; 606
 * chars in the context carry it on every step instead. It is ONE constant because it is one rule:
 * two copies are two texts that drift until they disagree in the same prompt.
 *
 * What it commits to, each measured: `content_get` is the read (a `content_list` answer averaged
 * 34,344 chars on r2, a `content_get` 5,942); the locale is filled by Tracy, so the model passes it
 * only for another language; ONE `content_update` with `status:"published"` changes AND publishes and
 * answers the receipt; `status:"draft"` takes a live page off the site. No `{list: true}`: the tools
 * tools named here are the whole road for words, and the catalogue answer alone was 49,977 chars.
 *
 * Which LANGUAGES a change reaches is not here: it is `EMDASH_LANGUAGE_RULE`, below.
 */
export const EMDASH_WORDS_ROAD =
  'WORDS — read the entry first: `content_get {collection, id:<slug>}` for a page or the site-wide `site` entry, `content_list {collection}` for a list; the locale is filled with this site\'s own language — pass `locale` for another. Then ONE `content_update {collection, id:<the id it answered>, data:{only the fields you change}, status:"published"}` (no `_rev`) changes AND publishes; its answer is the receipt. Leave `status` out only to stage a draft; `status:"draft"` takes a live page off the site. A list field takes {"<index>":{changed keys}}; null drops it, "+":[…] appends.'

/**
 * Which languages a change reaches on an EmDash site serving several, in the one sentence the site
 * context's EmDash row quotes after the words road.
 *
 * 🔒 THE SCOPE IS SAID, NEVER LEFT TO THE MODEL, AND NEVER ASKED. PR1's bench (25/09/2026,
 * benchemdash01, 40 languages served) put the count of languages in front of the model before its
 * first write and no rule for what "change the address" means there; each run settled it its own
 * way — C21 and C23 asked the customer first (FAIL), C04 and C20 wrote all 40, C22 wrote `en`. The
 * first fix wrote the filled language only ("say how many keep their own copy"), which leaves a
 * new phone number wrong on 39 of 40 language versions of the site.
 *
 * 🔒 DAVID'S RULE (25/09/2026), THE SAME SPLIT AS JOOMLA'S `CONTRACT_LANGUAGE_RULE` (T11): a FACT
 * the site prints the same way in every language — phone, e-mail, address, opening hours, the legal
 * or copyright line, social links — and any change the customer says applies everywhere change in
 * EVERY language served; WORDS change in the language of the page meant, others only when the
 * customer names them. Either way nothing is asked first, and the answer says how many changed.
 *
 * 🔒 THE CHEAPEST ROAD 0.37 HAS FOR A FACT IN N LANGUAGES, AND WHY IT IS STILL 2N CALLS. Each
 * language is its own entry with its own `_rev`, and EmDash has no write across a translation
 * group for a translatable field — every field of Tracy Business's `site` collection is (its seed
 * sets no `translatable`, and 0.37 defaults it to true, `schema/registry.ts`); only a
 * `translatable: false` field is copied to its siblings (`syncNonTranslatableFields`). So:
 * - ONE `content_translations {collection, id}` answers every language's entry: id, locale, slug,
 *   status and updatedAt, no data (0.37 `handleContentTranslations`) — the codes the read echo no
 *   longer lists (it says a count: the list was read as a scope to ask about);
 * - every `content_get` by that id in ONE step: reads run in parallel (`emdashRunsInParallel`),
 *   and a ULID needs no served-locale read, so N reads share nothing but the site;
 * - every `content_update` by id in the NEXT step: writes are barriers, so they run one after the
 *   other, but the model waits for them once, not N times. A ULID write needs no locale and no
 *   served-locale read (`localeNeed` → none), although each one drops the memo (a `site` write).
 * "Published" rows only: `status:"published"` on a draft language would put that language live.
 * "As one change": the site context sizes a request by its writes, and 2N writes sized as SEVERAL
 * JOBS are carried one item at a time with a line after each. C04 and C20 made 80 such calls for
 * 40 languages in ~155 s each.
 *
 * 🔒 E1 (26/09/2026): THE FACT GOES THROUGH `content.replace` FIRST, AND THAT 2N ROAD IS ITS FALLBACK.
 * PR2 made the fact one call — `tracy_site` `content.replace` finds the old value host-side in
 * every served language's entry and rewrites it there (`replace-emdash.mjs`, scope `every`), so the
 * N entries (3,429 chars for `site`@en in `test/fixtures/emdash/business-en.json`, each read back
 * on every later step) never reach the context — and EmDash is in `REPLACE_PLATFORMS` since. But
 * this sentence still sent a fact down the 2N road right after `REPLACE_ROAD` said "FIRST,
 * content.replace": two roads for one change in one row. The 25/09 bench paid for it: C21 and C22
 * alone took 244 s and 170 of the suite's 408 calls (C21's 40 `content_update` writes, 49.3 s).
 * What the engine does, so the sentence says it without guessing:
 * - a phone, e-mail, opening hours, copyright line or URL is a fact by its own words (`isFact`,
 *   `replace.mjs`), and so is a field the template's table marks — every language, no `all`;
 * - anything else — an address as the customer writes it — needs `all:true`, and `all` over
 *   `REPLACE_CONFIRM_OVER` (5) places is refused as confirm-count until the same call ran as a
 *   dryRun: saying "dryRun first" turns that refusal into the 2-call road it forces anyway;
 * - NOT_FOUND (the words are not stored as written) and TOO_MANY (`all` over `REPLACE_MAX_TARGETS`,
 *   40 places — a 41-language site's address) fall back to the road above. Neither cap is loosened.
 * `consistency.test.mjs` holds the kinds and the number here to `isFact` and `REPLACE_CONFIRM_OVER`.
 *
 * Not in the `tracy_emdash` description: this sentence is 821 chars, and that text (T12 cap 1,500)
 * was at 1,499 carrying the first fix's 128-char one; and the scope is a reading of the customer's
 * request, like the site context's FACT sentence, not a rule of the door. One copy, so nothing can
 * drift from it.
 */
export const EMDASH_LANGUAGE_RULE =
  'LANGUAGES — decide from the request, never ask. Words (headings, sentences, button labels) change in the language of the page meant (the filled one unless the request points at another), others only when the customer names them. A fact printed alike in every language, or a change said to apply everywhere, changes in EVERY language served, as one change: `tracy_site` `content.replace {find, replace, all:true}` (over 5 places, `dryRun:true` first): `all` reaches every place, and every language for opening hours, the legal or copyright line or an address; a phone, an e-mail or an https:// link reaches every language by itself. Only on TOO_MANY, or NOT_FOUND again after its next: `content_translations {collection, id}` lists them, `content_get` with `allLocales:true` reads them all; then `content_update` each published one, all in one step. The answer says how many languages changed.'

// ─── The door's own shape: what the model sends, repaired where it is predictably wrong ─────────

/**
 * Whether one `tracy_emdash` call may overlap its siblings in the same step (E1.2).
 *
 * 🔒 dsh's scheduler is fail-closed — only an exact `true` runs in parallel — so without this every
 * EmDash call was a barrier, and the reads the words road asks for in one step ran one after the
 * other (r2: 20 s of serial EmDash reads). True for `{list: true}` and for a tool EmDash itself marks
 * `readOnlyHint` (`EMDASH_READ_TOOLS`), read through the same shape repair `runEmdashTool` applies,
 * so `content.get` is the read it will be run as. A `page.text` routed to `tracy_site` stays
 * exclusive, as it is there. What a read writes outside the call is the served-locale memo
 * (`emdash-call.mjs`): a pure function of the site's published `site` rows, so two reads racing to
 * fill it store the same list and either may win — the contract `actionRunsInParallel` states. A
 * write, an unknown name and garbage are barriers: the safe direction.
 * @param {unknown} args - the call's parsed arguments.
 * @returns {boolean}
 */
export function emdashRunsInParallel(args) {
  const shape = normalizeEmdashShape(args)
  if (!shape.ok) return false
  if (shape.list === true) return true
  return shape.route === undefined && EMDASH_READ_TOOLS.has(shape.tool)
}

/**
 * The EmDash tool a finished `tracy_emdash` call wrote with, or null when it did not change the site
 * (stage 6, `tasks/evidence/comment-people/contract.md` § H1 — `siteChangedAt`). `tracy_emdash`
 * reaches the site's own MCP server and never passes Tracy's Apply door, so `index.ts` reports each
 * write named here to `POST /api/sites/:key/changed`, which stamps the site changed for everybody's
 * Refresh button. A write = one EmDash tool that is not a read (`EMDASH_READ_TOOLS`, plus the
 * redirect store's own listing) whose answer says `ok: true`; a list, a routed page read, a refusal,
 * a question to the customer (`CONFIRM_FIRST`) and an outcome nobody knows are not.
 * @param {unknown} args - the call's arguments, as the tool received them.
 * @param {unknown} answer - what the call answered.
 * @returns {string | null}
 */
export function emdashWriteTool(args, answer) {
  if (!answer || typeof answer !== 'object' || /** @type {{ ok?: unknown }} */ (answer).ok !== true)
    return null
  const shape = normalizeEmdashShape(args)
  if (!shape.ok || shape.list === true || shape.route !== undefined) return null
  if (EMDASH_READ_TOOLS.has(shape.tool) || shape.tool === 'redirect_list' || shape.tool === 'form_list')
    return null
  return shape.tool
}

/**
 * The entry a write named, as `site_write.target` keeps it (`{kind, id}`, the Apply door's shape):
 * the call's own `collection` and `id`, never a title looked up later. Null when the call named no
 * single entry (a menu, the redirect store, a schema change). Without it the Site changes row of an
 * EmDash chat turn could only say "Content change recorded" (QA-A10-em, 03/10), where the same edit
 * on Joomla reads "Updated article 2601".
 *
 * The id is the one the write's own receipt names (`result.entry.id`, `receiptOf`) when it has one:
 * a `content_create` call carries no id at all — EmDash mints it — so without the receipt a created
 * post read "Content change recorded" (dev acceptance ACC-30.C4, 03/10); and an update called with
 * a slug is named by the entry's real id. The call's own `id` is the fallback.
 *
 * Dev e2e 04/10/2026: plus `title` and `state` when the write's own answer carried them
 * ({@link WRITE_FACTS}) — the name Site changes shows, and the publish this write made.
 * @param {unknown} args - the call's arguments, as the tool received them.
 * @param {unknown} [answer] - what the call answered.
 * @returns {{ kind: string, id: string, ids?: string[], title?: string, state?: 'published' | 'draft' } | null}
 */
export function emdashWriteTarget(args, answer) {
  const target = writeTargetOnly(args, answer)
  if (target === null) return null
  // E3.2 / E5.e5 (dev e2e 04/10): what the write's own answer said, for the row's words and for the
  // publish rule — `WRITE_FACTS`, set by `runEmdashTool`; absent on an answer that carries none.
  const facts = writeFactsOf(answer)
  return {
    ...target,
    ...(facts?.title ? { title: facts.title } : {}),
    ...(facts?.state ? { state: facts.state } : {})
  }
}

/**
 * @param {unknown} args
 * @param {unknown} answer
 * @returns {{ kind: string, id: string, ids?: string[] } | null}
 */
function writeTargetOnly(args, answer) {
  const shape = normalizeEmdashShape(args)
  if (!shape.ok || shape.list === true || shape.route !== undefined) return null
  const removed = removedRowsOf(answer)
  if (removed !== null) return { kind: removed.collection, id: removed.ids[0], ids: removed.ids }
  if (MEDIA_WRITE_TOOLS.has(shape.tool)) return mediaWriteTarget(shape.tool, shape.args, answer)
  const { collection, id: asked } = /** @type {{ collection?: unknown, id?: unknown }} */ (shape.args ?? {})
  if (typeof collection !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(collection.trim())) return null
  const receipt = /** @type {{ result?: { entry?: { id?: unknown } } } | null} */ (
    answer && typeof answer === 'object' ? answer : null
  )
  const minted = receipt?.result?.entry?.id
  const id = typeof minted === 'string' && minted.trim() !== '' ? minted : asked
  if (typeof id !== 'string' && typeof id !== 'number') return null
  const entry = String(id).trim()
  if (entry === '' || entry.length > 128) return null
  return { kind: collection.trim(), id: entry }
}

/** EmDash's media writes that name one library item: by the item they made, or the `id` they name. */
const MEDIA_WRITE_TOOLS = new Set(['media_upload', 'media_update', 'media_delete'])

/**
 * 🔒 C1 media (04/10/2026): A MEDIA WRITE IS NAMED `{kind: 'media', id}` — THE KIND THE COLLECTOR GIVES
 * EMDASH'S MEDIA ROWS (`apps/tracy-host/src/cms-log.js` `mapEmdash`). The audit-log plugin logs every
 * upload as `media:upload` with the item's id and no user (core 1.0.1 `MediaAfterUploadEvent` has no
 * actor), so tracy-web can tell Tracy's own upload from somebody else's only by that id. An upload
 * carries no id when it is called — EmDash mints it — so it is the one the answer names
 * (`result.item.id`); an update or a delete names it in its call.
 * @param {string} tool
 * @param {unknown} args
 * @param {unknown} answer
 * @returns {{ kind: string, id: string } | null}
 */
function mediaWriteTarget(tool, args, answer) {
  const result = /** @type {{ result?: { item?: { id?: unknown }, id?: unknown } } | null} */ (
    answer && typeof answer === 'object' ? answer : null
  )?.result
  const id =
    tool === 'media_upload'
      ? (result?.item?.id ?? result?.id)
      : /** @type {{ id?: unknown }} */ (args ?? {}).id
  if (typeof id !== 'string' || !/^[\p{L}\p{N}._:-]{1,128}$/u.test(id)) return null
  return { kind: 'media', id }
}

/**
 * 🔒 C1 (04/10/2026): THE ROWS A DELETE REMOVED, FOR TRACY — NOT FOR THE MODEL. EmDash logs each removed
 * row as a `delete` with no user (core 1.0.1 passes no actor to `content:afterDelete`), so tracy-web can
 * tell Tracy's own deletes from somebody else's only by the row ids Tracy reports on `POST /changed`.
 * The call's own `id` is not enough: a slug is resolved to the ULID by the door, and an entry deleted in
 * all its languages is one call that removes N rows (F3.2). `runEmdashTool` puts the collection and the
 * ids of the rows that WENT (the asked row first, then the others in the entry's order; a row EmDash
 * refused is not one) under this symbol. A symbol, so the answer the model reads stays as it was:
 * `JSON.stringify` never writes it, and the refusal that once listed 40 ids on every later step stays gone.
 */
export const REMOVED_ROWS = Symbol('tracy_emdash removed rows')

/**
 * 🔒 DEV E2E 04/10/2026: WHAT A WRITE'S OWN ANSWER SAID ABOUT THE ENTRY, FOR TRACY — NOT FOR THE MODEL.
 * Set by `runEmdashTool` on a write's answer, read by {@link emdashWriteTarget} into the report on
 * `POST /changed`. A symbol, as {@link REMOVED_ROWS} is, so the answer the model reads is unchanged.
 *   - `title`: the entry's title (else its slug), a media item's file name — so Site changes says
 *     "Updated home “Home”", never "Updated home 01M3PJR…" (E3.2). Recorded with the write, never
 *     looked up later.
 *   - `state`: `published` when the write put the entry live or put a new revision live, `draft` when
 *     it took a live entry offline — by the very rule the collector reads EmDash's publish state with
 *     (`apps/tracy-host/src/cms-log.js` `emdashPublishState`), from the read before the write and the
 *     write's answer. Only then: an update that staged a draft, or kept a draft a draft, moved nothing
 *     the collector logs, and a state on it would hand somebody else's publish to Tracy (E5.e5).
 */
export const WRITE_FACTS = Symbol('tracy_emdash write facts')

/** The longest title a report carries (tracy-web keeps no more: `WRITE_TARGET_TITLE_MAX`). */
const WRITE_TITLE_MAX = 200

/**
 * The facts a write's answer carries under {@link WRITE_FACTS}, or null.
 * @param {unknown} answer
 * @returns {{ title?: string, state?: 'published' | 'draft' } | null}
 */
function writeFactsOf(answer) {
  if (!answer || typeof answer !== 'object') return null
  const facts = /** @type {Record<symbol, unknown>} */ (answer)[WRITE_FACTS]
  if (!facts || typeof facts !== 'object') return null
  const { title, state } = /** @type {{ title?: unknown, state?: unknown }} */ (facts)
  return {
    ...(typeof title === 'string' && title.trim() !== ''
      ? { title: title.trim().slice(0, WRITE_TITLE_MAX) }
      : {}),
    ...(state === 'published' || state === 'draft' ? { state } : {})
  }
}

/**
 * The {@link WRITE_FACTS} of one write, from the entry (or media item) its answer holds and the entry
 * the read before it answered; null when there is nothing to say.
 * @param {{ tool: string, args: Record<string, unknown>, data: unknown, before: unknown }} input
 * @returns {{ title?: string, state?: 'published' | 'draft' } | null}
 */
export function writeFacts({ tool, args, data, before }) {
  const d = /** @type {Record<string, unknown>} */ (isRecord(data) ? data : {})
  const item = /** @type {Record<string, unknown>} */ (isRecord(d.item) ? d.item : d)
  const text = (/** @type {unknown} */ v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  /** @type {{ title?: string, state?: 'published' | 'draft' }} */
  const out = {}
  if (tool.startsWith('media_')) {
    const name = text(item.filename) ?? text(args.filename)
    if (name) out.title = name
  } else {
    const fields = /** @type {Record<string, unknown>} */ (isRecord(item.data) ? item.data : {})
    const name = text(fields.title) ?? text(fields.name) ?? text(item.slug)
    if (name) out.title = name
  }
  if (tool === 'content_update' && isRecord(before) && isRecord(item) && typeof item.status === 'string') {
    const wasLive = before.status === 'published'
    const isLive = item.status === 'published'
    if (isLive && (!wasLive || (before.liveRevisionId ?? null) !== (item.liveRevisionId ?? null)))
      out.state = 'published'
    else if (wasLive && !isLive) out.state = 'draft'
  }
  return Object.keys(out).length ? out : null
}

/** The most row ids one report names: tracy-web keeps no more (`WRITE_TARGET_IDS_MAX`). */
const REMOVED_IDS_MAX = 200

/**
 * The `{collection, ids}` an answer carries under {@link REMOVED_ROWS}, or null when it carries none
 * that tracy-web would keep (a collection slug, 1–200 ids of the entry-id shape).
 * @param {unknown} answer
 * @returns {{ collection: string, ids: string[] } | null}
 */
function removedRowsOf(answer) {
  if (!answer || typeof answer !== 'object') return null
  const removed = /** @type {Record<symbol, unknown>} */ (answer)[REMOVED_ROWS]
  if (!removed || typeof removed !== 'object') return null
  const { collection, ids } = /** @type {{ collection?: unknown, ids?: unknown }} */ (removed)
  if (typeof collection !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(collection)) return null
  if (!Array.isArray(ids) || ids.length === 0) return null
  const kept = ids
    .slice(0, REMOVED_IDS_MAX)
    .filter((id) => typeof id === 'string' && /^[\p{L}\p{N}._:-]{1,128}$/u.test(id))
  return kept.length === ids.slice(0, REMOVED_IDS_MAX).length ? { collection, ids: kept } : null
}

/**
 * Whether a `content.replace` answer on an EmDash site says it wrote (`changed` lists at least one
 * place; a dryRun lists them under `would`, never `changed`). That job writes through the site's
 * own MCP too (`replace-emdash.mjs`), so it is reported like a `tracy_emdash` write.
 *
 * A job that stopped half way (`PARTIAL`, `OUTCOME_UNKNOWN`, a store that moved) names what landed
 * under `written`, never `changed` — and those places are on the site all the same, so they are
 * reported too (review 09/10/2026: a PARTIAL that wrote four places left no row in Site changes).
 * @param {unknown} answer
 * @returns {boolean}
 */
export function emdashReplaceWrote(answer) {
  if (!answer || typeof answer !== 'object') return false
  const a = /** @type {{ changed?: unknown, written?: unknown, dryRun?: unknown }} */ (answer)
  if (a.dryRun === true) return false
  const some = (/** @type {unknown} */ list) => Array.isArray(list) && list.length > 0
  return some(a.changed) || some(a.written)
}

/**
 * `content_list`'s own arguments (0.38 `tools/list`, pinned both ways by `test/emdash.test.mjs`).
 * EmDash reads no other key of it and answers the unfiltered page — round 7: `query:"<a title>"` came
 * back as the same eight rows, and the model read them as the ones that matched.
 */
export const CONTENT_LIST_ARGS = Object.freeze([
  'collection',
  'status',
  'limit',
  'cursor',
  'orderBy',
  'order',
  'locale',
  'markdown'
])

/** The names a model gives a filter on words. */
const SEARCH_ARGS = /^(search|s|q|query|text|match|filter|find|title|contains|keyword|keywords)$/i

/** Keys `tracy_emdash` itself reads; any other key beside `tool` is one of the tool's own arguments. */
const TRACY_KEYS = new Set([
  'tool',
  'arguments',
  'list',
  'tools',
  'siteKey',
  'allLocales',
  'raw',
  'confirm',
  'removes'
])

/** Where a model puts the arguments when it does not call them `arguments` (F4 ED-3). */
const ARGUMENT_ALIASES = ['args', 'params', 'input']

/** `tracy_site`'s page reads, asked of the wrong tool (F4 ED-5): answered as what they are. */
const PAGE_ACTIONS = Object.freeze({
  'page.text': 'page.text',
  page_text: 'page.text',
  'page.look': 'page.look',
  page_look: 'page.look'
})

/** The Apply door's receipts, asked of a door that keeps none (F4 ED-6). */
const APPLY_RECEIPTS = new Set(['apply.list', 'apply_list', 'apply.revert', 'apply_revert'])

/**
 * EmDash's sortable system columns by the snake-case names its own `content_list` description uses
 * as examples ("e.g. 'created_at'") — and then refuses: `mapOrderField` knows only the camel-case
 * keys (`database/repositories/content.ts` `ORDER_FIELD_COLUMNS`, emdash 0.37).
 */
const ORDER_FIELDS = Object.freeze({
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  published_at: 'publishedAt',
  scheduled_at: 'scheduledAt',
  deleted_at: 'deletedAt'
})

/**
 * @typedef {{ ok: true, list: true, route?: undefined, names: string[] | null, siteKey: string | null,
 *   notes: string[] }} ListShape
 * @typedef {{ ok: true, list?: undefined, route: { action: 'page.text' | 'page.look',
 *   params: Record<string, unknown> }, siteKey: string | null, notes: string[] }} RouteShape
 * @typedef {{ ok: true, list?: undefined, route?: undefined, tool: string, args: Record<string, unknown>,
 *   siteKey: string | null, allLocales: boolean, raw: boolean, confirm: boolean, removes: string | null,
 *   notes: string[] }} ToolShape
 * @typedef {{ ok: false, list?: undefined, route?: undefined, code: 'BAD_CALL' | 'NO_RECEIPTS_ON_EMDASH',
 *   tool?: string, error: string }} RefusedShape
 * @typedef {ListShape | RouteShape | ToolShape | RefusedShape} EmdashShape
 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isRecord(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * One `tracy_emdash` call, read once, with the shapes a model predictably gets wrong repaired and
 * each repair said in `notes` (they reach the answer as `normalized`: use the corrected form next
 * time). Pure; never throws.
 *
 * - ED-2: `arguments: {tool, arguments: {…}}` (the same call nested twice — measured on ed-vwptf3,
 *   answered `-32602`) → the inner arguments.
 * - ED-3: no `arguments`, but an `args` / `params` / `input` object, or the tool's own keys loose
 *   beside `tool` → those are the arguments.
 * - ED-4: `content.get` / `content-get` → `content_get`.
 * - ED-5: `page.text` / `page.look` → `route`: `tracy_site`'s own action for the same site.
 * - ED-6: `apply.list` / `apply.revert` → `NO_RECEIPTS_ON_EMDASH`: the write's answer is the receipt.
 * - ED-7: `content_list` `orderBy` in snake case → EmDash's camel-case key.
 * - ED-8: a `_rev` EmDash would call malformed but that decodes to `<version>:<updatedAt>` → EmDash's
 *   own token (`canonicalRev`).
 * - ED-10: `action` in place of `tool` (tracy_site's key) → the tool; `action:"list"` → the catalogue.
 * - ED-9: `content_list` with a key it reads nowhere (`query`, `fields`) → the key taken off and said;
 *   a name that asks to find words points at `search`.
 * - `confirm`, `allLocales` and `removes` (the body guard's way through for a cut the customer asked
 *   for, `emdash-call.mjs`) are Tracy's own parameters, read at the top or inside `arguments` (no
 *   EmDash tool takes any of them) and never forwarded.
 *
 * @param {unknown} args - the model's arguments, parsed or as JSON text.
 * @returns {EmdashShape}
 */
export function normalizeEmdashShape(args) {
  let parsed = args
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      parsed = {}
    }
  }
  const a = isRecord(parsed) ? parsed : {}
  /** @type {string[]} */
  const notes = []
  const siteKeyAsked = typeof a.siteKey === 'string' ? a.siteKey.trim() : ''
  const siteKey = /^[a-z0-9][a-z0-9.-]{0,120}$/.test(siteKeyAsked) ? siteKeyAsked : null
  if (a.list === true) {
    const names = Array.isArray(a.tools)
      ? [...new Set(a.tools.filter((n) => typeof n === 'string' && n.trim() !== '').map((n) => n.trim()))]
      : null
    return { ok: true, list: true, names: names !== null && names.length > 0 ? names : null, siteKey, notes }
  }

  let tool = typeof a.tool === 'string' ? a.tool.trim() : ''
  /**
   * ED-10 (09/10/2026): `action` is `tracy_site`'s key, and the model carried it over — `{action:"content_list",
   * arguments}`, `{action:"list"}` — and each was refused "tool required" (bench hb: 7 calls in one EmDash
   * picture run, one after another, before the model found the difference). An EmDash tool name under
   * `action` is the tool; "list" (or "tools") with nothing else is the catalogue `{list:true}`.
   */
  const action = tool === '' && typeof a.action === 'string' ? a.action.trim() : ''
  if (action !== '' && /^(list|tools|list_tools|tools_list)$/.test(action) && a.arguments === undefined) {
    notes.push(`action "${action}" is {list:true}: the tool catalogue`)
    return { ok: true, list: true, names: null, siteKey, notes }
  }
  if (action !== '') {
    tool = action
    notes.push(`action is "tool" here: tool ${action.slice(0, 40)}`)
  }
  let inner = a.arguments
  if (inner === undefined) {
    const alias = ARGUMENT_ALIASES.find((k) => isRecord(a[k]))
    const loose = Object.keys(a).filter((k) => !TRACY_KEYS.has(k) && !(action !== '' && k === 'action'))
    if (alias !== undefined) {
      inner = a[alias]
      notes.push(`arguments were sent as "${alias}"; they go in "arguments"`)
    } else if (loose.length > 0) {
      inner = Object.fromEntries(loose.map((k) => [k, a[k]]))
      notes.push(`${loose.slice(0, 4).join(', ')} moved into "arguments"`)
    }
  }
  // ED-2: the whole call again inside `arguments`. Only when the inner call names the same tool
  // (or the outer names none): two different names are a question, not a repair.
  if (
    isRecord(inner) &&
    typeof inner.tool === 'string' &&
    isRecord(inner.arguments) &&
    (tool === '' || sameTool(inner.tool, tool))
  ) {
    if (tool === '') tool = inner.tool.trim()
    inner = inner.arguments
    notes.push('arguments were nested twice; the inner ones were used')
  }

  const page = /** @type {Record<string, 'page.text' | 'page.look'>} */ (PAGE_ACTIONS)[tool]
  if (page !== undefined) {
    notes.push(`${tool} is tracy_site's ${page}; it was answered as that`)
    return { ok: true, route: { action: page, params: isRecord(inner) ? { ...inner } : {} }, siteKey, notes }
  }
  if (APPLY_RECEIPTS.has(tool))
    return {
      ok: false,
      code: 'NO_RECEIPTS_ON_EMDASH',
      tool,
      error: `${tool} is the Joomla/WordPress receipt door; EmDash keeps no apply receipts.`
    }
  if (/[.-]/.test(tool)) {
    const fixed = tool.replace(/[.-]/g, '_')
    notes.push(`tool ${tool} is ${fixed}`)
    tool = fixed
  }

  const plan = planEmdashCall({ tool, arguments: inner, siteKey: siteKeyAsked })
  if (!plan.ok) return { ok: false, code: 'BAD_CALL', ...(tool !== '' ? { tool } : {}), error: plan.error }
  const out = { ...plan.args }
  let confirm = a.confirm === true
  let allLocales = a.allLocales === true
  if (Object.hasOwn(out, 'confirm')) {
    confirm ||= out.confirm === true
    delete out.confirm
  }
  if (Object.hasOwn(out, 'allLocales')) {
    allLocales ||= out.allLocales === true
    delete out.allLocales
  }
  let removes = typeof a.removes === 'string' ? a.removes : null
  if (Object.hasOwn(out, 'removes')) {
    if (typeof out.removes === 'string') removes ??= out.removes
    delete out.removes
  }
  // G3 (27/09/2026): `schema_get_collection` takes `slug`, and the model sends the collection's name
  // as `collection` or `name` (A1/25-09 bench: every such call failed EmDash's validation first).
  if (plan.tool === 'schema_get_collection' && out.slug === undefined) {
    const named = ['collection', 'name'].find((k) => typeof out[k] === 'string' && out[k].trim() !== '')
    if (named !== undefined) {
      notes.push(`${named} is slug`)
      out.slug = String(out[named]).trim()
      delete out[named]
    }
  }
  if (plan.tool === 'content_list' && typeof out.orderBy === 'string') {
    const camel = ORDER_FIELDS[/** @type {keyof typeof ORDER_FIELDS} */ (out.orderBy.trim())]
    if (camel !== undefined) {
      notes.push(`orderBy ${out.orderBy} is ${camel}`)
      out.orderBy = camel
    }
  }
  // A key `content_list` reads nowhere is taken off and said: EmDash answers the unfiltered page and
  // the list looks filtered. A name that asks to FIND words points at `search`, which does — but only in
  // collections that are searchable (`search` in `supports`, fields marked `searchable`: posts, services,
  // projects, pages on Tracy's templates), so it says as much: a page's own fields are in no index, and a
  // note that promised "finds by words" sent models to a search that answered nothing (review of round 7, RL-1).
  if (plan.tool === 'content_list') {
    const stray = Object.keys(out).filter((k) => !CONTENT_LIST_ARGS.includes(k))
    for (const k of stray) delete out[k]
    const found = stray.find((k) => SEARCH_ARGS.test(k))
    if (found !== undefined)
      notes.push(
        `${found.slice(0, 20)} dropped: content_list filters nothing; search finds words in searchable collections`
      )
    const others = stray.filter((k) => k !== found)
    if (others.length > 0)
      notes.push(
        `${others
          .slice(0, 3)
          .map((k) => k.slice(0, 20))
          .join(', ')} dropped: content_list does not take ${others.length === 1 ? 'it' : 'them'}`
      )
  }
  if (typeof out._rev === 'string') {
    const r = canonicalRev(out._rev)
    if (r.changed) {
      notes.push('_rev re-encoded the way EmDash writes it')
      out._rev = r.rev
    }
  }
  return {
    ok: true,
    tool: plan.tool,
    args: out,
    siteKey: plan.siteKey,
    allLocales,
    raw: a.raw === true,
    confirm,
    removes,
    notes
  }
}

/** @param {string} x @param {string} y */
function sameTool(x, y) {
  return x.trim().replace(/[.-]/g, '_') === y.trim().replace(/[.-]/g, '_')
}

/** `<version>:<ISO updatedAt>` — what EmDash's `encodeRev` base64-encodes (`api/rev.ts`). */
const REV_PLAIN = /^\d+:\d{4}-\d\d-\d\dT[\d:.]+Z$/

/**
 * ED-8. EmDash decodes `_rev` strictly (`api/rev.ts`): r1 C10's token was the right one plus a stray
 * `=`, and the write was refused as malformed. A token that decodes to `<version>:<updatedAt>` after
 * fixing its padding, or that plain value unencoded, becomes EmDash's own encoding; anything else is
 * left for EmDash to judge.
 * @param {unknown} rev
 * @returns {{ rev: unknown, changed: boolean }}
 */
export function canonicalRev(rev) {
  if (typeof rev !== 'string') return { rev, changed: false }
  const raw = rev.trim()
  if (REV_PLAIN.test(raw)) return { rev: Buffer.from(raw, 'utf8').toString('base64'), changed: true }
  const body = raw.replace(/=+$/, '')
  if (!/^[A-Za-z0-9+/]+$/.test(body)) return { rev, changed: false }
  const decoded = Buffer.from(body + '='.repeat((4 - (body.length % 4)) % 4), 'base64').toString('utf8')
  if (!REV_PLAIN.test(decoded)) return { rev, changed: false }
  const canonical = Buffer.from(decoded, 'utf8').toString('base64')
  return { rev: canonical, changed: canonical !== rev }
}

// ─── Locales (D11) ─────────────────────────────────────────────────────────────────────────────

/** A ULID as EmDash mints and recognises them (`_findByIdOrSlug`: ID first, then slug). */
export const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/

/** A locale tag worth sending: `en`, `pt-BR`, `zh_Hant`. */
const LOCALE = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/

/**
 * 🔒 THE TOOLS WHERE A MISSING LOCALE MEANS "EVERY LANGUAGE" OR "THE FIRST ONE". Measured 24/09 on
 * ed-ivj9ni: `content_list {home}` 362,302 chars for 40 rows against 5,175 with `locale:"en"`, and
 * `content_get {home, id:"home"}` answered the `af` row. The ones whose `locale` filters or scopes a
 * lookup (0.38 `tools/list`), minus `content_create` (EmDash defaults it to the configured locale) and
 * the byline creators (not on the content road); `taxonomy_update` names its taxonomy per locale.
 * @type {ReadonlySet<string>}
 */
export const LOCALE_FILL_TOOLS = new Set([
  'content_list',
  'content_get',
  'content_update',
  'search',
  'menu_list',
  'menu_get',
  'menu_set_items',
  'menu_update',
  'menu_delete',
  'taxonomy_list',
  'taxonomy_get',
  'taxonomy_list_terms',
  'taxonomy_update'
])

/**
 * The 12 tools that take `{collection, id}` and NO locale (0.38 `tools/list`), so a slug there names
 * the alphabetically first language's entry — r2's 8 refused `content_publish {id:"home"}`.
 * @type {ReadonlySet<string>}
 */
export const ID_WITHOUT_LOCALE_TOOLS = new Set([
  'content_delete',
  'content_restore',
  'content_permanent_delete',
  'content_publish',
  'content_unpublish',
  'content_schedule',
  'content_unschedule',
  'content_compare',
  'content_discard_draft',
  'content_duplicate',
  'content_translations',
  'revision_list'
])

/** @param {Record<string, unknown>} args */
function explicitLocale(args) {
  return typeof args.locale === 'string' && args.locale.trim() !== '' ? args.locale.trim() : null
}

/** @param {Record<string, unknown>} args */
function idOf(args) {
  return typeof args.id === 'string' ? args.id.trim() : null
}

/**
 * Whether this call's locale depends on which languages the site serves, and so whether the
 * served-locale memo has to be asked first: `'read'` (a memo up to 10 minutes old is good enough —
 * a wrong fill on a read is echoed and changes nothing), `'write'` (recomputed once per turn before
 * the first such write, D11), or `'none'`.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {{ allLocales?: boolean }} [opts]
 * @returns {'none' | 'read' | 'write'}
 */
export function localeNeed(tool, args, { allLocales = false } = {}) {
  const read = EMDASH_READ_TOOLS.has(tool)
  if (allLocales && read) return 'none'
  if (explicitLocale(args) !== null) return 'none'
  const id = idOf(args)
  if (ID_WITHOUT_LOCALE_TOOLS.has(tool)) {
    if (id === null || id === '' || ULID.test(id)) return 'none'
    return read ? 'read' : 'write'
  }
  if (!LOCALE_FILL_TOOLS.has(tool)) return 'none'
  if (id !== null && ULID.test(id)) return 'none'
  return read ? 'read' : 'write'
}

/**
 * THE LOCALE RULE (D11), one rule for reads and writes. `served` = the distinct locales of this
 * site's published `site` rows (the template's own `served-locales` rule): a list of one, of
 * several, or `[]` / `null` = unknown.
 *
 * - An explicit `locale` is the model's: kept (on a locale-less entry tool with a slug, it scopes the
 *   one read that turns the slug into the ULID).
 * - A ULID needs no locale: EmDash finds an ID before it tries a slug.
 * - One served locale: filled on every locale-scoped tool, and a slug on a locale-less entry tool is
 *   resolved to its ULID.
 * - Several, the template's `locales.default` among them: that one, on reads AND writes — filled on
 *   a locale-scoped tool, and a slug on a locale-less entry tool resolved in it — echoed with the
 *   COUNT of languages served (`languages`), never their list.
 * - Several, the default not among them (or none named): a read goes as written; a write by slug or
 *   menu/taxonomy name is refused `EMDASH_LOCALE_REQUIRED`, a slug on a locale-less entry tool
 *   `EMDASH_ULID_REQUIRED`.
 *
 *   🔒 ONE FILL RULE FOR READS AND WRITES (D11 amended after the PR1 bench, 25/09/2026). D11 filled
 *   reads with the default and refused a slug write on a site serving several languages. On
 *   benchemdash01 (40 served; `en` the default, and the language `/` shows) that refusal met 20
 *   cases: 18 retried with `locale:"en"`, the language the read had already been filled with; one
 *   wrote `en`, then added `vi`; C21 turned it into a question to the customer and failed. It changed
 *   the language written in none of them and cost a step in each. A filled default still closes what
 *   D11 guards against — a slug with no locale landing on the alphabetically first language (`af`) —
 *   because the locale sent is always explicit, and the write's answer says which (`locale.filled`).
 *   Reads echoed every other served locale too: 39 codes in database order (`uk, tr, th…`, `en` 40th),
 *   re-sent on every later step, which C21 and C23 read as a scope to ask the customer about.
 * - Unknown because the read FAILED: the template default for reads only; writes are refused as
 *   with several — a slug without a locale would land on the alphabetically first language, and a
 *   refusal cannot. The refusal says the languages were not read (`languages: 'unread'`), never
 *   that the site serves several.
 * - Unknown because the template has NO `site` collection and declares no languages (`unscoped`):
 *   nothing to fill and nothing to refuse — the call goes as the model wrote it, as it did before
 *   this rule. 🔒 A template fact, not a failure: the apple and airbnb seeds
 *   (`vendor/emdash/emdash-theme-tracy-{apple,airbnb}/seed/seed.json`) hold no `site` collection
 *   and no i18n, and refusing there turned every `menu_set_items {name, items}` — the skill's own
 *   menu road — into `EMDASH_LOCALE_REQUIRED` on a one-language site.
 * - `allLocales: true` is honoured on reads only.
 * `locale.filled` is echoed only when the call names no ULID (a ULID was never in doubt).
 *
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {{ served?: string[] | null, artifactDefault?: unknown, allLocales?: boolean,
 *   unscoped?: boolean }} ctx
 * @returns {{ ok: true, args: Record<string, unknown>, filled: string | null, languages?: number,
 *   resolve?: { collection: unknown, slug: string, locale: string } }
 *   | { ok: false, code: 'EMDASH_LOCALE_REQUIRED' | 'EMDASH_ULID_REQUIRED', tool: string, error: string, [k: string]: unknown }}
 */
export function localePlan(
  tool,
  args,
  { served = null, artifactDefault = null, allLocales = false, unscoped = false }
) {
  const read = EMDASH_READ_TOOLS.has(tool)
  if (allLocales && !read)
    return {
      ok: false,
      code: 'EMDASH_LOCALE_REQUIRED',
      tool,
      allLocales: true,
      error: `allLocales reads every language; ${tool} writes one, so it takes a locale instead.`
    }
  if (allLocales) return { ok: true, args, filled: null }
  const known = Array.isArray(served) ? served.filter((l) => typeof l === 'string' && LOCALE.test(l)) : []
  const fallback =
    typeof artifactDefault === 'string' && LOCALE.test(artifactDefault) ? artifactDefault : null
  const given = explicitLocale(args)
  const id = idOf(args)
  const slug = id !== null && id !== '' && !ULID.test(id) ? id : null
  /** The template's default when this site serves it among several: the one both reads and writes get. */
  const byDefault = known.length > 1 && fallback !== null && known.includes(fallback) ? fallback : null

  if (ID_WITHOUT_LOCALE_TOOLS.has(tool)) {
    if (slug === null) return { ok: true, args, filled: null }
    const { locale: _dropped, ...rest } = args
    if (given !== null)
      return {
        ok: true,
        args: rest,
        filled: null,
        resolve: { collection: args.collection, slug, locale: given }
      }
    if (known.length === 1)
      return {
        ok: true,
        args: rest,
        filled: known[0],
        resolve: { collection: args.collection, slug, locale: known[0] }
      }
    if (byDefault !== null)
      return {
        ok: true,
        args: rest,
        filled: byDefault,
        languages: known.length,
        resolve: { collection: args.collection, slug, locale: byDefault }
      }
    if (unscoped && known.length === 0) return { ok: true, args, filled: null }
    return {
      ok: false,
      code: 'EMDASH_ULID_REQUIRED',
      tool,
      collection: typeof args.collection === 'string' ? args.collection : null,
      id: slug,
      ...servedFacts(known),
      error: clip(
        `${tool} takes no locale, so "${slug}" would name the first language's entry, not one this site shows${known.length > 1 ? ` (it serves ${known.length})` : ''}.`
      )
    }
  }

  if (!LOCALE_FILL_TOOLS.has(tool) || given !== null || (id !== null && ULID.test(id)))
    return { ok: true, args, filled: null }
  if (known.length === 1) return { ok: true, args: { ...args, locale: known[0] }, filled: known[0] }
  if (byDefault !== null)
    return { ok: true, args: { ...args, locale: byDefault }, filled: byDefault, languages: known.length }
  if (read) {
    // Unknown: the template default, echoed. Several without it: EmDash's own answer stands.
    if (fallback === null || known.length > 0) return { ok: true, args, filled: null }
    return { ok: true, args: { ...args, locale: fallback }, filled: fallback }
  }
  if (unscoped && known.length === 0) return { ok: true, args, filled: null }
  const named = slug ?? (typeof args.name === 'string' ? args.name : null)
  return {
    ok: false,
    code: 'EMDASH_LOCALE_REQUIRED',
    tool,
    ...(typeof args.collection === 'string' ? { collection: args.collection } : {}),
    ...(named !== null ? { [slug !== null ? 'id' : 'name']: named } : {}),
    ...servedFacts(known),
    error: clip(
      known.length > 1
        ? `This site serves ${known.length} languages; ${tool}${named !== null ? ` "${named}"` : ''} needs locale to know which one it changes.`
        : `This site's languages could not be read; ${tool}${named !== null ? ` "${named}"` : ''} needs locale to know which one it changes.`
    )
  }
}

/**
 * The served locales a refusal carries: every one when there are few, the count when there are
 * many — and, when none could be read, `languages: 'unread'`, so the next step does not claim the
 * site serves several (`refusalNext` branches on it).
 */
function servedFacts(/** @type {string[]} */ known) {
  if (known.length === 0) return { languages: 'unread' }
  return known.length <= 8 ? { served: known } : { served: known.slice(0, 8), servedCount: known.length }
}

/**
 * An `error` within T10's 160 chars, its head kept — where EmDash names the field and the rule
 * (`[VALIDATION_ERROR] data.hero_title_a: expected string, …`). Exported for the refusals
 * `emdash-call.mjs` passes on from EmDash's own door.
 * @param {string} s
 * @param {number} [max]
 */
export function clip(s, max = 160) {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

// ─── Entries: revision tokens and draft states (D12) ───────────────────────────────────────────

/**
 * EmDash's own `encodeRev` (`api/rev.ts`): base64 of `<version>:<updatedAt>`. Every `content_list`
 * row carries both, so a row read in a list can be written without a `content_get` first. Verified
 * 24/09 against the tokens EmDash answered: home@en `MTI6MjAyNi0wOS0yNFQwNDozNjo0NS4wNDBa`, site@en
 * `NjoyMDI2LTA5LTI0VDA0OjM2OjQ0LjU3Nlo=` — and re-checked on every `content_update` pre-read
 * (`emdash-call.mjs`), which turns computed tokens off if EmDash ever encodes them another way.
 * @param {unknown} item
 * @returns {string | null}
 */
export function revOf(item) {
  const i = /** @type {Record<string, unknown>} */ (isRecord(item) ? item : {})
  return typeof i.version === 'number' && typeof i.updatedAt === 'string'
    ? Buffer.from(`${i.version}:${i.updatedAt}`, 'utf8').toString('base64')
    : null
}

/**
 * Where an entry stands (D12), read from EmDash's own revision pointers:
 * - `'unpublished'` — not live (`status` other than published): never published, or taken offline.
 *   A draft revision on it is simply its content, nobody's pending change to a live page.
 * - `'pendingDraft'` — live, and holding a draft revision other than the live one: an unpublished
 *   change that the next publish ships.
 * - `'live'` — live with nothing waiting.
 * @param {unknown} item
 * @returns {'live' | 'pendingDraft' | 'unpublished'}
 */
export function entryState(item) {
  const i = /** @type {Record<string, unknown>} */ (isRecord(item) ? item : {})
  if (i.status !== 'published') return 'unpublished'
  return typeof i.draftRevisionId === 'string' && i.draftRevisionId !== i.liveRevisionId
    ? 'pendingDraft'
    : 'live'
}

/** Whether a live entry holds an unpublished change. */
export function hasPendingDraft(/** @type {unknown} */ item) {
  return entryState(item) === 'pendingDraft'
}

/**
 * The top-level fields where a pending draft differs from what visitors see — EmDash's
 * `content_get` answers the draft as `data` and the live values as `liveData`.
 * @param {unknown} item
 * @returns {string[]}
 */
export function draftFieldsOf(item) {
  const i = /** @type {Record<string, unknown>} */ (isRecord(item) ? item : {})
  const data = isRecord(i.data) ? i.data : {}
  const live = isRecord(i.liveData) ? i.liveData : {}
  return Object.keys(data).filter((k) => JSON.stringify(data[k]) !== JSON.stringify(live[k]))
}

/**
 * One content entry as the model needs it: who it is, its lock, whether a change waits, and `data`
 * EXACTLY as EmDash sent it — a list field is written back whole, and a picture object copied back
 * without its metadata would lose it. Dropped: type, authorId, primaryBylineId, the timestamps, the
 * revision ids, version, translationGroup, bylines (`raw: true` keeps them).
 * @param {unknown} item
 * @param {{ rev?: string | null, revs?: boolean }} [opts] - `rev`: EmDash's own token when it sent
 *   one; `revs: false` when computed tokens are off.
 * @returns {Record<string, unknown>}
 */
export function shapeRow(item, { rev = null, revs = true } = {}) {
  const i = /** @type {Record<string, unknown>} */ (isRecord(item) ? item : {})
  /** @type {Record<string, unknown>} */
  const row = { id: i.id, slug: i.slug, locale: i.locale ?? null, status: i.status }
  const token = rev ?? (revs ? revOf(i) : null)
  if (token !== null) row._rev = token
  if (entryState(i) === 'pendingDraft') row.pendingDraft = true
  row.data = i.data
  const seo = isRecord(i.seo) ? i.seo : null
  if (seo !== null && Object.values(seo).some((v) => v !== null && v !== '' && v !== false)) row.seo = seo
  return row
}

// ─── The catalogue ─────────────────────────────────────────────────────────────────────────────

/** A purpose line this long keeps 59 tools inside the `{list:true}` budget with room to spare. */
const PURPOSE_MAX = 100

/**
 * One line per tool — `name — what it does` — for `{list: true}`. The full argument schemas moved to
 * `{list: true, tools: [names]}`: r2 made `{list:true}` in 32 of 33 EmDash cases and re-read its
 * 49,977 chars on every later step, for the handful of tools the description already names.
 * @param {Array<{ name: string, description?: string }>} tools - `toolsOf(result)`.
 * @returns {string[]}
 */
export function catalogueOf(tools) {
  return (Array.isArray(tools) ? tools : []).map((t) => {
    const purpose = firstSentence(typeof t.description === 'string' ? t.description : '')
    return purpose === '' ? t.name : `${t.name} — ${purpose}`
  })
}

/** @param {string} text */
function firstSentence(text) {
  const one = text.trim().split(/(?<=[.!?])\s/)[0] ?? ''
  if (one.length <= PURPOSE_MAX) return one
  const cut = one.slice(0, PURPOSE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[,;:]$/, '')}…`
}

/**
 * The full schemas of the named tools only, as `toolsOf` gives them minus JSON Schema's own `$schema`
 * line; names this site does not publish are listed in `unknown`.
 * @param {Array<{ name: string, description: string, inputSchema: unknown }>} tools
 * @param {string[]} names
 */
export function schemasOf(tools, names) {
  const byName = new Map(
    [...FORM_TOOL_SCHEMAS, ...(Array.isArray(tools) ? tools : [])].map((t) => [t.name, t])
  )
  const found = []
  const unknown = []
  for (const n of names) {
    const t = byName.get(n) ?? byName.get(n.replace(/[.-]/g, '_'))
    if (t === undefined) unknown.push(n)
    else {
      const { $schema: _s, ...schema } = /** @type {Record<string, unknown>} */ (
        isRecord(t.inputSchema) ? t.inputSchema : {}
      )
      found.push({ name: t.name, description: t.description, inputSchema: schema })
    }
  }
  return { tools: found, ...(unknown.length > 0 ? { unknown } : {}) }
}

// ─── Answers ───────────────────────────────────────────────────────────────────────────────────

/**
 * menu_get's items in menu_set_items's own input shape, so the answer can be sent straight back
 * with one label changed: nulls dropped (the set schema takes optional STRINGS — a `titleAttr: null`
 * copied back is a validation error), and `parentId` → `parentIndex`, with every parent placed
 * before its children, because `parentIndex` "must be earlier in the list" (menu_set_items' schema).
 * @param {unknown} items
 * @returns {Array<Record<string, unknown>>}
 */
export function menuItemsForSet(items) {
  const list = (Array.isArray(items) ? items : []).filter(isRecord)
  const ids = new Set(list.map((it) => it.id))
  /** @type {Array<Record<string, unknown>>} */
  const ordered = []
  const placed = new Set()
  /** @param {Record<string, unknown>} it @param {Set<unknown>} path */
  const place = (it, path) => {
    if (placed.has(it) || path.has(it)) return
    path.add(it)
    const parent = it.parentId && ids.has(it.parentId) ? list.find((p) => p.id === it.parentId) : undefined
    if (parent !== undefined) place(parent, path)
    placed.add(it)
    ordered.push(it)
  }
  for (const it of list) place(it, new Set())
  const at = new Map(ordered.map((it, i) => [it.id, i]))
  return ordered.map((it) => {
    /** @type {Record<string, unknown>} */
    const o = { label: it.label, type: it.type }
    for (const k of ['customUrl', 'referenceCollection', 'referenceId', 'titleAttr', 'target', 'cssClasses'])
      if (typeof it[k] === 'string' && it[k] !== '') o[k] = it[k]
    const p = it.parentId ? at.get(it.parentId) : undefined
    if (p !== undefined && p < /** @type {number} */ (at.get(it.id))) o.parentIndex = p
    return o
  })
}

/**
 * `schema_get_collection` without the columns a model never writes with (ids, timestamps, comment
 * settings, sort orders): 17,348 chars on r2 for `home`. Field objects keep `options`, because a
 * repeater's sub-fields live there. `raw: true` returns everything.
 * @param {unknown} schema
 */
function slimSchema(schema) {
  const s = /** @type {Record<string, unknown>} */ (isRecord(schema) ? schema : {})
  const fields = Array.isArray(s.fields) ? s.fields.filter(isRecord) : []
  return {
    slug: s.slug,
    label: s.label,
    ...(Array.isArray(s.supports) ? { supports: s.supports } : {}),
    ...(typeof s.urlPattern === 'string' && s.urlPattern !== '' ? { urlPattern: s.urlPattern } : {}),
    ...(s.hasSeo === true ? { hasSeo: true } : {}),
    fields: fields.map((f) => {
      /** @type {Record<string, unknown>} */
      const o = { slug: f.slug, label: f.label, type: f.type }
      if (f.required === true) o.required = true
      if (f.options !== null && f.options !== undefined) o.options = f.options
      if (f.validation !== null && f.validation !== undefined) o.validation = f.validation
      return o
    })
  }
}

/**
 * 🔒 EACH ANSWER IS CAPPED WHERE THE DOOR CAN NARROW IT, AND ONLY THERE (D26). A cut answer names the
 * call that gets the rest — a parameter this tool really takes (0.38 `inputSchema`, pinned by IX1's
 * consistency test). Where EmDash has no narrowing (`content_get`, `schema_get_collection`,
 * `content_translations`) there is no cap: a cut entry could not be written back whole, and the
 * parsed answer already dropped the 33–44 % that was escaping.
 *
 * `whole` is the read that answers ONE row whole, named when a single row is over the budget and
 * the rows come cut by field (see `budget`); a list with no such read (trash, terms, revisions)
 * has none, and its rows still carry the ids its other tools act on.
 *
 * `paged` marks a list the door pages by `cursor` (0.38 `inputSchema`): a cut page of it keeps a
 * `nextCursor` (see `pagedCut`). `cursorKey` is the row value EmDash's cursor is made of where its
 * source fixes one (`media_list`: core `repositories/media.ts` `findMany`, newest `createdAt` first).
 *
 * `slim` marks a list whose rows are entries (`content_list`): over its budget it is shown by who each
 * row is — every row, its long values and pictures left out and named — before any row is dropped
 * (`cutByField`), because a row is found by its title and the one asked for was the row cut.
 * @type {Readonly<Record<string, { maxChars: number, listKey?: string, next?: string, whole?: string,
 *   paged?: boolean, cursorKey?: string, slim?: boolean }>>}
 */
export const EMDASH_BUDGETS = Object.freeze({
  list: {
    maxChars: 6000,
    listKey: 'tools',
    next: "{list:true, tools:[names]} gives those tools' full argument schemas"
  },
  content_list: {
    maxChars: 8000,
    listKey: 'items',
    next: 'content_list {collection, limit:<fewer rows>} answers a nextCursor; pass it as cursor for the next rows',
    whole: 'content_get {collection, id} reads one whole entry',
    paged: true,
    slim: true
  },
  content_list_trashed: {
    maxChars: 8000,
    listKey: 'items',
    next: 'content_list_trashed {collection, limit:<fewer rows>}, then cursor:<the nextCursor it answers>',
    paged: true,
    slim: true
  },
  media_list: {
    maxChars: 8000,
    listKey: 'items',
    next: 'media_list {mimeType, limit:<fewer>}, then cursor:<the nextCursor it answers>',
    whole: 'media_get {id} reads one whole',
    paged: true,
    cursorKey: 'createdAt'
  },
  search: {
    maxChars: 8000,
    listKey: 'items',
    next: 'search {query, collections, limit:<fewer>}, then cursor:<the nextCursor it answers>',
    whole: 'content_get {collection, id} reads one whole entry',
    paged: true
  },
  taxonomy_list_terms: {
    maxChars: 8000,
    listKey: 'items',
    next: 'taxonomy_list_terms {taxonomy, limit:<fewer>}, then cursor:<the nextCursor it answers>',
    paged: true
  },
  byline_list: {
    maxChars: 8000,
    listKey: 'items',
    next: 'byline_list {search, limit:<fewer>}, then cursor:<the nextCursor it answers>',
    whole: 'byline_get {id} reads one whole',
    paged: true
  },
  menu_list: {
    maxChars: 8000,
    listKey: 'items',
    next: 'menu_get {name} reads one menu',
    whole: 'menu_get {name} reads one menu'
  },
  revision_list: {
    maxChars: 12000,
    listKey: 'items',
    next: 'revision_list {collection, id, limit:<fewer>} lists the latest ones'
  },
  content_update: { maxChars: 3000 },
  content_publish: { maxChars: 3000 }
})

/**
 * An answer within its tool's budget: whole records from the head of its list, valid JSON, and
 * `truncated` + `next` when anything was left out (WP0 `budgetAnswer`). A cut page of a list the door
 * pages by cursor keeps a `nextCursor` (`pagedCut`); any other cut list drops the page's own, which
 * points past the WHOLE page, so following it would skip the rows cut.
 *
 * 🔒 WHEN NOT EVEN ONE WHOLE ROW FITS, THE ROWS ARE CUT BY FIELD, NOT DROPPED (principle 13; D26
 * "list rows are cut by field"). A record cut alone answered `items: []`, `shown: 0` and the next
 * "limit:<fewer rows>" — and `limit:1` answered the same empty page again, with no id to read one
 * entry by: a dead end (review of P4, 25/09: a 9,000-char post body gave 0 rows at limit 5 and at
 * limit 1). r2's stand rows peak at 5,148 chars, so r2 never showed it; a customer's blog will. So
 * each row keeps who it is — its short values (id, slug, locale, status, `_rev`, a title) whole —
 * and its long ones (`data`, `seo`, a body) are named in `truncated.fieldsLeftOut`; `next` names the
 * read that answers one row whole (`whole`), and, if even the cut rows overflow, the narrowing too.
 * @param {string} tool - a tool name, or `list` for the catalogue.
 * @param {unknown} result
 * @param {unknown[] | null} [rawRows] - the page's rows AS EMDASH SENT THEM, for the resume cursor
 *   only (F7, 28/09/2026): `shapeRow` drops the timestamps, and the cursor's order value is one of
 *   them, so a shaped row could never prove the order and every cut page fell back to a cursor that
 *   SKIPS the rows it cut. Nothing of these rows is shown; only their order value is read.
 * @returns {unknown}
 */
export function budget(tool, result, rawRows = null) {
  const rule = EMDASH_BUDGETS[tool]
  if (rule === undefined) return result
  const listKey = rule.listKey ?? null
  const input =
    listKey !== null && Array.isArray(result) ? { [listKey]: result } : /** @type {unknown} */ (result)
  const cut = budgetAnswer(input, {
    maxChars: rule.maxChars,
    ...(listKey ? { listKey } : {}),
    ...(rule.next ? { next: rule.next } : {})
  })
  if (cut === input) return result
  const byField = listKey !== null ? cutByField(rule, listKey, input, cut, rawRows) : null
  if (byField !== null) return byField
  const paged = listKey !== null ? pagedCut(rule, listKey, input, cut, '', rawRows) : null
  if (paged !== null) return paged
  if (isRecord(cut) && Object.hasOwn(cut, 'nextCursor')) {
    const { nextCursor: _past, ...rest } = cut
    return rest
  }
  return cut
}

/**
 * 🔒 A CUT PAGE KEEPS A WAY TO THE ROWS IT CUT (28/09/2026). The page used to lose its `nextCursor`
 * with nothing in its place, so the only road to the rows cut was a smaller `limit` the model had to
 * guess: on the stand, media rows 15-39 of a 39-row library (one page, 14 shown) were out of reach.
 * Now the answer carries a `nextCursor` and `next` says how many rows were left out:
 *   - EmDash's own cursor for the LAST ROW SHOWN (`resumeCursor`) when the order it pages by can be
 *     proven — the same call with it reads the rows cut, then the pages after, nothing skipped;
 *   - otherwise the page's own cursor, kept as EmDash wrote it, with `next` saying it skips the rows
 *     cut and naming the `limit` (the rows shown) whose answer's cursor loses nothing;
 *   - on a last page with no provable order, no cursor is invented: `next` names that `limit`.
 * Shown rows fall off the tail, one at a time, until the answer is back within budget.
 * @param {{ maxChars: number, paged?: boolean, cursorKey?: string }} rule
 * @param {string} listKey
 * @param {unknown} input - the answer before the cut.
 * @param {unknown} cut - the cut: its `listKey` rows (whole, or cut by field) and its `truncated`.
 * @param {string} lead - what `next` says first (the rows cut by field), or ''.
 * @param {unknown[] | null} [rawRows] - the rows as EmDash sent them (`budget`).
 * @returns {Record<string, unknown> | null} null for a list not paged by cursor, or no row shown.
 */
function pagedCut(rule, listKey, input, cut, lead, rawRows = null) {
  if (rule.paged !== true || !isRecord(input) || !isRecord(cut) || !isRecord(cut.truncated)) return null
  const rows = input[listKey]
  const shownRows = cut[listKey]
  if (!Array.isArray(rows) || !Array.isArray(shownRows) || shownRows.length === 0) return null
  // 🔒 F7 (28/09/2026): the ORDER is proven on the rows EmDash sent, not on the shaped ones.
  // `shapeRow` drops `createdAt`/`updatedAt`, and a list's cursor orders by one of them, so no shaped
  // row could ever match the cursor's order value: `resumeCursor` answered null every time and the
  // answer fell back to the page's own cursor, which starts after the LAST ROW OF THE PAGE and so
  // skips every row the cut left out. Following it read 31 of 120 posts. The raw rows are used for the
  // cursor and for nothing else — they are never shown — and they must line up with the shaped ones
  // row for row, or they are not trusted.
  const ordered = Array.isArray(rawRows) && rawRows.length === rows.length ? rawRows : rows
  const own = input.nextCursor
  const pageCursor = typeof own === 'string' && own !== '' ? own : undefined
  const total = rows.length
  const max = rule.maxChars.toLocaleString('en-US')
  const truncated = cut.truncated
  /** @param {number} shown */
  const compose = (shown) => {
    const resume = resumeCursor(rule, ordered, shown, pageCursor)
    const head = `${total - shown} of ${total} rows were left out to fit ${max} chars`
    // 🔒 The last branch is NOT "limit:N, then cursor:<…>": read as one call, it had a model send
    // `limit:7` with a cursor it made up (`eyJvIjo3fQ==`, base64 of {"o":7}) — refused INVALID_CURSOR,
    // one step lost (round 7). That page has no cursor to send: the cursor is the one the answer to
    // `limit:N` gives.
    const said =
      resume !== null
        ? `${head}; nextCursor starts right after the last row shown: send the same call with cursor:<nextCursor> to read them.`
        : pageCursor !== undefined
          ? `${head}, and this page's nextCursor skips them: send the same call with limit:${shown} and follow that answer's nextCursor.`
          : `${head}: send the same call with limit:${shown} and follow that answer's nextCursor.`
    const cursor = resume ?? pageCursor
    /** @type {Array<[string, unknown]>} */
    const entries = []
    for (const [k, v] of Object.entries(cut)) {
      if (k === 'nextCursor' || k === 'truncated' || k === 'next') continue
      entries.push([k, k === listKey ? shownRows.slice(0, shown) : v])
    }
    if (cursor !== undefined) entries.push(['nextCursor', cursor])
    entries.push(['truncated', { ...truncated, shown }])
    entries.push(['next', lead === '' ? said : `${lead} ${said}`])
    // Built through entries so a key such as `__proto__` stays an ordinary key, as JSON.parse made it.
    return Object.fromEntries(entries)
  }
  let shown = shownRows.length
  let answer = compose(shown)
  while (shown > 1 && JSON.stringify(answer).length > rule.maxChars) answer = compose(--shown)
  return answer
}

/**
 * EmDash's cursor for row `shown` of a page (1-based: the last row shown) — base64 of
 * `{orderValue, id}`, as core `repositories/types.ts` `encodeCursor` writes it — or null when which
 * value orders the list cannot be proven. EmDash writes a page's `nextCursor` from its LAST row, so
 * the key whose value on that row is the cursor's `orderValue` is the one the list is ordered by; a
 * last page has no cursor to read that from, and only `rule.cursorKey` (fixed by EmDash's source)
 * names it. Any doubt answers null: no such key, the page's cursor not naming its last row, keys
 * that disagree on the row shown, or an order value that is not a plain string or number (an
 * indexed field's cursor carries a JSON payload).
 * @param {{ cursorKey?: string }} rule
 * @param {unknown[]} rows - the whole page, before the cut.
 * @param {number} shown
 * @param {string | undefined} pageCursor - the page's own `nextCursor`.
 * @returns {string | null}
 */
function resumeCursor(rule, rows, shown, pageCursor) {
  const at = rows[shown - 1]
  const last = rows.at(-1)
  if (shown < 1 || shown >= rows.length || !isRecord(at) || !isRecord(last)) return null
  if (!isOrderValue(at.id)) return null
  /** @type {string[]} */
  let keys
  if (pageCursor === undefined) {
    if (rule.cursorKey === undefined) return null
    keys = [rule.cursorKey]
  } else {
    const c = cursorOf(pageCursor)
    if (c === null || c.orderValue === '' || !isOrderValue(last.id) || String(last.id) !== c.id) return null
    keys = Object.keys(last).filter((k) => isOrderValue(last[k]) && String(last[k]) === c.orderValue)
    if (rule.cursorKey !== undefined && !keys.includes(rule.cursorKey)) return null
  }
  const values = new Set(keys.map((k) => (isOrderValue(at[k]) ? String(at[k]) : null)))
  if (values.size !== 1 || values.has(null)) return null
  const [orderValue] = values
  return Buffer.from(JSON.stringify({ orderValue, id: String(at.id) }), 'utf8').toString('base64')
}

/** @param {unknown} v @returns {v is string | number} */
const isOrderValue = (v) =>
  (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v))

/**
 * An EmDash cursor read back, or null when it is not one.
 * @param {string} cursor
 * @returns {{ orderValue: string, id: string } | null}
 */
function cursorOf(cursor) {
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'))
    return isRecord(c) && typeof c.orderValue === 'string' && typeof c.id === 'string'
      ? { orderValue: c.orderValue, id: c.id }
      : null
  } catch {
    return null
  }
}

/** A text longer than this is left out of a row cut by field: a value shown is always whole. */
const ROW_TEXT_MAX = 200

/**
 * The keys of an entry's `data` that say what the row IS: kept up to {@link ROW_TEXT_MAX} at every
 * level, because a row cut to fit is read by its title.
 */
const IDENTITY_KEYS = new Set(['title', 'name', 'label', 'heading', 'headline'])

/**
 * How far a slim list is cut, widest first (`cutByField`): the short values of a row's `data`
 * (`dataMax` characters), then only the very short ones. A row's own `data` is opened at both — a list
 * row's title is inside it — where the last resort of `shown === 0`, `rowByField(row)`, leaves `data`
 * whole out. The row's own keys (id, slug, locale, status, `_rev`) are short by nature and never cut.
 */
const SLIM_LEVELS = Object.freeze([{ dataMax: ROW_TEXT_MAX }, { dataMax: 60 }])

/** What a row cut by field says about its `_cut` (see {@link rowByField}). */
const CUT_RULE = "A row's _cut lists what it lost; a field neither shown nor listed is not set."

/** @param {unknown} v @param {number} max */
const isShort = (v, max) =>
  v === null || typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= max)

/**
 * One row cut to who it is: its null, number, boolean and short string values, whole; the keys
 * of everything else (objects, lists, long text) in `left`. Null when the row is not an object.
 *
 * With `level`, a row's `data` object is opened rather than left out whole: its short values stay (a
 * title, a year, a city), each long or nested one (a body, a picture object with its metadata) is named
 * `data.<key>` in `left`, and a `data` with nothing short in it is left out as `data`. A value shown is
 * still whole and a value left out is not there at all, so a picture object is never copied back
 * without its metadata.
 *
 * 🔒 A ROW THAT LOST SOMETHING SAYS WHAT, IN A `_cut` OF ITS OWN (adversarial review of round 7, RL-3).
 * `fieldsLeftOut` is the union over the page, and a value left out is not there at all — so in a list
 * where one post's 130-character excerpt is cut and another's empty or short one is kept, a key missing
 * from a row read as "unset", and a model asked to write a summary for every post that has none wrote
 * over a customer's own. Only a row that lost a field carries `_cut`, so a field neither shown nor listed
 * there is not set.
 * @param {unknown} row
 * @param {{ dataMax: number } | null} [level]
 * @returns {{ row: Record<string, unknown>, left: string[] } | null}
 */
function rowByField(row, level = null) {
  if (!isRecord(row)) return null
  /** @type {Array<[string, unknown]>} */
  const kept = []
  /** @type {string[]} */
  const left = []
  for (const [k, v] of Object.entries(row)) {
    if (isShort(v, ROW_TEXT_MAX)) kept.push([k, v])
    else if (level !== null && k === 'data' && isRecord(v)) {
      /** @type {Array<[string, unknown]>} */
      const shown = []
      /** @type {string[]} */
      const dropped = []
      for (const [name, value] of Object.entries(v))
        if (isShort(value, IDENTITY_KEYS.has(name) ? ROW_TEXT_MAX : level.dataMax)) shown.push([name, value])
        else dropped.push(name)
      if (shown.length === 0) left.push(k)
      else {
        // Built through entries so a key such as `__proto__` stays an ordinary key, as JSON.parse made it.
        kept.push([k, Object.fromEntries(shown)])
        for (const name of dropped) left.push(`${k}.${name}`)
      }
    } else left.push(k)
  }
  if (left.length > 0) kept.push(['_cut', left])
  // Built through entries so a key such as `__proto__` stays an ordinary key, as JSON.parse made it.
  return { row: Object.fromEntries(kept), left }
}

/**
 * The page cut by field; null when there is nothing to cut that way (a row is not an object, or no row
 * has a long value to leave out — cutting by field would then change nothing).
 *
 * 🔒 TWO CASES, ONE CUT. (1) Not even one whole row fits (`shown === 0`): every row shows who it is
 * (25/09, P4 review). (2) A list that opts in (`rule.slim`: `content_list`) and overflows with SOME
 * rows whole: it is shown by who each row is too, at the widest level that fits EVERY row
 * (`SLIM_LEVELS`), and only when even the narrowest overflows are rows dropped from the tail (30/09/2026).
 * Round 7 measured what the old cut cost: a 10-row list showed 8 rows and the row the customer named was
 * the ninth — models paged with cursors they made up, or passed a `query` no EmDash tool reads, for
 * 27 wasted calls in seven runs. A row cut whole is one `content_get` away, and every row is there to
 * be picked by its title.
 * @param {{ maxChars: number, next?: string, whole?: string, slim?: boolean }} rule
 * @param {string} listKey
 * @param {unknown} input - the answer before the cut.
 * @param {unknown} cut - `budgetAnswer`'s record cut of it.
 * @param {unknown[] | null} [rawRows] - the rows as EmDash sent them (`budget`).
 * @returns {Record<string, unknown> | null}
 */
function cutByField(rule, listKey, input, cut, rawRows = null) {
  if (!isRecord(cut) || !isRecord(cut.truncated)) return null
  const single = cut.truncated.shown === 0
  if (!single && rule.slim !== true) return null
  const list = isRecord(input) && Array.isArray(input[listKey]) ? input[listKey] : null
  if (list === null || list.length === 0) return null
  const chars = cut.truncated.chars
  const max = rule.maxChars.toLocaleString('en-US')
  /**
   * The rows cut at one level: the answer with them, and the words about it.
   * @param {{ dataMax: number } | null} level
   */
  const at = (level) => {
    const rows = list.map((row) => rowByField(row, level))
    if (rows.some((r) => r === null)) return null
    const cutRows = /** @type {Array<{ row: Record<string, unknown>, left: string[] }>} */ (rows)
    const left = [...new Set(cutRows.flatMap((r) => r.left))]
    if (left.length === 0) return null
    const said = `${left.slice(0, 5).join(', ')}${left.length > 5 ? ', …' : ''}`
    const lead = `${single ? `One whole row is over ${max} chars, so rows show who they are` : `Rows are cut to fit ${max} chars`} (left out: ${said}). ${CUT_RULE}${rule.whole ? ` ${rule.whole}.` : ''}`
    const slim = Object.fromEntries(
      Object.entries(/** @type {Record<string, unknown>} */ (input)).map(([k, v]) => [
        k,
        k === listKey ? cutRows.map((r) => r.row) : v
      ])
    )
    return { left, lead, slim }
  }
  const levels = rule.slim === true ? SLIM_LEVELS : [null]
  /** @type {NonNullable<ReturnType<typeof at>> | null} */
  let last = null
  for (const level of levels) {
    const got = at(level)
    // Nothing to leave out at this level (every value is short enough): the next one may cut.
    if (got === null) continue
    last = got
    const truncated = { shown: list.length, total: list.length, chars, fieldsLeftOut: got.left }
    // Every row fits cut by field: the page is whole, so its cursor still leads to the next one.
    const whole = { ...got.slim, truncated, next: got.lead }
    if (JSON.stringify(whole).length <= rule.maxChars) return whole
  }
  return last === null ? null : narrowestOverflow(rule, listKey, input, chars, last, rawRows)
}

/**
 * Even cut by field the rows overflow: whole cut rows from the head, and the way to the rest as well.
 * @param {{ maxChars: number, next?: string, paged?: boolean, cursorKey?: string }} rule
 * @param {string} listKey
 * @param {unknown} input - the answer before the cut.
 * @param {unknown} chars - the size of the answer before the cut.
 * @param {{ left: string[], lead: string, slim: Record<string, unknown> }} got - the narrowest cut.
 * @param {unknown[] | null} rawRows
 * @returns {Record<string, unknown> | null}
 */
function narrowestOverflow(rule, listKey, input, chars, got, rawRows) {
  const { left, lead, slim } = got
  const room = rule.maxChars - JSON.stringify({ fieldsLeftOut: left, chars }).length
  const next = rule.next ? `${lead} ${rule.next}` : lead
  const again = budgetAnswer(slim, { maxChars: room, listKey, next })
  if (!isRecord(again) || !isRecord(again.truncated)) return null
  const { nextCursor: _past, truncated: t, next: _said, ...rest } = again
  const cutAgain = { ...rest, truncated: { ...t, chars, fieldsLeftOut: left } }
  return pagedCut(rule, listKey, input, cutAgain, lead, rawRows) ?? { ...cutAgain, next }
}

/** The characters one receipt value may show; a longer one is cut and the undo becomes a restore. */
const RECEIPT_VALUE_MAX = 300

/**
 * A value for a person to read: a string up to `max` chars, anything else as up to `max` chars of
 * its JSON; `cut` says whether it was shortened, `media` that it is a picture shown by `mediaView`.
 * @param {unknown} v
 * @param {number} max
 * @returns {{ value: unknown, cut: boolean, media: boolean }}
 */
function view(v, max) {
  if (v === undefined) return { value: null, cut: false, media: false }
  // Opt D (09/10/2026): a picture by its id, file name and alt (`mediaView`), not 300 characters of its
  // hashes. 🔒 A SUBSET, SO NEVER A VALUE TO WRITE BACK: `receiptOf` keeps the whole object for the undo.
  const media = mediaView(v)
  if (media !== null) return { value: media, cut: false, media: true }
  if (typeof v === 'string')
    return v.length <= max
      ? { value: v, cut: false, media: false }
      : { value: `${v.slice(0, max)}…`, cut: true, media: false }
  const json = JSON.stringify(v) ?? 'null'
  return json.length <= max
    ? { value: v, cut: false, media: false }
    : { value: `${json.slice(0, max)}…`, cut: true, media: false }
}

/** G4 (27/09/2026): what a live EmDash write's receipt says next — its `undo` is already beside it. */
export const EMDASH_RECEIPT_NEXT =
  'This is the receipt: nothing to read back. When every change asked is made, tell the customer what changed, in plain words. Keep undo to yourself: use it only if they ask to put it back.'

/**
 * The receipt of a direct `tracy_emdash` write: the entry, whether visitors see it, its new `_rev`,
 * and for `content_update` each field asked for, before and after — so "say what changed and how to
 * undo it" needs no read-back (D6′: the write's answer is the check). `before` is the pre-read the
 * flow made (`emdash-call.mjs`); the "before" values are what VISITORS saw (`liveData` when a draft
 * was waiting). Undo is exact where it can be (D14): the same call with the before values, or, when a
 * value was too long to show whole, EmDash's own `revision_restore` of the live revision.
 * @param {{ tool: string, args: Record<string, unknown>, answer: unknown, before?: unknown,
 *   foreignDraft?: string[] }} input - `answer` = the parsed MCP text part; `foreignDraft` = the
 *   fields of somebody else's waiting change this write merged onto or put live (`mixed`).
 * @returns {Record<string, unknown>}
 */
export function receiptOf({ tool, args, answer, before = null, foreignDraft = [] }) {
  const a = /** @type {Record<string, unknown>} */ (isRecord(answer) ? answer : {})
  const item = /** @type {Record<string, unknown>} */ (isRecord(a.item) ? a.item : {})
  const state = entryState(item)
  /** @type {Record<string, unknown>} */
  const out = {
    entry: {
      collection: args.collection ?? null,
      id: item.id ?? null,
      slug: item.slug ?? null,
      locale: item.locale ?? null
    },
    live: state === 'live',
    _rev: typeof a._rev === 'string' ? a._rev : revOf(item)
  }
  const b = /** @type {Record<string, unknown>} */ (isRecord(before) ? before : {})
  const wasLive = isRecord(before) && entryState(before) !== 'unpublished'
  if (tool === 'content_update') {
    const was = /** @type {Record<string, unknown>} */ (
      isRecord(b.liveData) ? b.liveData : isRecord(b.data) ? b.data : {}
    )
    const now = /** @type {Record<string, unknown>} */ (isRecord(item.data) ? item.data : {})
    const keys = Object.keys(isRecord(args.data) ? args.data : {})
    // Fields share the budget: one field shows 300 chars each side, thirty show fewer.
    const max = Math.max(
      24,
      Math.min(RECEIPT_VALUE_MAX, Math.floor(2200 / Math.max(1, 2 * keys.length)) - 20)
    )
    let cut = false
    /**
     * 🔒 THE WHOLE PICTURE A CHANGED PICTURE FIELD HELD, for an undo by value. Its `before` is shown as
     * `mediaView`'s subset (no `provider`, `mimeType`, `meta`), and writing that subset back would leave
     * a broken picture object (review of #1026). Used only when there is no live revision to restore.
     * @type {Record<string, unknown>}
     */
    const pictures = {}
    out.changed = Object.fromEntries(
      keys.map((k) => {
        const same = JSON.stringify(was[k]) === JSON.stringify(now[k])
        const after = view(now[k], max)
        // An unchanged field is not written back by the undo, so its shortened view never forces a restore.
        if (same) {
          cut ||= after.cut
          return [k, { unchanged: after.value }]
        }
        const prior = view(was[k], max)
        cut ||= prior.cut || after.cut
        if (prior.media) pictures[k] = was[k]
        return [k, { before: prior.value, after: after.value }]
      })
    )
    const liveRevision = typeof b.liveRevisionId === 'string' ? b.liveRevisionId : null
    const pictured = Object.keys(pictures).length > 0
    // A changed picture restores EmDash's live revision when there is one (exact, and no hashes in the
    // receipt); without one, the undo by value takes the whole picture from `undoData`.
    if ((cut || pictured) && liveRevision !== null)
      out.undo = `revision_restore {revisionId:"${liveRevision}"}, then content_update {collection, id, _rev:<the _rev it answers>, status:"published"}`
    else if (pictured) {
      out.undo =
        'content_update with the same collection and id, data = each field\'s before with undoData\'s whole value for a picture field, _rev = this _rev, status:"published"'
      out.undoData = pictures
    } else
      out.undo =
        'content_update with the same collection and id, data = each field\'s before, _rev = this _rev, status:"published"'
  }
  if (foreignDraft.length > 0) out.mixed = { draftFields: foreignDraft }
  // A write that left the entry unseen says so, with the one call that publishes it, ready to send.
  if (
    (state === 'pendingDraft' && tool === 'content_update') ||
    (state !== 'live' && tool === 'content_create')
  )
    out.next = `${tool === 'content_create' ? 'Created' : 'Staged'} as a draft: no visitor sees it yet. content_publish {collection:${JSON.stringify(args.collection ?? null)}, id:${JSON.stringify(item.id ?? null)}, _rev:${JSON.stringify(out._rev)}} puts it live, unless the customer asked for a draft.`
  if (isRecord(before) && !wasLive && state === 'live')
    out.note = 'This entry was not published before; it is live now.'
  // G4: a live write says it is the receipt, as `tracy_site`'s writes do (WRITE_RECEIPT_NEXT).
  if (out.next === undefined && state === 'live') out.next = EMDASH_RECEIPT_NEXT
  return out
}

/**
 * 🔒 D_UNDO (29/09/2026): THE ONE REVISION A `content_update` RECEIPT NAMED, MACHINE-READABLE. Its
 * `undo` is prose for the model (`receiptOf`, D14): `revision_restore {revisionId:"…"}, then
 * content_update {…}` only when a changed value was too long to show whole. The host remembers this
 * exact revisionId per entry per conversation (`emdash-call.mjs` `state.rememberUndo`) so a LATER
 * `revision_restore` of exactly that revision can be trusted as this conversation's own undo of its
 * own write — never any other revisionId, which stays a foreign draft to `draftGuard` as before (v6
 * EmDash L4-01: `revision_restore` succeeded but the `content_publish` after it was refused
 * PENDING_DRAFT every time, because nothing ever marked that restored draft as this conversation's).
 * One place parses the string `receiptOf` writes, so the two never drift apart.
 * @param {Record<string, unknown> | null | undefined} receipt - `receiptOf`'s own return value.
 * @returns {string | null}
 */
export function undoRevisionIdOf(receipt) {
  const undo = isRecord(receipt) ? receipt.undo : null
  if (typeof undo !== 'string') return null
  const m = /^revision_restore \{revisionId:"([^"]+)"\}/.exec(undo)
  return m ? m[1] : null
}

/**
 * The parsed EmDash answer, shaped for the model per tool; `raw: true` keeps EmDash's own shape.
 * Total: an answer of an unexpected shape falls back to the parsed data as it came. Never cuts —
 * `budget` does that, per tool.
 * @param {{ tool: string, args: Record<string, unknown>, data: unknown, raw?: boolean, before?: unknown,
 *   foreignDraft?: string[], revs?: boolean }} input
 * @returns {unknown}
 */
export function shapeAnswer({
  tool,
  args,
  data,
  raw = false,
  before = null,
  foreignDraft = [],
  revs = true
}) {
  if (raw || data === null || data === undefined) return data
  const d = /** @type {Record<string, unknown>} */ (isRecord(data) ? data : {})
  switch (tool) {
    case 'content_list':
      if (!Array.isArray(d.items)) return data
      return {
        items: d.items.map((it) => shapeRow(it, { revs })),
        ...(typeof d.nextCursor === 'string' && d.nextCursor !== '' ? { nextCursor: d.nextCursor } : {})
      }
    case 'content_get': {
      if (!isRecord(d.item)) return data
      const rev = typeof d._rev === 'string' ? d._rev : null
      const item = shapeRow(d.item, { rev, revs })
      return hasPendingDraft(d.item) ? { item, draftFields: draftFieldsOf(d.item) } : { item }
    }
    case 'content_update':
    case 'content_publish':
    case 'content_unpublish':
    case 'content_create':
      if (!isRecord(d.item)) return data
      return receiptOf({ tool, args, answer: d, before, foreignDraft })
    case 'schema_list_collections':
      if (!Array.isArray(d.items)) return data
      return {
        items: d.items.filter(isRecord).map((c) => ({
          slug: c.slug,
          label: c.label,
          ...(typeof c.description === 'string' && c.description !== ''
            ? { description: c.description }
            : {}),
          ...(typeof c.urlPattern === 'string' && c.urlPattern !== '' ? { urlPattern: c.urlPattern } : {})
        }))
      }
    case 'schema_get_collection':
      return Array.isArray(d.fields) ? slimSchema(d) : data
    case 'menu_get':
      if (!Array.isArray(d.items)) return data
      return {
        menu: { name: d.name, locale: d.locale ?? null, items: menuItemsForSet(d.items) },
        note: 'items are in the shape menu_set_items takes: send them all back with your change'
      }
    case 'menu_set_items':
      // Opt D: the labels set, in order, and the receipt's sentence — EmDash answers `{name, itemCount}`.
      return menuSetReceipt(args, d, EMDASH_RECEIPT_NEXT) ?? data
    case 'menu_list': {
      const menus = Array.isArray(data) ? data : Array.isArray(d.items) ? d.items : null
      if (menus === null) return data
      return {
        items: menus
          .filter(isRecord)
          .map((m) => ({ name: m.name, label: m.label, locale: m.locale ?? null, itemCount: m.itemCount }))
      }
    }
    default:
      return data
  }
}

// ─── Refusals: bare codes; `refusalNext` (site.mjs) writes every next step (D1) ───────────────

/**
 * EmDash's own refusal class, read from the text it answered: its `respondError` prefix
 * (`[CONFLICT] …`, `[NOT_FOUND] …`), or the class of a JSON-RPC error that has none. `refusalNext`
 * branches on it; nothing here writes the next step.
 * @param {unknown} text
 * @returns {string | null}
 */
export function emdashCodeOf(text) {
  const t = String(text ?? '').trim()
  const m = /^\[([A-Z_]+)\]/.exec(t)
  if (m) return m[1] === 'VALIDATION_ERROR' ? 'VALIDATION' : m[1]
  if (/_rev is required/.test(t)) return 'REV_MISSING'
  if (/-32602|Input validation error|Invalid arguments|Invalid order field|Malformed _rev/i.test(t))
    return 'VALIDATION'
  if (/-32601|Method not found|Tool \S+ not found/i.test(t)) return 'UNKNOWN_TOOL'
  return null
}

/**
 * The collection a refusal says this site does not have, or null when it names none. A
 * `[COLLECTION_NOT_FOUND]` always means one (EmDash 1.0.1's `content_list`; the pinned stand answered
 * `[NOT_FOUND]`), and a `[NOT_FOUND]` only when its message says "Collection '<name>' not found"
 * (`schema_get_collection`) — never for an entry, a menu or a redirect. '' when the message gave no name.
 * @param {Record<string, unknown>} refusal - a refusal carrying `emdash`, `error` and maybe `collection`.
 * @returns {string | null}
 */
export function missingCollectionOf(refusal) {
  if (refusal.code !== 'TOOL_FAILED') return null
  const named = /\bCollection\s+["']([^"']{1,80})["']\s+not found/i.exec(String(refusal.error ?? ''))?.[1]
  if (refusal.emdash === 'COLLECTION_NOT_FOUND')
    return named ?? (typeof refusal.collection === 'string' ? refusal.collection : '')
  return refusal.emdash === 'NOT_FOUND' && named !== undefined ? named : null
}

/** Collections one refusal lists, at most: a site has a dozen, and a runaway one must not fill the answer. */
const COLLECTIONS_LISTED = 40

/** A name without what a guess leaves out: case, `_`/`-`/spaces, and the word "page" ("News page" ~ `news_page`). */
const squash = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+page\b/g, '')
    .replace(/[^a-z0-9]+/g, '')

/**
 * How near a collection is to the name that was guessed: 3 when its slug, its label or the first
 * segment of its URL is that name (or its plural or singular), 2 when one holds the other, else 0.
 * @param {Record<string, any>} c - one row of `schema_list_collections`.
 * @param {string} guess
 */
function nearness(c, guess) {
  const g = squash(guess)
  if (g.length < 3) return 0
  const path = typeof c.urlPattern === 'string' ? (c.urlPattern.split('/').find(Boolean) ?? '') : ''
  let best = 0
  for (const name of [c.slug, c.label, path]) {
    const t = squash(name)
    if (t === '') continue
    if (t === g || `${t}s` === g || `${g}s` === t) best = 3
    else if (best < 2 && t.length >= 3 && (t.includes(g) || g.includes(t))) best = 2
  }
  return best
}

/**
 * 🔒 A COLLECTION THE SITE LACKS ANSWERS THE ONES IT HAS (round 7, 29/09/2026). Two runs named the
 * collection after the page — `post`, `news` — where this site's posts are `posts`, labelled "News".
 * EmDash's refusal (`[COLLECTION_NOT_FOUND]`) had no sentence of its own, so the model read the generic
 * "tell the customer … do not change the site another way", then spent a step (a
 * `schema_list_collections`, a 40,000-character `describe`) on what one list answers. The host reads
 * that list once, on this refusal only — as a menu name it lacks is answered with the menus it has (G3).
 * `collections` maps every slug to its label, so a label the customer says ("News") finds its slug; the
 * `next` names the nearest ones to the guess.
 * @param {unknown} listed - `runEmdashCall`'s answer to `schema_list_collections`: the shaped answer, or a refusal.
 * @param {string} guess - the name that was not found.
 * @returns {{ collections: Record<string, string>, next: string } | null} null when no list could be read.
 */
export function collectionsAnswer(listed, guess) {
  const items = isRecord(listed) && isRecord(listed.result) ? listed.result.items : null
  /** @type {Record<string, any>[]} */
  const rows = (Array.isArray(items) ? items : []).filter(
    (c) => isRecord(c) && typeof c.slug === 'string' && c.slug !== ''
  )
  if (rows.length === 0) return null
  const shown = rows.slice(0, COLLECTIONS_LISTED)
  const collections = Object.fromEntries(
    shown.map((c) => [c.slug, typeof c.label === 'string' && c.label !== '' ? c.label : c.slug])
  )
  const named = (/** @type {Record<string, any>} */ c) =>
    typeof c.label === 'string' && c.label !== '' && squash(c.label) !== squash(c.slug)
      ? `${c.slug} (${c.label})`
      : String(c.slug)
  const near = shown
    .map((c) => ({ c, score: nearness(c, guess) }))
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((r) => named(r.c))
  const base = 'The same call with one of the keys of collections (slug: label)'
  const closest = near.length > 0 ? `${base}; closest to "${guess.slice(0, 30)}": ${near.join(', ')}.` : ''
  return { collections, next: closest !== '' && closest.length <= 200 ? closest : `${base}.` }
}

/**
 * The ONE collection a `content_list` named by a guess means, or null (09/10/2026). A listing page's entries
 * live in the collection LABELLED like the page ("News" is `posts`), and the model lists them by the label
 * (`content_list {collection:"news"}`: 5 of the EmDash delete and add runs of bench hb, each a refused step
 * and a second list). Exactly one collection whose label is the guess, case aside, or whose slug is the
 * guess with or without its plural `s`, is that collection; two, or none, are a question the refusal's list
 * answers. The page's own entry (`news_page`, "News page") is never this: its label is not the guess.
 * @param {unknown} listed - `runEmdashCall`'s answer to `schema_list_collections`.
 * @param {string} guess
 * @returns {string | null}
 */
export function soleCollection(listed, guess) {
  const items = isRecord(listed) && isRecord(listed.result) ? listed.result.items : null
  const g = String(guess ?? '')
    .trim()
    .toLowerCase()
  if (g === '' || !Array.isArray(items)) return null
  const hits = items.filter(
    (c) =>
      isRecord(c) &&
      typeof c.slug === 'string' &&
      c.slug !== '' &&
      ((typeof c.label === 'string' && c.label.trim().toLowerCase() === g) ||
        c.slug === `${g}s` ||
        `${c.slug}s` === g)
  )
  return hits.length === 1 ? /** @type {string} */ (hits[0].slug) : null
}

/** The key `schema_list_collections` carries the record collections' fields under; the context row names it. */
export const RECORD_FIELDS_KEY = 'recordFields'

/** How many collections one list reads the fields of, at most: a site has a dozen, most of them pages. */
export const RECORD_COLLECTIONS_MAX = 6

/** The characters one collection's field summary may take; a longer list is cut at a field. */
export const RECORD_FIELDS_MAX = 400

/**
 * The collections of a `schema_list_collections` answer that hold RECORDS — the ones an "add a post, a
 * product, an opening" lands in — and so are worth a field summary: those whose address has `{slug}` (one
 * entry, one page: `/news/{slug}`), then those with no address at all (entries a page shows, `vacancies`),
 * each group in the order the site lists them, at most {@link RECORD_COLLECTIONS_MAX}. A collection whose
 * address has no `{slug}` IS a page (`/about`, `/`: its one entry holds that page's own words), and `site`
 * is the template's chrome (one entry per language, `servedLocales`): neither is a record collection.
 * @param {unknown} items - `result.items` of the shaped list: rows with `slug`, `label`, maybe `urlPattern`.
 * @returns {string[]} slugs
 */
export function recordCollectionsOf(items) {
  const rows = (Array.isArray(items) ? items : []).filter(
    (c) => isRecord(c) && typeof c.slug === 'string' && c.slug !== ''
  )
  const pattern = (/** @type {Record<string, any>} */ c) =>
    typeof c.urlPattern === 'string' ? c.urlPattern : ''
  const withPage = rows.filter((c) => pattern(c).includes('{slug}'))
  const bare = rows.filter((c) => pattern(c) === '' && c.slug !== 'site')
  return [...withPage, ...bare].slice(0, RECORD_COLLECTIONS_MAX).map((c) => c.slug)
}

/**
 * One collection's fields the way a person would list them for a colleague: `title:string required,
 * date:datetime, body:portableText` — the name a create writes under, its type, and "required" only where
 * it is. No label, option or validation (`schema_get_collection {slug}` has them, for the field that needs
 * them). Cut at a whole field when the list is longer than {@link RECORD_FIELDS_MAX}, ending `, +N more`.
 * @param {unknown} schema - the shaped `schema_get_collection` result (`slimSchema`): `fields` of `{slug, type, required?}`.
 * @returns {string | null} null when it holds no field with both a name and a type.
 */
export function recordFieldsOf(schema) {
  const fields = isRecord(schema) && Array.isArray(schema.fields) ? schema.fields : []
  const named = fields
    .filter(
      (f) =>
        isRecord(f) &&
        typeof f.slug === 'string' &&
        f.slug !== '' &&
        typeof f.type === 'string' &&
        f.type !== ''
    )
    .map((f) => `${f.slug}:${f.type}${f.required === true ? ' required' : ''}`)
  if (named.length === 0) return null
  const whole = named.join(', ')
  if (whole.length <= RECORD_FIELDS_MAX) return whole
  // Room for `, +NN more` after the last field kept.
  const room = RECORD_FIELDS_MAX - ', +999 more'.length
  let kept = ''
  let count = 0
  for (const one of named) {
    const next = count === 0 ? one : `${kept}, ${one}`
    if (next.length > room) break
    kept = next
    count += 1
  }
  return count === 0 ? null : `${kept}, +${named.length - count} more`
}

/** The tools whose schema requires `_rev` (0.38): refused before any read when it is missing. */
export const REV_TOOLS = new Set([
  'content_update',
  'content_publish',
  'content_unpublish',
  'content_discard_draft'
])

/**
 * What a destructive call would remove, in words (D34's `target`), and the verb for the error.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {{ name: string, size: number } | null} [group] - the entry's languages, when the delete is
 *   asked about as the whole entry (F3, `emdash-call.mjs`): its slug and how many rows it has.
 */
export function destructiveTarget(tool, args, group = null) {
  const s = (/** @type {unknown} */ v) =>
    typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 60) : '?'
  switch (tool) {
    case 'content_delete':
    case 'content_permanent_delete':
      return group !== null
        ? {
            verb: 'removes',
            target: `${s(args.collection)} "${s(group.name)}" in all ${group.size} languages`
          }
        : { verb: 'removes', target: `${s(args.collection)}/${s(args.id)}` }
    case 'content_discard_draft':
      return { verb: 'drops the unpublished changes of', target: `${s(args.collection)}/${s(args.id)}` }
    case 'schema_delete_collection':
      return { verb: 'removes', target: `the collection ${s(args.slug)} and every entry in it` }
    case 'schema_delete_field':
      return {
        verb: 'removes',
        target: `the field ${s(args.collection)}.${s(args.fieldSlug)} from every entry`
      }
    case 'media_delete':
      return { verb: 'removes', target: `media ${s(args.id)}` }
    case 'taxonomy_delete':
      return { verb: 'removes', target: `the taxonomy ${s(args.name)}` }
    case 'taxonomy_delete_term':
      return { verb: 'removes', target: `the term ${s(args.taxonomy)}/${s(args.termSlug)}` }
    case 'menu_delete':
      return {
        verb: 'removes',
        target: `the menu ${s(args.name)}${typeof args.locale === 'string' ? `@${s(args.locale)}` : ''}`
      }
    case 'byline_delete':
      return { verb: 'removes', target: `byline ${s(args.id)}` }
    case 'redirect_delete':
      return { verb: 'removes', target: `the redirect ${s(args.id)}` }
    default:
      return { verb: 'removes', target: s(args.id ?? args.name ?? args.slug) }
  }
}

/**
 * 🔒 AN UPDATE MERGES ONTO A WAITING DRAFT, AND PUBLISHING SHIPS IT (D12). EmDash's
 * `handleContentUpdate` starts from the draft revision's data when one exists, so
 * `status:"published"` — which the words road asks for — would put somebody's unfinished admin edit
 * live with the words asked for, silently: the receipt shows only the fields asked for. A draft this
 * conversation staged itself (`stagedHere`) is its own work and passes. An entry that is NOT live is
 * never guarded as someone's draft: publishing it is what publishing is for, and the receipt says it
 * went live. And `status:"draft"` on a live entry is not a draft — EmDash unpublishes it.
 * @param {{ tool: string, args: Record<string, unknown>, before: unknown, stagedHere: boolean }} input
 * @returns {Record<string, unknown> | null} a bare refusal, or null to go ahead.
 */
export function draftGuard({ tool, args, before, stagedHere }) {
  if (!isRecord(before)) return null
  const entry = {
    collection: args.collection ?? null,
    id: before.id ?? null,
    slug: before.slug ?? null,
    locale: before.locale ?? null
  }
  const name = `${String(entry.collection)}/${String(entry.slug ?? entry.id)}`
  if (tool === 'content_update' && args.status === 'draft' && entryState(before) !== 'unpublished')
    return {
      ok: false,
      code: 'WOULD_UNPUBLISH',
      tool,
      entry,
      error: clip(
        `status:"draft" takes ${name} off the site: EmDash unpublishes a live entry given that status.`
      )
    }
  const publishes = tool === 'content_publish' || (tool === 'content_update' && args.status === 'published')
  if (!publishes || stagedHere || entryState(before) !== 'pendingDraft') return null
  const draftFields = draftFieldsOf(before)
  return {
    ok: false,
    code: 'PENDING_DRAFT',
    tool,
    entry,
    draftFields,
    error: clip(
      `${name} holds an unpublished change nobody in this conversation made (${draftFields.slice(0, 5).join(', ') || 'no field differs'}); publishing would put it live too.`
    )
  }
}

// ─── The description ───────────────────────────────────────────────────────────────────────────

/**
 * `tracy_emdash`'s description (T9): the road itself, so `{list: true}` is the exception.
 *
 * 🔒 IT QUOTES THE WORDS ROAD VERBATIM. `EMDASH_WORDS_ROAD` is the one sentence the site context's
 * WORDS row quotes too: two texts in one prompt that say the same rule in different words drift
 * until they disagree (V6 C3: "always the ULID, never a slug" contradicted the locale fill). Measured
 * on r2: the old description told the model to start with `{list: true}` — 32 of 33 cases did, at
 * 49,977 chars re-read on every later step — and said "drafts until published", which cost a
 * `content_publish` per edit (8 of them refused on a slug id).
 *
 * T12 order (WHAT · WHEN · NOT FOR · CALL · RETURNS · REFUSALS), ≤ 1,500 chars for a multi-tool proxy.
 * Site-agnostic (CS2): no label, locale or version — the locale is said as "this site's own language".
 * WHAT and WHEN are one sentence, "or question" went (the site context sends a question about the
 * page to one `page.text` read), and the receipt and PENDING_DRAFT are each said once — the words
 * road says the answer is the receipt, and the refusal's own next says what a waiting change is.
 * Which languages a change reaches is the site context's (`EMDASH_LANGUAGE_RULE`), not this text's:
 * it would not fit the cap, and a second wording here is how two texts come to disagree.
 *
 * 🔒 "ITS ID INTO THE FIELD" IS WHAT EMDASH TAKES, and the `emdash-site` skill says the same words. An
 * image field is an object (`{id, provider, filename, …, meta:{storageKey}}` in the fixture), but
 * `handleContentUpdate`/`handleContentCreate` run `normalizeMediaFields` BEFORE validation (pinned
 * 0.37.0 `packages/core/src/emdash-runtime.ts`), which turns a bare local media id into that whole
 * object (`media/normalize.ts` `resolveLocalId`) — inside repeater items too. The skill used to say
 * "put the object it answers into the field": two picture rules in one prompt (review of P4, 25/09).
 */
export const EMDASH_DESCRIPTION = [
  // T9 lead (IX2, PR2): words already on a page take ONE call on `tracy_site`, before any read here.
  'Words on a page: tracy_site content.replace {find, replace}.',
  // "a page as read: tracy_site page.text" left (09/10/2026): the site context's "Seeing a page" row says it.
  // Not "and words the template code prints": a mode with a shell edits that code under /app and
  // rebuilds (ADR 0022); which mode can is the site context's EmDash row to say (28/09/2026).
  'Labels: not writable.',
  EMDASH_WORDS_ROAD,
  // 29/09/2026 (v6 L3-01): 20 s went on learning Portable Text for a page body; EmDash converts Markdown.
  'Menus: menu_get → menu_set_items.',
  // 29/09/2026 (v6): the redirect store and the SEO settings are read at request time — no rebuild.
  'Redirects: redirect_create {source, destination, type:301|302}, redirect_list, redirect_delete {id}. Verification tags: settings_update {seo:{googleVerification…}}; entry seo panels never show. No rebuild.',
  // 25/10/2026 (local round 18): a contact form's words live in the forms plugin, which no content tool reaches;
  // its arguments are in `{list:true, tools:["form_words"]}` (`FORM_TOOL_SCHEMAS`), the description has no room.
  'Forms: form_list, form_words.',
  // 27/09/2026: never a media_upload whose base64 or url the model types — 24–40 steps on the stand;
  // the host reads the customer's file (`upload.mjs`), and since 29/09/2026 a picture they attached in
  // the chat (`attachment`; v5 cause O: a 725 s timeout of base64 typed by hand on EmDash).
  "Pictures: the customer's → tracy_site media.upload {file} (Files tab) | {attachment} (in chat) → its id into the field. content_update edits/removes page image refs. media_delete removes library record + stored file; refs can break. It cannot revoke public URLs or purge edge caches; caches may still serve.",
  // "After a write, do not read back." left (09/10/2026): the site context's ONE JOB rule says it for every
  // platform, so it was said twice on every step. Its characters name the delete's own shape below: 17 of the
  // EmDash delete and add runs of bench hb fetched `{list:true, tools:["content_delete"…]}` first.
  '{list:true, tools:[names]}: schemas.',
  // A delete is called first and its CONFIRM_FIRST carries the question: a question of the agent's
  // own before the call opens nothing (`call-memory.mjs` `confirmed`), so asking first made the customer
  // answer twice (v5 V5-chat-08, V5-chat-03; 28/09/2026). Calling first is one question, and an entry in
  // N languages then goes in the one confirmed call (F3.2, `emdash-call.mjs`).
  // 09/10/2026 (bench hb, EmDash delete by chat): told nothing about languages, the agent read the entry's 40
  // translations and sent 20 deletes at once, one per row — each refused with the same question. One call
  // takes every language unless `locale` names one, as `content.delete` says on WordPress and Joomla.
  'CONFLICT → content_get for a fresh _rev; PENDING_DRAFT and CONFIRM_FIRST (content_delete {collection, id}: ONE call, all languages unless locale names one; call first) → ask_user_question, its ask only, then confirm:true.'
].join(' ')

/**
 * `tracy_emdash`'s parameters, beside its description so the two are one text (IX1 registers them).
 * Every key `normalizeEmdashShape` reads as Tracy's own is here, and nothing else (a test holds
 * both ways). Site-agnostic (CS2): `/site/<label>` is the literal placeholder, the same bytes on
 * every site. `confirm` and `allLocales` are consumed here and never reach EmDash.
 */
export const EMDASH_PARAMETERS = {
  type: 'object',
  properties: {
    tool: { type: 'string', description: 'An EmDash MCP tool name, e.g. content_update.' },
    arguments: {
      type: 'object',
      additionalProperties: true,
      description:
        "That tool's own arguments, as EmDash names them; this tool's description gives the content ones."
    },
    list: {
      type: 'boolean',
      description:
        "true → one line per tool this site publishes; with tools, those tools' full argument schemas."
    },
    tools: {
      type: 'array',
      items: { type: 'string' },
      description: 'With list: the tool names whose schemas you need.'
    },
    confirm: {
      type: 'boolean',
      description: 'true → what the customer agreed to after CONFIRM_FIRST or PENDING_DRAFT and their answer.'
    },
    allLocales: {
      type: 'boolean',
      description: 'true → a read covers every language (large); never on a write.'
    },
    raw: { type: 'boolean', description: "true → EmDash's answer unshaped: every column, full schemas." },
    siteKey: {
      type: 'string',
      description:
        "Leave this out: every call acts on this conversation's site (/site/<label>); naming another site is refused."
    },
    // H6: the person's numbered comment, taken off before the shape repair and echoed (`comment-echo.mjs`).
    comment: structuredClone(COMMENT_PARAMETER)
  }
}

/**
 * A 403 an OLDER Tracy EmDash template's guard answered (removed by ADR 0022), read back as `TEMPLATE_GUARD` so the agent is told the road that works — never a bare
 * SITE_REFUSED it has to interpret. Null for any other answer (`legacy-refusal.mjs`).
 * @param {number} status @param {string} body
 * @returns {{ ok: false, code: 'TEMPLATE_GUARD', platform: 'emdash', error: string } | null}
 */
export function templateRefusal(status, body) {
  if (status !== 403) return null
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && isLegacyStructureRefusal(parsed))
      return {
        ok: false,
        code: 'TEMPLATE_GUARD',
        platform: 'emdash',
        error: typeof parsed.error === 'string' ? parsed.error : 'refused by the template'
      }
  } catch {
    // not the template's answer
  }
  return null
}
