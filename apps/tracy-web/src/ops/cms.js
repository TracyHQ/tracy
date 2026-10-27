/**
 * `/api/ops/cms` — the build configuration of one git ref, read out of a file that was built from it.
 *
 * 🔒 THIS PROCESS NEVER READS A REPOSITORY. There is no `.git` in the image, no checkout, no token,
 * and none of those is an omission to be fixed later: a web process that can read arbitrary refs is
 * a web process that can be asked for the wrong one. `scripts/gen-ops-cms-snapshot.mjs` does the
 * reading where a repository already exists, and what ships is a JSON file with its provenance
 * stapled on. Everything below serves those files and nothing else.
 *
 * 🔒 THE ENVIRONMENT IS A KEY, NOT A PATH. A request names `dev` or `main`; the server looks that
 * up in the index it shipped with. No ref, path or URL from a browser ever reaches a filesystem
 * call — `snapshotFile()` refuses anything that is not one of the ids the index already lists, so
 * traversal has nothing to traverse.
 *
 * 🔒 READ ONLY, AND ENFORCED RATHER THAN INTENDED. Every route here is registered for GET alone,
 * and the namespace answers 405 to every other method (`app.all` below) instead of falling through
 * to a handler somebody adds later. This phase ships no write path, and the shape of the module is
 * part of how that stays true.
 *
 * A NOTE ON WHAT THIS CANNOT TELL YOU. A snapshot describes a TREE. It cannot say what any machine
 * is running — a branch is not a deployment — so every `running` answer here is `unknown` unless it
 * came from `/api/ops/cms/runtime`, which asks the host channel and reports what it actually got,
 * including the hosts that did not answer.
 */

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'

import { admit, denied } from './admit.js'
import { hostAgents } from './hosts.js'

/** Beside `static/ops`, and resolved the same way, for the same reason (see `route.js`). */
const DEFAULT_SNAPSHOT_DIR = fileURLToPath(new URL('../../static/ops-cms/', import.meta.url))

/** The schema this server speaks. A file built by a newer generator is refused, not half-read. */
const SCHEMA_VERSION = 'tracy-ops-cms/v1'

/** An environment id is one short token; anything else never becomes a path. */
const ENV_ID = /^[a-z][a-z0-9-]{0,31}$/

/** Design catalogues run to a few hundred rows; a page is bounded and the total is always real. */
const PAGE_MAX = 200
const PAGE_DEFAULT = 50

/**
 * @param {object} deps
 * @param {import('pg').Pool | null} deps.pool
 * @param {object} deps.config
 * @param {object} [deps.host] - the signed host channel, for runtime observations.
 * @param {Function} [deps.fetchImpl]
 * @param {string} [deps.snapshotDir] - override for tests.
 */
