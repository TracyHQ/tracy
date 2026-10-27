/**
 * The brand pictures of "Customize your site" (plan `tasks/plan-ten-logo-favicon.md`, T06, decisions D4, D12).
 * Table `site_brand_upload` (`075-site-brand-upload.sql`); bytes in the artifact store (`config.artifactStore`).
 *
 *   POST /api/sites/brand-files   multipart `file` + `role` → 201 {id, width, height} | 422 {code: <problem>}
 *
 * The sheet uploads each picture the moment it is picked, before the site exists, so a file belongs to the
 * ACCOUNT that uploaded it, not to a site. The create press names the ids in `brief.answers.logo` /
 * `brief.answers.favicon`; `brandOfPress` keeps only this account's own ids and claims them for the new site;
 * the brand writers read the bytes back with `readBrandFile` once the site is up.
 *
 * 🔒 BEHIND A SWITCH, ON THE SERVER. `site-brand-uploads` (`@tracy/core/ui-switches`, `defaultOn: false`) off, or no
 * artifact store: the door answers 404/503 and a press's file ids are dropped. `brandUploadsAvailable` is the one
 * test; the questions door uses it too, to leave the logo and favicon questions out.
 *
 * Object keys are chosen HERE (`brand/<account>/<uuid>`), outside the `sites/<label>/` prefix the artifact door lets
 * any seat `fetch` or `delete` by key. Nothing serves the bytes back to a browser: the sheet previews the file from
 * the browser's own copy.
 */
import { BRAND_SWITCH, brandUploadsAvailable } from '../lib/brand-uploads.js'
import { json } from '../lib/http.js'
import { presign, signedCall } from './artifacts.js'
import { BRAND_MAX_BYTES, BRAND_ROLES, checkBrandImage } from './brief-engines/brand-images.js'
import { audit } from './store.js'

// The switch and the one test live in `lib/brand-uploads.js` so the /ops preview reads them too.
export { BRAND_SWITCH, brandUploadsAvailable }
/** An upload no create press claimed within this long is removed. */
export const LOOSE_TTL_MS = 24 * 60 * 60 * 1000
/** A claimed upload is kept this long: the build reads it minutes later, a retried build may read it again. */
export const CLAIMED_TTL_MS = 30 * 24 * 60 * 60 * 1000
const STORE_URL_TTL_S = 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOGO_VARIANTS = ['light', 'dark', 'single']

export const BRAND_FILE_NEXT = {
  BRAND_UPLOADS_OFF: 'Logo and favicon uploads are off on this server; create the site without them.',
  BRAND_STORE_UNAVAILABLE:
    'Uploads are off on this server (no artifact store configured); create the site without them.',
  BRAND_STORE_FAILED: 'The file store did not answer; try again in a moment.',
  BRAND_BAD_INPUT: `Send multipart/form-data with a PNG in a field named \`file\` and \`role\` one of ${BRAND_ROLES.join(', ')}.`,
  PNG_ONLY: 'Send a PNG file.',
  PNG_UNREADABLE: 'The file is not a readable PNG; export it again as PNG.',
  TOO_LARGE: `Send a smaller file; a brand picture may be at most ${BRAND_MAX_BYTES} bytes.`,
  LOGO_TOO_SMALL: 'Send a logo whose longer side is at least 500 pixels.',
  FAVICON_NOT_SQUARE: 'Send a square favicon.',
  FAVICON_TOO_SMALL: 'Send a favicon of at least 512 × 512 pixels.'
}

function refuse(c, code, status, extra = {}) {
  return json(c, { code, next: BRAND_FILE_NEXT[code], ...extra }, status)
}

/**
 * The file ids a press names, shaped: `logo` is an id (the one logo) or `{light?, dark?, single?}` of ids;
 * `favicon` is an id. Anything that is not a uuid is not an id.
 * @param {unknown} answers - `body.brief.answers`, unread
 * @returns {{ logo: { light?: string, dark?: string, single?: string } | null, favicon: string | null }}
 */
