/**
 * Which model one conversation runs on, when the person may connect their own model plan
 * (tasks/todo-desktop-surface.md part B; Lee, 07/10/2026).
 *
 * Only the desktop app's own dsh, on the customer's machine, is given `customerRoutes`: an ordered
 * list of `{ provider, model }` routes served by `@goodandready/dsh-subscriptions` (provider ids
 * `claude`, `codex`, `copilot`, `grok`, `kimi`, …), one per plan the customer may connect.
 * Every other profile, the fleet's above all, has none, and then every conversation runs on the
 * deployment default exactly as before (gate `image-profile` keeps the key out of the fleet patch
 * and both bundles).
 *
 * The rules, each decided once per conversation and never revised while it runs:
 *
 *   - A NEW conversation takes the first route whose plan is connected — dsh-subscriptions holds a
 *     signed-in account for that provider (`ctx.subscriptions.available(provider)`, which never
 *     reveals a token) — and the deployment default when none is.
 *   - A conversation that ALREADY RAN keeps the route its last request was logged on — the default, or
 *     a plan route even if the profile no longer lists it — so a dsh restart does not move it either.
 *     A subagent follows the conversation that started it.
 *   - A conversation on a customer route whose plan is no longer connected FAILS with
 *     `PLAN_DISCONNECTED` ("reconnect"). It never falls back to the default: that would spend
 *     Tracy's model on a conversation the person started on their own plan, without telling them.
 *     A token the provider rejects mid-conversation surfaces as the provider's own AUTH error, on
 *     the same route, for the same reason.
 *
 * The default is still read per request (a changed deployment default is followed by every
 * conversation running on it), and a missing default fails closed, as before.
 */

/** RPC/error code for a conversation whose plan is no longer connected. */
export const PLAN_DISCONNECTED = 'tracy/plan-disconnected'

/**
 * @typedef {{ readonly provider: string, readonly model: string, readonly reasoningEffort?: string }} Selection
 * @typedef {{ readonly provider: string, readonly model: string }} Route
 * @typedef {{ available(provider: string): Promise<unknown> }} PlanAccounts
 *   dsh-subscriptions' `subscriptions` service: true when the provider has a signed-in account.
 * @typedef {{
 *   readonly id: string,
 *   readonly header?: { readonly origin?: unknown, readonly parentSession?: unknown },
 *   requestHeader?: () => { readonly config?: { readonly provider?: unknown, readonly model?: unknown } } | undefined,
 * }} SessionLike
 * @typedef {{ readonly kind: 'default' } | { readonly kind: 'customer', readonly route: Route }} Pin
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isName(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Read `customerRoutes` from the plugin config. Absent means none. Anything malformed throws, so a
 * profile that meant to offer plans and spelled it wrong fails at load instead of quietly running
 * every conversation on the default.
 * @param {unknown} raw - the plugin's config object.
 * @returns {readonly Route[]}
 */
export function customerRoutesOf(raw) {
  const value = raw !== null && typeof raw === 'object' ? /** @type {any} */ (raw).customerRoutes : undefined
  if (value === undefined) return Object.freeze([])
  if (!Array.isArray(value))
    throw new Error('tracy-mode-picker: customerRoutes must be a list of { provider, model }')
  return Object.freeze(
    value.map((entry, index) => {
      if (entry === null || typeof entry !== 'object' || !isName(entry.provider) || !isName(entry.model)) {
        throw new Error(`tracy-mode-picker: customerRoutes[${index}] must name both provider and model`)
      }
      return Object.freeze({ provider: entry.provider, model: entry.model })
    })
  )
}

/**
 * The error a conversation stops with when its plan is gone.
 * @param {Route} route
 * @returns {Error & { code: string }}
 */
function disconnected(route) {
  const error = /** @type {Error & { code: string }} */ (
    new Error(
      `The ${route.provider} plan this conversation runs on is no longer connected. ` +
        'Reconnect it in Settings › AI accounts to continue, or start a new conversation.'
    )
  )
  error.code = PLAN_DISCONNECTED
  return error
}

/**
 * @param {{
 *   customerRoutes: readonly Route[],
 *   deploymentDefault: () => Selection | undefined,
 *   plans: () => PlanAccounts | undefined,
 * }} deps - `deploymentDefault` answers undefined when the default cannot be read;
 *   `plans` answers undefined when the profile mounts no dsh-subscriptions.
 */
