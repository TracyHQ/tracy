// The brand reviewer (brand step trial bench, #320): the only model that looks at logos and icons for the agent. A
// tool calls review({ images, question, blind }) and gets the reviewer's answer text and its cost back; the tool
// builds the question (and, in blind mode, never names the business) and judges the answer by code. One call to the
// brand reviewer door, never a key or an image in the log: the call log row holds tool, model, purpose, status,
// latency and cost only. The cap is checked before the call (brand-spend.js). An answer with no cost figure is
// counted at the model's price (brand-prices.js) and its row marked estimated; a model with no price is refused.
import { usageOf } from '../lib/agent-over-door-wire.js'
import { isAnthropicModel } from './brand-doors.js'
import { costOfCall } from './brand-prices.js'

const SYSTEM =
  'You look at images and answer questions about them. Answer only what is asked, in the form asked, from what you see.'
const MAX_ANSWER_TOKENS = 2000
const CALL_TIMEOUT_MS = 3 * 60_000

// An image is { mediaType, base64 }, { mediaType, bytes } or a Buffer of a PNG.
function imagePart(image) {
  const mediaType = image?.mediaType ?? 'image/png'
  const base64 =
    typeof image?.base64 === 'string' ? image.base64 : Buffer.from(image?.bytes ?? image).toString('base64')
  return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } }
}

/**
 * @param {{ door: { baseUrl: string, apiKey: string, model: string }, fetchImpl?: typeof fetch,
 *   spend: ReturnType<import('./brand-spend.js').createSpend>, tool?: () => string | null,
 *   price: { inputCacheHit: number, inputCacheMiss: number, output: number, callCeiling: number } }} input
 * @returns {(call: { images: unknown[], question: string, blind?: boolean }) => Promise<{ answer: string, cost: number | null }>}
 */
export function createReview({ door, fetchImpl = fetch, spend, tool = () => null, price }) {
  if (isAnthropicModel(null, door.model)) throw new Error('the brand reviewer is never an Anthropic model')
  if (!price) throw new Error(`BRAND_PRICE_UNKNOWN: no price for ${door.model}, so no call is sent`)
  return async function review({ images, question, blind = false }) {
    await spend.check()
    const started = Date.now()
    const log = (status, extra = {}) =>
      spend.record({
        kind: 'reviewer',
        tool: tool(),
        model: door.model,
        purpose: blind ? 'blind icon look' : 'logo look',
        status,
        latencyMs: Date.now() - started,
        ...extra
      })
    let json
    try {
      const response = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: door.model,
          messages: [
            { role: 'system', content: SYSTEM },
            {
              role: 'user',
              content: [{ type: 'text', text: String(question) }, ...(images ?? []).map(imagePart)]
            }
          ],
          max_tokens: MAX_ANSWER_TOKENS,
          usage: { include: true }
        }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
      })
      json = await response.json().catch(() => null)
      if (!response.ok || json?.error) {
        const reason = String(json?.error?.message ?? `HTTP ${response.status}`).slice(0, 300)
        await log('failed', { error: { code: 'REVIEWER_PROVIDER', reason, status: response.status } })
        throw new Error(`REVIEWER_FAILED: ${reason}`)
      }
    } catch (error) {
      if (!String(error?.message).startsWith('REVIEWER_FAILED')) {
        await log('failed', {
          error: { code: 'REVIEWER_NETWORK', reason: String(error?.message ?? error).slice(0, 300) }
        })
        throw new Error(`REVIEWER_FAILED: ${String(error?.message ?? error).slice(0, 300)}`)
      }
      throw error
    }
    const answer = json?.choices?.[0]?.message?.content
    const { cost, estimated } = costOfCall(json?.usage, price)
    if (typeof answer !== 'string' || !answer.trim()) {
      await log('failed', {
        costUsd: cost,
        costEstimated: estimated,
        usage: usageOf(json?.usage),
        error: { code: 'REVIEWER_EMPTY', reason: 'no answer' }
      })
      throw new Error('REVIEWER_FAILED: the reviewer gave no answer')
    }
    await log('answered', { costUsd: cost, costEstimated: estimated, usage: usageOf(json?.usage) })
    return { answer, cost }
  }
}
