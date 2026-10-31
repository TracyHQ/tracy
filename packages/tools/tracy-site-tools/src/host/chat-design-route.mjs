/**
 * THE CHAT ROUTE TO A DESIGN SYSTEM, AND ITS SWITCH (11/10/2026: "for now the only way in is the
 * Design system button"; plan `tasks/ke-hoach-nut-design-system.md`, section "Chat path"). The toolbar
 * button was removed 12/10/2026: the way in is now the Design system row on the site's start screen.
 *
 * A whole design system reaches a running site two ways: the Design system row on the site's start
 * screen (the Design system tab → tracy-web `POST /api/sites/:key/design-system`), and the
 * chat. The chat route is kept, behind the operator's switch `chat-design-system` (`/ops` › User
 * Interface, catalogue `@tracy/core/ui-switches`, OFF by default). What this plugin holds of it:
 *
 * - `tracy_design_system` (this file): the agent's way to the button's own door — read what the site
 *   wears, apply another system. tracy-web refuses the apply by name while the switch is off
 *   (`CHAT_DESIGN_SYSTEM_OFF`), so the door, not this tool, is the fence.
 * - `tracy_site theme.style`: WordPress's whole-look switch to another style variation, which the
 *   agent could reach directly. Refused here while the switch is off; the Build's own `style` stage
 *   reaches the same action through the loopback door and is not governed (a NEW site's look).
 * - The site context's line `- Design systems through the chat: off …` ({@link chatRouteLine}), so a
 *   customer asking in the chat for a new look, for a named system or with a pasted DESIGN.md is
 *   answered in one sentence that points at the start screen's row, and nothing is written.
 *
 * Element edits stay: the `- Design system:` line, `tracy_design_check` and the EmDash slot-pin checks
 * keep an edit relative to the system the site wears, whatever this switch says.
 *
 * 🔒 READ AT TRACY, FAIL CLOSED. The switch is read from Tracy's `/api/ui` (`chat-design-switch.mjs`); a
 * Tracy that does not answer is OFF, never on — the operator's default and the safe side. This module
 * stays free of that read (no catalogue import), because `site-context.mjs` — which other plugins'
 * host bundles import — takes its line from here.
 */
/** The switch, as the catalogue names it. */
export const CHAT_DS_SWITCH = 'chat-design-system'

/** The Design system row's own switch: whether the row the refusal points at is there. */
export const BUTTON_SWITCH = 'toolbar-design-system'

/**
 * What the agent says instead of applying, in the words tracy-web's door refuses with.
 * @param {boolean} button whether the Design system row is there to point at
 */
export function routeSentence(button) {
  return button
    ? // named as the screen labels it in the customer's interface language, never a name of the agent's own (the
      // design-system ladder, 15/10/2026: a Vietnamese customer was sent to "a design picker row" the screen does
      // not show). The translations live in the locale packages, not in a host bundle (check-language)
      "tell the customer in one plain sentence, in their language, to use the Design system row on the site's start screen, named by the label the screen shows in their interface language, never a description of your own"
    : 'tell the customer in one plain sentence, in their language, that changing the whole design system of a site is not available right now'
}

/**
 * The refusal a chat-route call gets while the switch is off.
 * @param {boolean} button
 */
export function chatRouteRefusal(button) {
  return {
    ok: false,
    code: 'CHAT_DESIGN_SYSTEM_OFF',
    error: `Applying a design system or a whole new look through the chat is turned off. Change nothing; ${routeSentence(button)}.`
  }
}

/**
 * The site context's line while the chat route is off, or null while it is on (the
 * `tracy-design-inspiration` skill then leads, with `tracy_design_system`). It names no tool: a
 * deferred tool must never be named where it is still hidden (`deferred-tools.mjs`).
 * @param {{ chat: boolean, button: boolean, library?: boolean } | null | undefined} routes
 * @returns {string | null}
 */
export function chatRouteLine(routes) {
  if (!routes || routes.chat) return null
  return (
    '- Design systems through the chat: OFF (the operator\'s switch). When the customer asks to apply or switch to a design system — by name, from a design template, or by pasting a DESIGN.md — or for a whole new look of the site (redesign, restyle, "make the whole site look like …"), ' +
    `change nothing, propose nothing, and ${routeSentence(routes.button)}; a new site gets its design when it is created (Add site). ` +
    'This is not an element edit: a button, a colour, a section or one page is still changed as asked, relative to the design system the site wears.'
  )
}

/**
 * 🔒 THE LIBRARY'S STATE BEFORE THE FIRST STEP (#259, survey 30/10/2026). With the design-system library
 * off, a "show me design styles" turn followed the skill's "Step 1 — Read the site" — five reads, ~48 s —
 * before the one call that decides what can be offered refused DESIGN_SYSTEMS_OFF. The site context says
 * it now, as it says the chat route's; null while the library is on or its state is unknown here. It
 * names no tool, for the same reason as {@link chatRouteLine}.
 * @param {{ library?: boolean } | null | undefined} routes
 * @returns {string | null}
 */
