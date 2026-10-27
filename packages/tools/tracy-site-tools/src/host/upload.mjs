/**
 * `media.upload {file, alt?}` — a picture the CUSTOMER gave, from this site's folder into its media
 * library, on WordPress, Joomla and EmDash alike.
 *
 * 🔒 THE HOST READS THE BYTES; THE MODEL NEVER TYPES THEM. Until 27/09/2026 every road into a media
 * library wanted the file's bytes written out by the model: `media.upload {path, content_b64}` on
 * WordPress and Joomla, `tracy_emdash media_upload {filename, contentType, base64}` on EmDash. Measured
 * on the local stand (27/09): an EmDash agent handed a customer's picture looped 24–40 steps, 7–12
 * minutes — the URL road is refused by EmDash's SSRF guard ("Hostname resolved to no addresses"), its
 * own base64 came back "Invalid base64" or, once, was accepted corrupt — and every refusal told it to
 * try "the same call with contentType". The sidebar's Files tab already puts the customer's file at
 * `<sitesRoot>/<label>/<name>`, which this process can read; so the file is named, and read here.
 *
 * 🔒 THE FENCE IS THE SITE FOLDER, RESOLVED. `file` is resolved against the session's site folder and
 * both sides go through `realpath` before `insideSite` compares them (the one comparison
 * `tracy-subprocess-docker` fences every file tool with). Realpath is the point: the agent's shell can
 * plant a symlink in the site folder, and one pointing at `/desk-home` — the seat book, the model keys
 * — would pass a string check. A `..` segment is refused outright, the site's secrets by name (a
 * secret is no picture anyway, so this is the second of two locks), and only a regular file of at
 * most 8 MiB whose header says PNG, JPEG or WebP is read at all: the formats the two Claude Cowork
 * plugins take into `tracy-content/<sha256>.<png|jpg|webp>` (`CONTRACT_MEDIA_PATH`) and the limit
 * both take in one call (`MAX_MEDIA_BYTES`).
 *
 * 🔒 THE UPLOAD IS THE PERSON'S, THROUGH THE SITE'S OWN DOOR — the road `media.draw` takes (`draw.mjs`):
 * WordPress and Joomla through the seat book as the viewer, EmDash through its own `media_upload`.
 * The name on WordPress and Joomla is content-addressed (`<pictureFolder>/<sha256>.<ext>`), which is
 * the one name a bound quickstart accepts, and `sha256` rides along so the WordPress component checks
 * that the bytes that arrived are the bytes that were read.
 *
 * `media.upload {attachment, alt?}` (29/09/2026) — THE SAME ROAD FOR A PICTURE SENT IN THE CHAT. The
 * customer attaches the photo to their message first; dsh keeps it in its attachment store
 * (`<DSH_HOME>/attachments/v1`), which the model can look at (`read_image`) but no door reached: the
 * file tools and `media.upload {file}` stop at the site folder, and bash runs in the site's container,
 * which does not mount `/desk-home`. Measured (bench v5 cause O, V5-pick-04): 12 minutes and 28 steps
 * on WordPress with the picture re-encoded smaller so its base64 fit a call, a 725 s timeout on EmDash
 * with 55 k output tokens of base64 typed by hand; the honest answer was "put it in the Files tab",
 * one more round trip for the customer. `readChatPicture` says why the model's words can only CHOOSE
 * among this conversation's own attachments, and never name a path the host opens.
 */
import { createHash } from 'node:crypto'
import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { imageSize } from '../../../../cms/tracy-seeder/src/image-bytes.mjs'
import { insideSite } from '../../../tracy-subprocess-docker/src/route.mjs'
import {
  emdashPlacedNext,
  JOOMLA_ARTICLE_PICTURES,
  pictureFolder,
  WORDPRESS_THEME_PICTURES
} from './draw.mjs'

/** The most one upload carries: both components' `MAX_MEDIA_BYTES` (8 MiB), and the relay's body fits it. */
export const UPLOAD_MAX_BYTES = 8_388_608

/** Files that hold a site's secrets, refused by name before anything is opened. */
const SECRET_NAMES = new Set(['wp-config.php', 'configuration.php'])

/**
 * Whether a file name is one of a site's secrets: WordPress's and Joomla's configuration, and any
 * `.env` file (`.env`, `.env.local`, `dsh-passwords.env`).
 * @param {string} name - a base name.
 */
export function isSecretName(name) {
  const n = name.toLowerCase()
  return SECRET_NAMES.has(n) || n === '.env' || n.startsWith('.env.') || n.endsWith('.env')
}

/**
 * The picture a file's first bytes say it is, or null: the three kinds every door here takes.
 * @param {Buffer} b
 * @returns {{ ext: 'png' | 'jpg' | 'webp', contentType: string } | null}
 */
