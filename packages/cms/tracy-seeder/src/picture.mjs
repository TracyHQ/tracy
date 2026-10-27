/**
 * One picture, drawn for a site: the part of the hero seed that the agent's `media.draw` shares.
 *
 * 🔒 THE PROMPT IS PASSED AS GIVEN. Lee, 23/09/2026: the tool need not refuse to draw anything — a
 * customer who wants a picture drawn gets it drawn. Nothing is appended and nothing is filtered here;
 * the provider's own policy is the only one that applies. The seed's hero prompt, which does ask for
 * no text and no logos, is the SEED's choice for an unattended picture, made in `heroPrompt`.
 *
 * 🔒 A SHAPE ASKED FOR IS A SHAPE DELIVERED, OR A PLAIN NO. A sealed site refuses a picture whose
 * shape differs from the slot's by more than 0.02, and picture models draw from a short list of
 * shapes — so a JPEG is cut from its centre, and anything else that cannot be cut is answered as
 * such rather than uploaded to be refused.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { cutToAspect, imageSize } from './image-bytes.mjs'
import { chat as chatWith, keysFromCredentials, providerOf } from './model.mjs'

/** @type {Record<string, string>} */
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/**
 * The picture model this host was given: the key and model /ops pushed into dsh's credential store,
 * the environment winning on any name it sets. Null when no picture model can be reached.
 * @param {Record<string, string | undefined>} env
 */
export function pictureDoor(env) {
  const store = path.join(env.DSH_HOME ?? path.join(env.HOME ?? '', '.dsh'), '.credentials.yaml')
  const stored = existsSync(store) ? keysFromCredentials(readFileSync(store, 'utf8')) : {}
  const key = env.OPENROUTER_API_KEY || stored.OPENROUTER_API_KEY
  if (!key) return null
  const door = providerOf({
    OPENROUTER_API_KEY: key,
    TRACY_SEED_IMAGE_MODEL: env.TRACY_SEED_IMAGE_MODEL || stored.TRACY_SEED_IMAGE_MODEL
  })
  return door?.imageModel ? door : null
}

/**
 * Draw one picture and, when `aspect` (width / height) is given, hold it to that shape.
 * @param {{ door: { url: string, key: string, imageModel: string }, prompt: string, aspect?: number | null,
 *   folder?: string, chat?: typeof chatWith, fetch?: typeof fetch }} args
 *   `folder` is where the site takes an uploaded picture: Joomla `images/tracy-content` (the
 *   default), WordPress `wp-content/uploads/tracy-content`.
 * @returns {Promise<{ ok: true, bytes: Buffer, ext: string, path: string, width: number, height: number,
 *   model: string, costUsd: number | null } | { ok: false, error: string }>}
 */
export async function drawPicture({
  door,
  prompt,
  aspect = null,
  folder = 'images/tracy-content',
  chat = chatWith,
  fetch
}) {
  const answer = await chat(
    door,
    { model: door.imageModel, images: true, messages: [{ role: 'user', content: prompt }] },
    fetch
  )
  const image = answer?.images?.[0]
  let ext = image ? EXT[image.mime] : undefined
  if (!image || !ext) return { ok: false, error: `${door.imageModel} answered no picture` }
  /** @type {Buffer} */
  let bytes = Buffer.from(image.bytes)
  let size = imageSize(bytes)
  if (!size) return { ok: false, error: `${door.imageModel} answered a picture whose size cannot be read` }
  if (aspect && Math.abs(size[0] / size[1] - aspect) > 0.01) {
    if (ext !== 'jpg')
      return {
        ok: false,
        error: `the picture came back ${size[0]}×${size[1]} as ${ext}, which cannot be cut to the shape asked for (${aspect.toFixed(3)})`
      }
    bytes = cutToAspect(bytes, aspect)
    size = imageSize(bytes) ?? size
    ext = 'jpg'
  }
  const hash = createHash('sha256').update(bytes).digest('hex')
  const cost = Number(/** @type {{ cost?: unknown } | null} */ (answer?.usage ?? null)?.cost)
  return {
    ok: true,
    bytes,
    ext,
    path: `${folder}/${hash}.${ext}`,
    width: size[0],
    height: size[1],
    model: answer?.model ?? door.imageModel,
    costUsd: Number.isFinite(cost) && cost > 0 ? cost : null
  }
}
