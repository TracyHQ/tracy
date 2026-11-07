// How a bench run calls its model: the shared harness settings, DeepSeek's price tables and the per-model profiles
// (ADR 0041, #301). Shared by the planner bench and the brand bench (#320).
import { MAX_OUTPUT_TOKENS, STREAM_IDLE_MS } from './agent-over-door.js'
import { RETRY_DEFAULTS } from './agent-over-door-retry.js'

/**
 * How every bench run calls the model, stored on the run (parity with the reference run, ADR 0041). The output
 * budget is Claude Code's (thinking counts against it, and the reference plan alone is about 50k tokens); a call
 * that long can take well over 20 minutes, hence 45. A streamed call (the deepseek-native wire) is also cut after
 * idleMs without a byte, so a hung connection is retried within minutes instead of at the 45 minute mark; the
 * OpenRouter wire is not streamed and has only the 45 minutes. Transient provider errors are retried. Both cache
 * markers (system and rolling) live one hour: an answer can take longer than 5 minutes, and a 5 minute rolling marker
 * then expires before the next call, which writes the whole conversation to the cache again. Thinking effort is
 * medium, as in the Claude Code runs that produced the approved reference plans.
 *
 * Guards (#301, after a DeepSeek V4 Pro run looped 86 calls re-reading kit parts and was cancelled): a run whose
 * answered calls already cost more than budgetUsd stops before its next call (SITE_PLANNER_BUDGET); a run that reads
 * the kit with tools is told to write the plan, with tool_choice "none", after writeAfterToolTurns answers that called
 * a tool or as soon as an answer only re-reads parts it was already sent (bench-worker.js); maxTurns bounds the calls.
 */
export const BENCH_HARNESS = Object.freeze({
  maxTokens: MAX_OUTPUT_TOKENS,
  effort: 'medium',
  cacheTtl: Object.freeze({ system: '1h', rolling: '1h' }),
  toolImages: 'inline',
  cacheMarkers: true,
  maxTurns: 150,
  callTimeoutMs: 45 * 60_000,
  idleMs: STREAM_IDLE_MS,
  retry: RETRY_DEFAULTS,
  budgetUsd: 2,
  writeAfterToolTurns: 20
})

/**
 * DeepSeek's peak hours, in UTC: 01:00 to 04:00 and 06:00 to 10:00, Monday to Friday; every other hour is off-peak
 * (DeepSeek's pricing page, read 03/11/2026). DeepSeek also prices Chinese public holidays off-peak; they are ignored
 * here, so a call on such a holiday inside these hours is costed at the peak rate, an overestimate.
 */
export const DEEPSEEK_PEAK_UTC = Object.freeze({
  weekdays: Object.freeze([1, 2, 3, 4, 5]),
  hours: Object.freeze([Object.freeze([1, 4]), Object.freeze([6, 10])])
})

const deepseekPrice = (peak, offPeak) =>
  Object.freeze({ peak: Object.freeze(peak), offPeak: Object.freeze(offPeak), peakUtc: DEEPSEEK_PEAK_UTC })

/**
 * DeepSeek's own API reports no cost, so a run on it computes one from its pricing page (read 03/11/2026), USD per
 * million tokens: input on a cache hit, input on a cache miss, output; the table is chosen per call by the UTC time it
 * is dispatched (agent-over-door-wire.js priceAt), and the turn records which rate it used.
 */
export const DEEPSEEK_FLASH_PRICE = deepseekPrice(
  { inputCacheHit: 0.006, inputCacheMiss: 0.3, output: 1.2 },
  { inputCacheHit: 0.003, inputCacheMiss: 0.15, output: 0.6 }
)

/** The same for deepseek-v4-pro on DeepSeek's own API (pricing page, read 03/11/2026). */
export const DEEPSEEK_V4_PRO_PRICE = deepseekPrice(
  { inputCacheHit: 0.044, inputCacheMiss: 1.32, output: 3.96 },
  { inputCacheHit: 0.022, inputCacheMiss: 0.66, output: 1.98 }
)

/**
 * What changes in the harness for the door's model, by model id, and by the door's provider id where an entry names
 * one (`providerId`). Read on 03/11/2026 from OpenRouter's model list and endpoints (deepseek/deepseek-v4.1-flash-1017:
 * text and image input, tools, reasoning efforts max, high, low and none, the smallest endpoint output limit 131072)
 * and DeepSeek's API docs (images only in user messages, reasoning sent back in a tool loop, automatic caching). The
 * first matching entry wins.
 */
