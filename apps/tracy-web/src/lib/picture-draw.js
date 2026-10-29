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
import { colourWords } from 'website-opportunities/domain/brand-colours.mjs'

export const DRAW_PROMPT_VERSION = 'd6'
const REFERENCE_EDGE = 1024
const NEVER =
  'No text, no letters, no lettering, no numbers, no signs, no logos, no watermarks, no recognisable faces, no faces of any kind, no person facing the camera.'

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
 * Who the business is, as the Customize drawings tell it (`pictureBriefs` in `sites/brief-engines/pictures.js`): its
 * name and key messages, then its kind. Never one category's own words: any business gets its own facts.
 */
function factsOf(subject) {
  return [subject?.about, subject?.category]
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .join(' \u2014 ')
}

/**
 * What a scene shows: the offering a card is about in use, else the business's own place in use. Never an invented
 * person who seems to work or train there (spec #189, #194): people only small, far off, from behind or out of focus.
 */
function activityOf(subject) {
  if (subject?.kind === 'offering' && subject.label)
    return `${subject.label} at this business: its equipment and its place close up, ready or in use`
  return `the business's own place, ready or in use, as its customers arrive at it`
}

/** Who may be in a drawing: nobody a visitor could take for a real member of staff, customer or child of this business. */
const PEOPLE =
  'If any people appear, show them only from behind, with every face completely outside the frame: no face turned to the camera, no face in focus, no child as the subject. Distance or blur does not make a visible face acceptable.'

/** How the business's own photos are given: what it looks like, never a style or a frame to copy. */
const REFERENCES =
  'The attached photos are real photos of this business: keep what its place, equipment and colours look like, but make a new, professional photograph, not a copy of their framing, text or graphics.'

/**
 * The business's brand colours (its logo's, `item.palette`), said to a scene or object drawing so it sits with the site's
 * colours: where the scene holds colour of its own (clothing, equipment, decor), never as painted blocks or words.
 * Empty without a palette (ADR 0023 amended 29/10/2026).
 * @param {{palette?: string[]}} item
 */
function brandColoursOf(item) {
  const palette = Array.isArray(item.palette) ? item.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : []
  if (!palette.length) return ''
  const said = palette.map((c) => `${colourWords(c)} (${c.toLowerCase()})`).join(' and ')
  return `\nThe business's brand colours are ${said}, from its logo: let them show where the scene naturally holds colour (clothing, equipment, furniture, decor, light), without colour blocks, frames or graphics.`
}

/**
 * What the model is asked, by mode: `outpaint`, `scene`, or `object` (a cut-out figure's object on a plain ground).
 *
 * 🔒 A SCENE IS ASKED THE WAY CUSTOMIZE ASKS (d3, 29/10/2026). Measured on the local stand with the same model: d2 told
 * the model only "this business's own place (a <category>)" and to copy "the same style, colours and light" as the
 * owner's social posts, and it drew empty courts and rooms in their phone-camera look; a subject that was a record printed
 * as "[object Object]". Told the business's facts and its activity the way `pictureBriefs` does, with the owner's photos
 * as what the place looks like rather than a style to copy, it drew the business at work in its own place.
 * 🔒 BUT NEVER AN INVENTED PERSON WHO SEEMS TO BE ITS OWN (d4, 29/10/2026). d3 asked for the business "at work", and
 * drew a coach and children front-on: invented people a visitor would take for its staff and customers. d4 asks for
 * the place and its equipment in use, with people only small, far off, from behind or out of focus; a drawing the
 * labeller still finds a face in is refused (`drawnPictureVerdict`), drawn once more, then a brand colour block.
 * d5 (29/10/2026): an object for a cut-out is asked large, filling its frame; a small object in the middle of a white
 * ground was set floating across a hero's words instead of standing where the demo's figure stood.
 * d6 (29/10/2026): every visible face and all lettering are forbidden, including distant or blurred faces.
 */
export function drawPrompt(item) {
  const shape = `${ratio(item.aspect)} (width ${item.aspect.toFixed(2)} times the height), ${orientation(item.aspect)}`
  if (item.mode === 'outpaint')
    return `Extend this photograph to a wider frame of ${shape}. Keep the original photograph unchanged in the middle and continue its scene naturally on every side, with the same light, colours and perspective. Photorealistic. ${NEVER}`
  const facts = factsOf(item.subject)
  const about = facts ? `\n${facts}` : ''
  // A logo's symbol (`brief-engines/brand-logo-symbol.js`): the name is set beside it as type by code, never drawn here.
  if (item.mode === 'symbol') {
    const named = item.subject?.label ? ` named "${item.subject.label}"` : ''
    const colours =
      Array.isArray(item.colours) && item.colours.length ? ` in ${item.colours.join(' and ')}` : ''
    return `A simple logo symbol for a business${named}:${about}\nOne bold flat emblem that suggests what the business does, drawn${colours} on a plain pure white background, centred and filling most of a ${shape} frame. Vector style, solid flat colour, no gradient, no shadow, no photograph. The symbol contains no letters, no initials, no numbers and no words in any language: the business name is set beside it separately.\n${NEVER}`
  }
  if (item.mode === 'object') {
    const what = item.subject?.label ? `${item.subject.label}` : `the work of this business`
    return `One single object used for ${what}, for the website of this business:${about}\nShown whole and large, filling most of the frame, on a plain pure white background with nothing else in the frame, framed ${shape}. Photorealistic, soft even light, no shadow on the ground, no people.${brandColoursOf(item)}\n${REFERENCES}\n${NEVER}`
  }
  const page =
    item.subject?.kind === 'offering' && item.subject.label
      ? `for the page of one of its offerings, ${item.subject.label}`
      : 'for its website'
  return `A photograph of this business, ${page}:${about}\nPhotorealistic, natural light, ${activityOf(item.subject)}, framed ${shape}.${brandColoursOf(item)}\n${PEOPLE}\n${REFERENCES}\n${NEVER}`
}

/** The cache key of a drawing: what it was made from, for what subject and shape, how, and by which model. */
export function drawKey(item, { model, shas }) {
  const subject = item.subject
    ? [
        item.subject.kind,
        item.subject.id ?? null,
        item.subject.label ?? null,
        item.subject.category ?? null,
        item.subject.about ?? null
      ]
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
        item.variant ?? 0,
        // Only when given, so a drawing made without brand colours keeps its key.
        ...(Array.isArray(item.palette) && item.palette.length ? [item.palette] : [])
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
  signal?.throwIfAborted()
  // One original decoded at a time: all at once is the peak that got tracy-web OOM-killed in `picture-vision`.
  const images = []
  for (const bytes of references) {
    signal?.throwIfAborted()
    images.push(
      (
        await sharp(Buffer.from(bytes), { failOn: 'none' })
          .rotate()
          .resize(REFERENCE_EDGE, REFERENCE_EDGE, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer()
      ).toString('base64')
    )
  }
  signal?.throwIfAborted()
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