export function libraryLine(routes) {
  if (routes?.library !== false) return null
  return "- Design systems: OFF (the operator's switch): no design system is offered, read or previewed. A request to see design styles or a new look is answered from the finished templates published on Design templates, which the design library answers with at once: read nothing of the site first."
}

/** `tracy_design_system`'s description: within 400 characters of `name:` (`scripts/build-agent-tools.mjs`). */
export const DESIGN_SYSTEM_DESCRIPTION =
  'The site\'s design system through the Design system tab\'s own door. action "read": what the site wears and whether its template can wear one. action "apply" {id}: put a library design template (refero:<uuid>) on the running site, no rebuild; toolbar Undo reverts it. CONFIRM_FIRST asks the customer first. Refused CHAT_DESIGN_SYSTEM_OFF while the operator keeps the chat route off.'

export const DESIGN_SYSTEM_PARAMETERS = Object.freeze({
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['read', 'apply'] },
    id: { type: 'string', description: 'apply: library id, refero:<uuid>.' },
    confirm: {
      type: 'boolean',
      description: "apply: true only after the customer said yes to CONFIRM_FIRST's ask."
    }
  },
  required: ['action'],
  additionalProperties: false
})

/** A library id the door applies: Refero only since 12/10/2026 (tracy-web `REFERO_LIBRARY_ID`). */
const REFERO_ID = /^refero:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The arguments of one call, or the refusal that names what is wrong.
 * @param {unknown} args
 * @returns {{ ok: true, action: 'read' } | { ok: true, action: 'apply', id: string } | { ok: false, code: string, error: string }}
 */
export function designSystemArgs(args) {
  const a = args && typeof args === 'object' ? /** @type {Record<string, unknown>} */ (args) : {}
  if (a.action === 'read') return { ok: true, action: 'read' }
  if (a.action !== 'apply')
    return { ok: false, code: 'BAD_ACTION', error: 'action must be "read" or "apply".' }
  const id = typeof a.id === 'string' ? a.id.trim() : ''
  if (!REFERO_ID.test(id))
    return {
      ok: false,
      code: 'BAD_ID',
      error: 'apply needs id: a library design template id, refero:<uuid> (the Design system tab lists them).'
    }
  return { ok: true, action: 'apply', id }
}

/**
 * The request to the button's door, as the person who typed (or the viewer on a lane with no gate),
 * held to this conversation's site (`x-tracy-workspace-label`) and named as this conversation's
 * (`x-tracy-session`: the door tells a chat call from a press by it). Null without a plan or a key.
 * @param {{ as: 'prompter', assertion: string, sign?: () => string | null } | { as: 'viewer', cookie: string } | null} plan
 * @param {{ origin: string | null | undefined, siteKey: string | null, label: string | null, sessionId: string | null }} where
 * @param {{ action: 'read' } | { action: 'apply', id: string }} call
 * @returns {{ url: string, init: { method: string, headers: Record<string, string>, body?: string } } | null}
 */
export function designSystemRequest(plan, where, call) {
  const origin = typeof where.origin === 'string' ? where.origin.trim().replace(/\/+$/, '') : ''
  if (!plan || origin === '' || !where.siteKey) return null
  /** @type {Record<string, string>} */
  const headers =
    plan.as === 'prompter'
      ? { 'x-tracy-actor': plan.sign?.() ?? plan.assertion, accept: 'application/json' }
      : { cookie: plan.cookie, accept: 'application/json' }
  if (where.label) headers['x-tracy-workspace-label'] = where.label
  if (where.sessionId) headers['x-tracy-session'] = where.sessionId
  const url = `${origin}/api/sites/${encodeURIComponent(where.siteKey)}/design-system`
  if (call.action === 'read') return { url, init: { method: 'GET', headers } }
  return {
    url,
    init: {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: call.id })
    }
  }
}

/**
 * The door's answer as the model reads it: the body, with the HTTP status beside a refusal.
 * @param {{ url: string, init: Record<string, any> }} request
 * @param {typeof fetch} [http]
 * @param {number} [timeoutMs] past the door's own wait for an apply (130 s, `DOOR_WAIT_MS`)
 */
export async function callDesignSystemDoor(request, http = fetch, timeoutMs = 140_000) {
  let res
  try {
    res = await http(request.url, { ...request.init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    return {
      ok: false,
      code: 'COWORK_WEB_UNREACHABLE',
      error: error instanceof Error ? error.message : String(error)
    }
  }
  /** @type {any} */
  let body
  try {
    body = await res.json()
  } catch {
    body = { code: 'COWORK_WEB_BAD_RESPONSE' }
  }
  if (res.ok) return body && typeof body === 'object' ? body : { ok: true }
  return { ok: false, httpStatus: res.status, ...(body && typeof body === 'object' ? body : {}) }
}
