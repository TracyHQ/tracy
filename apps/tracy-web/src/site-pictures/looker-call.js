// One look (#343, ADR 0043 section 3): one finished picture, shown to the looker at its display size, with the plan's
// words for its frame and nothing else (not the picker's reason, not the other frames, not the brief). A fresh
// conversation every time: one system message (the looker prompt) and one user message. For an extended owner photo
// (`owner-photo-extended`, #344) the real part is outlined on the picture and the message says so. A cut-out (#346) is
// shown over grey and white checks where it is transparent, and the message says so, says whether the site's text sits
// over or beside the picture box, and how much of the box the template's own figure and this one cover; the cut-out
// faults are named only then. An `any-real` frame (spec #336) takes any real owner photo that fits it: the looker is told
// so, is given only the plan's `avoid` and `mood` for it, and may not name "wrong subject" there; code drops that fault
// if the model names it anyway (readLook), so a model slip never fails a gallery photo for its scene.
//
// The answer is held to a fixed form: a verdict, faults from the fixed list (FAULTS) and one `seen` sentence. A fault
// name outside the model's list is dropped and noted; any fault makes the verdict "fail". An answer that cannot be read,
// or a call that fails, is a look with no verdict and its reason; the caller asks once more, then records the fault
// "look unreadable" (looker-step.js). It never stops the run.
import sharp from 'sharp'
import { jsonObjectIn } from '../sites/brief-engines/shared.js'
import { costOf } from '../lib/agent-over-door-wire.js'
import { costOfCall, priceFor } from '../brand-step/brand-prices.js'

/** The faults the looker may name on any picture, exactly as written. */
export const PICTURE_FAULTS = Object.freeze([
  'wrong subject',
  'forbidden item',
  'subject cut off',
  'distorted face or body',
  'stray lettering',
  'visible drawing seam'
])
/** The faults it may name on a cut-out besides those (#346). */
export const CUTOUT_FAULTS = Object.freeze([
  'rough cut-out edge',
  'leftover ground',
  'missing part',
  'covers the text'
])
/** Every fault the looker model may name. */
export const MODEL_FAULTS = Object.freeze([...PICTURE_FAULTS, ...CUTOUT_FAULTS])
/** The fault code records when the looker could not look at a picture, twice: it fails the picture. */
export const LOOK_UNREADABLE = 'look unreadable'
/** The fixed fault list of a look: the model's faults and the one code records. */
export const FAULTS = Object.freeze([...MODEL_FAULTS, LOOK_UNREADABLE])

/** How long one look may take. */
export const LOOK_MS = 90_000
/**
 * The answer's token cap. A reasoning model (gpt-6-luna) spends its thinking from the same budget, measured at 300 to
 * 900 reasoning tokens before a 50 token answer: a cap of 600 cut about one look in five off before its JSON object.
 */
export const LOOK_MAX_TOKENS = 4000
const OUTLINE = '#ff00ff'
const CHECK = 16

/** The fault an `any-real` frame never fails for: it takes any real owner photo, whatever its scene. */
export const WRONG_SUBJECT = 'wrong subject'
/** Whether a frame's wish takes any real owner photo (spec #336). */
export const isAnyReal = (wish) => wish?.match === 'any-real'

/**
 * The plan's words for a frame, as the looker reads them. An any-real frame gets no subject words (`shows`,
 * `mustInclude`), only what applies to any picture in it, so the looker is not led to judge its scene.
 */
export const lookWords = (wish) => {
  const avoid = Array.isArray(wish?.avoid) ? wish.avoid : []
  const mood = wish?.mood ?? null
  if (isAnyReal(wish)) return { match: 'any-real', avoid, mood }
  return {
    shows: wish?.shows ?? null,
    mustInclude: Array.isArray(wish?.mustInclude) ? wish.mustInclude : [],
    avoid,
    mood
  }
}

/** The faults the model may name for a picture. */
export const faultsFor = ({ cutout = null, anyReal = false } = {}) =>
  (cutout ? MODEL_FAULTS : PICTURE_FAULTS).filter((f) => !(anyReal && f === WRONG_SUBJECT))

/**
 * The picture as the site shows it: resized to fit the frame's display box (never enlarged), as a PNG, with the real
 * part of an extended photo outlined, and a cut-out over grey and white checks. `realPart` is a box on the finished file.
 */
export async function lookImage(bytes, { width, height }, realPart = null, { checks = false } = {}) {
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
  let sized = await sharp(await pipeline.png().toBuffer())
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true })
  if (checks) sized = await overChecks(sized.data, sized.info)
  return { base64: sized.data.toString('base64'), width: sized.info.width, height: sized.info.height }
}

