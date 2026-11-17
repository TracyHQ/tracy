// The picture wishes of the frames the build draws (#575 pictures gap audit, port 1). The step chain's planner wrote a
// picture wish for every frame (`apps/tracy-web/src/site-planner/planner-prompt.md`, "A `specific` picture wish
// says"), and the drawer filled its fixed template from those words only (`site-pictures/drawer-call.js`
// `drawingText`). The build chat's plan carries no wish, so the standard build model writes them in ONE call for the
// frames that will be drawn, from the planner's own wish rules (`picture-wishes-prompt.md`, draft, #600). The frame's
// `size` is code's: its declared frame size in the planner's words ("wide, 1440 x 700").
//
// 🔒 A WISH THAT CANNOT BE USED FAILS THE STEP. A call that throws, an unreadable reply, a frame left out, or a `shows`
// that is empty or offers alternatives (the word "or", which the planner's rule forbids) throws `PicturePolicyError`
// `picture_wishes_failed`: the frame re-runs the step once, then the build stops (ADR 0047).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PicturePolicyError } from './picture-labelling.mjs'

export const PICTURE_WISHES_PROMPT_FILE = 'picture-wishes-prompt.md'
export const PICTURE_WISHES_PROMPT = readFileSync(
  new URL(`./${PICTURE_WISHES_PROMPT_FILE}`, import.meta.url),
  'utf8'
)
const PROMPT_SHA256 = createHash('sha256').update(PICTURE_WISHES_PROMPT).digest('hex')

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const words = (value) =>
  list(value)
    .filter(isText)
    .map((w) => w.trim())
/** The planner's rule: `shows` names exactly one subject, never alternatives. */
const OFFERS_CHOICE = /\bor\b/i

/** A frame's shape and size in the planner's words: "wide, 1440 x 700". Null when it declares no size. */
export function sizeWords(size) {
  const width = Number(size?.width)
  const height = Number(size?.height)
  if (!(width > 0 && height > 0)) return null
  const shape = width === height ? 'square' : width > height ? 'wide' : 'tall'
  return `${shape}, ${width} x ${height}`
}

/** The words of an item the model is shown: its name and the text fields of its own. */
function itemWordsOf(item) {
  if (!item) return null
  const fields = {}
  for (const [role, field] of Object.entries(item.fields ?? {}))
    if (!/(?:image|_url|video)$/.test(role) && isText(field?.value)) fields[role] = field.value
  return { kind: item.kind, ...(isText(item.label) ? { label: item.label } : {}), fields }
}

/**
 * The request of the wish call.
 * @param {{business: object, frames: object[], items: Map<string, object>}} input
 */
export function wishesRequest({ business, frames, items }) {
  const asked = frames.map((f) => ({
    id: f.id,
    page: f.page,
    block: f.block,
    type: f.blockType,
    kind: f.kind,
    size: sizeWords(f.generate?.size ?? f.size),
    ...(f.item && items.get(f.item) ? { item: itemWordsOf(items.get(f.item)) } : {})
  }))
  return { system: PICTURE_WISHES_PROMPT, user: JSON.stringify({ business, frames: asked }), format: 'json' }
}

function readReply(reply) {
  let value = reply
  if (typeof reply === 'string') {
    try {
      value = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
    } catch {
      return null
    }
  }
  return value && Array.isArray(value.wishes) ? value.wishes : null
}

const fail = (message, details) => {
  throw new PicturePolicyError('picture_wishes_failed', message, details)
}

/**
 * The wish of every frame to draw, by frame id.
 * @param {{frames: object[], profile: object, model: (request: object) => Promise<unknown>}} input `frames`: the
 *   frames to draw (generated, not a reuse, not a pair's variant); `profile`: the profile read without what it holds
 * @returns {Promise<{wishes: Map<string, {shows: string, mustInclude: string[], avoid: string[], mood: string,
 *   size: string | null}>, prompt: {file: string, sha256: string} | null}>}
 */
export async function pictureWishes({ frames, profile, model }) {
  if (!frames.length) return { wishes: new Map(), prompt: null }
  const items = new Map(
    Object.values(profile?.items ?? {})
      .flat()
      .filter((i) => isText(i?.id))
      .map((i) => [i.id, i])
  )
  const fact = (kind) => list(profile?.facts?.[kind]).find((f) => isText(f?.value))?.value ?? null
  const business = {
    name: fact('business.name'),
    about: profile?.about?.value ?? fact('business.description') ?? null
  }
  let reply
  try {
    reply = await model(wishesRequest({ business, frames, items }))
  } catch (error) {
    fail(`the wish call failed: ${error?.message ?? error}`, { frames: frames.map((f) => f.id) })
  }
  const answers = readReply(reply)
  if (!answers) fail('the wish reply is not a JSON object with wishes', { frames: frames.map((f) => f.id) })
  const byFrame = new Map(answers.filter((w) => isText(w?.frame)).map((w) => [w.frame, w]))
  const wishes = new Map()
  const unusable = []
  for (const frame of frames) {
    const w = byFrame.get(frame.id)
    if (!isText(w?.shows) || OFFERS_CHOICE.test(w.shows)) {
      unusable.push(frame.id)
      continue
    }
    wishes.set(frame.id, {
      shows: w.shows.trim(),
      mustInclude: words(w.mustInclude),
      avoid: words(w.avoid),
      mood: isText(w.mood) ? w.mood.trim() : '',
      size: sizeWords(frame.generate?.size ?? frame.size)
    })
  }
  if (unusable.length)
    fail(`no usable wish for ${unusable.length} of ${frames.length} frames`, { frames: unusable })
  return { wishes, prompt: { file: PICTURE_WISHES_PROMPT_FILE, sha256: PROMPT_SHA256 } }
}