export function cmsRoutes({ pool, config, host, fetchImpl, snapshotDir = DEFAULT_SNAPSHOT_DIR }) {
  const app = new Hono()

  /** Read, parse and CHECK a snapshot. A file that fails any of the three is not served as data. */
  async function loadSnapshot(id) {
    if (!ENV_ID.test(id)) return { error: 'unknown-environment' }
    const index = await loadIndex(snapshotDir)
    if (!index) return { error: 'no-index' }
    const entry = index.environments.find((e) => e.id === id)
    if (!entry) return { error: 'unknown-environment' }

    let raw
    try {
      raw = await readFile(join(snapshotDir, `${id}.json`), 'utf8')
    } catch {
      return { error: 'no-snapshot', entry }
    }
    const digest = createHash('sha256').update(raw).digest('hex')
    // The index recorded the digest of the bytes it wrote. A mismatch means the file changed after
    // it was built — a truncated copy, a hand edit, a bad layer — and a screen drawn from it would
    // look exactly as authoritative as a good one.
    if (entry.digest && entry.digest !== digest) return { error: 'digest-mismatch', entry, digest }

    let snap
    try {
      snap = JSON.parse(raw)
    } catch {
      return { error: 'unreadable', entry }
    }
    if (snap.schemaVersion !== SCHEMA_VERSION) return { error: 'schema', entry, got: snap.schemaVersion }
    if (snap.unavailable) return { error: 'ref-unavailable', entry, reason: snap.unavailable }
    if (!snap.sections || !snap.source?.sha) return { error: 'incomplete', entry }
    return { snapshot: snap, digest, entry }
  }

  /**
   * What went wrong, in the words the screen will show. Never a bare 500.
   *
   * 🔒 THE REQUESTED ID IS NEVER ECHOED BACK. A message like `No environment "<what you sent>"`
   * reflects caller input into a response body, which is how a JSON error becomes an injection
   * vector the day somebody renders it as HTML — and it tells an outsider nothing they did not
   * already type. Listing the ids this build DOES publish is both safer and more useful.
   */
  async function problem(c, result) {
    const index = await loadIndex(snapshotDir)
    const known = index ? index.environments.map((e) => e.id) : []
    const map = {
      'unknown-environment': [
        404,
        known.length > 0
          ? `No such environment on this build. It publishes: ${known.join(', ')}.`
          : 'No such environment on this build, which publishes none.'
      ],
      'no-index': [503, 'This build shipped no configuration snapshots at all.'],
      'no-snapshot': [
        503,
        'That environment is listed in the index but its snapshot file is not in this build.'
      ],
      'digest-mismatch': [500, 'That snapshot does not match the digest recorded when it was built.'],
      unreadable: [500, 'That snapshot is not valid JSON.'],
      schema: [500, `That snapshot declares ${safeSchema(result.got)}; this build reads ${SCHEMA_VERSION}.`],
      'ref-unavailable': [200, result.reason ?? 'That branch was not readable when this build was made.'],
      incomplete: [500, 'That snapshot is missing its source or its sections.']
    }
    const [status, message] = map[result.error] ?? [500, 'The snapshot could not be read.']
    return c.json(
      { status: result.error === 'ref-unavailable' ? 'unavailable' : 'error', reason: message },
      status
    )
  }

  /** Which environments this build can answer for, and which of them actually resolved. */
  app.get('/api/ops/cms/environments', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const index = await loadIndex(snapshotDir)
    if (!index)
      return c.json(
        { status: 'unavailable', reason: 'This build shipped no configuration snapshots.', environments: [] },
        200
      )
    return c.json({
      status: 'ok',
      generatedAt: index.generatedAt,
      environments: index.environments.map((e) => ({
        id: e.id,
        label: e.label,
        available: Boolean(e.available),
        sha: e.sha ?? null,
        shortSha: e.sha ? e.sha.slice(0, 9) : null,
        bytes: e.bytes ?? null
      }))
    })
  })

  /**
   * One environment's reading.
   *
   * The design catalogue is replaced by a bounded page plus its true total: 152 systems per CMS is
   * the one part of a snapshot that would dominate the payload, and the screen shows a search over
   * it rather than all of it at once. Everything else is already bounded at generation time.
   */
  app.get('/api/ops/cms/snapshot', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const id = c.req.query('env') ?? ''
    const result = await loadSnapshot(id)
    if (result.error) return problem(c, result)

    const snap = result.snapshot
    const sections = { ...snap.sections }
    if (sections.designs?.data?.byCms) {
      const byCms = {}
      for (const [cms, v] of Object.entries(sections.designs.data.byCms)) {
        byCms[cms] = Array.isArray(v.systems)
          ? {
              ...v,
              systems: v.systems.slice(0, PAGE_DEFAULT),
              total: v.systems.length,
              truncated: v.systems.length > PAGE_DEFAULT
            }
          : v
      }
      sections.designs = { ...sections.designs, data: { ...sections.designs.data, byCms } }
    }
    return c.json({
      status: 'ok',
      schemaVersion: snap.schemaVersion,
      source: { ...snap.source, digest: result.digest },
      sections,
      observations: snap.observations ?? [],
      notes: snap.notes ?? []
    })
  })

  /** The design catalogue, paged and searchable — the one table big enough to need it. */
  app.get('/api/ops/cms/designs', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const id = c.req.query('env') ?? ''
    const result = await loadSnapshot(id)
    if (result.error) return problem(c, result)

    const cms = c.req.query('cms') ?? ''
    const entry = result.snapshot.sections.designs?.data?.byCms?.[cms]
    if (!entry)
      return c.json({ status: 'error', reason: `No design catalogue for "${cms}" in this snapshot.` }, 404)
    if (!Array.isArray(entry.systems))
      return c.json(
        { status: entry.status, reason: entry.reason, cms, systems: [], total: 0, matched: 0 },
        200
      )

    const q = (c.req.query('q') ?? '').trim().toLowerCase()
    const filtered = q
      ? entry.systems.filter((s) => s.id.includes(q) || (s.name ?? '').toLowerCase().includes(q))
      : entry.systems
    const limit = clamp(Number(c.req.query('limit') ?? PAGE_DEFAULT), 1, PAGE_MAX)
    const offset = clamp(Number(c.req.query('offset') ?? 0), 0, Number.MAX_SAFE_INTEGER)
    return c.json({
      status: 'ok',
      cms,
      kind: entry.kind ?? null,
      total: entry.systems.length,
      matched: filtered.length,
      offset,
      limit,
      systems: filtered.slice(offset, offset + limit)
    })
  })

  /**
   * What anybody has actually observed on a machine.
   *
   * 🔒 SEPARATE ROUTE, SEPARATE ANSWER, ON PURPOSE. A snapshot is a tree and can never say what is
   * running; this asks the host channel that already exists for `/ops` and returns what it got,
   * hosts that failed to answer included. Nothing here is merged into the snapshot, because the
   * moment the two share a field somebody will read a branch as a deployment.
   */
  app.get('/api/ops/cms/runtime', async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    c.header('cache-control', 'no-store')
    const observedAt = new Date().toISOString()
    if (!host)
      return c.json({
        status: 'unknown',
        observedAt,
        reason:
          'This build has no host channel configured, so nothing can be observed. Not the same as nothing running.',
        hosts: []
      })
    try {
      const inventory = await hostAgents({ config, host, fetchImpl })
      return c.json({ status: 'ok', observedAt, ...inventory })
    } catch (e) {
      return c.json({
        status: 'unavailable',
        observedAt,
        reason: `The host channel did not answer: ${e instanceof Error ? e.message : String(e)}`,
        hosts: []
      })
    }
  })

  /**
   * Everything else under this namespace, including every write method.
   *
   * Registered last and deliberately total: a POST to `/api/ops/cms/anything` must be refused by
   * this module rather than fall through to whatever the app mounts next. The door still runs
   * first, so a refusal never tells an outsider which paths exist.
   */
  app.all('/api/ops/cms', methodRefused(pool, config))
  app.all('/api/ops/cms/*', methodRefused(pool, config))

  return app
}

function methodRefused(pool, config) {
  return async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    if (c.req.method === 'GET' || c.req.method === 'HEAD')
      return c.json({ status: 'error', reason: 'No such reading on this surface.' }, 404)
    return c.json({ status: 'error', reason: 'This surface is read-only; it has no write doors.' }, 405, {
      allow: 'GET, HEAD'
    })
  }
}

async function loadIndex(dir) {
  try {
    const raw = await readFile(join(dir, 'index.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.environments) ? parsed : null
  } catch {
    return null
  }
}

/**
 * A schema string from a file, made safe to quote back.
 *
 * The file is ours, but it is still bytes read off disk — an arbitrarily long or oddly shaped
 * value has no business being pasted into a response verbatim just because we expected a version.
 */
function safeSchema(v) {
  return typeof v === 'string' && /^[\w./+-]{1,64}$/.test(v) ? v : 'an unrecognised schema'
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo
  return Math.min(Math.max(Math.trunc(n), lo), hi)
}
