/**
 * `/v1/demos` (tasks/todo-wo-public-demos.md B, C, R1, decided 24/10/2026): an outside builder asks for a demo
 * of one business with `website-opportunities/demo-request/v1` or `v2`. Each request is an immutable snapshot imported as
 * the account's own opportunity (never a shared place, never research another account reads) and handed to the
 * same `acceptDemoActions` as the Build demo button: no second build pipeline.
 *
 * 🔒 ONE TRANSACTION accepts a request: the account lock, the replay check of its `Idempotency-Key`, the hosting cap
 * (`liveDemosPerAccount` demo sites alive at once), the model budget (demos on Tracy's model only), the import and
 * the demo action. A retry, concurrent or after a crash, finds the committed row and answers the same receipt; a
 * request that died before the commit left nothing, so its retry starts over.
 *
 * What the body may not decide: the account (the token's), the site, credentials, the template beyond the offered
 * ones, `ownSite` or any `verified` claim — the contract refuses those fields by name.
 */
import { createHash, randomUUID } from 'node:crypto'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { insertMedia, saveProfile } from 'website-opportunities/src/store.js'
import { chooseTemplate, pinsOf, templateChoices } from '../lib/wo-revision-choice.js'
import { acceptDemoActions } from './demo-actions.js'
import { AGENT_DEMO } from './agent-demo.js'
import { CLIENT_DEMO, LOGO_RESEARCH_PENDING } from './client-demo.js'
import { fetchDemoPhotos } from './public-demo-photos.js'
import { readPublicDemoSettings } from '../lib/wo-public-demo-settings.js'
import { snapshotRequest } from './public-demo-profile.js'

export const PUBLIC_DEMO_PROVIDER = 'external:website-opportunities'
const SOURCE = 'website-opportunities'
const FAILED = ['failed', 'quality-failed-v1']
const COMPLETED = ['completed', 'quality-completed-v1']
/**
 * The request capabilities this host takes all the way to the brief (`GET /v1/demos/options` `accepts`).
 * A part is listed only once its whole road (store, brief, build) is in: a client sends only what is listed.
 */
export const DEMO_ACCEPTS = Object.freeze([
  'items.size',
  'items.priceScale',
  'items.photo',
  'brand',
  'links',
  'posts',
  'profile/1'
])
const SENDER_MATCHER = 'sender/1'

const refusal = (status, code, message, extra = {}) => ({
  status,
  body: { error: { code, message }, ...extra }
})

/** The demo's row with its action, build and site: everything a status answer reads. */
const DEMO_ROW = `select d.*, a.status as action_status, a.step as action_step, a.error as action_error,
    a.selection as action_selection, a.session_id as action_session_id, b.content as build_content,
    b.id as build_id, b.site_key, b.state as build_state, b.qa as build_qa, b.choice as build_choice,
    b.demo_expires_at, b.demo_frozen_at, b.demo_deleted_at, st.address as site_address
  from wo_public_demo d
  join wo_demo_action a on a.id = d.action_id
  left join wo_build b on b.account_id = a.account_id and b.request_id = a.build_request_id
  left join site st on st.site_key = b.site_key`

/**
 * The account's demos holding a hosting slot: not cancelled before a build began, not deleted, not failed
 * without a site. An expired or frozen demo still runs (`demo-retention.js`), so it still counts.
 */
export async function liveDemos(db, accountId) {
  const { rows } = await db.query(
    `select count(*)::int as live from wo_public_demo d
       join wo_demo_action a on a.id = d.action_id
       left join wo_build b on b.account_id = a.account_id and b.request_id = a.build_request_id
     where d.account_id = $1 and not d.cancelled_without_site
       and (b.id is null or (b.demo_deleted_at is null and b.state <> 'deleted'))
       and not (a.status = any($2::text[]) and b.site_key is null)`,
    [accountId, FAILED]
  )
  return rows[0].live
}

/** Cents reserved this UTC month by demos built on Tracy's model. */
async function sponsoredThisMonth(db, at) {
  const d = new Date(at)
  const month = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const { rows } = await db.query(
    `select coalesce(sum(reserved_cents), 0)::int as cents from wo_public_demo
     where sponsored and not cancelled_without_site and created_at >= $1`,
    [month]
  )
  return rows[0].cents
}

