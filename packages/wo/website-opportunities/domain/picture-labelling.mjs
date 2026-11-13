// Labelling the business's own pictures before they are placed (ticket #595, spec #577). An own picture without a label
// is not discarded: ONE vision call of the standard build model labels every unlabelled own picture of the site. A
// stock picture is never labelled, since it is never used.
//
// 🔒 A LABELLING FAILURE IS A STEP FAILURE. A vision call that throws, an unreadable reply, or a reply that leaves a
// picture out or gives it no usable label throws a `PicturePolicyError` with code `picture_labelling_failed` naming the
// pictures. The step chain re-runs the pictures step once and then stops and reports (ADR 0047, #591). Nothing is ever
// skipped silently: a picture is labelled or the step fails.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { ASSET_CONTENT_KINDS, orientationOf } from './pictures/asset-labels.mjs'

/** The draft prompt (product owner review: #600). Its hash is recorded with every labelling it made. */
export const PICTURE_LABELLING_PROMPT_FILE = 'picture-labelling-prompt.md'
export const PICTURE_LABELLING_PROMPT = readFileSync(
  new URL(`./${PICTURE_LABELLING_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PICTURE_LABELLING_PROMPT).digest('hex')
const ORIENTATIONS = new Set(['landscape', 'portrait', 'square'])
const CONTENT = new Set(ASSET_CONTENT_KINDS)

/** A failure of the pictures step, with a code the step chain reports (ADR 0047). `details` keeps what the report needs. */
export class PicturePolicyError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = { step: 'pictures', ...details }
  }
}

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** Whether a picture carries a label it may be placed with. */
export const isLabelled = (picture) => isText(picture?.label)

/** The request of the vision call: the prompt, the pictures by id, and their refs as the images to look at. */
export function labellingRequest(pictures) {
  const asked = pictures.map(({ id, ref, media }) => ({ id, ref, media }))
  return {
    system: PICTURE_LABELLING_PROMPT,
    user: JSON.stringify({ pictures: asked }),
    images: asked.map((p) => p.ref),
    format: 'json'
  }
}

/** The reply's entries by id, or null when the reply is not the JSON object the prompt asks for. */
function readReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || !Array.isArray(value.pictures)) return null
  return new Map(value.pictures.filter((p) => isText(p?.id)).map((p) => [p.id, p]))
}

/**
 * Whether text is printed over a picture: `true` from research or from the vision reply wins; `false` only when one of
 * them says so and neither says `true`; otherwise unknown (`undefined`), which the video check refuses.
 */
function burnedInTextOf(picture, answer) {
  if (picture.burnedInText === true || answer.burnedInText === true) return true
  if (answer.burnedInText === false || picture.burnedInText === false) return false
  return undefined
}

/** One picture with the vision call's answer, or null when the answer cannot label it. */
function labelled(picture, answer) {
  if (!isText(answer?.label) || !CONTENT.has(answer?.content)) return null
  const measured = orientationOf(picture.width, picture.height)
  const orientation =
    measured !== 'unknown' ? measured : ORIENTATIONS.has(answer.orientation) ? answer.orientation : 'unknown'
  const { burnedInText: _research, ...rest } = picture
  const burnedInText = burnedInTextOf(picture, answer)
  return {
    ...rest,
    label: answer.label.trim().replace(/\s+/g, ' '),
    content: answer.content,
    people: answer.people === true || answer.content === 'team' || answer.content === 'people-in-action',
    ...(burnedInText === undefined ? {} : { burnedInText }),
    orientation,
    labelledBy: 'vision'
  }
}

/**
 * Label every unlabelled own picture with one vision call; labelled and stock pictures are returned as they are.
 * @param {{pictures: object[], vision: (request: object) => Promise<unknown>}} input own picture records
 *   (`picture-frames.mjs` `ownPicturesOf`) and the standard build model's vision call
 * @returns {Promise<{pictures: object[], labelled: string[], prompt: {file: string, sha256: string} | null}>}
 */
export async function labelOwnPictures({ pictures, vision }) {
  const all = list(pictures)
  const unlabelled = all.filter((p) => !p.stock && !isLabelled(p))
  if (unlabelled.length === 0) return { pictures: all, labelled: [], prompt: null }
  if (typeof vision !== 'function')
    throw new PicturePolicyError('vision_missing', 'own pictures need a label and no vision call was given', {
      pictures: unlabelled.map((p) => p.id)
    })
  let reply
  try {
    reply = await vision(labellingRequest(unlabelled))
  } catch (error) {
    throw new PicturePolicyError(
      'picture_labelling_failed',
      `the vision call failed: ${error?.message ?? error}`,
      {
        pictures: unlabelled.map((p) => p.id),
        cause: error
      }
    )
  }
  const answers = readReply(reply)
  if (!answers)
    throw new PicturePolicyError(
      'picture_labelling_failed',
      'the vision reply is not a JSON object with pictures',
      {
        pictures: unlabelled.map((p) => p.id)
      }
    )
  const done = new Map()
  for (const picture of unlabelled) {
    const result = labelled(picture, answers.get(picture.id))
    if (result) done.set(picture.id, result)
  }
  const missing = unlabelled.filter((p) => !done.has(p.id)).map((p) => p.id)
  if (missing.length)
    throw new PicturePolicyError(
      'picture_labelling_failed',
      `the vision reply gave no usable label for ${missing.length} of ${unlabelled.length} pictures`,
      { pictures: missing }
    )
  return {
    pictures: all.map((p) => done.get(p.id) ?? p),
    labelled: [...done.keys()],
    prompt: { file: PICTURE_LABELLING_PROMPT_FILE, sha256: PROMPT_SHA256 }
  }
}
