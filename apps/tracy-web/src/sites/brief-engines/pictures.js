/**
 * The pictures of "Apply": drawn while the site installs, shaped and placed the moment it is up.
 *
 *   draw   (no site needed) a few photographs of the customer's own business, all at once
 *   place  (the site is up) for each demo picture that is being replaced: read its shape from the site, cut
 *          the drawn picture to it, upload it — all of them at once, beside the engine's other work —
 *          and answer the slot values the contract apply then writes
 *
 * 🔒 WHICH PICTURES, AND NEVER WHICH OTHERS. The hero first, then the other demo pictures of the home page in the
 * order the page shows them, then those of the other pages: the ones a visitor meets, so a bakery's home page does not
 * keep another company's factory. Never a logo (a drawn one is an invented client), a map (a drawn place is an
 * invented one), a face (an avatar is somebody's), an icon or a flag. At most `MAX_PICTURES` distinct demo files:
 * every picture is a model call that costs money, and they are drawn side by side while the site installs.
 * 🔒 A DEMO FILE IS REPLACED EVERYWHERE IT APPEARS. The About page shows the factory the home page shows; replacing
 * it on the home page alone would leave the same picture two ways on one site.
 *
 * 🔒 THE SHAPE IS THE SITE'S, NOT OURS. A sealed site refuses a picture whose shape differs from the demo's
 * by more than 0.02, and one refused value fails the whole write. So the demo file's own header says what
 * shape is wanted, the drawn JPEG is cut from its centre to it, and a picture that cannot be cut (not a
 * JPEG) or whose demo cannot be read keeps the template's own — said, never guessed.
 *
 * 🔒 A PICTURE THAT FAILS COSTS ITS OWN SLOT, and never throws for one. The model call is the seeder's
 * (`model.mjs`, which has no dependency this image lacks); the shape and the cut are `sharp`'s, which this
 * image already carries for its thumbnails — so a PNG can be cut as well as a JPEG, where the seeder's own
 * cutter reads JPEG alone.
 */
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { seeder } from '../../lib/seeder.js'
import { pool } from './shared.js'

/** The width and height a picture's header says it has, or null. Reads no pixels, so a prefix of the file will do. */
export async function sizeOf(bytes) {
  try {
    const { width, height } = await sharp(bytes, { failOn: 'none' }).metadata()
    return width && height ? /** @type {[number, number]} */ ([width, height]) : null
  } catch {
    return null
  }
}

/** A picture cut from its centre to `aspect` (width / height), as a JPEG. */
export async function cutToShape(bytes, aspect) {
  const size = await sizeOf(bytes)
  if (!size) throw new Error('the picture has no readable size')
  let [width, height] = size
  let w = width
  let h = Math.round(width / aspect)
  if (h > height) {
    h = height
    w = Math.round(height * aspect)
  }
  return sharp(bytes)
    .extract({ left: Math.floor((width - w) / 2), top: Math.floor((height - h) / 2), width: w, height: h })
    .jpeg({ quality: 86 })
    .toBuffer()
}

/** @type {Record<string, string>} */
const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

/** The most distinct demo pictures replaced in one Apply: the hero and five more. */
export const MAX_PICTURES = 6
/** How much of a demo picture is read to learn its shape: a PNG says it in 24 bytes, a JPEG in the first segments. */
const HEADER_BYTES = 65_536
/** A picture's own time limit: the model answers in 10–25 s; past this the slot keeps the template's picture. */
export const DRAW_MS = 90_000

/** What a slot is NOT allowed to be drawn for. */
const NEVER = /\b(?:logos?|maps?|avatars?|icons?|flags?|partners?|clients?|favicon|sprite|badge|signature)\b/i
const HERO = /\bhero\b/i

/** The folder a platform takes an uploaded picture in. */
export const FOLDER = Object.freeze({
  joomla: 'images/tracy-content',
  wordpress: 'wp-content/uploads/tracy-content'
})

/**
 * What each picture is of: the customer's own business, never the demo's, and never words or marks.
 * @param {{name: string, about: string, sector?: string | null, pictures?: string[]}} brief
 * @returns {Array<{role: 'hero' | 'section', prompt: string}>}
 */
export function pictureBriefs(brief) {
  const facts = [brief.name, brief.about, brief.sector]
    .filter((v) => typeof v === 'string' && v.trim() !== '')
    .join(' — ')
  const none = 'No text, no letters, no logos, no watermarks, no brand names, no recognisable people.'
  const subject = (i) => (brief.pictures?.[i] ? `\nSubject: ${brief.pictures[i]}` : '')
  /** What each section's photograph is of, so six pictures of one business are six different pictures. */
  const angles = [
    'its craft or product up close — not the same scene as a wide shop front',
    'what it offers, a different subject and angle than the first close-up',
    'the place it works in, seen from inside, with nobody recognisable in it',
    'hands at work on its craft, no faces',
    'a tidy arrangement of what it offers, seen from above'
  ]
  return [
    {
      role: 'hero',
      prompt: `A wide 16:9 hero photograph for the home page of this business:\n${facts}${subject(0)}\nPhotorealistic, natural light, the business at work or its product in use.\n${none}`
    },
    ...angles.map((angle, i) => ({
      role: 'section',
      prompt: `A photograph for a section of the website of this business, beside a few lines about it:\n${facts}${subject(i + 1)}\nPhotorealistic, natural light, ${angle}.\n${none}`
    }))
  ].slice(0, MAX_PICTURES)
}

