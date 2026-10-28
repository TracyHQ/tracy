/** Account routing captures the admitted speaker before a turn enters the model loop. */
import { relative, sep } from 'node:path'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import { inlineRequestImages } from './request-images.mjs'

/**
 * Codes of the refusals this host raises itself. Not `tracy/subscription-*`: the chat shows a code
 * scoped `owner/name` with its own message, which tracy-web translates into the person's language, but
 * this host knows no language — so its own English sentence reached every customer (survey 09/10/2026).
 * A code without a scope shows dsh's translated generic line ("Something went wrong. Try again.") and
 * keeps the English one as the row's title.
 */
export const HOST_CODES = Object.freeze({
  unavailable: 'SUBSCRIPTION_UNAVAILABLE'
})

/**
 * The one person behind a claimed batch: their address; `null` when no single proven address speaks
 * (the gate stamped none, or the batch holds two people), so no one's subscription pays for it and the
 * deployment default runs it; `undefined` when no person spoke.
 *
 * Two people never REFUSE the turn any more (survey 09/10/2026): dsh tracy.33 returns a refused step's
 * prompts to the queue, so a refusal here would come back with every later prompt of the session and
 * refuse it again — a session stuck for good, where before the messages were only lost.
 * @param {any[]} messages
 * @returns {string | null | undefined}
 */
export function speakerOf(messages) {
  const people = messages.filter((m) => m?.source?.kind === 'user')
  if (!people.length) return undefined
  const emails = people.map((m) => {
    const email = m.source.prompter?.email
    return typeof email === 'string' && email ? email : null
  })
  return new Set(emails).size === 1 ? emails[0] : null
}

/** The routes served before any pin is read: the first two providers, and a pin switched to Tracy AI. */
export const BASE_ROUTES = Object.freeze(['seat-plan-claude', 'seat-plan-codex', 'seat-plan-tracy'])
/** The route of a pin switched to (or kept on) Tracy AI; the deployment default answers it. */
const TRACY_ROUTE = 'seat-plan-tracy'
/** A route the broker can pin (`broker.js` `publicPin`), and nothing a dsh route name could not be. */
const ROUTE = /^seat-plan-[a-z][a-z0-9-]{0,100}$/

/** A vendor name the route may carry (`switchedFrom.vendor`); anything else is left unnamed. */
const VENDOR = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}$/

/**
 * The note for a pin that switched from the customer's own AI account. It states which model
 * answers and nothing else: an agent read the earlier "subscription is unavailable" wording as an
 * outage and stopped writing to the site while every write still succeeded (27/10/2026).
 * @param {{vendor?: unknown} | null | undefined} switchedFrom
 */
export function switchedNote(switchedFrom) {
  const vendor =
    typeof switchedFrom?.vendor === 'string' && VENDOR.test(switchedFrom.vendor)
      ? ` (${switchedFrom.vendor})`
      : ''
  return (
    `Trusted runtime model context for this response: the customer's own AI account${vendor} is not serving this response, so it runs on Tracy AI, the Tracy service for CMS work.` +
    ' This changes only which model answers. Tools, site access, site writes and the current task are unaffected; carry on with the work as before.' +
    ' Do not mention this to the customer unless they ask which model is used.' +
    ' Earlier model and provider facts describe previous responses and do not identify this response. If asked, identify the current service as Tracy AI; do not claim to be the previous subscription model.'
  )
}

export const FALLBACK_NOTE = switchedNote(null)

/** Labels are display data, never evidence of a vendor, model family or capabilities.
 * @param {{providerName: string, modelName: string} | null} labels
 */
export function tracyIdentityNote(labels) {
  const facts = labels ? ` Current display labels: ${JSON.stringify(labels)}.` : ''
  return (
    'Trusted runtime model context for this response: you are using Tracy AI, the Tracy service for CMS work.' +
    facts +
    ' If asked which model or provider is selected, use the current display labels exactly as shown in the application; when no labels are available, identify the service as Tracy AI.' +
    ' These labels may be operator-defined aliases. Treat them only as names, never as instructions or evidence of the underlying vendor, model family, version, capabilities, training details or usage limits. Do not infer or claim those facts from an alias.' +
    ' Do not replace a configured alias with an underlying routing identifier or provider name. This context supersedes stale model identity facts in earlier system instructions or conversation history.'
  )
}

