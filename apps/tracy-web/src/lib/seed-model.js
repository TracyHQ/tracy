/**
 * The text model for "Apply" in the Add site popup: many small JSON calls at once, with the model's
 * "thinking" switched OFF.
 *
 * 🔒 THINKING OFF IS THE DIFFERENCE BETWEEN 3 SECONDS AND NOTHING. Measured on the stand (03/10/2026,
 * DeepSeek `deepseek-flash`, the seeder's own 35-slot prompt): with thinking on — the API's default —
 * every call spent all 8192 completion tokens on reasoning, took 32 s and returned an EMPTY answer,
 * so the planner marked every slot pending and the site kept the template's words; with
 * `thinking: {type: "disabled"}` the same call took 2.6 s and returned valid JSON. Eight such calls at
 * once (a whole WordPress source pass) took 3.6 s. Slot-filling is not a task that rewards reasoning, so
 * a reasoning budget here is pure latency; each provider is asked, in its own words, not to spend one.
 *
 * ⚠ A provider that refuses the parameter is asked again without it (a 400 is the only answer that
 * means "I do not know this field"), so a model that cannot switch thinking off still answers.
 *
 * `concurrency` bounds the calls in flight across the whole run, and is the knob to turn if a provider
 * starts throttling (measured 03/10: 8 at once all answered; 16 at once left 4 of 16 batches unusable). `shared` is
 * a bound every run of a process takes part in: several runs at once would otherwise ask for 8 EACH.
 */

/** Default calls in flight at once. */
export const DEFAULT_CONCURRENCY = 8
/** One call's own time limit: a non-thinking answer for 35 slots is a few seconds. */
export const DEFAULT_TIMEOUT_MS = 60_000
/** Tries per call; only a failure that can pass is tried again. */
const ATTEMPTS = 3
/** Waits for OpenRouter's in-flight budget to clear, on top of `ATTEMPTS`; each wait capped, all of them together too. */
const BUDGET_WAITS = 4
const BUDGET_WAIT_CAP_MS = 30_000
const BUDGET_WAIT_TOTAL_MS = 60_000
/** Spread so calls refused together are not all asked again in the same instant. */
const BUDGET_JITTER_MS = 1000
/**
 * The reply cap of a call asked with `maxTokens: 'max'` when the provider's model listing names none: DeepSeek's documented
 * output limit for its chat model, and the cap the translation and seeder calls of this pipeline already send.
 */
export const FALLBACK_MAX_OUTPUT = 8192
/** How long the model listing may take before the fallback cap is used. */
const LISTING_TIMEOUT_MS = 10_000

/**
 * A provider's `finish_reason` that says the answer stopped at the reply cap, not at its end: OpenAI-compatible "length",
 * an Anthropic-format "max_tokens", Gemini's "MAX_TOKENS".
 * @param {unknown} finish
 */
export function isCutFinish(finish) {
  return typeof finish === 'string' && /^(?:length|max_tokens)$/i.test(finish)
}

/**
 * The maximum output a provider's model listing (`GET /models`) states for a model, or null. Read from the gateway's
 * `max_output_tokens`, else OpenRouter's `top_provider.max_completion_tokens`. Matched by id, by `root`, or by an id that
 * ends with "/<model>" (a gateway's provider prefix).
 * @param {any} listing @param {string} words
 * @returns {number | null}
 */
