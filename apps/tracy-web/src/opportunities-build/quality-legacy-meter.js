/** Meter legacy transports while retaining the native Messages bytes and stream semantics. */
import { createHash } from 'node:crypto'
import { legacyMessagesUsage, legacyRequestBudget, legacyUsageCost } from './quality-legacy-wire.js'
import { runQualityAttempt } from './quality-runs.js'

const fail = (code) => Object.assign(new Error(code), { code })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const filesPath = (path) => path.split('/').includes('files')
const localError = (code, status = 409) =>
  Response.json({ error: { type: 'invalid_request_error', message: code } }, { status })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function boundedBytes(body, maximum, code) {
  if (!body) return new Uint8Array()
  const reader = body.getReader(),
    parts = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return Buffer.concat(parts, length)
      length += chunk.value.byteLength
      if (length > maximum) throw fail(code)
      parts.push(chunk.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}

/**
 * resolveContext authenticates the stand capability and resolves its immutable root/session/site.
 * resolveModel returns the existing provider-book key in memory; no key enters durable metadata.
 * checkAllowed validates the logical action, live permission, Stop state and capability on each boundary.
 */
export function createQualityLegacyMeter({
  pool,
  store,
  ledger,
  resolveContext,
  resolveModel,
  checkAllowed,
  fetchImpl = fetch,
  now = Date.now
}) {
  async function rootAllowed(context) {
    await checkAllowed(context)
    const root = (
      await pool.query(
        `select i.state,i.deadline,exists(select 1 from wo_quality_attempt a
          where a.intent_id=i.id and (a.state='uncertain' or
            (a.state='running' and a.lease_until<=$3))) as uncertain
        from wo_quality_intent i where i.id=$1 and i.account_id=$2`,
        [context.run.intent_id, context.run.account_id, new Date(now())]
      )
    ).rows[0]
    if (!root || ['cancelled', 'failed'].includes(root.state)) throw fail('QUALITY_RUN_CLOSED')
    if (new Date(root.deadline).getTime() <= now()) throw fail('QUALITY_RUN_DEADLINE')
    if (root.uncertain) throw fail('QUALITY_ROOT_UNCERTAIN')
  }

  async function transport(request) {
    const path = new URL(request.url).pathname
    // Native Files recovery receives an ordinary non-quota 400 and falls back to inline images.
    if (filesPath(path)) return localError('LEGACY_FILES_DISABLED_INLINE_ONLY', 400)
    if (request.method !== 'POST') return localError('LEGACY_METHOD_UNSUPPORTED', 405)
    const flavor = path.endsWith('/chat/completions') ? 'chat' : 'messages'
    if (!path.endsWith('/v1/messages') && flavor !== 'chat') return localError('LEGACY_PATH_UNSUPPORTED', 404)
    const attemptId = request.headers.get('x-tracy-quality-attempt')
    if (!uuid.test(attemptId ?? '')) return localError('LEGACY_ATTEMPT_ID_REQUIRED', 400)
    const context = await resolveContext(request)
    if (
      !context?.run?.id ||
      !context.run.intent_id ||
      !context.run.account_id ||
      !context.sessionId ||
      !context.siteId ||
      context.run.input?.schemaVersion !== 'tracy-wo-legacy-meter/v1'
    )
      throw fail('LEGACY_CONTEXT_INVALID')
    await rootAllowed(context)
    const config = await resolveModel(context, flavor)
    if (!config?.hash || !config.providerId || !config.apiKey) throw fail('LEGACY_MODEL_UNAVAILABLE')
    const raw = await boundedBytes(request.body, 48 * 1024 * 1024, 'QUALITY_REQUEST_BYTES_LIMIT')
    let body
    try {
      body = JSON.parse(new TextDecoder().decode(raw))
    } catch {
      throw fail('LEGACY_REQUEST_JSON_INVALID')
    }
    if (flavor === 'chat' && body.stream) throw fail('LEGACY_CHAT_STREAM_UNSUPPORTED')
    const budget = await legacyRequestBudget(body, config, { now })
    const upstreamURL = flavor === 'chat' ? config.chatURL : config.messagesURL
    if (!upstreamURL || !['http:', 'https:'].includes(new URL(upstreamURL).protocol))
      throw fail('LEGACY_UPSTREAM_UNAVAILABLE')
    const publicConfig = {
      providerId: config.providerId,
      model: body.model,
      hash: config.hash,
      price: config.price,
      capabilities: config.capabilities,
      reasoningEffort: budget.reasoningEffort,
      thinking: budget.thinking
    }
    const prepared = {
      attemptId,
      intentId: context.run.intent_id,
      runId: context.run.id,
      accountId: context.run.account_id,
      sessionId: context.sessionId,
      siteId: context.siteId,
      actionId: context.actionId ?? null,
      buildId: context.buildId ?? null,
      flavor,
      stream: body.stream === true,
      path: new URL(upstreamURL).pathname,
      bodyHash: budget.bodyHash,
      wireHash: digest(raw),
      modelConfigHash: config.hash,
      budget
    }
    // This write precedes admission, reservation and the first upstream byte.
    await store.artifact(context.run.id, context.run.account_id, `legacy-prepared:${attemptId}`, prepared)
    const headersReady = deferred(),
      completion = deferred()
    let delivered = false,
      dispatched = false,
      upstreamReader
    const check = () => rootAllowed({ ...context, dispatched })
    const work = runQualityAttempt({
      store,
      ledger,
      run: context.run,
      stage: `legacy:${attemptId}`,
      input: prepared,
      modelConfig: publicConfig,
      maxCents: budget.maxCents,
      actionId: context.actionId ?? null,
      buildId: context.buildId ?? null,
      checkAllowed: check,
      call: async () => {
        dispatched = true
        const startedAt = new Date(now()).toISOString()
        const headers = new Headers()
        // Only provider transport headers survive. Never forward the stand bearer capability.
        for (const name of [
          'content-type',
          'accept',
          'anthropic-version',
          'anthropic-beta',
          'user-agent',
          'x-deepseek-harness-user-id',
          'x-deepseek-harness-compact'
        ]) {
          const value = request.headers.get(name)
          if (value) headers.set(name, value)
        }
        headers.set('content-type', 'application/json')
        headers.set('x-api-key', config.apiKey)
        if (flavor === 'chat') headers.set('authorization', `Bearer ${config.apiKey}`)
        headers.set('x-deepseek-harness-session-id', context.sessionId)
        const upstream = await fetchImpl(upstreamURL, {
          method: 'POST',
          headers,
          body: raw,
          signal: request.signal,
          redirect: 'error'
        })
        const responseHeaders = new Headers(upstream.headers)
        responseHeaders.delete('content-length')
        responseHeaders.delete('content-encoding')
        responseHeaders.set('cache-control', 'no-store')
        if (!body.stream) {
          const bytes = await boundedBytes(upstream.body, 8 * 1024 * 1024, 'LEGACY_RESPONSE_BYTES_LIMIT')
          let data
          try {
            data = JSON.parse(new TextDecoder().decode(bytes))
          } catch {
            throw fail('LEGACY_RESPONSE_JSON_INVALID')
          }
          const receipt = {
            startedAt,
            requestId: data.id ?? upstream.headers.get('x-request-id'),
            model: data.model,
            usage: data.usage,
            responseHash: digest(bytes),
            requestHash: prepared.wireHash,
            modelConfigHash: config.hash,
            costBasis: 'verified-peak-usage-upper-bound'
          }
          // Expose the unchanged JSON only after its receipt and settlement are durable.
          completion.resolve({ bytes, status: upstream.status, headers: responseHeaders })
          return { receipt, error: upstream.ok ? null : 'LEGACY_PROVIDER_HTTP_ERROR' }
        }
        if (!upstream.body) throw fail('LEGACY_STREAM_BODY_MISSING')
        const parser = legacyMessagesUsage(),
          responseHash = createHash('sha256')
        let completed = false
        const finish = async (metadata, completeness) => {
          const receipt = {
            ...metadata,
            startedAt,
            responseHash: responseHash.digest('hex'),
            requestHash: prepared.wireHash,
            modelConfigHash: config.hash,
            costBasis: 'verified-peak-usage-upper-bound',
            completeness
          }
          completion.resolve({ receipt, error: upstream.ok ? null : 'LEGACY_PROVIDER_HTTP_ERROR' })
          await work
          completed = true
        }
        upstreamReader = upstream.body.getReader()
        const stream = new ReadableStream(
          {
            async pull(controller) {
              try {
                await check()
                const chunk = await upstreamReader.read()
                if (!chunk.done) {
                  responseHash.update(chunk.value)
                  parser.push(chunk.value)
                  const ready = parser.ready()
                  if (ready) {
                    // Commit usage before the native adapter observes its terminal event.
                    await finish(ready, 'through-message-stop')
                    controller.enqueue(chunk.value)
                    controller.close()
                    await upstreamReader.cancel().catch(() => {})
                    return
                  }
                  controller.enqueue(chunk.value)
                  return
                }
                await finish(parser.finish(), 'eof-and-message-stop')
                controller.close()
              } catch (e) {
                completion.reject(e)
                await upstreamReader.cancel().catch(() => {})
                // The consumer sees the error only once the attempt is durably uncertain: a retry it
                // sends at once must find the root fenced, never forward beside unknown spend.
                await work.catch(() => {})
                controller.error(e)
              }
            },
            async cancel() {
              if (!completed) completion.reject(fail('LEGACY_STREAM_CANCELLED_UNCERTAIN'))
              await upstreamReader.cancel().catch(() => {})
              await work.catch(() => {})
            }
          },
          { highWaterMark: 0 }
        )
        delivered = true
        headersReady.resolve(new Response(stream, { status: upstream.status, headers: responseHeaders }))
        return completion.promise
      },
      actualCents: (answer) => {
        const estimate = legacyUsageCost(answer.receipt, config, { flavor })
        return Number.isFinite(estimate) ? Math.ceil(estimate) : null
      }
    })
    // A completed stream cannot be recreated from metadata. Refuse instead of paying twice.
    work
      .then(async (answer) => {
        if (answer.reused) {
          headersReady.reject(fail('LEGACY_STREAM_REPLAY_UNAVAILABLE'))
        } else if (!delivered) {
          const response = await completion.promise
          headersReady.resolve(new Response(response.bytes, response))
        }
      })
      .catch((e) => {
        if (!delivered) headersReady.reject(e)
      })
    return headersReady.promise
  }
  return { fetch: transport, checkAllowed: rootAllowed }
}