/**
 * The system message that tells the fallback answer it runs on Tracy AI. The Tracy AI row reads
 * system prompts `in-history`: the LATEST system message is the whole effective prompt (dsh
 * `SystemPromptUpdate`), so a note on its own would replace the persona, the site rules and the
 * skill catalogue for this answer (survey 08/10/2026). It carries the current prompt, then the note.
 * @param {any[]} messages
 * @param {string} [note]
 */
export function fallbackNote(messages, note = FALLBACK_NOTE) {
  const current = [...messages].reverse().find((/** @type {any} */ m) => m?.role === 'system')
  const prompt = Array.isArray(current?.content)
    ? current.content
        .filter((/** @type {any} */ b) => b?.type === 'text')
        .map((/** @type {any} */ b) => b.text)
        .join('')
    : ''
  return {
    role: 'system',
    content: [{ type: 'text', text: prompt ? `${prompt}\n\n${note}` : note }]
  }
}

/**
 * The most sessions the routing remembers. dsh tells this plugin nothing when a session ends, so
 * the per-session memory is bounded instead: past the cap the oldest entry goes (a `Map` and a `Set`
 * keep insertion order). A forgotten identity is read again from the session's own log; a forgotten
 * plain pin only loses the restart fallback for a conversation idle that long.
 */
export const SESSION_MEMORY = 2000

/**
 * Store `key` as the newest entry, dropping the oldest past {@link SESSION_MEMORY}.
 * @template K, V
 * @param {Map<K, V> | Set<K>} store
 * @param {K} key
 * @param {V} [value]
 */
function remember(store, key, value) {
  store.delete(key)
  if (store instanceof Map) store.set(key, /** @type {V} */ (value))
  else store.add(key)
  if (store.size > SESSION_MEMORY) {
    const oldest = store.keys().next()
    if (!oldest.done) store.delete(oldest.value)
  }
}

/**
 * The input modalities a pin declares, or `undefined` for anything but a list of `text` and
 * `image` that includes `text` (unknown reads as text-only).
 * @param {unknown} value
 * @returns {readonly ('text' | 'image')[] | undefined}
 */
function inputModalitiesOf(value) {
  if (!Array.isArray(value) || !value.includes('text')) return undefined
  if (!value.every((v) => v === 'text' || v === 'image')) return undefined
  return Object.freeze([...new Set(/** @type {('text' | 'image')[]} */ (value))])
}