export function pictureKind(b) {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a)
    return { ext: 'png', contentType: 'image/png' }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { ext: 'jpg', contentType: 'image/jpeg' }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return { ext: 'webp', contentType: 'image/webp' }
  return null
}

/**
 * @typedef {{ ok: true, name: string, bytes: Buffer, sha256: string, ext: 'png' | 'jpg' | 'webp',
 *   contentType: string, width: number, height: number, reduced?: string }} SitePicture
 *   `reduced`: said when a chat picture is dsh's smaller copy of what the customer sent.
 * @typedef {{ ok: false, code: string, file: string, error: string } & Record<string, unknown>} FileRefusal
 * @typedef {{ ok: false, code: string, attachment: string, error: string } & Record<string, unknown>} AttachmentRefusal
 */

/**
 * @param {string} code @param {string} file @param {string} error @param {Record<string, unknown>} [extra]
 * @returns {FileRefusal}
 */
const refused = (code, file, error, extra = {}) => ({ ok: false, code, file, error, ...extra })

/**
 * 🔒 THE SPELLING THE FOLDER HOLDS, WHEN ONLY ITS UNICODE FORM DIFFERS (adversarial review of round 7, PD-2).
 * A Mac saves "Ả" as A + U+0309 and a model types it as the one letter U+1EA2 — or the other way round —
 * and on the fleet's filesystem (ext4 keeps a name's bytes; APFS, where the tests run, does not) only ONE of
 * the two names exists, so `media.upload {file}` answered FILE_NOT_FOUND for a file the notice had just
 * listed, and the notice tells the model not to `ls` or glob for it. Vietnamese customers, whose file names
 * carry accents, were the ones to meet it.
 *
 * Each segment is looked up by its exact name first; only a segment that is not there is matched by
 * `normalize('NFC')`, and only when EXACTLY ONE entry of that folder is the same text (two would be a guess).
 * The answer is a path spelled as the folder holds it, for `readSiteFile` to resolve and fence like any
 * other — this function only reads names and opens nothing, so it is no way around the fence.
 * @param {string} root - the site folder, symlink-resolved.
 * @param {string} asked - the relative path as the model wrote it.
 * @param {(dir: string) => Promise<string[]>} [list] - the names of a folder (a test's byte-exact folder).
 * @returns {Promise<string | null>} null when nothing else is held under that name.
 */
export async function heldSpelling(root, asked, list = (dir) => fs.readdir(dir)) {
  if (path.isAbsolute(asked)) return null
  const segments = asked.split('/').filter((segment) => segment !== '' && segment !== '.')
  if (segments.length === 0) return null
  let dir = root
  /** @type {string[]} */
  const held = []
  for (const segment of segments) {
    const names = await list(dir).catch(() => null)
    if (names === null) return null
    let name = names.includes(segment) ? segment : undefined
    if (name === undefined) {
      const same = names.filter((entry) => entry.normalize('NFC') === segment.normalize('NFC'))
      if (same.length !== 1) return null
      name = same[0]
    }
    held.push(name)
    dir = path.join(dir, name)
  }
  const spelled = held.join('/')
  return spelled === segments.join('/') ? null : spelled
}

/**
 * One picture from the site folder, fenced and checked — or the refusal that names why not.
 * @param {{ siteRoot: string, file: unknown }} input
 * @returns {Promise<SitePicture | FileRefusal>}
 */
