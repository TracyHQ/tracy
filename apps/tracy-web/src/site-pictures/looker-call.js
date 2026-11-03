// One look (#343, ADR 0043 section 3): one finished picture, shown to the looker at its display size, with the plan's
// words for its frame and nothing else (not the picker's reason, not the other frames, not the brief). A fresh
// conversation every time: one system message (the looker prompt) and one user message. For an extended owner photo
// (`owner-photo-extended`, #344) the real part is outlined on the picture and the message says so.
//
// The answer is held to a fixed form: a verdict, faults from the fixed list (FAULTS) and one `seen` sentence. A fault
// name outside the model's list is dropped and noted; any fault makes the verdict "fail". An answer that cannot be read,
// or a call that fails, is a look with no verdict and its reason; the caller asks once more, then records the fault
// "look unreadable" (looker-step.js). It never stops the run.
import sharp from 'sharp'
import { jsonObjectIn } from '../sites/brief-engines/shared.js'
import { costOf } from '../lib/agent-over-door-wire.js'
import { costOfCall, priceFor } from '../brand-step/brand-prices.js'

/** The faults the looker model may name, exactly as written. */
export const MODEL_FAULTS = Object.freeze([
  'wrong subject',
  'forbidden item',
  'subject cut off',
  'distorted face or body',
  'stray lettering',
  'visible drawing seam'
])
/** The fault code records when the looker could not look at a picture, twice: it fails the picture. */
export const LOOK_UNREADABLE = 'look unreadable'
/** The fixed fault list of a look: the model's faults and the one code records. */
export const FAULTS = Object.freeze([...MODEL_FAULTS, LOOK_UNREADABLE])

/** How long one look may take. */
export const LOOK_MS = 90_000
const MAX_TOKENS = 600
const OUTLINE = '#ff00ff'

/** The plan's words for a frame, as the looker reads them. */
export const lookWords = (wish) => ({
  shows: wish?.shows ?? null,
  mustInclude: Array.isArray(wish?.mustInclude) ? wish.mustInclude : [],
  avoid: Array.isArray(wish?.avoid) ? wish.avoid : [],
  mood: wish?.mood ?? null
})

/**
 * The picture as the site shows it: resized to fit the frame's display box (never enlarged), as a PNG, with the real
 * part of an extended photo outlined. `realPart` is a box on the finished file.
 */
export async function lookImage(bytes, { width, height }, realPart = null) {
  // Turned upright first, so the outline and its box are on the picture as shown.
  const upright = await sharp(Buffer.from(bytes), { failOn: 'none' }).rotate().toBuffer()
  const img = sharp(upright)
  const meta = await img.metadata()
  let pipeline = img
  if (realPart) {
    const { x, y, width: w, height: h } = realPart
    const line = Math.max(2, Math.round(Math.min(meta.width, meta.height) / 150))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${OUTLINE}" stroke-width="${line}"/></svg>`
    pipeline = sharp(upright).composite([{ input: Buffer.from(svg) }])
  }
  const sized = await sharp(await pipeline.png().toBuffer())
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { base64: sized.data.toString('base64'), width: sized.info.width, height: sized.info.height }
}

/** The look's only user message. */
export function lookMessage({ words, image, outlined }) {
  const text = [
    `The plan's words for this frame:`,
    JSON.stringify(words, null, 2),
    '',
    `The picture follows, at the size the site shows it (${image.width} x ${image.height}).`,
    ...(outlined
      ? [
          "The part outlined in magenta is the owner's real photo; the rest was extended by drawing. The outline is not part of the picture."
        ]
      : []),
    `Faults you may name: ${MODEL_FAULTS.map((f) => `"${f}"`).join(', ')}.`,
    'Answer with one JSON object: { "verdict": "pass" | "fail", "faults": [...], "seen": "<one sentence>" }'
  ].join('\n')
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${image.base64}` } }
  ]
}

/** The looker's answer held to the fixed form: { verdict, faults, seen, dropped } or { problem }. */
export function readLook(text) {
  const answer = jsonObjectIn(text)
  if (!answer || typeof answer !== 'object') return { problem: 'the answer holds no JSON object' }
  const seen = typeof answer.seen === 'string' ? answer.seen.trim() : ''
  if (!seen) return { problem: 'the answer has no seen sentence' }
  const named = Array.isArray(answer.faults) ? answer.faults.map((f) => String(f).trim().toLowerCase()) : []
  const faults = MODEL_FAULTS.filter((f) => named.includes(f))
  const dropped = named.filter((f) => !MODEL_FAULTS.includes(f))
  if (answer.verdict !== 'pass' && answer.verdict !== 'fail')
    return { problem: `the verdict must be "pass" or "fail", found ${JSON.stringify(answer.verdict)}` }
  const verdict = faults.length ? 'fail' : answer.verdict
  return { verdict, faults, seen, dropped }
}

/**
 * Ask the looker once, over an OpenAI-compatible /chat/completions endpoint.
 * @returns {Promise<{ verdict: 'pass' | 'fail' | null, faults: string[], seen: string | null, problem?: string,
 *   dropped?: string[], model: string, ms: number, costUsd: number | null, costEstimated: boolean }>}
 */
export async function askLooker({ door, system, words, image, outlined, fetchImpl = fetch, ms = LOOK_MS }) {
  const started = Date.now()
  const done = (fields, json = null) => {
    const price = priceFor(door.model)
    const reported = costOf(json?.usage)
    const cost =
      reported !== null
        ? { cost: reported, estimated: false }
        : json?.usage && price
          ? costOfCall(json.usage, price)
          : { cost: null, estimated: false }
    return {
      verdict: null,
      faults: [],
      seen: null,
      ...fields,
      model: json?.model ?? door.model,
      ms: Date.now() - started,
      costUsd: cost.cost,
      costEstimated: cost.estimated
    }
  }
  let json = null
  try {
    const res = await fetchImpl(`${door.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${door.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: door.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: lookMessage({ words, image, outlined }) }
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0,
        usage: { include: true }
      }),
      signal: AbortSignal.timeout(ms)
    })
    json = await res.json().catch(() => null)
    if (!res.ok || !json || json.error)
      return done(
        { problem: `the looker answered ${res.status}: ${String(json?.error?.message ?? '').slice(0, 200)}` },
        json
      )
  } catch (error) {
    return done({
      problem: `the looker could not be reached: ${String(error?.message ?? error).slice(0, 200)}`
    })
  }
  const read = readLook(json.choices?.[0]?.message?.content ?? '')
  return done(read.problem ? { problem: read.problem } : read, json)
}
