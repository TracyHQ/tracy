// The drawing door of the brand bench (#320): ctx.draw({ prompt, size }) -> { image, cost, model, provider }. It is
// the EXISTING picture door `seedImage` (the model a deployment books in /ops > Model & AI), called the way the
// site pictures are drawn: the seeder's `chat` with `images: true` against the provider's chat-completions endpoint
// (sites/brief-engines/pictures.js, lib/picture-draw.js). No new provider client, no environment fallback, and the
// key is read from the provider book only for the call and never logged or returned. The cost cap and the call log
// are the tool's business (it checks the cap before calling this and records after).
import { doorEntry } from '../lib/llm-catalog.js'
import { seeder } from '../lib/seeder.js'
import { lookupDoor } from '../lib/llm-store.js'

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
 * @param {{ pool: import('pg').Pool, secret: string, fetchImpl?: typeof fetch }} input
 * @returns {(call: { prompt: string, size?: number }) => Promise<{ image: Buffer, cost: number | null, model: string, provider: string }>}
 *   `size` is the square the tool wants; chat-completions picture models pick their own size, so it is not sent.
 */
export function createDraw({ pool, secret, fetchImpl = fetch }) {
  return async function draw({ prompt }) {
    const door = await drawDoor(pool, secret)
    const { chat } = await seeder('model')
    // `chat` retries a timeout and has no signal of its own: the race stops a run waiting on a model that never answers.
    const timeout = AbortSignal.timeout(DRAW_TIMEOUT_MS)
    const stopped = new Promise((_, reject) =>
      timeout.addEventListener('abort', () => reject(new Error('the picture took too long')), { once: true })
    )
    const answer = await Promise.race([
      chat(
        { url: door.url, key: door.key },
        { model: door.model, images: true, messages: [{ role: 'user', content: prompt }] },
        fetchImpl
      ),
      stopped
    ])
    const image = answer?.images?.[0]
    if (!image?.bytes?.length) throw new Error(`${door.model} answered no picture`)
    const cost = Number(answer.usage?.cost)
    return {
      image: Buffer.from(image.bytes),
      cost: Number.isFinite(cost) ? cost : null,
      model: answer.model ?? door.model,
      provider: door.providerId
    }
  }
}