export async function readSiteFile({ siteRoot, file }) {
  const asked = typeof file === 'string' ? file.trim() : ''
  const shown = asked.slice(0, 80)
  if (asked === '' || asked.includes('\0'))
    return refused(
      'UPLOAD_NEEDS_FILE',
      shown,
      'file must name a picture in this site\'s folder, as the Files tab shows it (e.g. "logo.png")'
    )
  if (asked.split(/[\\/]+/).includes('..'))
    return refused('FILE_OUTSIDE_SITE', shown, `"${shown}" leaves this site's folder`)
  if (isSecretName(path.basename(asked)))
    return refused('FILE_SECRET', shown, `"${shown}" holds this site's secrets`)
  let root
  let real
  // The name the folder holds it under: the model's own unless only its Unicode form differed.
  let spelled = asked
  try {
    root = await fs.realpath(siteRoot)
  } catch {
    return refused('FILE_NOT_FOUND', shown, "this site's folder cannot be read")
  }
  try {
    real = await fs.realpath(path.resolve(root, asked))
  } catch {
    const held = await heldSpelling(root, asked)
    if (held !== null) {
      real = await fs.realpath(path.resolve(root, held)).catch(() => undefined)
      spelled = held
    }
    if (real === undefined)
      return refused('FILE_NOT_FOUND', shown, `no file "${shown}" in this site's folder`)
  }
  if (!insideSite(real, root))
    return refused('FILE_OUTSIDE_SITE', shown, `"${shown}" leads out of this site's folder`)
  if (isSecretName(path.basename(real)))
    return refused('FILE_SECRET', shown, `"${shown}" holds this site's secrets`)
  // 🔒 EVERY COMPONENT OF THE WALK, NOT JUST THE LAST (28/09/2026). `O_NOFOLLOW` guards the final
  // name only, and the `realpath` above answers where the path led AT THAT MOMENT: the agent's shell
  // can turn a DIRECTORY on that walk into a symlink to another site's folder between the resolve and
  // the open, and the open follows it, because a directory component is followed whatever the flag
  // says. The inode check below could not see it either — `before` was taken after the swap too. So
  // the walk from the site root down is checked with `lstat`, refusing every link on it, and checked
  // again after the open: a swap either way leaves the opened file's identity disagreeing with the
  // re-walked path, and nothing is read.
  const walk = await walkInsideSite(root, real)
  if (walk !== null) return refused(walk.code, shown, walk.why(shown))
  // Judged before it is opened: a FIFO planted in the folder would hold an open for reading forever.
  const before = await fs.stat(real).catch(() => null)
  if (before === null || !before.isFile())
    return refused('FILE_NOT_FOUND', shown, `"${shown}" is not a file in this site's folder`)
  if (before.size > UPLOAD_MAX_BYTES)
    return refused(
      'FILE_TOO_LARGE',
      shown,
      `"${shown}" is ${before.size} bytes; one upload carries at most 8 MiB`,
      {
        bytes: before.size,
        max: UPLOAD_MAX_BYTES
      }
    )
  // Opened without following a link and without blocking, then judged again on what was opened: a
  // swap between the checks above and this open reads nothing it should not.
  let handle
  try {
    handle = await fs.open(
      real,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)
    )
  } catch {
    return refused('FILE_NOT_FOUND', shown, `"${shown}" cannot be opened`)
  }
  let bytes
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev)
      return refused('FILE_NOT_FOUND', shown, `"${shown}" changed while it was read; nothing was sent`)
    // The walk again, now that the file is open: for a swapped directory to have redirected this
    // open, the path must now name a different file than the handle holds — which this catches.
    const again = await walkInsideSite(root, real)
    if (again !== null) return refused(again.code, shown, again.why(shown))
    const end = await fs.lstat(real).catch(() => null)
    if (end === null || !end.isFile() || end.ino !== opened.ino || end.dev !== opened.dev)
      return refused('FILE_NOT_FOUND', shown, `"${shown}" changed while it was read; nothing was sent`)
    if (opened.size > UPLOAD_MAX_BYTES)
      return refused(
        'FILE_TOO_LARGE',
        shown,
        `"${shown}" is ${opened.size} bytes; one upload carries at most 8 MiB`,
        {
          bytes: opened.size,
          max: UPLOAD_MAX_BYTES
        }
      )
    bytes = await handle.readFile()
  } finally {
    await handle.close()
  }
  if (bytes.length > UPLOAD_MAX_BYTES)
    return refused('FILE_TOO_LARGE', shown, `"${shown}" grew past 8 MiB while it was read`, {
      bytes: bytes.length,
      max: UPLOAD_MAX_BYTES
    })
  const kind = pictureKind(bytes)
  const size = kind === null ? null : imageSize(bytes)
  if (kind === null || size === null || !(size[0] > 0 && size[1] > 0))
    return refused('NOT_A_PICTURE', shown, `"${shown}" is not a PNG, JPEG or WebP picture`)
  return {
    ok: true,
    name: path.basename(spelled),
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    ...kind,
    width: size[0],
    height: size[1]
  }
}

/** How many pictures the Files-tab notice names: enough to choose from, never a listing of the folder. */
const FILES_TAB_LISTED = 5
/** How many entries of the folder are looked at: a folder of thousands is a project, not a Files tab. */
const FILES_TAB_LOOKED_AT = 400
/**
 * A name the Files-tab notice may carry: letters (their combining marks too: a file saved on a Mac is
 * often the decomposed form, "Ả" as A + U+0309), digits, and the few marks a file name has, one of the
 * three picture extensions. The name goes into the model's context as it stands, so a line break, a
 * quote, a comma (it would split the list), a brace or a name that is far too long is left out, not quoted.
 */
const PICTURE_FILE_NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} _.()+\-'&@#~[\]!=]{0,58}\.(?:png|jpe?g|webp)$/iu

