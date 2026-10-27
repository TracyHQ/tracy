// post-batch.mjs — posts into the site in batches, not one wp call each.
//
// Measured 14/09 on the wp-tracy-business stand: a no-op seed spent 53 of its 76 wp calls on one
// `post meta get <id> _tracy_seed` per existing post, and a full seed one `post create` or
// `post update` plus one `post meta update` per key per post — at 2–3 s a call. Here the
// fingerprints of every seeded post come back in ONE call (scripts/php/fingerprints.php) and
// posts are created or updated ten at a time (scripts/php/upsert-posts.php), both run through
// `wp eval-file -` with the file on stdin. The decisions are the seeder's own, unchanged: a post
// whose fingerprint matches (and whose template the listing agrees with) is skipped, one that
// differs is updated in place, one the site lacks is created; the counts are the same numbers.
//
// A payload of ten pages of block markup runs to hundreds of KB — past what one argv string may
// carry into a container (128 KB on Linux) — so it goes down stdin, embedded ahead of the PHP
// file as `$tracy_payload_b64`. The PHP file itself also accepts `$args[0]` or stdin JSON, so it
// runs by hand as `wp eval-file scripts/php/<name>.php '<json>'`.
//
// `wp eval-file -` reads the code from STDIN per the WP-CLI eval-file reference ("Use '-' to run
// code from STDIN"). Not measured on the stand on 14/09 — the docker daemon on the build machine
// was not answering; the first real seed after this change is the measurement.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const PHP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'php')
const sources = new Map()

/** The text of scripts/php/<name>.php. */
export function phpSource(name) {
  if (!sources.has(name)) sources.set(name, readFileSync(join(PHP_DIR, `${name}.php`), 'utf8'))
  return sources.get(name)
}

/** The same fingerprint seed.mjs keeps in `_tracy_seed`: sha256 of the desired state, 24 hex chars. */
export const fingerprint = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 24)

/**
 * Run scripts/php/<name>.php inside the site with `payload`, through `wp eval-file -`. Returns
 * the JSON it printed (null when the runner returned nothing — a dry run's write).
 */
export function runPhp(wp, name, payload, { mutate = true } = {}) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  const body = phpSource(name).replace(/^<\?php\s*/, '')
  const stdin = `<?php\n$tracy_payload_b64 = '${b64}';\n${body}`
  const text = wp.run(['eval-file', '-'], { stdin, mutate }).stdout.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${name}.php: not JSON: ${text.slice(0, 300)} (${e.message})`)
  }
}

/**
 * A batch of posts to create or update. `add()` decides at once whether the post is a skip
 * (fingerprint and template match: the id is known) and otherwise queues it, returning a handle
 * `{ id }` that is filled by `flush()`. `count(kind, what)` is the seeder's counter.
 */
export function createPostBatch(wp, { count, chunk = 10, log = null }) {
  let fps = null
  const fingerprints = () => {
    if (fps) return fps
    fps = new Map()
    // A dry run reads no fingerprint, as it never did: every existing post counts as an update.
    if (!wp.dryRun) for (const [id, h] of Object.entries(runPhp(wp, 'fingerprints', {}, { mutate: false }) ?? {})) fps.set(Number(id), h)
    return fps
  }
  const queue = []

  const add = ({ postType, have, desired, kind, terms = null }) => {
    const fp = fingerprint({ ...desired, meta: desired.meta ?? {} })
    // Scalars as strings, as `post meta update` wrote them; an array or object (the Contact Form 7
    // mail settings) stays structured, as `--meta_input` carried it.
    const meta = Object.fromEntries(
      Object.entries({ ...desired.meta, _tracy_seed: fp })
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, typeof v === 'object' ? v : String(v)])
    )
    if (have) {
      const current = wp.dryRun ? null : (fingerprints().get(Number(have.ID)) ?? null)
      // The template is checked on its own when the listing carries it: a fingerprint says what
      // was asked for, not what WordPress kept (upsert-posts.php says why).
      const templateOk =
        have.page_template === undefined ||
        (have.page_template || undefined) === (desired.meta?._wp_page_template || undefined)
      if (current === fp && templateOk) {
        count(kind, 'skipped')
        return { id: Number(have.ID) }
      }
    }
    const item = {
      post_type: postType,
      post_title: desired.post_title,
      post_name: desired.post_name,
      post_status: desired.post_status,
      post_excerpt: desired.post_excerpt ?? '',
      post_content: desired.content ?? '',
      meta,
      existing_id: have ? Number(have.ID) : null,
      clear_template: Boolean(have && desired.meta && desired.meta._wp_page_template === undefined),
      clear_category: Boolean(have && 'post_category' in desired && !(Array.isArray(desired.post_category) ? desired.post_category.length : desired.post_category)),
      // A page the spec no longer tags loses the tags an earlier run gave it (a post always states its tags).
      clear_tags: Boolean(have && postType === 'page' && desired.tags_input === undefined)
    }
    if (desired.post_parent !== undefined) item.post_parent = desired.post_parent
    if (desired.menu_order !== undefined) item.menu_order = desired.menu_order
    if (desired.post_date) item.post_date = desired.post_date
    if (desired.post_author) item.post_author = desired.post_author
    if (Array.isArray(desired.post_category) ? desired.post_category.length : desired.post_category) item.post_category = desired.post_category
    if (desired.tags_input !== undefined) item.tags_input = desired.tags_input
    if (desired.sticky !== undefined) item.sticky = Boolean(desired.sticky)
    if (terms && !have) item.terms = terms
    const handle = { id: null }
    if (wp.dryRun) {
      // Nothing is written and no call is made, as before: an existing post is an update, a new
      // one is created with id 0.
      handle.id = have ? Number(have.ID) : 0
      count(kind, have ? 'updated' : 'created')
      return handle
    }
    queue.push({ item, handle, kind })
    return handle
  }

  /** Meta keys on an existing post (an attachment's alt text), written with the next flush. */
  const addMeta = (id, meta) => {
    const item = { existing_id: Number(id), meta_only: true, meta: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, String(v)])) }
    if (wp.dryRun) return
    queue.push({ item, handle: { id: Number(id) }, kind: null })
  }

  const flush = () => {
    while (queue.length) {
      const part = queue.splice(0, chunk)
      const results = runPhp(wp, 'upsert-posts', { items: part.map((q) => q.item) }) ?? []
      if (results.length !== part.length)
        throw new Error(`upsert-posts.php: ${part.length} items sent, ${results.length} results back`)
      part.forEach((q, i) => {
        const r = results[i]
        if (r.action === 'error')
          throw new Error(`seed: ${q.kind ?? 'meta'} ${q.item.post_name ?? q.item.existing_id} (${q.item.existing_id ? 'update' : 'create'}): ${r.error}`)
        q.handle.id = Number(r.id)
        if (q.kind) count(q.kind, r.action)
        if (r.action === 'created' && r.slug && q.item.post_name && r.slug !== q.item.post_name)
          log?.(`seed: ${q.kind} ${q.item.post_name} created as ${r.slug}`)
      })
    }
  }

  return { add, addMeta, flush, fingerprintOf: (id) => fingerprints().get(Number(id)) ?? null, pending: () => queue.length }
}
