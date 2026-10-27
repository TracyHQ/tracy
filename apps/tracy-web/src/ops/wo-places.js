/**
 * `/ops/wo` › Places — the shared place store across accounts (tasks/todo-wo-shared-research.md P4).
 *
 *   GET  /api/ops/wo/places?q=&state=&cursor=&limit=   → a page of places with their facts and counts
 *   GET  /api/ops/wo/places/merge-queue?state=         → URL ↔ Google merge candidates
 *   POST /api/ops/wo/places/merge-queue/:id/approve    → merge the URL place into the Google place
 *   POST /api/ops/wo/places/merge-queue/:id/reject
 *   GET  /api/ops/wo/places/:id                        → one place: sources, media, snapshots, accounts, history
 *   POST /api/ops/wo/places/:id/refresh                → at most one next run, under the daily cap
 *   POST /api/ops/wo/places/:id/media/:mediaId/revoke  { reason } / …/unrevoke
 *   POST /api/ops/wo/places/:id/social-pages/add       { url } → a social page no search found becomes a source
 *   POST /api/ops/wo/places/:id/merge                  { into }
 *   POST /api/ops/wo/places/:id/split                  { identity: {namespace, externalId} }
 *
 * Staff (`admit`) read; only `owner` or `admin` from this deployment's origin act (same rule as `wo.js`).
 * Every action is recorded in `wo_place_ops_event` with the operator's email.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { Hono } from 'hono'
import { againPartsOf } from 'website-opportunities/src/research-again.js'
import { woRuntime } from '../lib/wo-ops.js'
import { readWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import {
  PLACE_STATES,
  PlaceMergeError,
  PlaceOpsError,
  addSocialPage,
  costToday,
  decideMergeCandidate,
  isUuid,
  judgeSocialPage,
  listMergeQueue,
  listPlaces,
  mergePlaces,
  placeAgainPreview,
  placeDetail,
  refreshPlace,
  researchAgainPlace,
  researchCapsOf,
  setMediaRevoked,
  splitPlace
} from 'website-opportunities/src/wo-places-store.js'
import { admit, denied } from './admit.js'
import { displayNameOf, emailOf, principalOf } from '../lib/wo-principal.js'

/**
 * @param {{
 *   pool: import('pg').Pool | null,
 *   config: { origin: string, sessionSecret: string },
 *   log?: { log: (...a: any[]) => void },
 *   now?: () => number,
 *   resolve?: (host: string) => Promise<{address: string, family: number}[]>
 * }} deps
 */