export function createSessionModels({ customerRoutes, deploymentDefault, plans }) {
  /** @type {Map<string, Pin>} */
  const pins = new Map()
  /** @type {Map<string, Promise<Pin>>} */
  const deciding = new Map()

  /** @returns {Selection} */
  const requireDefault = () => {
    const fixed = deploymentDefault()
    if (fixed === undefined) {
      throw new Error(
        'tracy-mode-picker: the deployment default model is unavailable; no request is sent on any other route'
      )
    }
    return fixed
  }

  /**
   * Whether the plan behind a route is connected. A service that is missing or cannot answer counts
   * as not connected: a new conversation then runs on the default, a running one asks to reconnect.
   * @param {string} provider
   */
  const connected = async (provider) => {
    const service = plans()
    if (service === undefined || typeof service.available !== 'function') return false
    try {
      return (await service.available(provider)) === true
    } catch {
      return false
    }
  }

  /**
   * The pin a conversation's logged request already implies, if it names a route this policy owns.
   * @param {SessionLike | undefined} session
   * @returns {Pin | undefined}
   */
  const loggedPin = (session) => {
    let config
    try {
      config = session?.requestHeader?.()?.config
    } catch {
      return undefined
    }
    if (config === undefined || !isName(config.provider) || !isName(config.model)) return undefined
    const fixed = deploymentDefault()
    if (fixed !== undefined && fixed.provider === config.provider && fixed.model === config.model) {
      return { kind: 'default' }
    }
    // Any other logged route is a plan this conversation ran on — listed today or dropped by the
    // operator since. It stays there: reconnect if its plan is gone, never another plan, never the default.
    return { kind: 'customer', route: Object.freeze({ provider: config.provider, model: config.model }) }
  }

  /** @returns {Promise<Pin>} */
  const decideFresh = async () => {
    for (const route of customerRoutes) {
      if (await connected(route.provider)) return { kind: 'customer', route }
    }
    return { kind: 'default' }
  }

  /**
   * The pin of one conversation, decided on first sight and remembered.
   * @param {string} id
   * @param {SessionLike | undefined} session
   * @returns {Promise<Pin>}
   */
  const pinOf = (id, session) => {
    const known = pins.get(id)
    if (known !== undefined) return Promise.resolve(known)
    const pending = deciding.get(id)
    if (pending !== undefined) return pending
    const parent = session?.header?.origin === 'subagent' ? session.header.parentSession : undefined
    const inherited = isName(parent) ? pins.get(parent) : undefined
    const decided = (async () => inherited ?? loggedPin(session) ?? (await decideFresh()))().then(
      (pin) => {
        pins.set(id, pin)
        deciding.delete(id)
        return pin
      },
      (error) => {
        deciding.delete(id)
        throw error
      }
    )
    deciding.set(id, decided)
    return decided
  }

  /**
   * The selection one request of this conversation must use.
   * @param {Pin} pin
   * @returns {Promise<Selection>}
   */
  const selectionOf = async (pin) => {
    if (pin.kind === 'default') return requireDefault()
    if (!(await connected(pin.route.provider))) throw disconnected(pin.route)
    return pin.route
  }

  return {
    /**
     * The model of the next request of one conversation. A request that names no conversation
     * (none is known to reach here) runs on the default: there is nothing to have connected a plan.
     * @param {SessionLike | undefined} session
     * @returns {Promise<Selection>}
     */
    async forSession(session) {
      if (customerRoutes.length === 0 || session === undefined) return requireDefault()
      return selectionOf(await pinOf(session.id, session))
    },
    /**
     * The model a conversation known only by id runs on (the model door has no session object).
     * Does not throw for a disconnected plan: the door only compares a pick against it.
     *
     * 🔒 IT NEVER PINS. Without the session object the logged route is unknown, so a conversation
     * not seen yet in this process is answered by a fresh decision and left undecided: its first
     * request still reads its log. Pinning here would let a selection made before that request move
     * a conversation logged on the customer's plan onto the default after a restart.
     * @param {string} sessionId
     * @returns {Promise<Selection | undefined>}
     */
    async forSessionId(sessionId) {
      if (customerRoutes.length === 0) return deploymentDefault()
      const pin = pins.get(sessionId) ?? (await (deciding.get(sessionId) ?? decideFresh()))
      return pin.kind === 'default' ? deploymentDefault() : pin.route
    }
  }
}