/** Whether the account has an AI account of its own connected: its demo agent then runs on it, not on Tracy's. */
export async function hasAiAccount(db, accountId) {
  const { rows } = await db.query(
    `select exists (select 1 from seat_plan_connection where account_id = $1 and secret is not null
       and provider <> 'tracy') as connected`,
    [accountId]
  )
  return rows[0].connected
}

/** `acceptDemoActions`'s own transaction as a savepoint of ours: its refusal undoes only its part, we roll back the rest. */
function insideOf(client) {
  const as = {
    begin: 'savepoint wo_public_demo_accept',
    commit: 'release savepoint wo_public_demo_accept',
    rollback: 'rollback to savepoint wo_public_demo_accept'
  }
  return {
    connect: async () => ({
      query: (sql, ...args) =>
        client.query(typeof sql === 'string' ? (as[sql.trim().toLowerCase()] ?? sql) : sql, ...args),
      release() {}
    })
  }
}

/** An agent demo whose site exists and whose brief no chat has sent yet: the seller's AI builds it in Tracy. */
const waitsForSeller = (row) =>
  row.action_selection?.chatMode === CLIENT_DEMO &&
  Boolean(row.site_key) &&
  !row.build_content?.agentDemo?.clientChat?.submissions?.[row.action_id]

export function statusOf(row) {
  if (row.cancelled_at) return 'cancelled'
  if (FAILED.includes(row.action_status)) return 'failed'
  if (COMPLETED.includes(row.action_status))
    return row.build_qa?.state === 'passed' ? 'ready' : 'needs-review'
  if (waitsForSeller(row)) return 'waiting-for-you'
  return row.build_id ? 'building' : 'queued'
}

/** Where the seller continues: the agent demo's own chat (sending its brief while it waits), else the site. */
function editUrlOf(origin, row) {
  const site = `${origin}/${encodeURIComponent(row.site_key)}`
  if (row.action_selection?.chatMode !== CLIENT_DEMO || !row.action_session_id) return site
  const chat = `${site}/s/${encodeURIComponent(row.action_session_id)}`
  return waitsForSeller(row) ? `${chat}?wo-demo-chat=${encodeURIComponent(row.action_id)}` : chat
}

/**
 * @param {{ pool: import('pg').Pool, config: { origin: string, apiOrigin?: string }, loadDomain: () => Promise<any>,
 *   resolve: Function, fetchImpl: typeof fetch, imageInfo: Function, objects: { put: Function } | null,
 *   templateCards: () => Promise<any>, woSettings: () => Promise<any>, now?: () => number,
 *   hasAiAccount?: (accountId: string) => Promise<boolean> }} deps
 */
