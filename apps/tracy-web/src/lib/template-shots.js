/**
 * The pictures a Design inspiration card is drawn with, kept by Tracy.
 *
 * 🔒 WHY THIS STORE EXISTS. A card's pictures used to reach a customer only inside the dsh image
 * (`/opt/tracy/templates/<id>/`, built from `provision/templates/` in this repository), so
 * publishing a card took a commit, a CI build and a fleet deploy. Here the picture is a row, the
 * door below serves it, and `/api/templates` hands out its absolute address — a Publish press on
 * the operations page is finished the moment it returns. A name with no row is NO picture — null
 * on the card, never the bare name (#523, `withPictureUrls` says why).
 *
 * 🔒 THE PAIR (template id, file) IS A PUBLIC URL, so neither half may spell a path. Both are held
 * to one shape here, in one place, and `putShot` refuses before it reaches the table rather than
 * trusting a caller to have checked — the door, the import script and the operations upload all
 * arrive through this module.
 */
import { createHash } from 'node:crypto'

/** A template id: one segment, lower case. The same shape the dsh plugin holds an id to. */
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * The one spelling of a template's id, whatever a release wrote.
 *
 * ⚠ THE SAME TEMPLATE IS SPELLED TWO WAYS TODAY, AND NOBODY CHOSE THAT. A release states its
 * template in `tracy_setting.json`, and a Joomla one states the TEMPLATE DIRECTORY — `ja_kinetic`,
 * `tracy_business` — because that is Joomla's own convention, while an EmDash one states a slug
 * (`tracy-business`). Measured 17/09 in `quickstart_releases`:
 *
 *     quickstart/ja-kinetic/j6     → ja_kinetic
 *     tracy-business/j6            → tracy_business
 *     tracy-business/emdash-0.x    → tracy-business
 *
 * Two things broke on that, and only one of them was visible: every capture of a Joomla template
 * was refused by this file's own name rule ("a template id is lower-case letters, digits and
 * dashes"), AND `tracy-business/j6` did not group with `tracy-business/emdash-0.x` as one card,
 * because the grouping compares these strings — a card quietly missing a CMS, with nothing said.
 *
 * So the id is normalised where it is USED as an identity: underscores become dashes. The release's
 * own field is untouched — provisioning still needs the real Joomla directory name.
 *
 * @param {unknown} template the release's `setting.template`
 * @returns {string | null} the id the store, the card and the grouping all use
 */
export function templateIdOf(template) {
  if (typeof template !== 'string' || template === '') return null
  const id = template.trim().toLowerCase().replaceAll('_', '-')
  return TEMPLATE_ID.test(id) ? id : null
}
/** A picture: one segment, lower case, one of the four types a browser draws on a card. */
const PICTURE = /^[a-z0-9][a-z0-9-]*\.(?:png|jpg|jpeg|webp)$/

/**
 * The two viewports a Design inspiration card frames — the thumbnail's, and the phone the preview
 * dialog offers. The single source for both the checkout script (`scripts/shoot-template.mjs`
 * re-exports these) and the server-side capture door, so a shot's width — which NAMES it — is one
 * fact, not three.
 */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 390, height: 844 })
])

/**
 * What one picture is called: `<template>-<release>-<key>-<width>.png`, where `<release>` is the
 * release's own part of its tag (`releaseShotPart`). The store holds a file name to one lower-case
 * segment (`PICTURE` above); a template id, that part and a layout key are already that shape, so
 * the four compose a name the store accepts by construction.
 *
 * 🔒 PER RELEASE, BECAUSE THE STORE IS PER TEMPLATE (12/10/2026). Pictures are rows keyed by
 * (template id, file), and every CMS of one template shares the id: `tracy-business/wp7` and
 * `tracy-business/emdash-0.x` are both `tracy-business`. Named `<template>-<key>-<width>.png`, the
 * EmDash Home capture landed on the WordPress Home picture, so one card showed the other's page,
 * and an agent had to invent keys (`wp-services`, `emdash-about`) to keep them apart. A card names
 * its pictures explicitly (`layouts[].shots`), so a card published before this keeps the names it
 * already wears and those rows are never written again by a capture: no migration is needed.
 *
 * 🔒 THE SINGLE SOURCE. The operations capture door names pictures this way; a name composed a
 * second way would be refused by the door after the browser work was already done, or, worse,
 * spell a path. tracy-host deliberately does not import this (its image cannot); it returns key +
 * width and lets this side name.
 * @param {string} templateId
 * @param {string} key
 * @param {number} width
 * @param {string | null} [release] `releaseShotPart(tag)`; absent keeps the old per-template name
 * @returns {string}
 */
