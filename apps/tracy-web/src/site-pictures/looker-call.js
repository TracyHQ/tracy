// One look (#343, ADR 0043 section 3): one finished picture, shown to the looker at its display size, with the plan's
// words for its frame and nothing else (not the picker's reason, not the other frames, not the brief). A fresh
// conversation every time: one system message (the looker prompt) and one user message. For an extended owner photo
// (`owner-photo-extended`, #344) the real part is outlined on the picture and the message says so. A cut-out (#346) is
// shown over the frame page background colour (mid-grey when unknown) where it is transparent, and the message says so, says whether the site's text sits
// over or beside the picture box, and how much of the box the template's own figure and this one cover; the cut-out
// faults are named only then. An `any-real` frame (spec #336) takes any real owner photo that fits it: the looker is told
// so, is given only the plan's `avoid` and `mood` for it, and may not name "wrong subject" there; code drops that fault
// if the model names it anyway (readLook), so a model slip never fails a gallery photo for its scene. "face cut" (a
// person's head or face cut by the frame edge) fails every picture frame, any-real ones included. A frame's surface
// (frame-surface/, ADR 0043 section 3e) is told too: when the template lays its own dark overlay over the picture the
// looker is told not to judge its brightness; when the site's text sits over it with no such overlay, it judges whether
// light text would read there and may name "text would not read" (only then: code drops it on any other look).
//
// The answer is held to a fixed form: a verdict, faults from the fixed list (FAULTS) and one `seen` sentence. A fault
// name outside the model's list is dropped and noted; any fault makes the verdict "fail". An answer that cannot be read,
// or a call that fails, is a look with no verdict and its reason; the caller asks once more, then records the fault
// "look unreadable" (looker-step.js). It never stops the run.
import sharp from 'sharp'
import { costOfCall, priceFor } from '../brand-step/brand-prices.js'
import { costOf } from '../lib/agent-over-door-wire.js'
import { jsonObjectIn } from '../sites/brief-engines/shared.js'
import { overlayCovers } from './frame-surface/surface.js'

/** The faults the looker may name on any picture, exactly as written. */
export const PICTURE_FAULTS = Object.freeze([
  'wrong subject',
  'no clear subject',
  'forbidden item',
  'subject cut off',
  'face cut',
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
/** The fault it may name when the site's text sits over the picture with no template overlay (section 3e). */
export const TEXT_OVER_FAULT = 'text would not read'
/** Every fault the looker model may name. */
export const MODEL_FAULTS = Object.freeze([...PICTURE_FAULTS, ...CUTOUT_FAULTS, TEXT_OVER_FAULT])
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
export const faultsFor = ({ cutout = null, anyReal = false, surface = null } = {}) => [
  ...(cutout ? [...PICTURE_FAULTS, ...CUTOUT_FAULTS] : PICTURE_FAULTS).filter(
    (f) => !(anyReal && f === WRONG_SUBJECT)
  ),
  ...(judgesText(surface) ? [TEXT_OVER_FAULT] : [])
]

/** Whether a look judges how light text would read on the picture: text over it, no template overlay covering it. */
const judgesText = (surface) => Boolean(surface?.textOver) && !surface?.overlay

/**
 * What the looker is told of a frame's surface: { textOver, overlay: { colour, strength } | null } where `overlay` is
 * the template's own overlay strong enough to carry light text; null when the frame has neither (nothing to say).
 */
export function surfaceFacts(frame) {
  const o = frame?.templateOverlay
  const covers = overlayCovers(frame)
  const textOver = frame?.textOver === true || frame?.shownAs === 'background'
  if (!covers && !textOver) return null
  return { textOver, overlay: covers ? { colour: o.colour, strength: o.strength } : null }
}

// The lines a frame's surface adds to the message.
function surfaceLines(surface) {
  if (surface.overlay)
    return [
      `On the site, the template lays its own dark overlay (${surface.overlay.colour}, ${percent(surface.overlay.strength)} strong) over this whole picture${surface.textOver ? ", and the page's heading and text sit on it" : ''}. You see the picture without it: do not judge how bright or dark the picture is.`
    ]
  return [
    'On the site, the page\'s heading and text sit over this picture in light letters, with no overlay of the template over it. Judge whether light text would read on it: name "text would not read" when the picture is so bright or so busy that white letters over most of it would not read.'
  ]
}

/**
 * The picture as the site shows it: resized to fit the frame's display box (never enlarged), as a PNG, with the real
 * part of an extended photo outlined, and a cut-out over the frame's page background colour (mid-grey when unknown). `realPart` is a box on the finished file.
 */
export async function lookImage(
  bytes,
  { width, height },
  realPart = null,
  { checks = false, background = null } = {}
) {
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
  if (checks) sized = await overBackground(sized.data, sized.info, background)
  return { base64: sized.data.toString('base64'), width: sized.info.width, height: sized.info.height }
}

// A cut-out laid over one flat colour: the frame's page background when known, else mid-grey. Never a checkerboard,
// which the looker could mistake for leftover ground.
const MID_GREY = '#808080'
async function overBackground(png, { width, height }, background) {
  const colour = /^#[0-9a-f]{6}$/i.test(String(background ?? '')) ? background : MID_GREY
  return sharp({ create: { width, height, channels: 3, background: colour } })
    .composite([{ input: png }])
    .removeAlpha()
    .png()
    .toBuffer({ resolveWithObject: true })
}

const percent = (x) => `${Math.round(x * 100)}%`

// The lines a cut-out adds to the message.
function cutoutLines(cutout) {
  return [
    'This picture is a cut-out: the figure was drawn on a plain ground that code removed. The flat colour behind the figure is the page background of the site, shown where the picture is transparent; it is not part of the picture.',
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
export function lookMessage({ words, image, outlined, cutout = null, anyReal = false, surface = null }) {
  const faults = faultsFor({ cutout, anyReal, surface })
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
    ...(surface && !cutout ? surfaceLines(surface) : []),
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
export function readLook(text, { anyReal = false, surface = null } = {}) {
  const answer = jsonObjectIn(text)
  if (!answer || typeof answer !== 'object') return { problem: 'the answer holds no JSON object' }
  const seen = typeof answer.seen === 'string' ? answer.seen.trim() : ''
  if (!seen) return { problem: 'the answer has no seen sentence' }
  const named = Array.isArray(answer.faults) ? answer.faults.map((f) => String(f).trim().toLowerCase()) : []
  const allowed = MODEL_FAULTS.filter(
    (f) => !(anyReal && f === WRONG_SUBJECT) && (f !== TEXT_OVER_FAULT || judgesText(surface))
  )
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
  surface = null,
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
          { role: 'user', content: lookMessage({ words, image, outlined, cutout, anyReal, surface }) }
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
  const read = readLook(choice?.message?.content ?? '', { anyReal, surface })
  // An answer the cap cut off says so, so a too small cap is not mistaken for a model that ignores the form.
  if (read.problem && choice?.finish_reason === 'length')
    return done(
      { problem: `${read.problem}: the answer was cut off at the token cap (${LOOK_MAX_TOKENS})` },
      json
    )
  return done(read.problem ? { problem: read.problem } : read, json)
}