export function createPublicDemos(deps) {
  const { pool, config } = deps
  const now = deps.now ?? Date.now
  const origin = String(config.origin ?? '').replace(/\/+$/, '')
  const apiOrigin = String(config.apiOrigin ?? config.origin ?? '').replace(/\/+$/, '')
  const connected = deps.hasAiAccount ?? ((accountId) => hasAiAccount(pool, accountId))

  function shape(row) {
    const choice = row.build_choice ?? null
    return {
      id: row.id,
      status: statusOf(row),
      statusUrl: `${apiOrigin}/v1/demos/${row.id}`,
      createdAt: new Date(row.created_at).toISOString(),
      business: { name: row.request.profile?.business.name?.value ?? row.request.business?.name },
      cms: choice?.cms ?? row.request.cms ?? null,
      template: choice?.template
        ? { quickstart: choice.template.quickstart, design: choice.template.design }
        : (row.request.template ?? null),
      site: row.site_key
        ? {
            key: row.site_key,
            url: row.site_address ?? null,
            editUrl: editUrlOf(origin, row)
          }
        : null,
      error: row.cancelled_at
        ? null
        : FAILED.includes(row.action_status)
          ? { code: row.action_error ?? 'DEMO_FAILED' }
          : null,
      // The WO demo clock (`demo-retention.js`) starts when the site exists; reading this never moves it.
      retention: {
        expiresAt: row.demo_expires_at ? new Date(row.demo_expires_at).toISOString() : null,
        frozenAt: row.demo_frozen_at ? new Date(row.demo_frozen_at).toISOString() : null,
        deletedAt: row.demo_deleted_at ? new Date(row.demo_deleted_at).toISOString() : null
      },
      model: row.sponsored ? 'tracy' : 'account',
      photos: row.photos ?? {}
    }
  }

  async function demosOf(db, accountId) {
    const { settings } = await readPublicDemoSettings(db)
    return { live: await liveDemos(db, accountId), limit: settings.liveDemosPerAccount }
  }

  async function rowOf(db, accountId, id) {
    const { rows } = await db.query(`${DEMO_ROW} where d.account_id = $1 and d.id = $2`, [accountId, id])
    return rows[0] ?? null
  }

  /** The template a request names, checked against what is offered, before anything is fetched or written. */
  function selectionFor(request, cards, ops) {
    const cms = request.cms ?? ops.defaultCms ?? 'wordpress'
    let named
    if (request.template) {
      const design =
        request.template.design ??
        ('cards' in cards
          ? cards.cards.find((card) =>
              (card.platforms ?? []).some((p) => p?.platform === cms && p.tag === request.template.quickstart)
            )?.id
          : undefined)
      named = { design, quickstart: request.template.quickstart }
    }
    const chosen = chooseTemplate(cards, cms, named, named ? null : (pinsOf(ops)[cms] ?? null))
    if (chosen.status || chosen.refusal)
      return refusal(
        422,
        named ? 'INVALID_TEMPLATE' : 'NO_TEMPLATE_OFFERED',
        named
          ? 'Choose a template GET /v1/demos/options lists for this CMS.'
          : 'No template is offered for this CMS right now. Try another CMS or later.'
      )
    return { selection: { cms, design: chosen.design, quickstart: chosen.quickstart } }
  }

  async function replay(db, accountId, key, fingerprint) {
    const { rows } = await db.query(`${DEMO_ROW} where d.account_id = $1 and d.idempotency_key = $2`, [
      accountId,
      key
    ])
    if (!rows[0]) return null
    if (rows[0].fingerprint !== fingerprint)
      return refusal(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was used with a different body. Send a new key for a new demo.'
      )
    return { status: 202, body: { demo: shape(rows[0]), demos: await demosOf(db, accountId) } }
  }

  /** Refusals of the hosting cap and the model budget, read under the account lock or before it. */
  async function capRefusal(db, accountId, sponsored, at) {
    const { settings } = await readPublicDemoSettings(db)
    const live = await liveDemos(db, accountId)
    if (live >= settings.liveDemosPerAccount)
      return refusal(
        409,
        'DEMO_LIMIT_REACHED',
        `This account has ${live} live demo sites, the most it may have at once. Delete a demo in Tracy to make room.`,
        { demos: { live, limit: settings.liveDemosPerAccount } }
      )
    if (
      sponsored &&
      (await sponsoredThisMonth(db, at)) + settings.sponsoredDemoMaxCents >
        settings.sponsoredMonthlyBudgetCents
    )
      return refusal(
        503,
        'SPONSOR_BUDGET_EXHAUSTED',
        'Tracy’s model budget for demos is used up for this month. Connect your own AI account in Tracy, or try next month.'
      )
    return null
  }

  /**
   * @param {{ accountId: string, key: string, request: any, fingerprint: string }} input the validated request
   * @returns {Promise<{ status: number, body: object }>}
   */
  async function submit({ accountId, key, request, fingerprint }) {
    const early = await replay(pool, accountId, key, fingerprint)
    if (early) return early
    const at = now()
    const sponsored = !(await connected(accountId))
    const capped = await capRefusal(pool, accountId, sponsored, at)
    if (capped) return capped
    const [cards, ops] = await Promise.all([deps.templateCards(), deps.woSettings()])
    const chosen = selectionFor(request, cards, ops)
    if ('status' in chosen) return chosen

    const domain = await deps.loadDomain()
    const snapshot = snapshotRequest(request, { at: new Date(at).toISOString() })
    if (typeof snapshot.business.name !== 'string' || !snapshot.business.name.trim())
      return refusal(422, 'INVALID_DEMO_REQUEST', 'Send the business name in the place profile.', {
        errors: [{ path: 'profile.business.name', code: 'REQUIRED' }]
      })
    const fetched = await fetchDemoPhotos(domain, request.photos, {
      fetch: deps.fetchImpl,
      resolve: deps.resolve,
      imageInfo: deps.imageInfo,
      now
    })
    if ('blocked' in fetched)
      return refusal(
        422,
        'PHOTO_URL_BLOCKED',
        `photos.${fetched.blocked.index}.url points at an address Tracy does not fetch (${fetched.blocked.reason}).`,
        { errors: [{ path: `photos.${fetched.blocked.index}.url`, code: 'URL_BLOCKED' }] }
      )
    // v1 sends its logo apart from photos; v2 includes it in that list and its limits.
    const logoFetched =
      request.schema !== 'website-opportunities/demo-request/v2' && request.brand?.logo
        ? await fetchDemoPhotos(domain, [{ url: request.brand.logo }], {
            fetch: deps.fetchImpl,
            resolve: deps.resolve,
            imageInfo: deps.imageInfo,
            now
          })
        : null
    if (logoFetched && 'blocked' in logoFetched)
      return refusal(
        422,
        'PHOTO_URL_BLOCKED',
        `brand.logo points at an address Tracy does not fetch (${logoFetched.blocked.reason}).`,
        { errors: [{ path: 'brand.logo', code: 'URL_BLOCKED' }] }
      )
    const id = randomUUID()
    const opportunityId = randomUUID()
    const stored = []
    const excluded = new Map((snapshot.skippedPhotos ?? []).map((p) => [p.index, p.reason]))
    for (const photo of fetched.got) {
      if (excluded.has(photo.index)) {
        fetched.skipped.push({ index: photo.index, reason: excluded.get(photo.index) })
        continue
      }
      const objectKey = `opportunities/${accountId}/${opportunityId}/${photo.sha256}.${photo.ext}`
      if (deps.objects && (await deps.objects.put(objectKey, photo.bytes, photo.mime)))
        stored.push({ ...photo, objectKey })
      else fetched.skipped.push({ index: photo.index, reason: 'store_failed' })
    }
    let logo = null
    for (const photo of logoFetched?.got ?? []) {
      const objectKey = `opportunities/${accountId}/${opportunityId}/${photo.sha256}.${photo.ext}`
      if (deps.objects && (await deps.objects.put(objectKey, photo.bytes, photo.mime)))
        logo = { ...photo, objectKey }
    }
    // v2's logo is one of photos[], fetched once under that same request's limits.
    if (request.schema === 'website-opportunities/demo-request/v2')
      logo = stored.find((photo) => request.photos[photo.index].url === snapshot.brand?.logo) ?? null
    // The fill builds only from the business's real photos (`quickstart-first.js`, QUICKSTART_PHOTOGRAPHS_REQUIRED):
    // without one, say so now instead of making a site that cannot be filled.
    if (stored.length === 0) {
      if (fetched.skipped.some((skip) => skip.reason === 'store_failed'))
        return refusal(
          503,
          'PHOTO_STORE_UNAVAILABLE',
          'Tracy could not keep the photos right now. Try again shortly.'
        )
      if (!request.photos?.length)
        return refusal(
          422,
          'PHOTOS_REQUIRED',
          'Send at least one public https photo of the business: a demo is built from its own photos.'
        )
      return refusal(422, 'PHOTOS_UNUSABLE', 'None of the photos could be downloaded as an image.', {
        photos: { skipped: fetched.skipped }
      })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`wo-demo:${accountId}`])
      const again = await replay(client, accountId, key, fingerprint)
      if (again) {
        await client.query('rollback')
        return again
      }
      const held = await capRefusal(client, accountId, sponsored, at)
      if (held) {
        await client.query('rollback')
        return held
      }
      await importSnapshot(client, { domain, id, accountId, opportunityId, request: snapshot, stored, logo })
      const accepted = await acceptDemoActions(insideOf(client), {
        accountId,
        entries: [
          {
            opportunityId,
            requestId: `v1-demo:${id}`,
            // No label: the build names the site from the business (`suggestedLabel`); a display name is no address.
            selection: chosen.selection,
            // The same demo Tracy's own Build demo button makes: the seller's AI builds it in the site's chat, from
            // the imported business frozen as its research (`acceptDemoActions`).
            workflow: AGENT_DEMO,
            chatMode: CLIENT_DEMO,
            demoRequest: request
          }
        ],
        requireSelection: true,
        templates: cards,
        pins: pinsOf(ops),
        // No daily cap here: the cap is live sites (24/10/2026); counted apart from the Build demo button.
        limit: 0,
        usageKind: 'external',
        now: () => at
      })
      if (accepted.status !== 202) {
        await client.query('rollback')
        return refusal(accepted.status, accepted.body.code, accepted.body.next)
      }
      const { settings } = await readPublicDemoSettings(client)
      await client.query(
        `insert into wo_public_demo (id, account_id, idempotency_key, fingerprint, request, opportunity_id, action_id,
           sponsored, reserved_cents, photos, created_at)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11)`,
        [
          id,
          accountId,
          key,
          fingerprint,
          JSON.stringify(request),
          opportunityId,
          accepted.body.actions[0].id,
          sponsored,
          sponsored ? settings.sponsoredDemoMaxCents : 0,
          JSON.stringify({ stored: stored.length, skipped: fetched.skipped }),
          new Date(at)
        ]
      )
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      // Two first sends of one key racing past the lock-free check: the loser answers the winner's receipt.
      if (error?.code === '23505') {
        const raced = await replay(pool, accountId, key, fingerprint)
        if (raced) return raced
      }
      throw error
    } finally {
      client.release()
    }
    await prepareChat(accountId, await rowOf(pool, accountId, id))
    return {
      status: 202,
      body: { demo: shape(await rowOf(pool, accountId, id)), demos: await demosOf(pool, accountId) }
    }
  }

  /** The request as the account's opportunity: its own rows only (`brief-research.js` `fromOpportunity`). */
  async function importSnapshot(db, { domain, id, accountId, opportunityId, request, stored, logo }) {
    const b = request.business
    const candidate = {
      name: b.name,
      ...(b.address ? { address: b.address } : {}),
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.website ? { website: b.website } : {}),
      ...(b.category ? { category: b.category } : {}),
      ...(b.category ? { trade: domain.tradeOfCategory(b.category) ?? 'other' } : {}),
      ...(b.location ? { lat: b.location.lat, lon: b.location.lon } : {}),
      ...(b.socials ? { socials: b.socials } : {}),
      source: PUBLIC_DEMO_PROVIDER
    }
    await db.query(
      `insert into wo_opportunity (id, account_id, name, provider, provider_id, candidate)
       values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [opportunityId, accountId, b.name, PUBLIC_DEMO_PROVIDER, id, JSON.stringify(candidate)]
    )
    // The sender's posts, collected like a source's (`content-pool.mjs` reads them); never menu items.
    const posts = (request.posts ?? []).map((p, i) => ({
      id: `${id}:post:${i}`,
      caption: p.text,
      ...(p.url ? { url: p.url } : {}),
      ...(p.publishedAt ? { postedAt: p.publishedAt } : {}),
      ...(p.source ? { platform: p.source } : {}),
      photos: p.photos ?? []
    }))
    await db.query(
      `insert into wo_source (opportunity_id, source, ref, status, coverage, collected)
       values ($1, $2, null, 'complete', $3::jsonb, $4::jsonb)`,
      [
        opportunityId,
        SOURCE,
        JSON.stringify({ fetched: stored.length }),
        JSON.stringify(posts.length ? { posts: posts.map(({ photos: _photos, ...post }) => post) } : {})
      ]
    )
    const mediaIdOf = new Map()
    const keep = async (photo, sent, postId) => {
      const row = await insertMedia(db, {
        accountId,
        opportunityId,
        sha256: photo.sha256,
        objectKey: photo.objectKey,
        status: 'stored',
        mime: photo.mime,
        bytes: photo.bytes.length,
        width: photo.info.width,
        height: photo.info.height,
        kind: 'image',
        category: 'other',
        palette: photo.info.palette ?? null,
        source: SOURCE,
        sourceUrl: sent.url,
        postId,
        caption: sent.caption ?? null,
        alt: sent.alt ?? null,
        dhash: photo.info.dhash ?? null,
        labels: photo.info.features ? { features: photo.info.features } : null
      })
      // The same bytes sent at two addresses are one row.
      const mediaId =
        row?.id ??
        (
          await db.query('select id from wo_media where opportunity_id = $1 and sha256 = $2', [
            opportunityId,
            photo.sha256
          ])
        ).rows[0]?.id
      mediaIdOf.set(sent.url, mediaId)
      return mediaId
    }
    for (const photo of stored) {
      const sent = request.photos[photo.index]
      // A photo keeps its post only when exactly one post names it.
      const of = posts.filter((p) => p.photos.includes(sent.url))
      await keep(photo, sent, of.length === 1 ? of[0].id : null)
    }
    const logoId = logo ? await keep(logo, { url: request.brand.logo }, null) : null

    // A dish's photo as its sender named it: a candidate, dropped when it did not download or names another dish's too.
    const photoOf = (item) => (item.photo ? mediaIdOf.get(item.photo) : undefined)
    const uses = new Map()
    for (const item of b.items ?? []) {
      const mediaId = photoOf(item)
      if (mediaId) uses.set(mediaId, (uses.get(mediaId) ?? 0) + 1)
    }
    // Menu items cite where they were sent from; none is `verified`.
    const itemSource = { kind: 'page', url: b.website ?? `${apiOrigin}/v1/demos/${id}` }
    const links = request.links ?? {}
    const profile = {
      name: b.name,
      ...(b.address ? { address: b.address } : {}),
      ...(b.phone ? { phone: b.phone } : {}),
      ...(b.email ? { email: b.email } : {}),
      ...(b.website ? { website: b.website } : {}),
      ...(b.hours ? { hours: b.hours } : {}),
      ...(b.socials ? { socials: b.socials } : {}),
      ...(b.description ? { bio: b.description } : {}),
      ...(links.menu ? { menus: [{ url: links.menu, source: SOURCE }] } : {}),
      // A booking link the sender gives is not one Tracy checked: listed, never the booking button.
      ...(links.booking ? { booking: [{ url: links.booking, verified: false, source: SOURCE }] } : {}),
      ...(b.items?.length
        ? {
            menuItems: b.items.map((item) => {
              const mediaId = photoOf(item)
              return {
                name: item.name,
                price: item.price ?? null,
                currency: item.currency ?? null,
                section: item.section ?? null,
                ...(item.size ? { size: item.size } : {}),
                ...(item.priceScale && item.price ? { priceScale: item.priceScale } : {}),
                ...(mediaId && uses.get(mediaId) === 1
                  ? {
                      photo: {
                        mediaId,
                        status: 'candidate',
                        how: 'sender',
                        evidence: { sourceUrl: item.photo },
                        matcher: SENDER_MATCHER
                      }
                    }
                  : {}),
                source: itemSource,
                verified: false
              }
            })
          }
        : {})
    }
    await saveProfile(db, opportunityId, { profile, brand: senderBrand(request.brand, logoId, logo, now) })
  }

  /** The agent demo's site and chat, made at once so the answer names where to continue; a miss is tried on the next read. */
  async function prepareChat(accountId, row) {
    if (
      !row ||
      row.site_key ||
      row.action_status !== 'queued' ||
      row.action_selection?.chatMode !== CLIENT_DEMO
    )
      return
    if (!deps.clientDemo) return
    await deps.clientDemo.prepare({ accountId, actionId: row.action_id }).catch((error) => {
      // Its logo research still running is the expected wait, not a miss (logo-research.js).
      if (error?.code !== LOGO_RESEARCH_PENDING)
        console.warn(`[wo] /v1/demos ${row.id}: chat not prepared yet (${error?.code ?? error})`)
    })
  }

  async function view(accountId, id) {
    const found = await rowOf(pool, accountId, id)
    if (found && !found.site_key) await prepareChat(accountId, found)
    const row = found && !found.site_key ? await rowOf(pool, accountId, id) : found
    return row ? { demo: shape(row), demos: await demosOf(pool, accountId) } : null
  }

  /** Newest first; `cursor` is the last row's `[createdAt, id]`. */
  async function list(accountId, { limit, after }) {
    const { rows } = await pool.query(
      `${DEMO_ROW} where d.account_id = $1
         and ($2::timestamptz is null or (d.created_at, d.id) < ($2::timestamptz, $3::uuid))
       order by d.created_at desc, d.id desc limit $4`,
      [accountId, after?.[0] ?? null, after?.[1] ?? null, limit + 1]
    )
    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      data: page.map(shape),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(JSON.stringify([new Date(last.created_at).toISOString(), last.id])).toString(
              'base64url'
            )
          : null,
      demos: await demosOf(pool, accountId)
    }
  }

  async function options(accountId) {
    const [cards, ops] = await Promise.all([deps.templateCards(), deps.woSettings()])
    const choices = templateChoices(cards, ops)
    return {
      cms: 'error' in choices ? [] : Object.entries(choices).map(([cms, c]) => ({ cms, ...c })),
      ...('error' in choices ? { unavailable: choices.error } : {}),
      defaultCms: ops.defaultCms ?? null,
      accepts: [...DEMO_ACCEPTS],
      demos: await demosOf(pool, accountId)
    }
  }

  /**
   * Stop a demo not finished yet. A demo whose build had begun keeps its slot and what it spent; one stopped
   * before frees both. Cancelling twice answers the cancelled demo.
   */
  async function cancel(accountId, id) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`wo-demo:${accountId}`])
      const row = await rowOf(client, accountId, id)
      if (!row) {
        await client.query('rollback')
        return null
      }
      if (!row.cancelled_at) {
        if (FAILED.includes(row.action_status) || COMPLETED.includes(row.action_status)) {
          await client.query('rollback')
          return refusal(409, 'DEMO_FINISHED', 'This demo has finished: delete its site in Tracy instead.', {
            demo: shape(row)
          })
        }
        // The runner holds the row only while it is queued (`demoLeasePool`): moving it out stops the runner's writes.
        await client.query(
          `update wo_demo_action set status = 'failed', error = 'DEMO_CANCELLED', lease_until = null,
             lease_token = lease_token + 1, updated_at = $3 where id = $1 and account_id = $2`,
          [row.action_id, accountId, new Date(now())]
        )
        await client.query(
          'update wo_public_demo set cancelled_at = $3, cancelled_without_site = $4 where id = $1 and account_id = $2',
          [id, accountId, new Date(now()), !row.build_id]
        )
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return { status: 200, body: await view(accountId, id) }
  }

  return { submit, view, list, options, cancel }
}

/**
 * The brand a sender gave, in the shape research keeps (`place-executor.js` brand step): its colours as an observation,
 * never an official brand, and its logo as the chosen one, recognised by nobody but the sender.
 */
function senderBrand(sent, logoId, logo, now) {
  const colors = (sent?.colors ?? []).map((c) => ({ hex: c.hex, role: c.role ?? 'unspecified' }))
  if (!colors.length && !logoId) return null
  return {
    website: null,
    social: colors.length
      ? { origin: 'social', official: false, colors, fonts: [], evidence: [{ kind: 'sender' }] }
      : null,
    ...(logoId
      ? {
          logo: logoId,
          logoResearch: {
            version: SENDER_MATCHER,
            at: new Date(now()).toISOString(),
            status: 'found',
            chosen: {
              mediaId: logoId,
              url: sent.logo,
              via: 'sender',
              source: SOURCE,
              width: logo.info.width,
              height: logo.info.height,
              hasAlpha: null,
              recognised: 'sender',
              showsName: null,
              readsAs: null
            },
            candidates: []
          }
        }
      : {})
  }
}

/** The fingerprint of a whole request body: the same JSON in any key order or spacing is the same request. */
export function fingerprintOf(body) {
  return createHash('sha256').update(canonicalJson(body)).digest('hex')
}