/**
 * Draw the pictures, all at once. Never throws: a picture that did not come is missing from the answer.
 * @param {object} input
 * @param {{url: string, key: string, imageModel: string} | null} input.door - the picture model, or null when none is set
 * @param {Array<{role: string, prompt: string}>} input.briefs
 * @param {AbortSignal} [input.signal]
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{drawn: Array<{role: string, prompt: string, bytes: Buffer, ext: string, width: number, height: number}>, failed: number, why: string[]}>}
 */
export async function drawPictures({ door, briefs, signal, fetchImpl }) {
  if (!door?.imageModel) return { drawn: [], failed: 0, why: [] }
  const { chat } = await seeder('model')
  const answers = await pool(
    briefs.map((brief) => async () => {
      const cutoff = AbortSignal.any([AbortSignal.timeout(DRAW_MS), ...(signal ? [signal] : [])])
      // `drawPicture` has no signal of its own: the race is what stops a run waiting on a model that never answers.
      const stopped = new Promise((_, reject) => {
        const stop = () => reject(new Error('the picture took too long'))
        if (cutoff.aborted) stop()
        else cutoff.addEventListener('abort', stop, { once: true })
      })
      const answer = await Promise.race([
        chat(
          door,
          { model: door.imageModel, images: true, messages: [{ role: 'user', content: brief.prompt }] },
          fetchImpl
        ),
        stopped
      ])
      const image = answer?.images?.[0]
      const ext = image ? EXT[image.mime] : undefined
      if (!image || !ext) throw new Error(`${door.imageModel} answered no picture`)
      const size = await sizeOf(image.bytes)
      if (!size) throw new Error(`${door.imageModel} answered a picture whose size cannot be read`)
      return {
        role: brief.role,
        prompt: brief.prompt,
        bytes: Buffer.from(image.bytes),
        ext,
        width: size[0],
        height: size[1]
      }
    }),
    briefs.length
  )
  const drawn = []
  const why = []
  for (const answer of answers) {
    if (answer.ok) drawn.push(answer.value)
    else why.push(answer.error instanceof Error ? answer.error.message : String(answer.error))
  }
  return { drawn, failed: answers.length - drawn.length, why }
}

/**
 * The demo pictures a customer's own should replace: the hero first, then the other pictures of the home page in the
 * order the page shows them, then those of the other pages — one entry per distinct demo FILE (the archive shows one file
 * in several slots, on several pages), each with EVERY slot that shows it.
 * @param {Array<{key: string, type: string, sample?: string, label?: string, requiresEvidence?: boolean, entity?: string, target?: {block?: string}}>} slots
 * @param {(slot: any) => boolean} [inEdition] - whether a slot belongs to the edition the words are written in
 * @param {(slot: any) => boolean} [onHome] - whether a slot sits on the home page
 * @returns {Array<{sample: string, role: 'hero' | 'section', slots: any[]}>}
 */
export function pictureGroups(slots, inEdition = () => true, onHome = () => true) {
  /** @type {Map<string, {sample: string, role: 'hero' | 'section', home: boolean, slots: any[]}>} */
  const groups = new Map()
  for (const slot of slots) {
    if (slot.type !== 'image' || !slot.sample || slot.requiresEvidence) continue
    if (!inEdition(slot)) continue
    const name = `${slot.label ?? ''} ${slot.target?.block ?? ''} ${slot.sample}`
    if (NEVER.test(name)) continue
    const group = groups.get(slot.sample) ?? {
      sample: slot.sample,
      role: 'section',
      home: false,
      slots: []
    }
    if (HERO.test(name)) group.role = 'hero'
    if (onHome(slot)) group.home = true
    group.slots.push(slot)
    groups.set(slot.sample, group)
  }
  // The hero first, then what the home page shows (in page order: the sort is stable), then the rest.
  const rank = (/** @type {{role: string, home: boolean}} */ g) => (g.role === 'hero' ? 0 : g.home ? 1 : 2)
  return [...groups.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_PICTURES)
    .map(({ sample, role, slots }) => ({ sample, role, slots }))
}

