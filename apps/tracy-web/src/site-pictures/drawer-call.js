// One drawing (#344, ADR 0043 section 3): the drawer's fixed template (drawing-prompt.md) filled from the plan's words
// for one frame and nothing else (shows, mustInclude, avoid, mood, size), sent to the image model of the `pictureDrawer`
// door in a fresh conversation over an OpenAI-compatible /chat/completions endpoint (OpenRouter's image output). Three
// modes, chosen by code (ladder-step.js): `scene` (a photograph of a place and what happens there), `object` (one thing
// on a quiet background) and `outpaint` (a real owner photo placed in the middle of a wide band, its sides extended).
// The one redraw after a looker rejection adds the template's `redraw` part with the fault names. A fourth mode,
// `cutout` (#346), draws the figure of a cut-out frame on a flat plain ground of one colour code names and removes
// afterwards (cutout-ground.js).
//
// A call that fails or answers no picture is a drawing with no bytes and its reason; it never throws and is never sent
// twice by this module (one drawing is one paid call). Its cost is the provider's figure, else its tokens at the model's
// price (brand-step/brand-prices.js), else null.
import { costOf } from '../lib/agent-over-door-wire.js'
import { costOfCall, priceFor } from '../brand-step/brand-prices.js'

export const DRAW_MODES = Object.freeze(['scene', 'object', 'outpaint', 'cutout'])
/** How long one drawing may take: the model answers in 10 to 25 s. */
export const DRAW_MS = 90_000
/** The aspect ratios the image model takes (OpenRouter `image_config.aspect_ratio`). */
export const ASPECT_RATIOS = Object.freeze([
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
])

const listed = (x) => (Array.isArray(x) && x.length ? x.map(String).join(', ') : 'nothing in particular')
const said = (x) => (typeof x === 'string' && x.trim() ? x.trim() : 'not stated')

/**
 * The text of one drawing: the template's common part, the mode's part and, on a redraw, the redraw part; every place
 * filled from the plan's words (`wish`) or, for the redraw, the fault names; a cut-out's from its `ground`.
 * @param {Record<string, string>} parts picture-prompts.js drawingParts
 * @param {{ name: string, hex: string } | null} [ground] the plain ground of a cut-out (cutout-ground.js GROUNDS)
 */
export function drawingText(parts, mode, wish, faults = null, ground = null) {
  if (!DRAW_MODES.includes(mode)) throw new Error(`not a drawing mode: ${mode}`)
  const values = {
    shows: said(wish?.shows),
    mustInclude: listed(wish?.mustInclude),
    avoid: listed(wish?.avoid),
    mood: said(wish?.mood),
    size: said(wish?.size),
    faults: listed(faults),
    ground: ground ? `${ground.name} (${ground.hex})` : ''
  }
  const fill = (text) => String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '')
  return [parts.common, parts[mode], ...(faults?.length ? [parts.redraw] : [])].map(fill).join('\n\n')
}

/** The supported aspect ratio nearest to a width and height (compared on a log scale). */
export function aspectRatioFor(width, height) {
  const want = Math.log(width / height)
  const ratio = (r) => {
    const [w, h] = r.split(':').map(Number)
    return Math.log(w / h)
  }
  return ASPECT_RATIOS.reduce((best, r) =>
    Math.abs(ratio(r) - want) < Math.abs(ratio(best) - want) ? r : best
  )
}

// The first picture of an answer: OpenRouter's `message.images`, else an image part of the content. Inline only.
function pictureOf(message) {
  const urls = [
    ...(Array.isArray(message?.images) ? message.images : []),
    ...(Array.isArray(message?.content) ? message.content.filter((p) => p?.type === 'image_url') : [])
  ].map((p) => p?.image_url?.url ?? p?.url)
  const url = urls.find((u) => typeof u === 'string' && u.startsWith('data:image/'))
  if (!url) return null
  const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64')
  return bytes.length ? bytes : null
}

/**
 * Draw once.
 * @param {{ door: { baseUrl: string, apiKey: string, model: string }, text: string, image?: Buffer | null,
 *   aspect: string, fetchImpl?: typeof fetch, ms?: number }} input `image`: the picture to extend (PNG), for outpaint
 * @returns {Promise<{ bytes: Buffer | null, problem?: string, model: string, ms: number, costUsd: number | null,
 *   costEstimated: boolean }>}
 */
export async function askDrawer({ door, text, image = null, aspect, fetchImpl = fetch, ms = DRAW_MS }) {
  const started = Date.now()
  const done = (fields, json = null) => {
    const price = priceFor(door.model)
    const reported = costOf(json?.usage)
    const cost =
      reported !== null
        ? { cost: reported, estimated: false }
        : json && price
          ? costOfCall(json.usage, price)
          : { cost: null, estimated: false }
    return {
      bytes: null,
      ...fields,
      model: json?.model ?? door.model,
      ms: Date.now() - started,
      costUsd: cost.cost,
      costEstimated: cost.estimated
    }
  }
  const content = image
    ? [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } }
      ]
    : text
  let json = null
  try {
    const res = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: door.model,
        messages: [{ role: 'user', content }],
        modalities: ['image', 'text'],
        image_config: { aspect_ratio: aspect },
        usage: { include: true }
      }),
      signal: AbortSignal.timeout(ms)
    })
    json = await res.json().catch(() => null)
    if (!res.ok || !json || json.error)
      return done(
        { problem: `the drawer answered ${res.status}: ${String(json?.error?.message ?? '').slice(0, 200)}` },
        json
      )
  } catch (error) {
    return done({
      problem: `the drawer could not be reached: ${String(error?.message ?? error).slice(0, 200)}`
    })
  }
  const bytes = pictureOf(json.choices?.[0]?.message)
  return done(bytes ? { bytes } : { problem: 'the drawer answered no picture' }, json)
}