/**
 * The pictures at the top of a site's folder: what the Files tab holds for `media.upload {file}` to
 * read, by the names it shows. Regular files only — a folder, a link (the walk `readSiteFile` refuses)
 * or a secret is not listed — and at most {@link FILES_TAB_LISTED} of them, the newest, by name. A
 * folder that cannot be read has none. Names only: nothing is opened, so nothing here is a fence; the
 * upload itself is judged when a name is used (`readSiteFile`).
 *
 * The names are listed AS THE FOLDER HOLDS THEM, a Mac's decomposed accents included: `readSiteFile` takes
 * either Unicode form of a listed name (`heldSpelling`), so a model that types "Ả" composed still finds the
 * file the notice showed decomposed (review of round 7, PD-2).
 *
 * 🔒 WHY THE HOST LISTS THEM. A picture the customer puts in the Files tab is in the site folder and
 * NOT in the media library until `media.upload` reads it; a model that is not told so hunts for it
 * (`media.scan`, `media_list`, glob, `find`, `grep` — 5 of the 12 round-7 chat runs that used an uploaded picture, about 20 calls, one
 * Writer's first write at step 7) although the door to use it is one call. Nothing tells the host that
 * the customer just dropped a file, but the folder says which pictures are there.
 * @param {string} siteRoot - the site folder.
 * @returns {Promise<string[]>} names, sorted.
 */
export async function filesTabPictures(siteRoot) {
  let entries
  try {
    entries = await fs.readdir(siteRoot, { withFileTypes: true })
  } catch {
    return []
  }
  /** @type {Array<{ name: string, at: number }>} */
  const found = []
  for (const entry of entries.slice(0, FILES_TAB_LOOKED_AT)) {
    if (!entry.isFile() || !PICTURE_FILE_NAME.test(entry.name) || isSecretName(entry.name)) continue
    const stat = await fs.lstat(path.join(siteRoot, entry.name)).catch(() => null)
    if (stat !== null && stat.isFile()) found.push({ name: entry.name, at: stat.mtimeMs })
  }
  return found
    .sort((a, b) => b.at - a.at || (a.name < b.name ? -1 : 1))
    .slice(0, FILES_TAB_LISTED)
    .map((one) => one.name)
    .sort()
}

/**
 * Every step from the site root down to `real`, checked with `lstat`: not one of them may be a link,
 * and each parent must be a directory. Null when the walk is clean, else the refusal to answer.
 *
 * It is run before the open AND after it: a link appearing on the walk in between is what redirects
 * the open into another customer's site, and the second run is what sees it.
 * @param {string} root - the site folder, already symlink-resolved.
 * @param {string} real - the file, already symlink-resolved and known to be inside `root`.
 * @returns {Promise<{ code: string, why: (shown: string) => string } | null>}
 */
async function walkInsideSite(root, real) {
  if (real === root) return null
  const steps = real.slice(root.length + 1).split('/')
  let at = root
  for (const [i, step] of steps.entries()) {
    at = path.join(at, step)
    const found = await fs.lstat(at).catch(() => null)
    if (found === null)
      return { code: 'FILE_NOT_FOUND', why: (shown) => `no file "${shown}" in this site's folder` }
    if (found.isSymbolicLink())
      return {
        code: 'FILE_OUTSIDE_SITE',
        why: (shown) => `"${shown}" goes through a link out of this site's folder`
      }
    const last = i === steps.length - 1
    if (!last && !found.isDirectory())
      return { code: 'FILE_NOT_FOUND', why: (shown) => `"${shown}" is not a path in this site's folder` }
  }
  return null
}

/**
 * dsh's attachment store (`ctx.get('attachments')`, `@deepseek-ai/dsh-attachment`'s `AttachmentStore`),
 * as much of it as reading one attachment back needs. Both reads verify the stored bytes against the
 * reference's digest (and an image's size and type) before they answer.
 * @typedef {{
 *   readImage?: (ref: Record<string, unknown>) => Promise<{ data: Uint8Array }>,
 *   readFileStream?: (ref: Record<string, unknown>) => AsyncIterable<Uint8Array>
 * }} AttachmentReader
 */

/**
 * One attachment a person put in this conversation: an image block (`ImageAttachmentRef`, the
 * normalized copy dsh keeps) or a file block (`FileAttachmentRef`, the bytes as sent).
 * @typedef {{ kind: 'image' | 'file', ref: Record<string, any>, digest: string, name: string | null }} ChatAttachment
 */

/** A durable reference's id: `sha256:<64 hex>` (`attachment-local` `ID_PATTERN`). */
const ATTACHMENT_ID = /^sha256:([a-f0-9]{64})$/

