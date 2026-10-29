/**
 * One chat completion against an OpenAI-compatible endpoint — OpenRouter when its key is set (and
 * then a model that answers with images in the same turn: measured 07/09, google/gemini-3.1-flash-image
 * returns text plus `message.images[]` as data URIs), else DeepSeek (text only). No SDK: one fetch.
 *
 * Pure apart from the fetch, which is handed in, so the tests never reach the network.
 */

/** Abort a model call that never responds — without this the seeder hangs silently until the
 * execFile timeout (RUN_TIMEOUT_MS) kills it with no output, which the seed stage reports as "The
 * seeder stopped." with no context. A hung connection aborts and throws, so bin/seed.mjs's error
 * handler writes a readable line.
 *
 * 240 s, not 120: measured 23/09/2026 on j-se6mii, OpenRouter's deepseek-chat-v3.1 took ~110 s for
 * a 35-slot batch, and the eighth crossed 120 s and killed a 13-minute seed. The stage allows 45. */
const CHAT_TIMEOUT_MS = 240_000
/** Tries per call. Only a failure that passes is tried again (see `transient`). */
const CHAT_ATTEMPTS = 3

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
export const IMAGE_MODEL = 'google/gemini-3.1-flash-lite-image'
export const TEXT_MODEL_OPENROUTER = 'deepseek/deepseek-chat-v3.1'
// Not `deepseek-chat`: that name is retired and no longer on DeepSeek's price list — asked on
// 23/09/2026, the API answered `"model": "deepseek-flash"`. Name the model that is billed.
export const TEXT_MODEL_DEEPSEEK = 'deepseek-flash'

/**
 * The keys a lane keeps in dsh's credential store (`$DSH_HOME/.credentials.yaml`, the `refs:` block
 * `docs/references/ban-do-fleet.md` step 3 writes DEEPSEEK_API_KEY into), as env-shaped pairs —
 * the seeder runs as a child of dsh and inherits its environment, not its store.
 * @param {string} yaml
 * @returns {Record<string, string>}
 */
