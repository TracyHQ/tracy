/** Account management over the viewer cookie; fleet execution over the signed actor assertion. */
import { Hono } from 'hono'
import { readProviders } from '../lib/llm-store.js'
import { allowedModelProviders, tracyModelIdentity } from '../lib/model-providers.js'
import { getCookie } from 'hono/cookie'
import { SESSION_COOKIE } from '../lib/session.js'
import { requireViewer } from '../lib/http.js'
import { verifyActor } from '../lib/actor.js'
import { readDesktopSetting } from '../lib/desktop-setting.js'
import { requestLanguage, translator } from '../lib/i18n/index.js'
import { createSeatPlanBroker, PlanFailure } from './broker.js'
import { requestPictures } from './wire/messages.js'

/** The run door's limits: the body in UTF-8 bytes, and the pictures of one request (every occurrence). */
export const RUN_BODY_BYTES = 16 * 1024 * 1024
export const RUN_PICTURES = 20
export const RUN_PICTURE_BASE64_BYTES = 12 * 1024 * 1024

/**
 * A request body as text, refused with 413 as soon as it passes `limit` UTF-8 bytes while it is
 * still being read (a JavaScript string's `.length` counts UTF-16 units, not what crossed the wire).
 * @param {Request} raw
 * @param {number} limit
 */
