/**
 * Session model selection policy. dsh validates session-local picks; Tracy web filters deployment
 * availability and checks connected account ownership before a personal route can be selected.
 * The host default remains operator-controlled and initializeDefaultModel is always refused.
 * Account subscriptions can override an agent request with its authorized account route. Plain
 * sessions retain dsh's selection, including changes made within the same conversation.
 */

import { createSessionModels, customerRoutesOf } from './session-models.mjs'
import { createAccountSubscriptions } from './account-subscriptions.mjs'

export { PLAN_DISCONNECTED } from './session-models.mjs'

/** The two unary Remote endpoints this policy owns on the shared `/api` channel. */
export const SELECT_MODEL = 'session/selectModel'
export const INITIALIZE_DEFAULT_MODEL = 'session/initializeDefaultModel'
export const LOCKED_ENDPOINTS = Object.freeze([SELECT_MODEL, INITIALIZE_DEFAULT_MODEL])

/** RPC error codes this policy answers with; the refusal carries no route the host could reach. */
export const MODEL_LOCKED = 'tracy/model-locked'
export const DEFAULT_UNAVAILABLE = 'tracy/model-default-unavailable'

/**
 * @typedef {{ readonly provider: string, readonly model: string, readonly reasoningEffort?: string }} Selection
 * @typedef {{ currentSelection(): unknown }} DefaultModelSource
 * @typedef {{ readonly code: string, readonly message: string, readonly details: Record<string, unknown> }} RpcFailure
 * @typedef {{
 *   namespace: string,
 *   method: string,
 *   args: Record<string, unknown>,
 *   signal?: AbortSignal,
 * }} InvokeRequest
 * @typedef {{ provider?: string, model?: string, reasoningEffort?: string }} CallConfig
 * @typedef {{ sections?: unknown, variables?: unknown }} Assembly
 * @typedef {{ invoke(request: InvokeRequest): Promise<unknown> }} Gateway
 * @typedef {{
 *   path: string,
 *   methods: readonly ('GET' | 'HEAD' | 'POST')[],
 *   requestBody: 'buffered' | 'streaming',
 *   fetch: (request: Request) => Promise<Response>,
 * }} FetchRoute
 * @typedef {{
 *   get(name: string): unknown,
 *   on(name: string, listener: (...args: any[]) => unknown, options?: { prepend?: boolean }): unknown,
 *   inject(names: string[], callback: (ctx: HostContext) => void): unknown,
 *   connection: { fetch: { register(route: FetchRoute): unknown } },
 * }} HostContext
 *   The part of dsh's cordis `Context` this file uses; the package has no type dependency on dsh.
 * @typedef {{
 *   prepareSelection?: (request: Request, selection: any) => Promise<(() => Promise<unknown>) | undefined>,
 *   sessionModel: (sessionId: string) => Promise<Selection | undefined>,
 *   invoke: () => ((request: InvokeRequest) => Promise<unknown>) | undefined,
 * }} DoorDeps
 *   `sessionModel` answers the one route a conversation may be put on: the deployment default, or
 *   on a profile with `customerRoutes` the conversation's own (`session-models.mjs`); undefined when
 *   it cannot be read.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isName(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * The deployment default, or `undefined` when it cannot be read as one complete route.
 * @param {DefaultModelSource | undefined} source - `ctx.agentDefaultModel`.
 * @returns {Selection | undefined}
 */
export function deploymentDefault(source) {
  if (source === undefined || typeof source?.currentSelection !== 'function') return undefined
  let raw
  try {
    raw = source.currentSelection()
  } catch {
    return undefined
  }
  if (!isPlainObject(raw)) return undefined
  const { provider, model, reasoningEffort } = raw
  if (!isName(provider) || !isName(model)) return undefined
  if (reasoningEffort !== undefined && !isName(reasoningEffort)) return undefined
  return Object.freeze({ provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) })
}

/**
 * Whether a requested route is the deployment default. An absent effort asks for nothing beyond
 * the route, so it matches; a named effort must be the default's own.
 * @param {{ provider: unknown, model: unknown, reasoningEffort?: unknown }} requested
 * @param {Selection} fixed
 * @returns {boolean}
 */
export function isDeploymentDefault(requested, fixed) {
  if (requested.provider !== fixed.provider || requested.model !== fixed.model) return false
  return requested.reasoningEffort === undefined || requested.reasoningEffort === fixed.reasoningEffort
}

/**
 * Put one request configuration on the deployment default. An effort the chain inherited is
 * dropped unless the default names one, the same rule dsh's own selection applies.
 * @template {{ provider?: string, model?: string, reasoningEffort?: string }} T
 * @param {T} config - the configuration the rest of the chain produced.
 * @param {Selection} fixed
 * @returns {T}
 */