export function woPlacesOpsRoutes({
  pool,
  config,
  log = console,
  now = Date.now,
  resolve = (host) => dnsLookup(host, { all: true, verbatim: true })
}) {
  const app = new Hono()

  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write && (!['owner', 'admin'].includes(who.role) || c.req.header('origin') !== config.origin))
      return { deny: c.body(null, 403) }
    if (!pool) return { deny: c.json({ error: 'NO_DATABASE' }, 503) }
    return { who }
  }

  const refuse = (c, error) => {
    if (error instanceof PlaceMergeError)
      return c.json(
        { error: error.code, message: error.message, ...(error.plan ? { plan: error.plan } : {}) },
        error.status
      )
    throw error
  }

  const act = (path, run) =>
    app.post(path, async (c) => {
      const g = await guard(c, { write: true })
      if (g.deny) return g.deny
      const body = await c.req.json().catch(() => ({}))
      try {
        const out = await run(c, body && typeof body === 'object' ? body : {}, g.who.email)
        log.log(`[ops/wo/places] ${path.split('/').pop()} ${c.req.param('id') ?? ''} by ${g.who.email}`)
        c.header('cache-control', 'no-store')
        return c.json({ ok: true, ...out })
      } catch (error) {
        return refuse(c, error)
      }
    })

  const placeIdOf = (c) => {
    const id = c.req.param('id')
    if (!isUuid(id)) throw new PlaceOpsError(404, 'PLACE_NOT_FOUND', 'Place not found.')
    return id
  }

  app.get('/api/ops/wo/places', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const state = c.req.query('state') ?? 'all'
    if (!PLACE_STATES.includes(state)) return c.json({ error: 'INVALID_STATE' }, 400)
    const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query('limit') ?? '50', 10) || 50))
    const nowMs = now()
    const [page, settings, today] = await Promise.all([
      listPlaces(pool, {
        q: c.req.query('q') ?? '',
        state,
        cursor: c.req.query('cursor') ?? null,
        limit,
        nowMs
      }),
      readWoOpsSettings(pool),
      costToday(pool, nowMs)
    ])
    c.header('cache-control', 'no-store')
    return c.json({
      ...page,
      today,
      caps: researchCapsOf(settings.settings),
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  // Before `/places/:id`, which would read `merge-queue` as a place id.
  app.get('/api/ops/wo/places/merge-queue', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const state = c.req.query('state') ?? 'pending'
    if (!['pending', 'waiting', 'approved', 'rejected'].includes(state))
      return c.json({ error: 'INVALID_STATE' }, 400)
    c.header('cache-control', 'no-store')
    return c.json({ candidates: await listMergeQueue(pool, state) })
  })

  for (const decision of ['approve', 'reject'])
    act(`/api/ops/wo/places/merge-queue/:id/${decision}`, async (c, _body, actor) => {
      const id = c.req.param('id')
      if (!isUuid(id)) throw new PlaceOpsError(404, 'CANDIDATE_NOT_FOUND', 'Merge candidate not found.')
      return { candidate: await decideMergeCandidate(pool, id, decision, actor) }
    })

  app.get('/api/ops/wo/places/:id', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    try {
      const detail = await placeDetail(pool, placeIdOf(c), now(), { emailOf, displayNameOf })
      c.header('cache-control', 'no-store')
      return c.json(detail)
    } catch (error) {
      return refuse(c, error)
    }
  })

  act('/api/ops/wo/places/:id/refresh', async (c, _body, actor) => {
    const settings = (await readWoOpsSettings(pool)).settings
    return refreshPlace(pool, placeIdOf(c), {
      actor,
      caps: researchCapsOf(settings),
      nowMs: now(),
      principalOf
    })
  })

  // Research again: the preview, and the run of only what is due (tasks/todo-wo-research-again.md).
  const againDeps = async (parts) => {
    // `parts` limits the plan ("Read menu again": menu-file, menu-photos); absent = every part.
    const limited = againPartsOf(parts)
    if ('error' in limited) throw new PlaceOpsError(400, 'INVALID_PARTS', limited.error)
    const { keys, settings } = await woRuntime(pool, config)
    return {
      keys,
      settings,
      domain: await websiteOpportunitiesDomain().catch(() => null),
      onlyParts: limited.parts
    }
  }
  app.get('/api/ops/wo/places/:id/research-again', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    try {
      c.header('cache-control', 'no-store')
      return c.json(
        await placeAgainPreview(pool, placeIdOf(c), {
          nowMs: now(),
          ...(await againDeps(c.req.query('parts')))
        })
      )
    } catch (error) {
      return refuse(c, error)
    }
  })

  act('/api/ops/wo/places/:id/research-again', async (c, body, actor) => {
    const deps = await againDeps(body.parts)
    return researchAgainPlace(pool, placeIdOf(c), {
      actor,
      caps: researchCapsOf(deps.settings),
      nowMs: now(),
      principalOf,
      ...deps
    })
  })

  act('/api/ops/wo/places/:id/social-pages', async (c, body, actor) => {
    if (typeof body.url !== 'string' || body.url.length > 2000)
      throw new PlaceOpsError(
        400,
        'INVALID_URL',
        'Send the url of a Facebook or Instagram page the search found.'
      )
    return judgeSocialPage(pool, placeIdOf(c), { url: body.url, verdict: body.verdict, actor })
  })

  act('/api/ops/wo/places/:id/social-pages/add', async (c, body, actor) => {
    if (typeof body.url !== 'string' || body.url.length > 2000)
      throw new PlaceOpsError(
        400,
        'INVALID_URL',
        'Send the url of a Facebook, Instagram, TikTok or YouTube page.'
      )
    return addSocialPage(pool, placeIdOf(c), { url: body.url.trim(), actor, resolve })
  })

  for (const [verb, revoked] of [
    ['revoke', true],
    ['unrevoke', false]
  ])
    act(`/api/ops/wo/places/:id/media/:mediaId/${verb}`, async (c, body, actor) => {
      const mediaId = c.req.param('mediaId')
      if (!isUuid(mediaId)) throw new PlaceOpsError(404, 'MEDIA_NOT_FOUND', 'Media not found.')
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (revoked && (!reason || reason.length > 500))
        throw new PlaceOpsError(400, 'INVALID_REASON', 'A revoke needs a reason of 1–500 characters.')
      return { media: await setMediaRevoked(pool, placeIdOf(c), mediaId, { revoked, reason, actor }) }
    })

  act('/api/ops/wo/places/:id/merge', async (c, body, actor) => {
    if (!isUuid(body.into)) throw new PlaceOpsError(400, 'INVALID_TARGET', 'Body needs `into`, a place id.')
    return mergePlaces(pool, placeIdOf(c), body.into, { actor })
  })

  act('/api/ops/wo/places/:id/split', async (c, body, actor) => {
    const identity = body.identity
    if (
      !identity ||
      typeof identity.namespace !== 'string' ||
      typeof identity.externalId !== 'string' ||
      !identity.externalId
    )
      throw new PlaceOpsError(400, 'INVALID_IDENTITY', 'Body needs `identity: {namespace, externalId}`.')
    return splitPlace(pool, placeIdOf(c), identity, { actor })
  })

  return app
}