/**
 * The attachments a PERSON put in this conversation, from its own log: newest first, one per digest.
 *
 * Only a `user/message` whose source is `user` counts — the walk `prompter.mjs` makes for "who typed".
 * A plugin's or another agent's message (`relay`, `recall`) is not the customer handing a picture
 * over, and a tool result (a `page.look` screenshot) is Tracy's own picture of the page.
 * @param {readonly unknown[] | undefined} events - the session's events, oldest first.
 * @returns {ChatAttachment[]}
 */
export function chatAttachments(events) {
  if (!Array.isArray(events)) return []
  /** @type {ChatAttachment[]} */
  const out = []
  const seen = new Set()
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event =
      /** @type {{ type?: unknown, data?: { source?: { kind?: unknown }, content?: unknown } }} */ (events[i])
    if (event?.type !== 'user/message' || event.data?.source?.kind !== 'user') continue
    const content = event.data?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== 'image' && part?.type !== 'file') continue
      const ref = part.attachment
      const digest = ATTACHMENT_ID.exec(String(ref?.attachmentId ?? ''))?.[1]
      if (digest === undefined || seen.has(digest)) continue
      seen.add(digest)
      const name = typeof ref.name === 'string' && ref.name.trim() !== '' ? ref.name.trim() : null
      out.push({ kind: part.type, ref, digest, name })
    }
  }
  return out
}

/** How many attachments a refusal lists: enough to choose from, never a transcript. */
const LISTED = 8

/**
 * What a refusal shows of the attachments, so the next call can name one: its name, the id the
 * model can pass back (`sha256:` and 12 hex — any 8 or more are taken), and its size.
 * @param {ChatAttachment[]} attached
 */
function attachmentList(attached) {
  return attached.slice(0, LISTED).map((a) => ({
    name: a.name,
    id: `sha256:${a.digest.slice(0, 12)}`,
    ...(a.kind === 'image' && Number.isFinite(a.ref.width) && Number.isFinite(a.ref.height)
      ? { size: `${a.ref.width}x${a.ref.height}` }
      : Number.isFinite(a.ref.bytes)
        ? { bytes: a.ref.bytes }
        : {})
  }))
}

/**
 * @param {string} code @param {string} attachment @param {string} error @param {Record<string, unknown>} [extra]
 * @returns {AttachmentRefusal}
 */
const refusedAttachment = (code, attachment, error, extra = {}) => ({
  ok: false,
  code,
  attachment,
  error,
  ...extra
})

/** A digest the model may give: `sha256:<hex>` anywhere in its words (the handle dsh prints). */
const SHA_WORD = /sha256:([a-f0-9]{8,64})/
/** The store's own address of one object (the path dsh shows beside an image or a file). */
const STORE_PATH = /\/attachments\/v1\/(?:objects|files)\/[a-f0-9]{2}\/([a-f0-9]{64})(?:\/|$)/
/** A bare digest, or the first 8+ of one. */
const BARE_HEX = /^[a-f0-9]{8,64}$/

/**
 * Which of this conversation's attachments the model named — by its id (`sha256:…`, whole or its
 * first 8+ hex), the store path dsh showed for it, or its name — or the refusal that lists them.
 * @param {unknown} asked - `params.attachment`.
 * @param {ChatAttachment[]} attached - `chatAttachments(events)`.
 * @returns {{ ok: true, entry: ChatAttachment } | AttachmentRefusal}
 */