export function onDefault(config, fixed) {
  const { reasoningEffort: _inherited, ...rest } = config
  return /** @type {T} */ ({
    ...rest,
    provider: fixed.provider,
    model: fixed.model,
    ...(fixed.reasoningEffort === undefined ? {} : { reasoningEffort: fixed.reasoningEffort })
  })
}

/**
 * @param {string} rpcId
 * @param {{ ok: true, value?: unknown } | { ok: false, error: RpcFailure }} result
 * @returns {Response}
 */
function rpcResponse(rpcId, result) {
  return Response.json({ type: 'server-response', rpcId, result })
}

/**
 * @param {string} rpcId
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [details]
 * @returns {Response}
 */
function refuse(rpcId, code, message, details = {}) {
  return rpcResponse(rpcId, { ok: false, error: { code, message, details } })
}

/**
 * A thrown Remote failure as the envelope the gateway itself would send (`rpcFailure`).
 * @param {unknown} error
 * @returns {RpcFailure}
 */
function failureOf(error) {
  if (error !== null && typeof error === 'object') {
    const { code, message, details } = /** @type {Record<string, unknown>} */ (error)
    if (typeof code === 'string' && typeof message === 'string' && isPlainObject(details)) {
      return { code, message, details }
    }
  }
  return {
    code: 'gateway/internal',
    message: error instanceof Error ? error.message : String(error),
    details: {}
  }
}

/**
 * Read one Connection client-request envelope the way dsh's own RPC handler does
 * (`client-connection` `rpcFetchHandler`), so a malformed call gets the same kind of answer.
 * @param {Request} request
 * @param {string} endpoint
 * @returns {Promise<{ rpcId: string, payload: unknown } | { response: Response }>}
 */
