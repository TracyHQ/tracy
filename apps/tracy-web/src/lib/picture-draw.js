/**
 * A picture drawn for an empty place, always from the business's own photographs (plan §8, spec #189 ticket #194):
 * `outpaint` extends one real photo to the place's shape, its middle kept; `scene` draws the slot's subject (an offering,
 * else the business's place) in the style, colours and light of a few of its own photos; `object` draws one object of the
 * activity on a plain ground, for a cut-out figure (#195). The fill plan decides which slot is drawn and how
 * (`domain/fill-draw.mjs`, `decor-plan.mjs`); never a person, a logo or words.
 *
 * The model is the picture door this deployment has (`models().image`: OpenRouter, `google/gemini-3.1-flash-lite-image` by
 * default, measured 18/10/2026: 16:9 kept, $0.034, 8 s); the call is the seeder's `chat`. What comes back is checked by the
 * caller like any picture (C9: never enlarged past 1.25×), and is never mixed into the collected pictures.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const DRAW_PROMPT_VERSION = 'd2'
const REFERENCE_EDGE = 1024
const NEVER =
  'No text, no letters, no signs, no logos, no watermarks, no recognisable faces, no person facing the camera.'

const ratio = (aspect) => {
  for (const [w, h] of [
    [16, 9],
    [21, 9],
    [12, 5],
    [3, 2],
    [4, 3],
    [2, 1],
    [1, 1],
    [3, 4],
    [9, 16]
  ])
    if (Math.abs(w / h - aspect) / aspect < 0.03) return `${w}:${h}`
  return `${Math.round(aspect * 100)}:100`
}
const orientation = (aspect) => (aspect > 1.05 ? 'landscape' : aspect < 0.95 ? 'portrait' : 'square')

/**
 * What the drawing shows, from the brief (spec #189, ticket #194): the offering a card is about, else the business's own
 * place, with the business's category. Never one category's own words: any business gets its own subject.
 */
function subjectWords(subject) {
  const of = subject?.category ? ` (a ${subject.category})` : ''
  if (subject?.kind === 'offering' && subject.label) return `${subject.label} at this business${of}`
  return `this business's own place${of}, as its customers see it`
}

/** What the model is asked, by mode: `outpaint`, `scene`, or `object` (a cut-out figure's object on a plain ground). */
export function drawPrompt(item) {
  const shape = `${ratio(item.aspect)} (width ${item.aspect.toFixed(2)} times the height), ${orientation(item.aspect)}`
  if (item.mode === 'outpaint')
    return `Extend this photograph to a wider frame of ${shape}. Keep the original photograph unchanged in the middle and continue its scene naturally on every side, with the same light, colours and perspective. Photorealistic. ${NEVER}`
  if (item.mode === 'object') {
    const what = item.subject?.label ? `${item.subject.label}` : `the work of this business`
    return `One single object used for ${what}, shown whole in the centre on a plain pure white background with nothing else in the frame, framed ${shape}, in the colours and light of these reference photos. Photorealistic, soft even light, no shadow on the ground, no people. ${NEVER}`
  }
  return `A photograph of ${subjectWords(item.subject)}, in the same style, colours and light as these reference photos of it, framed ${shape}, for its website. Photorealistic, natural light. ${NEVER}`
}

/** The cache key of a drawing: what it was made from, for what subject and shape, how, and by which model. */
export function drawKey(item, { model, shas }) {
  const subject = item.subject
    ? [item.subject.kind, item.subject.id ?? null, item.subject.label ?? null, item.subject.category ?? null]
    : null
  return createHash('sha256')
    .update(
      JSON.stringify([
        DRAW_PROMPT_VERSION,
        model,
        item.mode,
        item.aspect.toFixed(3),
        shas,
        subject,
        item.variant ?? 0
      ])
    )
    .digest('hex')
}

/**
 * @param {{door: {url: string, key: string, imageModel: string}, chat: Function, item: {mode: string, aspect: number},
 *   references: Uint8Array[], fetchImpl?: typeof fetch, signal?: AbortSignal}} input
 * @returns {Promise<{bytes: Buffer, width: number, height: number, costUsd: number | null, model: string}>}
 */
export async function drawForPlace({ door, chat, item, references, fetchImpl, signal }) {
  // One original decoded at a time: all at once is the peak that got tracy-web OOM-killed in `picture-vision`.
  const images = []
  for (const bytes of references)
    images.push(
      (
        await sharp(Buffer.from(bytes), { failOn: 'none' })
          .rotate()
          .resize(REFERENCE_EDGE, REFERENCE_EDGE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
      ).toString('base64')
    )
  // `chat` has no signal of its own and retries a timeout: the race is what stops a run waiting on a model that never
  // answers, as `drawPictures` does.
  const stopped = new Promise((_, reject) => {
    const stop = () => reject(new Error('the picture took too long'))
    if (signal?.aborted) stop()
    else signal?.addEventListener('abort', stop, { once: true })
  })
  const answer = await Promise.race([
    chat(
      door,
      {
        model: door.imageModel,
        images: true,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: drawPrompt(item) },
              ...images.map((b64) => ({
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${b64}` }
              }))
            ]
          }
        ]
      },
      fetchImpl
    ),
    stopped
  ])
  const image = answer?.images?.[0]
  if (!image) throw new Error(`${door.imageModel} answered no picture`)
  const meta = await sharp(Buffer.from(image.bytes), { failOn: 'none' }).metadata()
  if (!meta.width || !meta.height)
    throw new Error(`${door.imageModel} answered a picture whose size cannot be read`)
  const cost = Number(/** @type {any} */ (answer.usage)?.cost)
  return {
    bytes: Buffer.from(image.bytes),
    width: meta.width,
    height: meta.height,
    costUsd: Number.isFinite(cost) ? cost : null,
    model: answer.model ?? door.imageModel
  }
}