export function findAttachment(asked, attached) {
  // dsh prints a name in quotes (`Image "photo.jpg" (sha256:…)`), and a model may copy them along.
  const text = typeof asked === 'string' ? asked.trim().replace(/^["'`]+|["'`]+$/g, '') : ''
  const shown = text.slice(0, 80)
  if (attached.length === 0)
    return refusedAttachment('NO_ATTACHMENT', shown, 'the customer attached no picture in this conversation')
  if (text === '')
    return refusedAttachment(
      'ATTACHMENT_NOT_FOUND',
      shown,
      'attachment must name a picture the customer attached in this conversation: its name or its sha256 id',
      { attached: attachmentList(attached) }
    )
  const lower = text.toLowerCase()
  const digest =
    SHA_WORD.exec(lower)?.[1] ?? STORE_PATH.exec(lower)?.[1] ?? (BARE_HEX.test(lower) ? lower : null)
  /** @type {ChatAttachment[]} */
  let hits
  if (digest !== null) hits = attached.filter((a) => a.digest.startsWith(digest))
  else {
    // Names are compared as text, not as bytes: a Mac sends "Ả" decomposed and a model types it composed (PD-2).
    const fold = (/** @type {string} */ n) => n.normalize('NFC').toLowerCase()
    const leaf = fold(text.slice(Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\')) + 1))
    const stem = (/** @type {string} */ n) => n.replace(/\.[^.]*$/, '')
    hits = attached.filter((a) => a.name !== null && fold(a.name) === leaf)
    if (hits.length === 0) hits = attached.filter((a) => a.name !== null && stem(fold(a.name)) === stem(leaf))
  }
  if (hits.length === 1) return { ok: true, entry: hits[0] }
  if (hits.length > 1)
    return refusedAttachment(
      'ATTACHMENT_AMBIGUOUS',
      shown,
      `${hits.length} pictures attached in this conversation answer to "${shown}"`,
      { attached: attachmentList(hits) }
    )
  return refusedAttachment(
    'ATTACHMENT_NOT_FOUND',
    shown,
    `no picture attached in this conversation answers to "${shown}"`,
    { attached: attachmentList(attached) }
  )
}

/**
 * One attachment's bytes, through the store's own verified read; null when the store cannot read it.
 * @param {AttachmentReader | undefined} store @param {ChatAttachment} entry
 * @returns {Promise<Buffer | null>}
 */
async function attachmentBytes(store, entry) {
  if (entry.kind === 'image') {
    if (typeof store?.readImage !== 'function') return null
    const { data } = await store.readImage(entry.ref)
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  if (typeof store?.readFileStream !== 'function') return null
  /** @type {Buffer[]} */
  const chunks = []
  let total = 0
  for await (const chunk of store.readFileStream(entry.ref)) {
    total += chunk.byteLength
    // The reference said it fits; a store that keeps sending past that is not read to the end.
    if (total > UPLOAD_MAX_BYTES) throw new Error('grew past 8 MiB')
    chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength))
  }
  return Buffer.concat(chunks)
}

/**
 * The picture the customer attached in THIS conversation, read back from dsh's store — or the
 * refusal that names why not.
 *
 * 🔒 THE MODEL CHOOSES; IT NEVER POINTS. The store is shared by every site and every session on the
 * host dsh, and it sits under `/desk-home` beside the seat book and the model keys. So nothing the
 * model types becomes a path: its words are matched against the durable references in THIS
 * session's own log (`chatAttachments`), and the bytes are read through the store's own API from
 * the reference that matched. A digest from another conversation matches nothing here, and neither
 * does a path elsewhere in the store or outside it — the same "own attachments only" rule the fence
 * keeps for `read_image` (`tracy-subprocess-docker` `readsOwnAttachment`), made stricter: that one
 * rests on a digest being unguessable, this one on the reference being in this conversation.
 *
 * 🔒 WHAT ARRIVES IS WHAT THE REFERENCE NAMES. The store verifies its bytes against the digest, and
 * so does this function (a store is a service another plugin may replace). An image is dsh's
 * NORMALIZED copy: the same bytes when the picture was already clean and under 2048×2048 pixels
 * (`canPassThroughNormalization`), otherwise re-encoded or reduced — and a reduced one is said in
 * the answer (`reduced`), with the Files tab as the road to the full size.
 * @param {{ asked: unknown, events: readonly unknown[] | undefined, store: AttachmentReader | undefined }} input
 * @returns {Promise<SitePicture | AttachmentRefusal>}
 */
export async function readChatPicture({ asked, events, store }) {
  const found = findAttachment(asked, chatAttachments(events))
  if (!found.ok) return found
  const { entry } = found
  const shown = (entry.name ?? `sha256:${entry.digest.slice(0, 12)}`).slice(0, 80)
  const declared = Number(entry.ref.bytes)
  if (Number.isFinite(declared) && declared > UPLOAD_MAX_BYTES)
    return refusedAttachment(
      'FILE_TOO_LARGE',
      shown,
      `"${shown}" is ${declared} bytes; one upload carries at most 8 MiB`,
      { bytes: declared, max: UPLOAD_MAX_BYTES }
    )
  let bytes
  try {
    bytes = await attachmentBytes(store, entry)
  } catch (error) {
    const why = /** @type {{ code?: unknown }} */ (error)?.code
    return refusedAttachment(
      'ATTACHMENT_UNREADABLE',
      shown,
      `dsh could not read "${shown}" back${typeof why === 'string' ? ` (${why})` : ''}; nothing was sent`
    )
  }
  if (bytes === null)
    return refusedAttachment(
      'ATTACHMENT_UNREADABLE',
      shown,
      'this host keeps no attachment store Tracy can read; nothing was sent'
    )
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (sha256 !== entry.digest)
    return refusedAttachment(
      'ATTACHMENT_UNREADABLE',
      shown,
      `the stored bytes of "${shown}" are not the ones attached; nothing was sent`
    )
  if (bytes.length > UPLOAD_MAX_BYTES)
    return refusedAttachment(
      'FILE_TOO_LARGE',
      shown,
      `"${shown}" is ${bytes.length} bytes; one upload carries at most 8 MiB`,
      { bytes: bytes.length, max: UPLOAD_MAX_BYTES }
    )
  const kind = pictureKind(bytes)
  const size = kind === null ? null : imageSize(bytes)
  if (kind === null || size === null || !(size[0] > 0 && size[1] > 0))
    return refusedAttachment('NOT_A_PICTURE', shown, `"${shown}" is not a PNG, JPEG or WebP picture`)
  const original = entry.ref.originalDimensions
  const reduced =
    entry.kind === 'image' &&
    original &&
    Number.isFinite(original.width) &&
    Number.isFinite(original.height) &&
    (original.width !== size[0] || original.height !== size[1])
      ? `dsh keeps a reduced copy of this picture: ${size[0]}x${size[1]} of the ${original.width}x${original.height} sent. For the full size, the customer puts the file in the Files tab.`
      : null
  return {
    ok: true,
    name: entry.name ?? `${entry.digest.slice(0, 16)}.${kind.ext}`,
    bytes,
    sha256,
    ...kind,
    width: size[0],
    height: size[1],
    ...(reduced !== null ? { reduced } : {})
  }
}

/**
 * What goes to a WordPress or Joomla site's `media.upload`: the bytes, their digest, a
 * content-addressed name in the folder each Claude Cowork plugin takes a picture into, and a receipt
 * of its own (`media-<sha16>`: never a `contract-` one, which a bound component refuses for media).
 * An explicit `path` from the call is kept — the one case the model names where the file lands.
 *
 * 🔒 ONE RECEIPT PER UPLOAD, NOT PER PICTURE (28/09/2026). `apply_id` was `media-<sha16>` — the
 * picture's own digest — so uploading the SAME picture a second time (another path, another
 * conversation, another day) reused the first upload's receipt, and `apply.revert` on the second
 * removed the file the page put up on the first. The digest stays in the NAME, where being
 * content-addressed is the point; the receipt now names this upload, and a `seq` from the caller
 * keeps two uploads of one picture apart within a process.
 * @param {SitePicture} picture
 * @param {string | null | undefined} platform
 * @param {unknown} [asked] - the call's own `path`, if any.
 */
export function uploadParams(picture, platform, asked) {
  const own = typeof asked === 'string' ? asked.trim().replace(/^\/+/, '') : ''
  return {
    path: own !== '' ? own : `${pictureFolder(platform)}/${picture.sha256}.${picture.ext}`,
    content_b64: picture.bytes.toString('base64'),
    sha256: picture.sha256,
    apply_id: `media-${uploadStamp(picture)}`
  }
}

/** How many uploads this process has stamped: what keeps two uploads of one picture apart. */
let uploads = 0

/**
 * The receipt's own name: this upload's place in the process, and the picture's digest so the receipt
 * still says which bytes went. Never the digest alone — that is what collided.
 * @param {SitePicture} picture
 */
function uploadStamp(picture) {
  uploads += 1
  return `${picture.sha256.slice(0, 12)}-${Date.now().toString(36)}${uploads.toString(36)}`
}

/**
 * The name an EmDash media item keeps: the customer's own, with the extension its bytes say.
 * @param {SitePicture} picture
 */
function emdashFilename(picture) {
  const stem = path
    .basename(picture.name, path.extname(picture.name))
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 80)
  return `${stem || picture.sha256.slice(0, 16)}.${picture.ext}`
}

/**
 * Where a WordPress or Joomla picture goes next: into a slot on a site with a contract, or into the
 * record that shows it.
 *
 * 🔒 THE NEXT WRITE, AS THE DOOR TAKES IT. On a contract site it said "with the revision of your last
 * inspect", which sends a model that has already read the page to inspect it again (the apply's own
 * description says: no inspect, Tracy fills the revision from what was read), and it named the
 * picture's url beside its path — the form a WordPress slot refuses. The key is the slotKey the read
 * showed on the picture being replaced.
 * @param {string} where - the stored path.
 * @param {boolean} contract - the surface offers `content.contract`.
 * @param {string | null} [platform]
 * @param {boolean} [quickstart] - the contract is a QUICKSTART's, where a theme's picture is a slot. An imported
 *   copy offers the door too (`contract` true) and keeps its logo in a template part like an open site; it
 *   used to be told apart by the door alone, so the theme-part sentence never reached it (review, 02/10/2026).
 */
function placedNext(where, contract, platform = null, quickstart = contract) {
  const articles =
    platform === 'joomla'
      ? JOOMLA_ARTICLE_PICTURES
      : platform === 'wordpress' && !quickstart
        ? WORDPRESS_THEME_PICTURES
        : ''
  return contract
    ? `The picture is in the media library as ${where}. Put it in its slot: content.contract {operation:"apply", changes:{"<image slot key>":"${where}"}} — the slotKey your read showed on the picture it replaces; Tracy adds the revision (a slot takes a picture shaped like its demo). Elsewhere: the content.update of the record that shows it.${articles}`
    : `The picture is in the media library as ${where} (its url on the site: /${where}). Put it where it belongs: the content.update of the record that shows it.${articles}`
}

/**
 * Whether the call names a picture sent in the chat (`attachment`) rather than one in the Files tab.
 * @param {Record<string, unknown> | undefined} params
 */
export const asksAttachment = (params) => params?.attachment !== undefined && params?.attachment !== null

/**
 * Read the named picture — a file in the site folder (`file`) or one the customer attached in this
 * conversation (`attachment`) — and upload it through the site's own door. Every dependency comes in,
 * so the whole road is testable without a site.
 * @param {{ params: Record<string, unknown>, platform: string | null | undefined, siteRoot: string,
 *   contract?: boolean, quickstart?: boolean,
 *   readAttachment?: (asked: unknown) => Promise<SitePicture | AttachmentRefusal>,
 *   upload: (args: any) => Promise<any> }} args
 *   `readAttachment`: `readChatPicture` bound to this session's log and dsh's store; absent where the
 *   caller has neither, and then an attachment is refused rather than guessed at.
 *   `upload`: on EmDash `{bytes, filename, contentType, alt}` → `{ok, id, url}` or EmDash's refusal;
 *   elsewhere the `media.upload` params (`uploadParams`) → the component's answer, next included.
 */
export async function mediaUpload({
  params,
  platform,
  siteRoot,
  contract = false,
  quickstart = contract,
  readAttachment,
  upload
}) {
  const fromChat = asksAttachment(params)
  // One picture per call, named one way: a call naming both would upload whichever was read first.
  if (fromChat && params?.file !== undefined && params?.file !== null)
    return {
      ok: false,
      code: 'UPLOAD_TWO_SOURCES',
      error:
        'media.upload takes one picture: file (its name in the Files tab) or attachment (sent in this chat), not both'
    }
  const picture = fromChat
    ? typeof readAttachment === 'function'
      ? await readAttachment(params.attachment)
      : refusedAttachment(
          'ATTACHMENT_UNREADABLE',
          String(params.attachment).slice(0, 80),
          'this conversation has no attachment store Tracy can read; nothing was sent'
        )
    : await readSiteFile({ siteRoot, file: params?.file })
  if (!picture.ok) return picture
  const alt =
    typeof params?.alt === 'string' && params.alt.trim() !== '' ? params.alt.trim().slice(0, 500) : null
  // The answer names the picture the way the call did, so a second call with that name takes the same road.
  const source = fromChat ? 'attachment' : 'file'
  const shape = {
    [source]: picture.name,
    width: picture.width,
    height: picture.height,
    ...(picture.reduced ? { reduced: picture.reduced } : {})
  }
  if (platform === 'emdash') {
    const up = await upload({
      bytes: picture.bytes,
      filename: emdashFilename(picture),
      contentType: picture.contentType,
      alt
    })
    if (up?.ok !== true)
      return { ...(up && typeof up === 'object' ? up : {}), ok: false, [source]: picture.name }
    const id = typeof up.id === 'string' ? up.id : null
    const url = typeof up.url === 'string' ? up.url : null
    const placed = emdashPlacedNext(id, url, picture.name)
    if (up.deduplicated !== true) return { ok: true, id, url, ...shape, next: placed }
    // E5.e4: EmDash keeps one item per picture (content hash) and answers the same bytes with the item
    // already in the library, its own alt kept — nothing was uploaded and the alt sent was not stored.
    const kept = typeof up.alt === 'string' && up.alt !== '' ? `alt ${JSON.stringify(up.alt)}` : 'no alt'
    return {
      ok: true,
      id,
      url,
      ...shape,
      deduplicated: true,
      ...(alt !== null
        ? {
            alt: `not stored: this picture was already in the media library as media ${id} (${kept}); nothing was uploaded and its alt is unchanged`
          }
        : {}),
      next: `Nothing was uploaded: this picture was already in the media library (${kept}). ${placed} It is the same item wherever the site already shows it: media_update of its alt changes it everywhere it shows, so ask the customer first.`
    }
  }
  const sent = uploadParams(picture, platform, params?.path)
  const up = await upload(sent)
  if (up?.ok !== true) return up
  const stored = typeof up.path === 'string' && up.path !== '' ? up.path : sent.path
  return {
    ...up,
    path: stored,
    ...shape,
    apply_id: sent.apply_id,
    ...(alt !== null
      ? { alt: 'not stored: this door keeps no alt text; write it where the picture is placed' }
      : {}),
    next: placedNext(stored, contract, platform, quickstart)
  }
}
