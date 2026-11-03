// The drawing door of the brand bench (#320): ctx.draw({ prompt, size }) -> { image, cost, model, provider }. It is
// the EXISTING picture door `seedImage` (the model a deployment books in /ops > Model & AI), called the way the
// site pictures are drawn: the seeder's `chat` with `images: true` against the provider's chat-completions endpoint
// (sites/brief-engines/pictures.js, lib/picture-draw.js). No new provider client, no environment fallback, and the
// key is read from the provider book only for the call and never logged or returned. The cost cap and the call log
// are the tool's business (it checks the cap before calling this and records after). One drawing is ONE paid call: the
// seeder's `chat` asks again after a timeout or a 5xx, which would make one logged drawing several paid calls, so
// only the first attempt is sent (`singleAttempt`). An answer with no cost figure is counted at the model's price and
// marked estimated; a model with no price is refused before anything is sent (brand-prices.js).
import { doorEntry } from '../lib/llm-catalog.js'
import { seeder } from '../lib/seeder.js'
import { lookupDoor } from '../lib/llm-store.js'
import { BRAND_PRICES, costOfCall, priceFor } from './brand-prices.js'

export const DRAW_DOOR = 'seedImage'
/** A drawing's own time limit: the model answers in 10 to 25 s. */
export const DRAW_TIMEOUT_MS = 90_000
const WHERE = '/ops > Model & AI'

/** A refusal: nothing was sent and nothing was spent. The tool reports it as a tool failure. */
export class DrawRefused extends Error {
  constructor(message) {
    super(message)
    this.name = 'DrawRefused'
    this.code = 'BRAND_DRAW_DOOR'
    this.refusal = true
  }
}

/** The picture door's credential, or a DrawRefused saying why it cannot draw. */
async function drawDoor(pool, secret) {
  const found = await lookupDoor(pool, DRAW_DOOR, secret)
  if (found.state === 'unassigned')
    throw new DrawRefused(`The picture door "${DRAW_DOOR}" has no provider and model. Set it in ${WHERE}.`)
  if (found.state === 'disabled')
    throw new DrawRefused(`The provider of the picture door is switched off. Turn it on in ${WHERE}.`)
  if (found.state !== 'ok')
    throw new DrawRefused(
      `The key of the picture door's provider cannot be opened. Save it again in ${WHERE}.`
    )
  const { providerId, baseUrl, apiKey, model } = found.credential
  if (!model) throw new DrawRefused(`The picture door names no model. Set it in ${WHERE}.`)
  const metadata = found.snapshot.metadata
  if (doorEntry(DRAW_DOOR).requires.some((cap) => metadata?.[cap] === false))
    throw new DrawRefused(`The provider says ${model} cannot draw pictures. Pick another model in ${WHERE}.`)
  return { providerId, url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`, key: apiKey, model }
}

/**
 * The fetch for one `chat` call that sends only its first attempt: a later attempt is answered at once with the first
 * one's reason as a plain 400, which `chat` does not retry, so it throws that reason.
 */
function singleAttempt(fetchImpl) {
  let failed = null
  return async (url, init) => {
    if (failed !== null)
      return new Response(JSON.stringify({ error: { message: failed } }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    failed = 'the picture call failed'
    let res
    try {
      res = await fetchImpl(url, init)
    } catch (error) {
      failed = error?.name === 'TimeoutError' ? 'the picture call timed out' : String(error?.message ?? error)
      throw error
    }
    if (res.ok) failed = null
    else {
      const body = await res
        .clone()
        .json()
        .catch(() => null)
      failed = String(body?.error?.message ?? body?.error ?? `HTTP ${res.status}`).slice(0, 300)
    }
    return res
  }
}

/**
 * @param {{ pool: import('pg').Pool, secret: string, fetchImpl?: typeof fetch, prices?: object[] }} input
 * @returns {(call: { prompt: string, size?: number }) => Promise<{ image: Buffer, cost: number, costEstimated: boolean, model: string, provider: string }>}
 *   `size` is the square the tool wants; chat-completions picture models pick their own size, so it is not sent.
 */
export function createDraw({ pool, secret, fetchImpl = fetch, prices = BRAND_PRICES }) {
  return async function draw({ prompt }) {
    const door = await drawDoor(pool, secret)
    const price = priceFor(door.model, prices)
    if (!price)
      throw new DrawRefused(
        `BRAND_PRICE_UNKNOWN: no price for ${door.model}, so the picture is not sent. Add it to brand-step/brand-prices.js.`
      )
    const { chat } = await seeder('model')
    // `chat` has no signal of its own: the race stops a run waiting on a model that never answers.
    const timeout = AbortSignal.timeout(DRAW_TIMEOUT_MS)
    const stopped = new Promise((_, reject) =>
      timeout.addEventListener('abort', () => reject(new Error('the picture took too long')), { once: true })
    )
    const answer = await Promise.race([
      chat(
        { url: door.url, key: door.key },
        { model: door.model, images: true, messages: [{ role: 'user', content: prompt }] },
        singleAttempt(fetchImpl),
        { retryDelayMs: 0 }
      ),
      stopped
    ])
    const image = answer?.images?.[0]
    if (!image?.bytes?.length) throw new Error(`${door.model} answered no picture`)
    const { cost, estimated } = costOfCall(answer.usage, price)
    return {
      image: Buffer.from(image.bytes),
      cost,
      costEstimated: estimated,
      model: answer.model ?? door.model,
      provider: door.providerId
    }
  }
}