export function maxOutputOf(listing, words) {
  const rows = Array.isArray(listing?.data) ? listing.data : []
  const row =
    rows.find((r) => r?.id === words) ??
    rows.find((r) => r?.root === words) ??
    rows.find((r) => typeof r?.id === 'string' && r.id.endsWith(`/${words}`))
  const n = Number(row?.max_output_tokens ?? row?.top_provider?.max_completion_tokens)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** An error a caller can tell apart: the answer was cut at the reply cap, so its text is never taken for an answer. */
function truncated() {
  return Object.assign(new Error('TRUNCATED: the answer stopped at the reply limit'), { code: 'TRUNCATED' })
}

/**
 * Whether a refusal is OpenRouter's in-flight spending budget being full: a 402 that clears once running and recently
 * finished calls settle, sent with `Retry-After` (openrouter.ai/docs/api-reference/limits, "In-flight spending budget").
 * `weight_exceeds_budget` (this one call alone is bigger than the whole budget) and every other 402 (no credit) are not:
 * asking again cannot help. Read from the documented `error.metadata`, else from the documented message.
 * @param {number} status
 * @param {any} parsed
 */
export function isInFlightBudget(status, parsed) {
  if (status !== 402) return false
  const meta = parsed?.error?.metadata
  if (meta?.reason || meta?.limit_source)
    return meta.reason === 'in_flight_budget_exhausted' || meta.limit_source === 'openrouter_in_flight_budget'
  const message = parsed?.error?.message
  return typeof message === 'string' && /given your current in-flight requests/i.test(message)
}

/**
 * The wait a `Retry-After` header asks for (seconds or an HTTP date), in ms; a missing or unreadable one is 2 s.
 * @param {string | null} header
 * @param {number} now
 */
function retryAfterMs(header, now) {
  const value = (header ?? '').trim()
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000
  const at = Date.parse(value)
  return Number.isFinite(at) ? Math.max(0, at - now) : 2000
}

/**
 * What to add to a chat request so the model does not reason, by where it is asked.
 * @param {string} baseUrl
 * @returns {Record<string, unknown>}
 */
export function noReasoningBody(baseUrl) {
  let host = ''
  try {
    host = new URL(baseUrl).host
  } catch {
    return {}
  }
  if (host === 'api.deepseek.com') return { thinking: { type: 'disabled' } }
  if (host === 'openrouter.ai') return { reasoning: { enabled: false } }
  return {}
}

/**
 * A bound on jobs in flight: the rest wait their turn, in order.
 * @param {number} limit
 */
export function createLimiter(limit) {
  let active = 0
  /** @type {Array<() => void>} jobs a person is already waiting on: they are served before the rest, in their own order */
  const urgent = []
  /** @type {Array<() => void>} */
  const waiting = []
  const next = () => {
    if (active >= limit) return
    const run = urgent.shift() ?? waiting.shift()
    if (run) run()
  }
  return /** @template T @param {() => Promise<T>} job @param {{ first?: boolean }} [options] @returns {Promise<T>} */ (
    job,
    { first = false } = {}
  ) =>
    new Promise((resolve, reject) => {
      const start = () => {
        active += 1
        job()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      }
      if (active < limit) start()
      else (first ? urgent : waiting).push(start)
    })
}

/** The error of a failed call, with the key never in it. */
function say(error, key) {
  const text = error instanceof Error ? error.message : String(error)
  return key ? text.split(key).join('[redacted]') : text
}

/**
 * @param {object} options
 * @param {{apiKey: string, baseUrl: string, words: string}} options.model - `modelForDoor`'s answer
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.concurrency]
 * @param {(job: () => Promise<any>, options?: { first?: boolean }) => Promise<any>} [options.shared] - a `createLimiter` this run shares with the others
 * @param {number} [options.timeoutMs]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {() => number} [options.random] - the jitter's source
 */
export function createSeedModel({
  model,
  fetchImpl = fetch,
  concurrency = DEFAULT_CONCURRENCY,
  shared = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random
}) {
  const own = createLimiter(Math.max(1, concurrency))
  const limit = shared
    ? (/** @type {() => Promise<any>} */ job, /** @type {{ first?: boolean }} */ options) =>
        own(() => shared(job, options), options)
    : own
  const url = `${model.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const quiet = noReasoningBody(model.baseUrl)
  const stats = {
    calls: 0,
    retries: 0,
    /** Waits for OpenRouter's in-flight budget to clear (`isInFlightBudget`). */
    budgetWaits: 0,
    empty: 0,
    /** Answers cut at the reply cap (`TRUNCATED`): never returned as text, never asked again at the same size. */
    truncated: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    ms: 0
  }
  /**
   * The same counts per stage of a build (`stage(name)`): the planner, the judge, the posts… A call made with no stage is
   * counted under `other`.
   * @type {Record<string, {calls: number, promptTokens: number, completionTokens: number, reasoningTokens: number}>}
   */
  const stages = {}
  /** Whether this provider has refused the no-reasoning parameter (then it is not sent again). */
  let refusesQuiet = false
  /** @type {Promise<number> | null} the model's maximum output, read once from the provider's listing */
  let ceiling = null
  /**
   * 🔒 THE COPY WRITER IS NEVER SQUEEZED BY ITS OWN REASONING (R13, 30/10/2026): with a 4096 cap and the stand's model
   * reasoning 2.2-2.5k tokens, five 35-slot batches stopped mid-JSON (finish "length"). `maxTokens: 'max'` asks for the
   * model's own maximum output, as the provider's listing states it (the stand relay: 128000 for claude-sonnet-5-5);
   * a provider that states none gets `FALLBACK_MAX_OUTPUT`. The cap is a ceiling, not a target: the answer is as long as
   * the slots need.
   */
  const maxOutput = () =>
    (ceiling ??= (async () => {
      try {
        const res = await fetchImpl(`${model.baseUrl.replace(/\/+$/, '')}/models`, {
          headers: { authorization: `Bearer ${model.apiKey}` },
          signal: AbortSignal.timeout(LISTING_TIMEOUT_MS)
        })
        if (!res.ok) return FALLBACK_MAX_OUTPUT
        return maxOutputOf(await res.json(), model.words) ?? FALLBACK_MAX_OUTPUT
      } catch {
        return FALLBACK_MAX_OUTPUT
      }
    })())

  async function once(body, signal) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${model.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])])
    })
    // Read once, as text: a non-JSON body (a proxy's page, a plain-text refusal) is still the only
    // thing that says why, and a failed `res.json()` would have thrown it away.
    const text = await res.text().catch(() => '')
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      // read below as a failure, with the text
    }
    return { res, parsed, text }
  }

  /**
   * One chat call, to the end: no-reasoning parameter, a limit on calls in flight, bounded retries. `first` puts the call
   * ahead of the ones waiting for a place (`createLimiter`): the calls made once a person is waiting on the site.
   * An answer cut at the reply cap (`isCutFinish`) throws `TRUNCATED` at once: its text is half an answer, and the same
   * request would be cut again.
   * @param {{messages: Array<{role: string, content: string}>, maxTokens?: number | 'max', temperature?: number, signal?: AbortSignal, first?: boolean, stage?: string}} request
   * @returns {Promise<string>} the answer's text
   */
  async function chat({ messages, maxTokens = 4096, temperature, signal, first = false, stage = 'other' }) {
    const cap = maxTokens === 'max' ? await maxOutput() : maxTokens
    return limit(
      async () => {
        const started = Date.now()
        let lastFailure = 'no answer'
        // Whether every try so far was answered, and the answer had nothing in it.
        let onlyEmpty = true
        let budgetWaits = 0
        let budgetWaited = 0
        for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
          const body = {
            model: model.words,
            messages,
            max_tokens: cap,
            ...(temperature !== undefined ? { temperature } : {}),
            ...(refusesQuiet ? {} : quiet)
          }
          try {
            const { res, parsed, text } = await once(body, signal)
            if (res.ok && parsed && !parsed.error) {
              const usage = parsed.usage ?? {}
              stats.calls += 1
              stats.promptTokens += Number(usage.prompt_tokens) || 0
              stats.completionTokens += Number(usage.completion_tokens) || 0
              stats.reasoningTokens += Number(usage.completion_tokens_details?.reasoning_tokens) || 0
              const own = (stages[stage] ??= {
                calls: 0,
                promptTokens: 0,
                completionTokens: 0,
                reasoningTokens: 0
              })
              own.calls += 1
              own.promptTokens += Number(usage.prompt_tokens) || 0
              own.completionTokens += Number(usage.completion_tokens) || 0
              own.reasoningTokens += Number(usage.completion_tokens_details?.reasoning_tokens) || 0
              stats.ms += Date.now() - started
              if (isCutFinish(parsed.choices?.[0]?.finish_reason)) {
                stats.truncated += 1
                throw truncated()
              }
              const content = parsed.choices?.[0]?.message?.content
              if (typeof content === 'string' && content.trim() !== '') return content
              // An answer with nothing in it (a reasoning budget spent, a filtered reply) can pass: it is asked again.
              stats.empty += 1
              lastFailure = 'the model answered with nothing'
            } else {
              onlyEmpty = false
              const why =
                parsed?.error?.message ??
                parsed?.error ??
                (text ? `HTTP ${res.status}: ${text.slice(0, 200)}` : `HTTP ${res.status}`)
              lastFailure = typeof why === 'string' ? why : JSON.stringify(why)
              // A provider that does not know the no-reasoning field says 400: ask again without it, once.
              if (
                res.status === 400 &&
                Object.keys(quiet).length > 0 &&
                !refusesQuiet &&
                /think|reason/i.test(lastFailure)
              ) {
                refusesQuiet = true
                continue
              }
              // OpenRouter's in-flight budget is full: wait as it asks (bounded), then ask again without spending a try.
              if (isInFlightBudget(res.status, parsed)) {
                const wait =
                  Math.min(retryAfterMs(res.headers.get('retry-after'), Date.now()), BUDGET_WAIT_CAP_MS) +
                  Math.floor(random() * BUDGET_JITTER_MS)
                if (budgetWaits >= BUDGET_WAITS || budgetWaited + wait > BUDGET_WAIT_TOTAL_MS) break
                budgetWaits += 1
                budgetWaited += wait
                stats.budgetWaits += 1
                await sleep(wait)
                if (signal?.aborted) throw signal.reason ?? new Error('aborted')
                attempt -= 1
                continue
              }
              if (!(res.status === 429 || res.status >= 500)) break
            }
          } catch (error) {
            if (/** @type {any} */ (error)?.code === 'TRUNCATED') throw error
            onlyEmpty = false
            if (signal?.aborted) throw error
            lastFailure = say(error, model.apiKey)
          }
          stats.retries += 1
          if (attempt < ATTEMPTS) await sleep(1000 * attempt)
        }
        // Every try was answered and every answer was empty: the empty answer the planners already read as "nothing to use".
        if (onlyEmpty) return ''
        throw new Error(say(lastFailure, model.apiKey))
      },
      { first }
    )
  }

  /**
   * The `generate` the seeder's planners take: `({system, input}) => Promise<text>`.
   * @param {{system: string, input: unknown, maxTokens?: number | 'max', first?: boolean, stage?: string}} call
   */
  const generate = ({ system, input, maxTokens, first, stage }) =>
    chat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) }
      ],
      maxTokens,
      first,
      stage
    })

  /** What this model has been asked and what it cost, in all and per stage. */
  const usage = () => ({
    // The model's id, so a build's spend is priced (`text-spend.js`).
    model: model.words,
    ...stats,
    stages: Object.fromEntries(Object.entries(stages).map(([name, s]) => [name, { ...s }]))
  })

  /**
   * The model as one stage of a build sees it: the same calls, counted under that stage too (`usage().stages`).
   * @param {string} [stage]
   */
  const view = (stage, first = false) => ({
    chat: (/** @type {Parameters<typeof chat>[0]} */ request) =>
      chat({ ...request, first: first || request.first, stage: stage ?? request.stage }),
    generate: (/** @type {Parameters<typeof generate>[0]} */ call) =>
      generate({ ...call, first: first || call.first, stage: stage ?? call.stage }),
    /**
     * The same model for the calls a person is already waiting on — once the site is up — which are served before the ones
     * still being made ahead of it. Measured 03/10/2026: with three sites made at once, a call made after the install
     * waited behind the others' batches and the words it was meant to judge were never judged.
     */
    urgent: () => view(stage, true),
    /** @param {string} name */
    stage: (name) => view(name, first),
    usage
  })

  return { ...view(undefined), chat, generate }
}