/**
 * Cut each drawn picture to the shape of the demo it replaces. Reads the site's public address and does CPU work,
 * writes nothing, so it can run beside anything — it is the half of placing that does NOT need the site's one write at a time.
 * @param {object} input
 * @param {Array<{role: string, bytes: Buffer, ext: string, width: number, height: number}>} input.drawn
 * @param {ReturnType<typeof pictureGroups>} input.groups
 * @param {(path: string) => Promise<Buffer | null>} input.siteFile - the first bytes of a file the site serves, or null
 * @param {(note: string) => void} input.note
 * @returns {Promise<Array<{group: ReturnType<typeof pictureGroups>[number], bytes: Buffer, ext: string, hash: string}>>}
 */
export async function shapePictures({ drawn, groups, siteFile, note }) {
  if (drawn.length === 0 || groups.length === 0) return []
  // Heroes take the hero, sections take the sections in turn; a drawing is never used twice.
  const heroes = drawn.filter((d) => d.role === 'hero')
  const sections = drawn.filter((d) => d.role !== 'hero')
  const jobs = groups.map((group) => {
    const picture = (group.role === 'hero' ? heroes : sections).shift() ?? sections.shift() ?? heroes.shift()
    return async () => {
      if (!picture) return null
      const header = await siteFile(group.sample)
      const demo = header ? await sizeOf(header) : null
      if (!demo) {
        note(
          `the shape of ${group.sample} could not be read from the site, so it keeps the template’s picture`
        )
        return null
      }
      const aspect = demo[0] / demo[1]
      let bytes = picture.bytes
      let ext = picture.ext
      if (Math.abs(picture.width / picture.height - aspect) > 0.01) {
        bytes = await cutToShape(bytes, aspect)
        ext = 'jpg'
      }
      return { group, bytes, ext, hash: createHash('sha256').update(bytes).digest('hex') }
    }
  })
  const answers = await pool(jobs, jobs.length)
  /** @type {Array<{group: any, bytes: Buffer, ext: string, hash: string}>} */
  const shaped = []
  for (const answer of answers) {
    if (answer.ok && answer.value) shaped.push(answer.value)
    else if (!answer.ok)
      note(
        `a picture could not be shaped: ${answer.error instanceof Error ? answer.error.message : answer.error}`
      )
  }
  return shaped
}

/**
 * Upload the shaped pictures ONE AT A TIME and say which slot gets which path.
 *
 * 🔒 A SITE TAKES ONE WRITE AT A TIME. Measured 03/10/2026 on the stand: two `media.upload` calls at once, the
 * second answered `writer_busy` ("another writer is changing this site"), and the demo trim is a write too. So
 * this waits for the one before it, and the engines run it after their own writes, never beside them. An upload
 * is quick (0.3–0.6 s for a 40 KB picture) and does not move the contract's revision, so a read made before it is still good.
 * @param {object} input
 * @param {Awaited<ReturnType<typeof shapePictures>>} input.shaped
 * @param {'joomla' | 'wordpress'} input.platform
 * @param {(call: any) => Promise<any>} input.apply - the Apply door as the person who pressed
 * @param {string} input.siteKey
 * @param {(note: string) => void} input.note
 * @returns {Promise<{values: Record<string, string>, placed: number}>}
 */
export async function uploadPictures({ shaped, platform, apply, siteKey, note }) {
  /** @type {Record<string, string>} */
  const values = {}
  let placed = 0
  for (const { group, bytes, ext, hash } of shaped) {
    const path = `${FOLDER[platform]}/${hash}.${ext}`
    let uploaded
    try {
      uploaded = await apply({
        siteKey,
        action: 'media.upload',
        params: { apply_id: `media-brief-${hash.slice(0, 16)}`, path, content_b64: bytes.toString('base64') }
      })
    } catch (error) {
      uploaded = { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    if (!uploaded?.ok) {
      note(
        `the site refused a picture (${uploaded?.code ?? uploaded?.message ?? 'no answer'}), so ${group.sample} keeps the template’s picture`
      )
      continue
    }
    for (const slot of group.slots) values[slot.key] = path
    placed += group.slots.length
  }
  return { values, placed }
}

/** Shape, then upload: the two halves in a row, for a caller with nothing to run between them. */
export async function placePictures({ drawn, groups, platform, apply, siteKey, siteFile, note }) {
  return uploadPictures({
    shaped: await shapePictures({ drawn, groups, siteFile, note }),
    platform,
    apply,
    siteKey,
    note
  })
}

/**
 * The first bytes of a file the site serves, or null. `fetchSite` reads one path of the site's public address.
 * @param {(path: string, init: {headers: Record<string, string>, signal: AbortSignal}) => Promise<Response>} fetchSite
 * @returns {(path: string) => Promise<Buffer | null>}
 */
export function headerReader(fetchSite) {
  return async (path) => {
    try {
      const response = await fetchSite(path.replace(/^\/+/, ''), {
        headers: { range: `bytes=0-${HEADER_BYTES - 1}` },
        signal: AbortSignal.timeout(15_000)
      })
      if (!response.ok) return null
      return Buffer.from(await response.arrayBuffer()).subarray(0, HEADER_BYTES)
    } catch {
      return null
    }
  }
}
