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
 * The model maximum assumed when the provider's model listing names none: DeepSeek's documented
 * output limit for its chat model, and the cap the translation and seeder calls of this pipeline already send.
 */
export const FALLBACK_MAX_OUTPUT = 8192
/** How long the model listing may take before the fallback cap is used. */
const LISTING_TIMEOUT_MS = 10_000

/**
 * 🔒 A CALL ASKS FOR THE OUTPUT ITS WORK NEEDS, NEVER THE MODEL MAXIMUM (ticket TracyHQ/tracy#234, 30/10/2026). OpenRouter
 * reserves credit for the whole `max_tokens` before it answers: the site plan asked for deepseek-v4-pro's 384000 and was
 * refused with HTTP 402 on a key that could pay for 188778, though the answer needed under 20000. `outputBudget` estimates
 * the reply from the work asked (the characters and items the answer holds, with headroom) plus a reasoning allowance, and
 * `chat({maxTokens: {budget}})` clamps it to the model's stated maximum. An answer that still stops at the budget throws
 * `TRUNCATED`, and its caller splits the work (the copy batches) or asks once with more room (the site plan).
 */
/** Characters per output token assumed: low on purpose, as JSON punctuation and non-Latin scripts cost more tokens. */
export const CHARS_PER_TOKEN = 3
/** Tokens an answer spends around each item it holds: its key, quotes, separators and a source id. */
export const ITEM_TOKENS = 40
/** Headroom on the estimated answer, for words written a little longer than counted. */
const BUDGET_HEADROOM = 1.25
/** The smallest budget asked: a short answer still has room for its JSON frame. */
export const MIN_BUDGET = 1024
/**
 * The reasoning allowance on top of the answer, by the effort asked. `unasked` is a model asked not to reason that does
 * anyway: the stand's relay model reasoned 2.2-2.5k tokens per copy batch (R13), and a 4096 cap cut five batches. `low`:
 * deepseek-v4-pro reasoned 14027 tokens over the pilot site plan at low effort (30/10/2026).
 */
export const REASONING_ALLOWANCE = { unasked: 4096, low: 16384, medium: 32768, high: 65536 }

/**
 * The output budget of one call, from the work it asks.
 * @param {{characters?: number, items?: number, reasoning?: keyof typeof REASONING_ALLOWANCE | null}} work - the
 *   characters the answer may write at most, the items it holds, and the reasoning allowance to add
 * @returns {number}
 */
export function outputBudget({ characters = 0, items = 0, reasoning = null }) {
  const answer = Math.ceil(
    (Math.max(0, characters) / CHARS_PER_TOKEN + Math.max(0, items) * ITEM_TOKENS) * BUDGET_HEADROOM
  )
  const think = reasoning ? (REASONING_ALLOWANCE[reasoning] ?? REASONING_ALLOWANCE.medium) : 0
  return Math.max(MIN_BUDGET, answer + think)
}

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
 * The field that asks a provider TO reason, in its own words: the site plan author (`site-plan-author.js`, ticket
 * TracyHQ/tracy#234) plans the whole site on the editorial door with reasoning on. With an `effort` ('low', 'medium',
 * 'high'), OpenRouter is sent `reasoning: {effort}`, DeepSeek's own API `reasoning_effort` beside `thinking` (its levels
 * low, high, max: api-docs.deepseek.com/guides/thinking_mode, as `llm-effort.js` reads them), and another OpenAI-compatible
 * provider `reasoning_effort`. Empty for a provider with no known field and no effort.
 * Measured 30/10/2026 on the stand (deepseek-v4-pro, the pilot brief's plan): default effort took 2 rounds, 608 s; low
 * effort 1 round, 173 s.
 * @param {string} baseUrl @param {string | null} [effort]
 */
export function reasoningBody(baseUrl, effort = null) {
  let host = ''
  try {
    host = new URL(baseUrl).host
  } catch {
    return {}
  }
  if (host === 'api.deepseek.com')
    return { thinking: { type: 'enabled' }, ...(effort ? { reasoning_effort: effort } : {}) }
  if (host === 'openrouter.ai') return { reasoning: effort ? { effort } : { enabled: true } }
  return effort ? { reasoning_effort: effort } : {}
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
 * @param {boolean} [options.reasoning] - ask the model to reason (`reasoningBody`) instead of asking it not to
 */
export function createSeedModel({
  model,
  fetchImpl = fetch,
  concurrency = DEFAULT_CONCURRENCY,
  shared = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  reasoning = false
}) {
  const own = createLimiter(Math.max(1, concurrency))
  const limit = shared
    ? (/** @type {() => Promise<any>} */ job, /** @type {{ first?: boolean }} */ options) =>
        own(() => shared(job, options), options)
    : own
  const url = `${model.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const quiet = reasoning ? reasoningBody(model.baseUrl) : noReasoningBody(model.baseUrl)
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
   * The model's own maximum output, as the provider's listing states it (the stand relay: 128000 for claude-sonnet-5-5),
   * read once; a provider that states none gets `FALLBACK_MAX_OUTPUT`. A budget (`maxTokens: {budget}`, `outputBudget`) is
   * clamped to it.
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
   * `maxTokens: {budget}` asks for that budget, clamped to the model's stated maximum (`outputBudget`). `effort` is the
   * reasoning effort of a reasoning model (`reasoningBody`); a model asked not to reason ignores it.
   * @param {{messages: Array<{role: string, content: string}>, maxTokens?: number | {budget: number}, effort?: string | null, temperature?: number, signal?: AbortSignal, first?: boolean, stage?: string}} request
   * @returns {Promise<string>} the answer's text
   */
  async function chat({
    messages,
    maxTokens = 4096,
    effort = null,
    temperature,
    signal,
    first = false,
    stage = 'other'
  }) {
    const cap =
      typeof maxTokens === 'object' && maxTokens !== null
        ? Math.max(1, Math.min(Math.ceil(Number(maxTokens.budget) || MIN_BUDGET), await maxOutput()))
        : maxTokens
    const ask = reasoning && effort ? reasoningBody(model.baseUrl, effort) : quiet
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
            ...(refusesQuiet ? {} : ask)
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
                Object.keys(ask).length > 0 &&
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
   * @param {{system: string, input: unknown, maxTokens?: number | {budget: number}, first?: boolean, stage?: string}} call
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