export function brandIdsOf(answers) {
  const given = answers && typeof answers === 'object' && !Array.isArray(answers) ? answers : {}
  const id = (v) => (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null)
  let logo = null
  const rawLogo = /** @type {any} */ (given).logo
  if (typeof rawLogo === 'string') logo = id(rawLogo) ? { single: id(rawLogo) } : null
  else if (rawLogo && typeof rawLogo === 'object' && !Array.isArray(rawLogo)) {
    const variants = {}
    for (const v of LOGO_VARIANTS) if (id(rawLogo[v])) variants[v] = id(rawLogo[v])
    logo = Object.keys(variants).length ? variants : null
  }
  return { logo, favicon: id(/** @type {any} */ (given).favicon) }
}

/**
 * The brand a create press may use: the ids `brandIdsOf` read, kept only when they are this account's own uploads
 * of a fitting role, and claimed for `siteKey`. Never throws: an id it cannot keep is dropped with a note.
 * @param {import('pg').Pool} pool
 * @param {{ answers: unknown, accountId: string, siteKey: string, available: boolean }} press
 * @returns {Promise<{ logo: { light?: string, dark?: string, single?: string } | null, favicon: string | null, notes: string[] }>}
 */
export async function brandOfPress(pool, { answers, accountId, siteKey, available }) {
  const asked = brandIdsOf(answers)
  const wanted = [...Object.values(asked.logo ?? {}), ...(asked.favicon ? [asked.favicon] : [])]
  const none = { logo: null, favicon: null, notes: [] }
  if (wanted.length === 0) return none
  if (!available)
    return { ...none, notes: ['logo and favicon uploads are off; the files named were ignored'] }
  let rows = []
  try {
    ;({ rows } = await pool.query(
      `update site_brand_upload set site_key = $3, claimed_at = now()
        where id = any($1::uuid[]) and uploaded_by = $2 returning id, role`,
      [wanted, accountId, siteKey]
    ))
  } catch (err) {
    return { ...none, notes: [`the logo and favicon files could not be read: ${err?.message ?? err}`] }
  }
  const roleOf = new Map(rows.map((r) => [r.id, r.role]))
  const notes = []
  const keep = (fileId, fits, what) => {
    if (fits(roleOf.get(fileId))) return true
    notes.push(
      `${what} ${fileId} was dropped: ${roleOf.has(fileId) ? 'not uploaded for that place' : 'not an upload of this account'}`
    )
    return false
  }
  /** @type {any} */
  let logo = {}
  for (const [variant, fileId] of Object.entries(asked.logo ?? {}))
    if (keep(fileId, (role) => typeof role === 'string' && role !== 'favicon', `logo ${variant}`))
      logo[variant] = fileId
  if (Object.keys(logo).length === 0) logo = null
  const favicon =
    asked.favicon && keep(asked.favicon, (role) => role === 'favicon', 'favicon') ? asked.favicon : null
  return { logo, favicon, notes }
}

/**
 * The stored picture behind an id, for the brand writers (T10). Null when the id is unknown, its object gone, or
 * the store does not answer.
 * @param {{ pool: import('pg').Pool, store: object | null, fetchImpl?: typeof fetch }} deps
 * @param {string} id
 * @returns {Promise<{ bytes: Uint8Array, role: string, width: number, height: number, owner: string, siteKey: string | null } | null>}
 */
export async function readBrandFile({ pool, store, fetchImpl = fetch }, id) {
  if (!store || typeof id !== 'string' || !UUID.test(id)) return null
  const { rows } = await pool.query('select * from site_brand_upload where id = $1', [id])
  const row = rows[0]
  if (!row) return null
  const url = await presign(store, { method: 'GET', key: row.object_key, expiresIn: STORE_URL_TTL_S })
  const res = await fetchImpl(url, { method: 'GET' }).catch(() => null)
  if (!res?.ok) return null
  const bytes = new Uint8Array(await res.arrayBuffer())
  return {
    bytes,
    role: row.role,
    width: row.width,
    height: row.height,
    owner: row.uploaded_by,
    siteKey: row.site_key
  }
}