async function readEnvelope(request, endpoint) {
  if (request.method !== 'POST') return { response: new Response('not found', { status: 404 }) }
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    return { response: new Response('content type must be application/json', { status: 415 }) }
  }
  /** @type {unknown} */
  let body
  try {
    body = await request.json()
  } catch {
    return { response: new Response('body is not JSON', { status: 400 }) }
  }
  const rawId = isPlainObject(body) ? body.rpcId : undefined
  const rpcId = typeof rawId === 'string' ? rawId : 'invalid-request'
  if (
    !isPlainObject(body) ||
    body.type !== 'client-request' ||
    typeof body.rpcId !== 'string' ||
    typeof body.method !== 'string' ||
    !('payload' in body)
  ) {
    return {
      response: refuse(rpcId, 'gateway/bad-request', 'invalid client-request message', { issues: [] })
    }
  }
  if (body.method !== endpoint) {
    return {
      response: refuse(
        rpcId,
        'gateway/bad-request',
        `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
        { issues: [] }
      )
    }
  }
  return { rpcId, payload: body.payload }
}

/**
 * The `request` argument of a `selectModel` call, or `undefined` when the payload is not one.
 * @param {unknown} payload
 * @returns {{ sessionId: string, provider: string, model: string, reasoningEffort?: string } | undefined}
 */
function selectRequestOf(payload) {
  if (!isPlainObject(payload) || Object.keys(payload).length !== 1 || !isPlainObject(payload.args)) {
    return undefined
  }
  const { args } = payload
  if (Object.keys(args).length !== 1 || !isPlainObject(args.request)) return undefined
  const { sessionId, provider, model, reasoningEffort } = args.request
  if (!isName(sessionId) || typeof provider !== 'string' || typeof model !== 'string') return undefined
  if (reasoningEffort !== undefined && typeof reasoningEffort !== 'string') return undefined
  return { sessionId, provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}

/**
 * Serve `POST /api/session/selectModel`: authorize the account route, forward to dsh for model
 * validation, then persist the account pin only after the selection succeeds.
 * @param {Request} request
 * @param {DoorDeps} deps
 * @returns {Promise<Response>}
 */
export async function serveSelectModel(request, deps) {
  const read = await readEnvelope(request, SELECT_MODEL)
  if ('response' in read) return read.response
  const { rpcId } = read
  const asked = selectRequestOf(read.payload)
  if (asked === undefined) {
    return refuse(
      rpcId,
      'gateway/arguments-invalid',
      'selectModel expects { args: { request: { sessionId, provider, model, reasoningEffort? } } }'
    )
  }
  const invoke = deps.invoke()
  if (invoke === undefined) {
    return refuse(rpcId, 'gateway/service-unavailable', 'Remote invocation is unavailable.')
  }
  try {
    const commit = await deps.prepareSelection?.(request, asked)
    const value = await invoke({
      namespace: 'session',
      method: 'selectModel',
      args: { request: asked },
      signal: request.signal
    })
    await commit?.()
    return rpcResponse(rpcId, value === undefined ? { ok: true } : { ok: true, value })
  } catch (error) {
    return rpcResponse(rpcId, { ok: false, error: failureOf(error) })
  }
}

/**
 * Serve `POST /api/session/initializeDefaultModel`: always refused.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function serveInitializeDefaultModel(request) {
  const read = await readEnvelope(request, INITIALIZE_DEFAULT_MODEL)
  if ('response' in read) return read.response
  return refuse(
    read.rpcId,
    MODEL_LOCKED,
    'The default model is set by the deployment and cannot be changed here.'
  )
}

/**
 * The conversation an `agent/request` payload or a `system-prompt/assemble` context belongs to.
 * @param {unknown} carrier
 * @returns {import('./session-models.mjs').SessionLike | undefined}
 */
function sessionOf(carrier) {
  const session = /** @type {any} */ (carrier)?.agent?.session
  return session !== null && typeof session === 'object' && isName(session.id) ? session : undefined
}

/**
 * Install both holds on the host.
 * @param {HostContext} ctx - the plugin's context.
 * @param {unknown} [config] - the plugin's row config; only `customerRoutes` is read
 *   (`session-models.mjs`), and a malformed one throws here, failing the load.
 */
export function installModelPolicy(ctx, config) {
  const defaultModel = () => /** @type {DefaultModelSource | undefined} */ (ctx.get('agentDefaultModel'))
  // `subscriptions` (dsh-subscriptions) is read through `get`, not injected: the policy must load on
  // a profile without it, and only a profile with `customerRoutes` ever asks it anything.
  const models =
    /** @type {any} */ (config)?.accountSubscriptions === true
      ? createAccountSubscriptions(ctx, () => deploymentDefault(defaultModel()))
      : createSessionModels({
          customerRoutes: customerRoutesOf(config),
          deploymentDefault: () => deploymentDefault(defaultModel()),
          plans: () => /** @type {any} */ (ctx.get('subscriptions'))
        })

  ctx.on(
    'agent/request',
    async (/** @type {unknown} */ payload, /** @type {() => Promise<CallConfig>} */ next) => {
      const resolved = await next()
      if (/** @type {any} */ (config)?.accountSubscriptions === true) {
        const route = await models.forSession(sessionOf(payload))
        return route.provider.startsWith('seat-plan-') ? onDefault(resolved, route) : resolved
      }
      return customerRoutesOf(config).length > 0
        ? onDefault(resolved, await models.forSession(sessionOf(payload)))
        : resolved
    },
    { prepend: true }
  )

  ctx.on(
    'system-prompt/assemble',
    async (
      /** @type {unknown} */ _assembly,
      /** @type {unknown} */ context,
      /** @type {() => Promise<Assembly>} */ next
    ) => {
      const assembled = await next()
      if (!(/** @type {any} */ (config)?.accountSubscriptions) && customerRoutesOf(config).length === 0)
        return assembled
      const variables = assembled?.variables
      if (!isPlainObject(variables) || !('provider' in variables || 'model' in variables)) return assembled
      // A conversation that cannot be answered (no default, plan gone) fails at its request with
      // the reason; the prompt is left as it is rather than failing first with a vaguer one.
      /** @type {Selection | undefined} */
      let fixed
      try {
        if (/** @type {any} */ (config)?.accountSubscriptions === true) {
          const note = await /** @type {any} */ (models).modelIdentityForSession(
            sessionOf(context),
            variables,
            /** @type {any} */ (context)?.signal
          )
          return note && Array.isArray(assembled.sections)
            ? {
                ...assembled,
                sections: [
                  ...assembled.sections,
                  { name: 'TRACY_MODEL_IDENTITY', text: note, interpolate: false }
                ]
              }
            : assembled
        }
        fixed = await models.forSession(sessionOf(context))
      } catch {
        const abortedContext = /** @type {any} */ (context)
        abortedContext?.signal?.throwIfAborted()
        fixed = undefined
      }
      if (fixed === undefined) return assembled
      return { ...assembled, variables: { ...variables, provider: fixed.provider, model: fixed.model } }
    },
    { prepend: true }
  )

  ctx.inject(['connection'], (/** @type {HostContext} */ connectionCtx) => {
    /** @type {DoorDeps} */
    const deps = {
      sessionModel: (sessionId) => models.forSessionId(sessionId),
      prepareSelection: (request, selection) =>
        /** @type {any} */ (models).prepareSelection?.(request, selection),
      invoke: () => {
        const gateway = /** @type {Gateway | undefined} */ (connectionCtx.get('typertGateway'))
        return gateway === undefined ? undefined : (request) => gateway.invoke(request)
      }
    }
    // Each registration is an effect of `connectionCtx`'s fiber (`HostConnectionService`), so the
    // routes leave with this plugin, and a second owner of either path fails the load loudly.
    const register = (
      /** @type {string} */ endpoint,
      /** @type {(request: Request) => Promise<Response>} */ fetch
    ) =>
      connectionCtx.connection.fetch.register({
        path: `/api/${endpoint}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch
      })
    register(SELECT_MODEL, (request) => serveSelectModel(request, deps))
    register(INITIALIZE_DEFAULT_MODEL, (request) => serveInitializeDefaultModel(request))
  })
}