export function shotName(templateId, key, width, release = null) {
  return release ? `${templateId}-${release}-${key}-${width}.png` : `${templateId}-${key}-${width}.png`
}

/**
 * The part of a release tag that tells one CMS (or CMS version) of a template from another, as a
 * name segment: the tag's last segment, lower case, anything outside `[a-z0-9-]` a dash.
 * `quickstart/ja-vogue/j6` gives `j6`, `tracy-business/emdash-0.x` gives `emdash-0-x`.
 * @param {unknown} tag
 * @returns {string | null}
 */
export function releaseShotPart(tag) {
  if (typeof tag !== 'string') return null
  const last = tag.split('/').filter(Boolean).at(-1) ?? ''
  const part = last
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return part === '' ? null : part
}

/**
 * The cap on one picture. A card shot at 1440×900 and 1× was a few hundred kilobytes; since 20/09
 * the demo host shoots at 2× and keeps up to four screens of page (`apps/tracy-host/src/browser.js`),
 * and a dense home page then runs to a few megabytes. Eight is room for that and still a wall
 * against an upload that would make this table the product's biggest object. The number lives
 * here so the door and the import script cannot disagree.
 */
export const MAX_PICTURE_BYTES = 8 * 1024 * 1024

/** The store refused to write — the reason says which rule, in words a screen may show. */
export class ShotRejected extends Error {
  /** @param {string} reason */
  constructor(reason) {
    super(reason)
    this.name = 'ShotRejected'
    this.reason = reason
  }
}

/**
 * Why this picture may not be stored, or null when it may. Pure: the upload door and the import
 * script both ask before they read any bytes off the wire.
 * @param {{ templateId?: unknown, file?: unknown, bytes?: Uint8Array | null }} candidate
 * @returns {string | null}
 */
export function shotProblem({ templateId, file, bytes = null }) {
  if (typeof templateId !== 'string' || !TEMPLATE_ID.test(templateId))
    return 'A template id is lower-case letters, digits and dashes — nothing else, and no path.'
  if (typeof file !== 'string' || !PICTURE.test(file))
    return 'A picture is one lower-case name ending in .png, .jpg, .jpeg or .webp — no path.'
  if (bytes && bytes.length > MAX_PICTURE_BYTES)
    return `A picture may be at most ${MAX_PICTURE_BYTES} bytes; this one is ${bytes.length}.`
  if (bytes && bytes.length === 0) return 'A picture with no bytes is not a picture.'
  return null
}

/**
 * The media type a picture is served as, READ OFF THE EXTENSION and nothing else. What an uploader
 * called it never reaches the browser: a `text/html` label on a stored picture is how a picture
 * store becomes a way to serve a page from Tracy's own origin.
 * @param {string} file
 */
export function pictureType(file) {
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/** @param {Uint8Array} bytes */
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Store one picture, replacing whatever was under that name.
 *
 * `contentType` is accepted so a caller can pass what it received and be ignored on purpose — the
 * stored type is the extension's (see `pictureType`).
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[], rowCount?: number | null }> }} pool
 * @param {{ templateId: string, file: string, contentType?: string, bytes: Uint8Array }} shot
 * @returns {Promise<{ sha256: string, bytes: number }>}
 */
export async function putShot(pool, { templateId, file, bytes }) {
  const problem = shotProblem({ templateId, file, bytes })
  if (problem) throw new ShotRejected(problem)
  const sha256 = digest(bytes)
  await pool.query(
    `insert into template_shots (template_id, file, content_type, bytes, sha256, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (template_id, file) do update set content_type = excluded.content_type,
       bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at`,
    [templateId, file, pictureType(file), Buffer.from(bytes), sha256]
  )
  return { sha256, bytes: bytes.length }
}