/**
 * Remove uploads nobody claimed within `LOOSE_TTL_MS` and claimed ones past `CLAIMED_TTL_MS`: the object first, the
 * row only once its object is confirmed gone (a 404 is gone), so a refused delete is tried again next time.
 * Ages are measured on the database clock, the one that wrote `created_at` and `claimed_at`: comparing them with
 * the process clock deletes a fresh upload whenever the two clocks disagree by more than a day.
 * @returns {Promise<string[]>} the ids removed, for tests.
 */
export async function sweepBrandUploads(pool, store, fetchImpl = fetch) {
  const { rows } = await pool.query(
    `select id, object_key from site_brand_upload
      where (claimed_at is null and created_at < now() - ($1 * interval '1 millisecond'))
         or claimed_at < now() - ($2 * interval '1 millisecond')
      limit 50`,
    [LOOSE_TTL_MS, CLAIMED_TTL_MS]
  )
  const swept = []
  for (const row of rows) {
    const res = await signedCall(store, { method: 'DELETE', key: row.object_key }, fetchImpl).catch(
      () => null
    )
    if (!res || (!res.ok && res.status !== 404)) continue
    const { rowCount } = await pool.query('delete from site_brand_upload where id = $1', [row.id])
    if (rowCount === 1) swept.push(row.id)
  }
  return swept
}

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {{ artifactStore?: object | null }} deps.config
 * @param {(c: any) => Promise<{ email: string, accountId: string } | Response>} deps.account - the signed-in caller
 * @param {() => Promise<string[]>} deps.hidden - the switches hidden for every customer
 * @param {typeof fetch} [deps.fetchImpl]
 */
export function mountBrandFiles(app, { pool, config, account, hidden, fetchImpl = fetch }) {
  app.post('/api/sites/brand-files', async (c) => {
    const me = await account(c)
    if (me instanceof Response) return me
    c.header('cache-control', 'no-store')
    // The switch first: off, the door is not there at all, whatever the store.
    if ((await hidden()).includes(BRAND_SWITCH)) return refuse(c, 'BRAND_UPLOADS_OFF', 404)
    const store = config.artifactStore
    if (!store) return refuse(c, 'BRAND_STORE_UNAVAILABLE', 503)
    // Refused on the announced length BEFORE reading (the comment attachments' rule); multipart framing adds a little.
    const announced = Number(c.req.header('content-length') ?? '0')
    if (announced > BRAND_MAX_BYTES + 64 * 1024)
      return refuse(c, 'TOO_LARGE', 422, { problems: ['TOO_LARGE'] })
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    const role = form?.get('role')
    if (typeof role !== 'string' || !BRAND_ROLES.includes(role))
      return refuse(c, 'BRAND_BAD_INPUT', 400, { field: 'role' })
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function' || file.size === 0)
      return refuse(c, 'BRAND_BAD_INPUT', 400, { field: 'file' })
    if (file.size > BRAND_MAX_BYTES) return refuse(c, 'TOO_LARGE', 422, { problems: ['TOO_LARGE'] })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const verdict = await checkBrandImage(bytes, role)
    if (!verdict.ok) return refuse(c, verdict.problems[0], 422, { problems: verdict.problems })
    const id = crypto.randomUUID()
    const objectKey = `brand/${me.accountId}/${id}`
    const url = await presign(store, { method: 'PUT', key: objectKey, expiresIn: STORE_URL_TTL_S })
    const put = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: bytes
    }).catch(() => null)
    if (!put?.ok) return refuse(c, 'BRAND_STORE_FAILED', 502, put ? { status: put.status } : {})
    await pool.query(
      `insert into site_brand_upload (id, uploaded_by, role, size, width, height, object_key)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, me.accountId, role, bytes.length, verdict.width, verdict.height, objectKey]
    )
    await audit(pool, {
      actor: me.email,
      action: 'site.brand-file.upload',
      detail: { id, role, size: bytes.length }
    })
    await sweepBrandUploads(pool, store, fetchImpl).catch(() => {})
    return json(c, { id, width: verdict.width, height: verdict.height }, 201)
  })
}