// A cut-out laid over grey and white checks, so its transparent part, its edges and any ground left are seen.
async function overChecks(png, { width, height }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><pattern id="c" width="${2 * CHECK}" height="${2 * CHECK}" patternUnits="userSpaceOnUse"><rect width="${2 * CHECK}" height="${2 * CHECK}" fill="#ffffff"/><rect width="${CHECK}" height="${CHECK}" fill="#c8c8c8"/><rect x="${CHECK}" y="${CHECK}" width="${CHECK}" height="${CHECK}" fill="#c8c8c8"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#c)"/></svg>`
  const laid = await sharp(Buffer.from(svg))
    .composite([{ input: png }])
    .png()
    .toBuffer()
  // Composited last by sharp, so the alpha is dropped in a second pass.
  return sharp(laid).removeAlpha().png().toBuffer({ resolveWithObject: true })
}

const percent = (x) => `${Math.round(x * 100)}%`

// The lines a cut-out adds to the message.
function cutoutLines(cutout) {
  return [
    'This picture is a cut-out: the figure was drawn on a plain ground that code removed. The grey and white checks show where the picture is transparent on the site; they are not part of the picture.',
    cutout.textOver
      ? "On the site, the page's heading and text sit over part of this picture box, on the part the figure leaves clear."
      : "On the site, the page's heading and text sit beside this picture.",
    ...(Number.isFinite(cutout.demoFigure) && Number.isFinite(cutout.figure)
      ? [
          `The template's own figure covers about ${percent(cutout.demoFigure)} of the box; this figure covers about ${percent(cutout.figure)}.`
        ]
      : [])
  ]
}

const ANY_REAL_LINES = [
  'This frame accepts any real photo of the business (a gallery, background or atmosphere picture): it does not ask for a particular scene, so never fail it for what it shows. Fail it only for a fault in the list below that is visible in it.'
]

/**
 * The look's only user message. `cutout`: { textOver, figure, demoFigure } for a cut-out, else null; `anyReal` for a
 * frame that takes any real owner photo.
 */
export function lookMessage({ words, image, outlined, cutout = null, anyReal = false }) {
  const faults = faultsFor({ cutout, anyReal })
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
    ...(cutout ? cutoutLines(cutout) : []),
    ...(anyReal ? ANY_REAL_LINES : []),
    `Faults you may name: ${faults.map((f) => `"${f}"`).join(', ')}.`,
    'Answer with one JSON object: { "verdict": "pass" | "fail", "faults": [...], "seen": "<one sentence>" }'
  ].join('\n')
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${image.base64}` } }
  ]
}

/**
 * The looker's answer held to the fixed form: { verdict, faults, seen, dropped } or { problem }. For an any-real frame
 * (`anyReal`) "wrong subject" is dropped like a name outside the list, and a fail that named nothing else passes.
 */
export function readLook(text, { anyReal = false } = {}) {
  const answer = jsonObjectIn(text)
  if (!answer || typeof answer !== 'object') return { problem: 'the answer holds no JSON object' }
  const seen = typeof answer.seen === 'string' ? answer.seen.trim() : ''
  if (!seen) return { problem: 'the answer has no seen sentence' }
  const named = Array.isArray(answer.faults) ? answer.faults.map((f) => String(f).trim().toLowerCase()) : []
  const allowed = anyReal ? MODEL_FAULTS.filter((f) => f !== WRONG_SUBJECT) : MODEL_FAULTS
  const faults = allowed.filter((f) => named.includes(f))
  const dropped = named.filter((f) => !allowed.includes(f))
  if (answer.verdict !== 'pass' && answer.verdict !== 'fail')
    return { problem: `the verdict must be "pass" or "fail", found ${JSON.stringify(answer.verdict)}` }
  const slipOnly = anyReal && !faults.length && named.includes(WRONG_SUBJECT)
  const verdict = faults.length ? 'fail' : slipOnly ? 'pass' : answer.verdict
  return { verdict, faults, seen, dropped }
}

/**
 * Ask the looker once, over an OpenAI-compatible /chat/completions endpoint.
 * @returns {Promise<{ verdict: 'pass' | 'fail' | null, faults: string[], seen: string | null, problem?: string,
 *   dropped?: string[], model: string, ms: number, costUsd: number | null, costEstimated: boolean }>}
 */
export async function askLooker({
  door,
  system,
  words,
  image,
  outlined,
  cutout = null,
  anyReal = false,
  fetchImpl = fetch,
  ms = LOOK_MS
}) {
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
          { role: 'user', content: lookMessage({ words, image, outlined, cutout, anyReal }) }
        ],
        max_tokens: LOOK_MAX_TOKENS,
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
  const choice = json.choices?.[0]
  const read = readLook(choice?.message?.content ?? '', { anyReal })
  // An answer the cap cut off says so, so a too small cap is not mistaken for a model that ignores the form.
  if (read.problem && choice?.finish_reason === 'length')
    return done(
      { problem: `${read.problem}: the answer was cut off at the token cap (${LOOK_MAX_TOKENS})` },
      json
    )
  return done(read.problem ? { problem: read.problem } : read, json)
}