/**
 * One picture, or null. A name that could never have been stored is answered null without a query:
 * the door reads both halves off the request path.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} templateId
 * @param {string} file
 * @returns {Promise<{ bytes: Buffer, contentType: string, sha256: string, updatedAt: Date } | null>}
 */
export async function getShot(pool, templateId, file) {
  if (shotProblem({ templateId, file })) return null
  const { rows } = await pool.query(
    'select content_type, bytes, sha256, updated_at from template_shots where template_id = $1 and file = $2',
    [templateId, file]
  )
  if (rows.length === 0) return null
  return {
    bytes: rows[0].bytes,
    contentType: rows[0].content_type,
    sha256: rows[0].sha256,
    updatedAt: rows[0].updated_at
  }
}

/**
 * What a template has, by name — the byte COUNT, never the bytes. This is what a screen lists and
 * what "2 layouts not shot yet" is counted from; a list that carried the pictures would move
 * megabytes to draw a table.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string} templateId
 * @returns {Promise<{ file: string, contentType: string, sha256: string, bytes: number, updatedAt: Date }[]>}
 */
export async function listShots(pool, templateId) {
  if (typeof templateId !== 'string' || !TEMPLATE_ID.test(templateId)) return []
  const { rows } = await pool.query(
    `select file, content_type, sha256, octet_length(bytes) as bytes, updated_at
       from template_shots where template_id = $1 order by file`,
    [templateId]
  )
  return rows.map((r) => ({
    file: r.file,
    contentType: r.content_type,
    sha256: r.sha256,
    bytes: Number(r.bytes),
    updatedAt: r.updated_at
  }))
}

/**
 * Which pictures each of these templates has — ONE query for a whole page of cards.
 *
 * `/api/templates` asks this once and then decides, per name, between an absolute address here and
 * no picture at all. A query per template would be a query per card on a public
 * door that every lane calls when its tab opens.
 * The digest comes back with the name because the ADDRESS a browser is given depends on it
 * (`withPictureUrls`): a picture keeps its file name when it is shot again, so without something in
 * the URL that changes with the bytes, a browser that already fetched the old one keeps drawing it.
 * A `Map` rather than a `Set` so callers that only ask "is it held" keep asking `.has(file)`.
 *
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} pool
 * @param {string[]} templateIds
 * @returns {Promise<Map<string, Map<string, string>>>} per template: file name → its sha256.
 */
export async function shotFilesFor(pool, templateIds) {
  /** @type {Map<string, Map<string, string>>} */
  const byTemplate = new Map()
  const ids = [...new Set(templateIds.filter((id) => TEMPLATE_ID.test(id)))]
  if (ids.length === 0) return byTemplate
  const { rows } = await pool.query(
    'select template_id, file, sha256 from template_shots where template_id = any($1::text[])',
    [ids]
  )
  for (const row of rows) {
    const files = byTemplate.get(row.template_id) ?? new Map()
    files.set(row.file, row.sha256)
    byTemplate.set(row.template_id, files)
  }
  return byTemplate
}

/**
 * An absolute `http(s)` address, as it was written, or null. Anything else a card could carry in a
 * picture field — a rooted path, `file:`, `javascript:`, a relative path — is not a picture another
 * origin can fetch.
 * @param {string} value
 * @returns {string | null}
 */