export const MODEL_HARNESS = Object.freeze([
  {
    profile: 'deepseek-flash-native',
    providerId: 'deepseek',
    match: /^deepseek-flash$/,
    harness: {
      // DeepSeek's own API: reasoning_effort instead of OpenRouter's reasoning object, no usage or provider field,
      // and reasoning_content sent back on every later turn (agent-over-door-wire.js).
      wire: 'deepseek-native',
      toolImages: 'user-message',
      cacheMarkers: false,
      // DeepSeek's efforts are low, high and max. Four dev runs on one brief with the same frozen checker (03/11/2026):
      // low took 7.6 minutes, 202 failures in the first draft and 2 still failing after the last fix round; high took
      // 10.5 minutes, 62 first-draft failures and none at the end; max took about 10.3 minutes of model time (a redeploy
      // interrupted that run once), 46 first-draft failures and none at the end, fix rounds of about 30 seconds, about
      // 0.05 USD. Max thinks more while reading the kit, so the first draft misses less and the fix rounds are shorter.
      effort: 'max',
      // Not yet measured against DeepSeek's own API; kept at the bench budget until it is.
      maxTokens: MAX_OUTPUT_TOKENS,
      price: DEEPSEEK_FLASH_PRICE
    }
  },
  {
    profile: 'deepseek-v4-pro-native',
    providerId: 'deepseek',
    match: /^deepseek-v4-pro$/,
    harness: {
      wire: 'deepseek-native',
      // DeepSeek's own API lists this model as text only (03/11/2026): it plans from the kit's looks, and the door lets
      // it in only for a kit with a current look for every shot (door.js). Given no images, the run gets the whole kit
      // in its first message and no tools at all (bench-worker.js), so the first answer is the plan.
      images: false,
      toolImages: 'user-message',
      cacheMarkers: false,
      effort: 'high',
      // A planner-sized call (231k prompt tokens, 20.8k out) answered in 191 s with this budget (03/11/2026).
      maxTokens: 128000,
      price: DEEPSEEK_V4_PRO_PRICE
    }
  },
  // Claude Sonnet 5.5 and Opus 5.5 alike (alternatives to the planner's default model, door.js SITE_PLANNER_MODEL):
  // OpenRouter lists both with image input, tools, reasoning_effort, a 1h cache write price and 128000 output tokens on
  // every endpoint (03/11/2026).
  { profile: 'anthropic', match: /^anthropic\//, harness: {} },
  {
    profile: 'deepseek-v4.1-flash',
    match: /^deepseek\/deepseek-v4\.1-flash/,
    harness: {
      // DeepSeek takes images in user messages only, never inside a tool result.
      toolImages: 'user-message',
      // DeepSeek caches on its own; Anthropic's cache_control markers are left out.
      cacheMarkers: false,
      // The model offers low, high and max but no medium; high is its default.
      effort: 'high',
      // One provider for the whole run: each provider caches on its own, and DeepSeek's own endpoint is the one
      // whose image handling its docs describe.
      provider: Object.freeze({ order: Object.freeze(['deepseek']), allow_fallbacks: false })
    }
  }
])

/** Any other model: images in user messages and no cache markers, the forms OpenAI-compatible models all accept. */
const OTHER_MODEL = { profile: 'other', harness: { toolImages: 'user-message', cacheMarkers: false } }

/**
 * The harness a run on this model records: BENCH_HARNESS with the model's own settings and its profile name.
 * `providerId` is the door's provider (the run's door snapshot); an entry that names a provider matches only it.
 */
export function benchHarnessFor(model, providerId) {
  const entry =
    MODEL_HARNESS.find(
      (m) => (m.providerId === undefined || m.providerId === providerId) && m.match.test(String(model ?? ''))
    ) ?? OTHER_MODEL
  return { ...BENCH_HARNESS, ...entry.harness, modelProfile: entry.profile }
}

/** Whether a run's harness sends images to this model: false for a text-only profile. */
export const sendsImages = (model, providerId) => benchHarnessFor(model, providerId).images !== false