async function readCapped(raw, limit) {
  if (!raw.body) return ''
  const reader = raw.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > limit) {
      await reader.cancel().catch(() => {})
      throw new PlanFailure('invalid', 413)
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export function seatPlanRoutes({ pool, config, broker: supplied }) {
  const app = new Hono()
  const broker =
    supplied ??
    createSeatPlanBroker({
      pool,
      kek: config.seatPlanKek,
      policy: () => readDesktopSetting(pool, { strict: true })
    })
  const message = (c, error) => translator(requestLanguage(c))(`subscription.${error.code}`, error.params)
  /**
   * A refusal in the asker's language. The internal doors are called by the host's dsh, whose
   * request carries no `Accept-Language`, so their refusals took the default (English) whatever the
   * person reads (survey 09/10/2026); `language` is the account's own when the caller is known.
   */
  const refusal = (c, error, language) => {
    const e = error instanceof PlanFailure ? error : new PlanFailure('unavailable', 503)
    const text = language ? translator(language)(`subscription.${e.code}`, e.params) : message(c, e)
    // `reason` tells the host which limit a refusal is about (`images`), when it is one of those.
    const reason = typeof e.params?.reason === 'string' ? { reason: e.params.reason } : {}
    return c.json({ code: e.code, message: text, ...reason }, e.status)
  }
  async function caller(c, internal = false) {
    const email = internal
      ? await verifyActor(c.req.header('x-tracy-actor'), config.actorSecret)
      : await requireViewer(c, config)
    if (email instanceof Response) return email
    if (!email) throw new PlanFailure('notSignedIn', 401)
    return broker.account(email)
  }
  const management = (fn) => async (c) => {
    c.header('cache-control', 'no-store')
    try {
      const person = await caller(c)
      if (person instanceof Response) return person
      return c.json(await fn(c, person))
    } catch (error) {
      return refusal(c, error)
    }
  }
  const body = async (c) => {
    const raw = await c.req.text()
    if (raw.length > 16384) throw new PlanFailure('invalid', 400)
    try {
      const input = JSON.parse(raw)
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PlanFailure('invalid', 400)
      return input
    } catch {
      throw new PlanFailure('invalid', 400)
    }
  }
  app.post(
    '/api/seat-plan/models',
    management(async (c, p) => {
      const input = await body(c)
      return broker.catalog(p.id, input.site, input.sessionId)
    })
  )
  app.post(
    '/api/seat-plan/model',
    management(async (c, p) => {
      const input = await body(c)
      if (typeof input.provider !== 'string') throw new PlanFailure('invalid', 400)
      if (!input.provider.startsWith('seat-plan-')) {
        const allowed = allowedModelProviders(await readProviders(pool, config.sessionSecret))
        if (!allowed.has(input.provider)) throw new PlanFailure('unavailable', 409)
        return { route: await broker.selectDefault(p.id, input.site, input.sessionId) }
      }
      return { route: await broker.selectModel(p.id, input.site, input) }
    })
  )
  app.get(
    '/api/seat-plan/status',
    management((_c, p) => broker.status(p.id))
  )
  app.put(
    '/api/seat-plan/routing',
    management(async (c, p) => broker.saveRouting(p.id, await body(c)))
  )
  // `surface` is where the person signs in from: `desktop` (the desktop app catches a vendor's
  // localhost callback itself) or, for anything else, the web.
  app.post(
    '/api/seat-plan/connect/start',
    management(async (c, p) => {
      const input = await body(c)
      const surface = input.surface === 'desktop' ? 'desktop' : 'web'
      return broker.start(p.id, getCookie(c, SESSION_COOKIE) || '', input.provider, surface)
    })
  )
  app.post(
    '/api/seat-plan/connect/complete',
    management(async (c, p) => broker.complete(p.id, getCookie(c, SESSION_COOKIE) || '', await body(c)))
  )
  // A pasted API key (Kimi, GLM, Qwen): 200 with the status, else `{code, message}` with 400 `invalid`,
  // 401 `key` (the vendor refused the key), 403 `plan` (no plan behind it) or 502 `vendor`.
  app.post(
    '/api/seat-plan/connect/key',
    management(async (c, p) => {
      const input = await body(c)
      return broker.connectKey(p.id, input.provider, input.key)
    })
  )
  app.post(
    '/api/seat-plan/disconnect',
    management(async (c, p) => broker.disconnect(p.id, (await body(c)).connectionId))
  )
  app.get(
    '/api/seat-plan/session',
    management(async (c, p) => broker.inspect(p.id, c.req.query('site'), c.req.query('sessionId')))
  )
  // Only the signed host reads canonical routing fields; the answer contains display labels.
  app.post('/internal/seat-plan/model-identity', async (c) => {
    let person
    try {
      person = await caller(c, true)
      if (person instanceof Response) return person
      const selection = await body(c)
      if (
        typeof selection.provider !== 'string' ||
        typeof selection.model !== 'string' ||
        selection.provider.length > 120 ||
        selection.model.length > 300
      )
        throw new PlanFailure('invalid', 400)
      c.header('cache-control', 'no-store')
      return c.json({
        identity: tracyModelIdentity(await readProviders(pool, config.sessionSecret), selection)
      })
    } catch (error) {
      return refusal(c, error, person?.language)
    }
  })
  app.post('/internal/seat-plan/pin', async (c) => {
    /** @type {{ id: string, language?: string } | undefined} */
    let person
    try {
      const found = await caller(c, true)
      if (found instanceof Response) return found
      person = found
      const input = await body(c)
      return c.json({
        route: await broker.pin(person.id, c.req.header('x-tracy-workspace-label'), input.sessionId)
      })
    } catch (error) {
      return refusal(c, error, person?.language)
    }
  })
  app.post('/internal/seat-plan/run', async (c) => {
    let person, input
    try {
      person = await caller(c, true)
      input = JSON.parse(await readCapped(c.req.raw, RUN_BODY_BYTES))
      if (
        !input ||
        typeof input.sessionId !== 'string' ||
        !input.request ||
        !Array.isArray(input.request.messages)
      )
        throw new PlanFailure('invalid', 400)
      const pictures = requestPictures(input.request)
      if (pictures.external) throw new PlanFailure('invalid', 400, { reason: 'images' })
      if (pictures.count > RUN_PICTURES || pictures.base64Bytes > RUN_PICTURE_BASE64_BYTES)
        throw new PlanFailure('invalid', 413, { reason: 'images' })
    } catch (error) {
      return refusal(c, error, person instanceof Response ? undefined : person?.language)
    }
    const abort = new AbortController()
    const signal = AbortSignal.any([abort.signal, c.req.raw.signal])
    const encoder = new TextEncoder()
    const iterator = broker.run(
      person.id,
      c.req.header('x-tracy-workspace-label'),
      input.sessionId,
      input.request,
      signal
    )
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const next = await iterator.next()
          if (next.done) controller.close()
          else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`))
        } catch (error) {
          const e = error instanceof PlanFailure ? error : new PlanFailure('unavailable', 503)
          if (!signal.aborted)
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ error: { code: `tracy/subscription-${e.code}`, message: translator(person.language || requestLanguage(c))(`subscription.${e.code}`, e.params) } })}\n`
              )
            )
          controller.close()
        }
      },
      async cancel() {
        abort.abort()
        await iterator.return()
      }
    })
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' }
    })
  })
  return app
}