function httpAddress(value) {
  // `new URL` alone accepts `https:shot.png` and `https:/shot.png`, which a browser on an https page
  // resolves as a same-origin relative path. Written `//` and a host, or no picture.
  if (typeof value !== 'string' || !/^https?:\/\/[^/\\?#]/i.test(value)) return null
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '' ? value : null
  } catch {
    return null
  }
}

/**
 * One template card with every picture it names turned into the address a browser should fetch.
 *
 * 🔒 A NAME THIS SERVER DOES NOT HOLD IS NO PICTURE: null, never the bare name (#523). The bare
 * name used to travel on as a "fallback" the lane would resolve against `template/<id>/<file>` in
 * its own image — but the image has carried no `quickstarts.json` since 16/09, so that door answers
 * 404 for every name, and a card that named a picture nobody held drew a broken-image icon (JA
 * Restaurant, 27/09: a release with no picture assets and no demo). Null is what a card with no
 * picture says; every surface then draws its empty block. The card itself is kept: a site with no
 * picture is still a site a customer can make.
 *
 * An address this server did not build is kept only when it is an absolute `http(s)` URL; any other
 * scheme or a rooted path is not something a card on another origin can fetch, so it is null too.
 *
 * Pure, and takes the output shape of `templateCards` (`{ id, label, card, platforms }`) rather
 * than a release, so the two can be changed without touching each other.
 * @template {{ id: string, card?: any }} T
 * @param {T} template
 * ⚠ AND THE ADDRESS CARRIES THE BYTES' OWN DIGEST when `version` can name one. A re-shot picture
 * keeps its file name, so the URL is unchanged, so a browser inside the door's one-hour
 * `max-age` never asks again — it draws the old picture until the hour is up. Measured 18/09 on
 * dev: the store held the real pages (335 KB–3.2 MB, shot at 03:25) and three thumbnails on screen
 * were still the 404 captures they replaced, with nothing wrong anywhere on the server. `?v=` is
 * eight characters of the sha256 the store already keeps and the door already sends as its ETag —
 * no new column, no new hash, and a picture that has not changed keeps its address and its cache.
 *
 * @param {{ origin: string, has: (templateId: string, file: string) => boolean, version?: (templateId: string, file: string) => string | null | undefined }} where
 * @returns {T}
 */
export function withPictureUrls(template, { origin, has, version }) {
  const card = template?.card
  if (!card || typeof card !== 'object') return template
  const base = `${origin.replace(/\/+$/, '')}/api/templates/${template.id}/shots`
  /** @param {unknown} file */
  const address = (file) => {
    if (typeof file !== 'string' || file === '') return null
    if (!PICTURE.test(file)) return httpAddress(file)
    if (!has(template.id, file)) return null
    const digest = version?.(template.id, file)
    // Only a digest that is one: a caller with no version, or a row written before the column was
    // filled, gets exactly the address it got before.
    return typeof digest === 'string' && /^[0-9a-f]{8,}$/.test(digest)
      ? `${base}/${file}?v=${digest.slice(0, 8)}`
      : `${base}/${file}`
  }
  const layouts = Array.isArray(card.layouts)
    ? card.layouts.map((/** @type {any} */ layout) =>
        layout?.shots && typeof layout.shots === 'object'
          ? {
              ...layout,
              shots: Object.fromEntries(
                Object.entries(layout.shots).map(([which, file]) => [which, address(file)])
              )
            }
          : layout
      )
    : card.layouts
  // A live demo also gets the door a card asks before it frames that demo (`demo-frame` in
  // `ops/quickstarts.js`): absolute, built from `origin` like every picture address above, so the
  // card fetches it as an address and never spells a Tracy path of its own.
  const demo =
    card.demo && typeof card.demo === 'object' && typeof card.demo.url === 'string' && card.demo.url !== ''
      ? { ...card.demo, probe: `${origin.replace(/\/+$/, '')}/api/templates/${template.id}/demo-frame` }
      : card.demo
  return {
    ...template,
    card: {
      ...card,
      ...(card.image === undefined ? {} : { image: address(card.image) }),
      ...(layouts === undefined ? {} : { layouts }),
      ...(demo === undefined ? {} : { demo })
    }
  }
}

/**
 * Remove one picture. False when there was none — an Unpublish that runs twice is not an error.
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> }} pool
 * @param {string} templateId
 * @param {string} file
 */
export async function deleteShot(pool, templateId, file) {
  if (shotProblem({ templateId, file })) return false
  const result = await pool.query('delete from template_shots where template_id = $1 and file = $2', [
    templateId,
    file
  ])
  return (result.rowCount ?? 0) > 0
}