export function keysFromCredentials(yaml) {
  /** @type {Record<string, string>} */
  const out = {}
  const refs = /^refs:\s*\n((?:[ \t]+\S.*\n?)*)/m.exec(yaml)
  if (!refs) return out
  for (const line of refs[1].split('\n')) {
    const m = /^[ \t]+([A-Z][A-Z0-9_]*):[ \t]*(.+?)[ \t]*$/.exec(line)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

/**
 * Which door the lane has: OpenRouter first (it can draw), else DeepSeek, else none.
 * @param {Record<string, string | undefined>} env
 * @returns {{ provider: 'openrouter', url: string, key: string, imageModel: string, textModel: string } | { provider: 'deepseek', url: string, key: string, imageModel: null, textModel: string } | null}
 */
export function providerOf(env) {
  const or = env.OPENROUTER_API_KEY?.trim()
  // /ops names the provider the seed's text runs on (`TRACY_SEED_TEXT_PROVIDER`, pushed beside the
  // keys). Honoured when its key is here; otherwise the order below decides, as it always did.
  // Measured 23/09/2026 on the dev host: assigned openrouter / openai/gpt-5.4-mini, the seeder
  // wrote with DeepSeek because DeepSeek's key came first in its environment.
  if (env.TRACY_SEED_TEXT_PROVIDER?.trim() === 'deepseek' && env.DEEPSEEK_API_KEY?.trim())
    return providerOf({ ...env, OPENROUTER_API_KEY: '', TRACY_SEED_TEXT_PROVIDER: '' })
  if (or) {
    return {
      provider: 'openrouter',
      url: OPENROUTER_URL,
      key: or,
      imageModel: env.TRACY_SEED_IMAGE_MODEL?.trim() || IMAGE_MODEL,
      textModel: env.TRACY_SEED_TEXT_MODEL?.trim() || TEXT_MODEL_OPENROUTER
    }
  }
  const ds = env.DEEPSEEK_API_KEY?.trim()
  if (ds)
    return {
      provider: 'deepseek',
      url: DEEPSEEK_URL,
      key: ds,
      imageModel: null,
      textModel: env.TRACY_SEED_TEXT_MODEL?.trim() || TEXT_MODEL_DEEPSEEK
    }
  return null
}

/**
 * The images of an answer as buffers: OpenRouter puts them in `message.images[].image_url.url`
 * (data URIs); anything else is ignored.
 * @param {any} message
 * @returns {{ mime: string, bytes: Buffer }[]}
 */
export function imagesOf(message) {
  const out = []
  for (const im of Array.isArray(message?.images) ? message.images : []) {
    const url = im?.image_url?.url
    if (typeof url !== 'string') continue
    const m = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(url)
    if (!m) continue
    out.push({ mime: m[1], bytes: Buffer.from(m[2], 'base64') })
  }
  return out
}

/**
 * Where each answered call's usage goes, or null. One process, one seeding run, so one sink: every
 * caller reaches the model through `chat()`, including the writers and the translator that import
 * it directly, and none of them has to remember to report.
 * @type {((entry: { model: string, requested: string, provider: string | null, usage: unknown }) => void) | null}
 */
let usageSink = null

/**
 * A thrown fetch or body read, in words: a timeout says so instead of looking like an answer.
 * @param {any} e
 */
function describe(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError')
    return `timed out after ${CHAT_TIMEOUT_MS / 1000} s`
  return e?.cause?.code ? `${e.message} (${e.cause.code})` : String(e?.message ?? e)
}

/**
 * Route the usage of every later `chat()` to `sink` (null stops it).
 * @param {((entry: { model: string, requested: string, provider: string | null, usage: unknown }) => void) | null} sink
 */
export function meterUsage(sink) {
  usageSink = sink
}

/**
 * @param {{ url: string, key: string }} door
 * @param {{ model: string, messages: { role: string, content: string }[], images?: boolean, maxTokens?: number, temperature?: number }} req
 *   `temperature` goes to the provider when set (0 included); left out, the provider's default stays.
 * @param {typeof fetch} [doFetch]
 * @returns {Promise<{ text: string, images: { mime: string, bytes: Buffer }[], usage: unknown, model: string }>}
 */
export async function chat(door, req, doFetch = fetch, { retryDelayMs = 2000 } = {}) {
  const body = {
    model: req.model,
    messages: req.messages,
    ...(req.images ? { modalities: ['image', 'text'] } : {}),
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {})
  }
  // 🔒 ONE SLOW OR DROPPED ANSWER USED TO END THE WHOLE SEED. A timeout, a reset connection, a
  // rate limit or an overloaded provider passes; each is asked again, a little later. A refusal the
  // provider means (a bad key, a bad request) is not. And the error says what happened: an abort
  // while the body was read used to surface as "HTTP 200" (23/09/2026, j-se6mii).
  let json = null
  for (let attempt = 1; ; attempt++) {
    let failure
    try {
      const res = await doFetch(door.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${door.key}`,
          'content-type': 'application/json',
          'http-referer': 'https://tracy.ai',
          'x-title': 'Tracy seeder'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
      })
      let parsed = null
      let unread = null
      try {
        parsed = await res.json()
      } catch (e) {
        unread = e
      }
      if (res.ok && parsed && !parsed.error) {
        json = parsed
        break
      }
      const why =
        parsed?.error?.message ?? parsed?.error ?? (unread ? describe(unread) : `HTTP ${res.status}`)
      failure = {
        transient: unread !== null || res.status === 429 || res.status >= 500,
        message: typeof why === 'string' ? why : JSON.stringify(why)
      }
    } catch (e) {
      failure = { transient: true, message: describe(e) }
    }
    if (!failure.transient || attempt >= CHAT_ATTEMPTS)
      throw new Error(
        `model call failed: ${failure.message}${failure.transient ? ` (after ${attempt} tries)` : ''}`
      )
    await new Promise((r) => setTimeout(r, retryDelayMs * attempt))
  }
  const message = json.choices?.[0]?.message ?? {}
  const text =
    typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content.map((/** @type {any} */ p) => p?.text ?? '').join('')
        : ''
  const answered = {
    text,
    images: imagesOf(message),
    usage: json.usage ?? null,
    model: json.model ?? req.model
  }
  try {
    usageSink?.({
      model: answered.model,
      requested: req.model,
      provider: /** @type {{ provider?: string }} */ (door).provider ?? null,
      usage: answered.usage
    })
  } catch {
    // A meter that cannot write must not cost the seed the answer it paid for.
  }
  return answered
}
