/**
 * The pictures the build chat's research stores before a site exists (#609), table `build_draft_picture` (migration
 * 218). Each collected picture is downloaded, sniffed, measured and put in the object store by the Website
 * Opportunities media rules (`media-store.js` `createMediaStore`, injected as `mediaStoreOf`) under a key of the draft
 * (`build-drafts/<account>/<sha256>.<ext>`); a draft row records it. No `wo_*` row is written.
 *
 * A picture that is not stored (a failed download, not a picture, too large, refused by the guard, no store, the
 * research's time ran out) stays out of the manifest, its address and reason set aside.
 *
 * 🔒 A NEWER RESEARCH REPLACES THE PICTURES. One row per picture bytes of an account: research again on the same
 * bytes keeps the row and its id, moved to the new run. Once a research step has succeeded, `prune` deletes the rows
 * of every older run and their objects, so the draft holds exactly the pictures its current research names.
 */

/** The executor's media budget (`executor.js` `MEDIA_BUDGET`), and its admission's parallel downloads. */
export const PICTURE_BUDGET = 300
const AT_ONCE = 5

/** Plain reasons a picture was not stored, by the media record's `reason`. */
export const NOT_STORED = Object.freeze({
  download_failed: 'the picture could not be downloaded',
  too_large: 'the picture is larger than a picture may be',
  not_media: 'the address is not a picture or a video',
  image_unreadable: 'the picture could not be read',
  store_failed: 'the picture could not be kept',
  store_unavailable: 'this server has no store to keep pictures in',
  url_blocked: 'a private address, or one that does not answer on the internet',
  timeout: 'the research ran out of time before this picture was kept'
})
const reasonOf = (code) => NOT_STORED[code] ?? NOT_STORED.download_failed

export const draftKeyPrefix = (accountId) => `build-drafts/${accountId}`

/**
 * The items to store: every collected picture of the rows, then the logo hints of the sources (`place-logo.js`, kept
 * whatever their size), shared fairly between sources up to the budget.
 */
export function picturesToStore({ rows, hints = [], fairShare, budget = PICTURE_BUDGET }) {
  const queue = new Map()
  for (const r of rows)
    for (const m of r.collected?.media ?? [])
      if (typeof m?.url === 'string' && !queue.has(m.url)) queue.set(m.url, { ...m, source: r.source })
  const items = fairShare([...queue.values()], budget)
  for (const h of hints)
    if (typeof h?.url === 'string' && !queue.has(h.url))
      items.push({ url: h.url, kind: 'image', source: h.source })
  return items
}

/** A stored row as a brief read's media row (the `wo_place_media` columns `fromPlace` reads), origin `draft`. */
const asMediaRow = (r) => ({
  id: r.id,
  origin: 'draft',
  status: 'stored',
  kind: r.kind,
  category: r.category,
  sha256: r.sha256,
  mime: r.mime,
  width: r.width,
  height: r.height,
  source: r.source,
  source_url: r.source_url,
  post_id: r.post_id,
  posted_at: r.posted_at,
  caption: r.caption,
  alt: r.alt,
  bytes: r.bytes,
  dhash: r.dhash,
  labels: r.labels
})

const UPSERT = `insert into build_draft_picture (account_id, research_run, kind, category, source, source_url, post_id,
    posted_at, caption, alt, sha256, object_key, mime, bytes, width, height, duration_s, palette, dhash, labels)
  values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb)
  on conflict (account_id, sha256) do update set research_run = excluded.research_run, source = excluded.source,
    source_url = excluded.source_url, post_id = excluded.post_id, posted_at = excluded.posted_at,
    caption = excluded.caption, alt = excluded.alt, category = excluded.category
  returning *`

/**
 * @param {{pool: import('pg').Pool, objects: {get: Function, delete?: Function} | null,
 *   mediaStoreOf: (deps: object) => {mediaRecord: Function}, withinTime: Function}} deps
 */
export function createDraftPictures({ pool, objects, mediaStoreOf, withinTime }) {
  /** Store the items of one research run: `{rows, setAside}`, rows in the brief read's media shape. */
  async function store({ accountId, run, items, domain, deps, remaining }) {
    const media = mediaStoreOf(deps)
    const owner = { fields: { accountId }, keyPrefix: draftKeyPrefix(accountId) }
    const rows = []
    const setAside = []
    const keptAt = new Map()
    let next = 0
    async function worker() {
      while (next < items.length) {
        const item = items[next++]
        if (remaining() <= 0) {
          setAside.push({ url: item.url, reason: reasonOf('timeout') })
          continue
        }
        const got = await withinTime(() => media.mediaRecord(domain, owner, item), remaining())
        const record = got?.timedOut ? { status: 'reference', reason: 'timeout' } : got
        if (record?.status !== 'stored') {
          setAside.push({ url: item.url, reason: reasonOf(record?.reason) })
          continue
        }
        const { rows: saved } = await pool.query(UPSERT, [
          accountId,
          run,
          record.kind,
          record.category ?? null,
          record.source,
          record.sourceUrl,
          record.postId ?? null,
          record.postedAt ?? null,
          record.caption ?? null,
          record.alt ?? null,
          record.sha256,
          record.objectKey,
          record.mime,
          record.bytes,
          record.width ?? null,
          record.height ?? null,
          record.durationS ?? null,
          record.palette ? JSON.stringify(record.palette) : null,
          record.dhash ?? null,
          record.labels ? JSON.stringify(record.labels) : null
        ])
        // Two addresses of the same bytes are one picture.
        if (!keptAt.has(saved[0].id)) {
          keptAt.set(saved[0].id, true)
          rows.push({ ...asMediaRow(saved[0]), palette: saved[0].palette, objectKey: saved[0].object_key })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker))
    return { rows, setAside }
  }

  /** Delete the account's pictures of every run but `run`, rows and objects. Answers how many went. */
  async function prune(accountId, run) {
    const { rows } = await pool.query(
      'delete from build_draft_picture where account_id = $1 and research_run <> $2 returning object_key',
      [accountId, run]
    )
    for (const r of rows) await objects?.delete?.(r.object_key).catch(() => false)
    return rows.length
  }

  /** The stored bytes of one draft picture, checked against its sha256; null when gone or changed. */
  async function open(id, { accountId = null, hash } = {}) {
    const { rows } = await pool.query(
      `select id, account_id, sha256, object_key, mime, width, height, kind from build_draft_picture
        where id::text = $1 and ($2::uuid is null or account_id = $2)`,
      [String(id), accountId]
    )
    const row = rows[0]
    if (!row || !objects) return null
    const res = await objects.get(row.object_key).catch(() => null)
    if (!res?.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    if (hash && hash(bytes) !== row.sha256) return null
    return {
      id: row.id,
      sha256: row.sha256,
      mime: row.mime,
      width: row.width,
      height: row.height,
      kind: row.kind,
      bytes
    }
  }

  return { store, prune, open }
}