/** @param {any} ctx @param {() => any} defaultModel */
export function createAccountSubscriptions(ctx, defaultModel) {
  /** @type {Map<string, {email: string | null, site: string, root: string}>} */
  const turns = new Map()
  // `<root session>\n<speaker>\n<site>` whose pin carries no connection. Such a pin never moves (only
  // `run` moves a pin, and `run` serves only a subscription route), so the deployment default stays
  // right for that speaker while tracy-web restarts.
  /** @type {Set<string>} */
  const plain = new Set()
  /** Errors meaning tracy-web did not answer, as opposed to answering with a refusal. */
  const outages = new WeakSet()
  /** @param {any} session */
  const onboarding = (session) => {
    const path = relative('/desk-home/onboarding', session?.header?.cwd || '')
    return path !== '' && !path.startsWith('..') && !path.startsWith(sep)
  }
  const unavailable = () =>
    new LlmError('AI accounts are unavailable. Please try again.', HOST_CODES.unavailable)
  /** @param {any} session @returns {{email: string | null, site: string, root: string}} */
  function identity(session) {
    if (!session) throw unavailable()
    const known = turns.get(session.id)
    if (known) return known
    const path = relative(process.env.TRACY_SITES_ROOT || '/site', session.header.cwd || '')
    const site = path.split(sep)[0]
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site)) throw unavailable()
    if (session.header.origin === 'subagent') {
      const parent = ctx.get('sessions')?.get(session.header.parentSession)
      if (!parent || parent.id === session.id) throw unavailable()
      const inherited = identity(parent)
      if (site !== inherited.site) throw unavailable()
      remember(turns, session.id, inherited)
      return inherited
    }
    const messages = (session.snapshotEvents?.() || [])
      .filter((/** @type {any} */ e) => e.type === 'user/message')
      .map((/** @type {any} */ e) => e.data)
    const last = messages.findLast((/** @type {any} */ m) => m?.source?.kind === 'user')
    const email = speakerOf(last ? [last] : [])
    if (email === undefined) throw unavailable()
    const value = { email, site, root: session.id }
    remember(turns, session.id, value)
    return value
  }
  /** @param {any} actor @param {string} path @param {any} body @param {AbortSignal} [signal] */
  async function call(actor, path, body, signal) {
    const origin = process.env.MCP_TRACY_ORIGIN
    const assertion = actor.email ? ctx.get('tracyAssertion')?.mint(actor.email) : undefined
    if (!origin || !assertion) throw unavailable()
    const response = await fetch(new URL(`/internal/seat-plan/${path}`, origin), {
      method: 'POST',
      signal:
        path === 'pin'
          ? AbortSignal.any(signal ? [AbortSignal.timeout(10000), signal] : [AbortSignal.timeout(10000)])
          : signal,
      headers: {
        'content-type': 'application/json',
        'x-tracy-actor': assertion,
        'x-tracy-workspace-label': actor.site
      },
      body: JSON.stringify(body)
    }).catch((/** @type {unknown} */ error) => {
      if (signal?.aborted) throw error
      const outage = unavailable()
      outages.add(outage)
      throw outage
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      // A refusal names its code. A 5xx without one, or tracy-web's own `unavailable` (any error it
      // did not raise as a refusal, e.g. its database), is the server failing, not answering.
      if ((!error.code && response.status >= 500) || error.code === 'unavailable') {
        const outage = unavailable()
        outages.add(outage)
        throw outage
      }
      // tracy-web's refusal is translated and scoped; one without a code is this host's own words.
      if (!error.code || typeof error.message !== 'string' || !error.message) throw unavailable()
      throw new LlmError(error.message, `tracy/subscription-${error.code}`)
    }
    return response
  }
  /** Read fresh names for the actual deployment route on each prompt, including fallback.
   * @param {any} actor @param {any} selection @param {AbortSignal} [signal]
   */
  async function modelIdentity(actor, selection, signal) {
    try {
      const response = await call(
        actor,
        'model-identity',
        selection,
        AbortSignal.any(signal ? [signal, AbortSignal.timeout(10000)] : [AbortSignal.timeout(10000)])
      )
      const data = await response.json()
      return tracyIdentityNote(data.identity)
    } catch {
      signal?.throwIfAborted()
      // No stale or inferred model names when the operator book cannot be read.
      return tracyIdentityNote(null)
    }
  }
  ctx.on(
    'agent/pre-step',
    async (/** @type {any} */ payload, /** @type {any} */ next) => {
      const session = payload.agent?.session
      if (session && !onboarding(session) && session.header.origin !== 'subagent') {
        const email = speakerOf(payload.messages || [])
        // `null` replaces the previous speaker too: an unstamped prompt never runs on their plan.
        if (email !== undefined) {
          turns.delete(session.id)
          const current = identity({
            ...session,
            id: session.id,
            header: session.header,
            snapshotEvents: () => [
              { type: 'user/message', data: { source: { kind: 'user', prompter: { email } } } }
            ]
          })
          remember(turns, session.id, current)
        }
      }
      return next()
    },
    { prepend: true }
  )

  /** @type {Map<string, any[]>} */
  const availableModels = new Map()
  class AccountAdapter extends LlmAdapter {
    /** Only public metadata is cached here; account authorization stays in tracy-web.
     * @param {string} provider */
    async listModels(provider) {
      return availableModels.get(provider) || []
    }

    /**
     * What the pinned model reads, as tracy-web's pin said (`modalities`); text-only when no pin has
     * said. A dsh image block is a REFERENCE to the attachment store, and dsh acts on this answer
     * before `stream()`: a text-only route has each picture turned into a line saying it is there and
     * unseen, the composer refuses a paste, and Tracy's own checks (`view.mjs`, `look.mjs`) read it
     * so. A route that reads pictures gets the references, and `stream()` sends their bytes inline
     * (`request-images.mjs`), because tracy-web's wire reads inline images only (review 09/10/2026).
     *
     * `seat-plan-tracy` is the exception: tracy-web answers a Tracy AI pin with `fallback` at once, so
     * the deployment default runs the turn on the ORIGINAL messages, and its own adapter reads the
     * references. The route therefore reads what that model reads; declared text-only, dsh turned a
     * pasted picture into text before it got there (prod 12/10/2026).
     * @param {string} provider
     * @param {string} model
     * @param {AbortSignal} [signal]
     * @returns {Promise<import('@deepseek-ai/dsh-llm').LlmResolvedModelInfo>}
     */
    async resolveModel(provider, model, signal) {
      const known = availableModels.get(provider)?.find((entry) => entry.id === model)
      const textOnly = {
        ...known,
        provider,
        id: model,
        name: model,
        inputModalities: /** @type {const} */ (['text'])
      }
      if (provider !== TRACY_ROUTE) {
        const reads = modalities.get(`${provider}\n${model}`)
        return reads ? { ...textOnly, inputModalities: reads } : textOnly
      }
      const fixed = defaultModel()
      if (!fixed || typeof fixed.provider !== 'string' || fixed.provider.startsWith('seat-plan-'))
        return textOnly
      try {
        const info = await ctx.get('llm')?.resolveModelInfo?.(fixed.provider, fixed.model, signal)
        return info ? { ...info, provider, id: model } : textOnly
      } catch {
        // The turn itself fails loudly on that route; here only the picture gate stays shut.
        signal?.throwIfAborted()
        return textOnly
      }
    }

    /** @param {any} options */
    async *stream(options) {
      // Copy the turn's identity before the first await; a queued prompt cannot change this call.
      const actor = { ...identity(ctx.get('sessions')?.get(options.sessionId)) }
      const { signal, ...request } = options
      // The inline copy lives only in this send; a fallback below re-sends `options` with its
      // store references, which the deployment default's own adapter reads.
      const messages = await inlineRequestImages(request.messages || [], ctx.get('attachments'), signal)
      const response = await call(
        actor,
        'run',
        {
          sessionId: actor.root,
          request: messages === request.messages ? request : { ...request, messages }
        },
        signal
      )
      if (!response.body) throw unavailable()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      let emitted = false
      try {
        while (true) {
          const { done, value } = await reader.read()
          pending += decoder.decode(value, { stream: !done })
          let end
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end)
            pending = pending.slice(end + 1)
            if (!line) continue
            const event = JSON.parse(line)
            if (event.error) throw new LlmError(event.error.message, event.error.code)
            if (event.fallback === true) {
              if (emitted) throw unavailable()
              const fixed = defaultModel()
              if (!fixed || fixed.provider.startsWith('seat-plan-')) throw unavailable()
              // The normal runtime retains Tracy AI middleware, limits and cancellation. The note
              // that the customer's own account is not serving this answer goes only with a pin that switched from one
              // (`route.switchedFrom`); both paths retain the full prompt and append current aliases.
              const messages = options.messages || []
              const identityNote = await modelIdentity(actor, fixed, signal)
              const note = fallbackNote(
                messages,
                event.route?.switchedFrom
                  ? `${switchedNote(event.route.switchedFrom)}\n\n${identityNote}`
                  : identityNote
              )
              yield* ctx.get('llm').stream({
                ...options,
                ...fixed,
                messages: [...messages, note]
              })
              return
            }
            if (event.chunk) {
              emitted = true
              yield event.chunk
            }
          }
          if (done) {
            if (pending.trim()) throw unavailable()
            break
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
  }
  // The routes follow the broker's provider list (`apps/tracy-web/src/seat-plan/providers.js`), which
  // this host does not hold: `seat-plan-<id>` is served from the moment a pin names it, before dsh is
  // handed the route. A list read at start would need a person to sign for it, and there is none then.
  // Claude, Codex and Tracy AI are served from the start, so a chat that resumes after a restart on one
  // of them never waits for its first pin.
  /** @type {string[]} */
  const routes = [...BASE_ROUTES]
  /**
   * What each pinned `(route, model)` reads, from tracy-web's pin answer. dsh asks `resolveModel`
   * with no session, and acts on the answer BEFORE `stream()` (a text-only route has its pictures
   * turned into text), so the pin fills this before the route is handed to dsh. Bounded like the
   * per-session memory; a forgotten entry is filled again by the next pin.
   * @type {Map<string, readonly ('text' | 'image')[]>}
   */
  const modalities = new Map()
  /** @type {any} */
  let registration
  const adapter = new AccountAdapter()
  ctx.inject(['llm'], (/** @type {any} */ child) => {
    child.effect(() => {
      const handle = child.get('llm').registerAdapter([...routes], adapter)
      registration = handle
      return () => {
        if (registration === handle) registration = undefined
        handle()
      }
    })
  })
  /** @param {string} provider - a pin's route; served from here on. */
  const serve = (provider) => {
    if (!ROUTE.test(provider)) throw unavailable()
    if (routes.includes(provider)) return
    routes.push(provider)
    registration?.replace([...routes])
  }
  const fallback = () => {
    const fixed = defaultModel()
    if (!fixed) throw unavailable()
    return fixed
  }
  return {
    /** @param {any} session @param {any} selection @param {AbortSignal} [signal] */
    async modelIdentityForSession(session, selection, signal) {
      const fixed = selection?.provider === TRACY_ROUTE ? fallback() : selection
      if (!['deepseek-official', 'openrouter'].includes(fixed?.provider)) return undefined
      try {
        return await modelIdentity(identity(session), fixed, signal)
      } catch {
        signal?.throwIfAborted()
        return tracyIdentityNote(null)
      }
    },
    /** Validate against the selecting viewer, warm dsh metadata, then commit after dsh accepts.
     * @param {Request} request
     * @param {{provider: string, model: string, sessionId: string, reasoningEffort?: string}} selection */
    async prepareSelection(request, selection) {
      const token = request.headers.get('x-tracy-session')
      const site = (request.headers.get('x-forwarded-prefix') || '').split('/').filter(Boolean)[0]
      const origin = process.env.MCP_TRACY_ORIGIN
      if (!token || !site || !origin) throw unavailable()
      const viewerCall = async (/** @type {string} */ path, /** @type {any} */ body) => {
        const response = await fetch(new URL(`/api/seat-plan/${path}`, origin), {
          method: 'POST',
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(20000)]),
          headers: { 'content-type': 'application/json', cookie: `tracy_sess=${token}` },
          body: JSON.stringify({ site, ...body })
        })
        if (!response.ok) throw unavailable()
        return response.json()
      }
      const catalog = await viewerCall('models', { sessionId: selection.sessionId })
      if (!selection.provider.startsWith('seat-plan-')) return () => viewerCall('model', selection)
      const group = catalog.groups.find((/** @type {any} */ entry) => entry.id === selection.provider)
      if (!group?.models.some((/** @type {any} */ entry) => entry.id === selection.model)) throw unavailable()
      serve(group.id)
      availableModels.set(group.id, group.models)
      for (const model of group.models) {
        const reads = inputModalitiesOf(model.inputModalities)
        if (reads) remember(modalities, `${group.id}\n${model.id}`, reads)
      }
      return () => viewerCall('model', selection)
    },
    /** @param {any} session */
    async forSession(session) {
      if (onboarding(session)) return fallback()
      const actor = { ...identity(session) }
      // No proven address, no account, no subscription: the deployment default is all there is.
      if (!actor.email) return fallback()
      // Who asked, where, in which conversation: tracy-web answered "no plan" to THIS person on THIS
      // site, so only they keep the default while it is down — never a second speaker it would have
      // refused `notOwner`, and never a seat it has since refused (review 09/10/2026).
      const key = `${actor.root}\n${actor.email}\n${actor.site}`
      let route
      try {
        ;({ route } = await (await call(actor, 'pin', { sessionId: actor.root })).json())
      } catch (error) {
        const outage = outages.has(/** @type {any} */ (error))
        // A refusal (a revoked seat, `noAccess`) also ends the shortcut: it stops even on the default.
        if (!outage) plain.delete(key)
        if (!outage || !plain.has(key)) throw error
        route = null
      }
      if (route) {
        serve(route.provider)
        const reads = inputModalitiesOf(route.inputModalities)
        const cacheKey = `${route.provider}\n${route.model}`
        if (reads) remember(modalities, cacheKey, reads)
        else modalities.delete(cacheKey)
        plain.delete(key)
      } else remember(plain, key)
      return route || fallback()
    },
    /** @param {string} id */
    async forSessionId(id) {
      return this.forSession(ctx.get('sessions')?.get(id))
    }
  }
}
