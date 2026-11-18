/**
 * The share link of a demo (migration 216): `GET /d/<token>` on Tracy's own origin sends whoever opens it to the demo's
 * address and counts the open, so a seller learns when the business owner looked at the demo they were sent. The
 * outreach draft (`website-opportunities/src/outreach.js`) and `/v1/demos` (`site.shareUrl`) hand out this link instead
 * of the bare address; the door is `opportunities-build/demo-link-route.js`. In `lib/` because three domains read it:
 * the builder, the `/v1/demos` door and `/ops/wo` (`lib/wo-ops.js`).
 *
 * 🔒 AN OPEN IS COUNTED WITHOUT ANYTHING THAT NAMES THE VISITOR: the time, the path asked after the token and the
 * device class (`phone` or `desktop`, read from the User-Agent and thrown away). No address, no cookie set or read
 * back, no User-Agent, no referrer is stored. Not counted at all: a HEAD, a prefetch, a link preview or any other
 * program (`automatedOpen`), the seller's own signed-in session, and opens past `DEMO_OPENS_PER_HOUR` for one link.
 * A count is therefore a floor, never a guess: an owner who opens the demo in an app this cannot tell from a preview
 * bot is not counted.
 *
 * 🔒 THE TOKEN OPENS THE DEMO AND ITS PREVIEWS, NOTHING MORE: 192 random bits, kept as it is so every outreach draft
 * shows the same link. Whoever holds it learns the demo's address, which is public anyway, and may see the demo in
 * another design system and say which look they like (`opportunities-build/demo-link-route.js`): previews that write
 * nothing to the demo, and a pick row (`recordSystemPick`). It opens no other Tracy door. One live link per build;
 * revoking it (`revokeDemoLinks`) makes the next outreach read mint a new one, and the old token answers 404.
 *
 * 🔒 A PICK IS COUNTED LIKE AN OPEN: the look, the number the page showed it under, the system's name, the time and
 * the device class. Not counted: a program, the seller's own signed-in session, and picks past
 * `DEMO_SYSTEM_PICKS_PER_HOUR` for one link.
 */
import { randomBytes, randomUUID } from 'node:crypto'

export const DEMO_LINK_TOKEN = /^[A-Za-z0-9_-]{32}$/
/** Counted opens of one link in one hour; past it the link still sends people on, uncounted. */
export const DEMO_OPENS_PER_HOUR = 60
/** Counted picks of one link in one hour; past it a pick is answered, uncounted. */
export const DEMO_SYSTEM_PICKS_PER_HOUR = 30
/** Reads of one link's other looks in one hour (each may run one read in the demo's container); past it 429. */
export const DEMO_SYSTEMS_READS_PER_HOUR = 120
/** The look a pick names when the owner likes the demo as it was built, wearing no preview. */
export const CURRENT_LOOK = 'current'
/** What a pick may name: the demo as built, or an offered library system (`lib/ds-slot.js` `REFERO_ID`). */
export const PICKED_LOOK = /^(?:current|refero:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
/** Picks a seller reads per build, newest first; `total` still counts every one. */
export const SYSTEM_PICKS_LISTED = 20
const PATH_MAX = 200

/** 24 random bytes as 32 base64url characters. */
export const newDemoLinkToken = () => randomBytes(24).toString('base64url')

/** The address a share link is handed out at, on Tracy's own origin. */
export function demoLinkUrl(origin, token) {
  return `${String(origin ?? '').replace(/\/+$/, '')}/d/${token}`
}

/**
 * The live link token of each build, made when the build has none. Only builds of `accountId` get one; a build of
 * another account is left out of the answer. Two callers racing make one link (`wo_demo_link_live`).
 * @param {{ query: Function }} db
 * @returns {Promise<Map<string, string>>} build id → token
 */
export async function ensureDemoLinks(db, accountId, buildIds, now = Date.now()) {
  const ids = [...new Set((buildIds ?? []).filter(Boolean))]
  if (!accountId || !ids.length) return new Map()
  const live = await liveTokens(db, accountId, ids)
  for (const buildId of ids.filter((id) => !live.has(id)))
    await db.query(
      `insert into wo_demo_link (id, account_id, build_id, token, created_at)
       select $1, b.account_id, b.id, $4, $5 from wo_build b
        where b.id = $3 and b.account_id = $2
       on conflict do nothing`,
      [randomUUID(), accountId, buildId, newDemoLinkToken(), new Date(now)]
    )
  return live.size === ids.length ? live : liveTokens(db, accountId, ids)
}

async function liveTokens(db, accountId, ids) {
  const { rows } = await db.query(
    `select build_id, token from wo_demo_link
      where account_id = $1 and build_id = any($2::uuid[]) and revoked_at is null`,
    [accountId, ids]
  )
  return new Map(rows.map((r) => [r.build_id, r.token]))
}

/** Stop every live link of these builds of `accountId`; answers how many stopped. */
export async function revokeDemoLinks(db, accountId, buildIds, now = Date.now()) {
  if (!accountId || !buildIds?.length) return 0
  const { rowCount } = await db.query(
    `update wo_demo_link set revoked_at = $3
      where account_id = $1 and build_id = any($2::uuid[]) and revoked_at is null`,
    [accountId, buildIds, new Date(now)]
  )
  return rowCount
}

/**
 * The opens of one build's links as one jsonb (null when the build never had a link: nothing was measured), for a
 * query that names the build row `alias`. Read by `opensShape`.
 */
export const opensJsonSql = (alias) => `(select jsonb_build_object('total', count(dop.id),
    'phone', count(dop.id) filter (where dop.device = 'phone'),
    'desktop', count(dop.id) filter (where dop.device = 'desktop'),
    'lastOpenedAt', max(dop.opened_at), 'firstOpenedAt', min(dop.opened_at))
  from wo_demo_link dl left join wo_demo_open dop on dop.link_id = dl.id
  where dl.build_id = ${alias}.id having count(dl.id) > 0)`

/** The live share token of the build row `alias`, or null. */
export const liveTokenSql = (alias) =>
  `(select dl.token from wo_demo_link dl where dl.build_id = ${alias}.id and dl.revoked_at is null)`

const iso = (value) => {
  const at = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(at) ? new Date(at).toISOString() : null
}

/** `{total, phone, desktop, lastOpenedAt, firstOpenedAt}` of `opensJsonSql`, or null when no link was ever made. */
export function opensShape(raw) {
  if (!raw || typeof raw !== 'object') return null
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return {
    total: n(raw.total),
    phone: n(raw.phone),
    desktop: n(raw.desktop),
    lastOpenedAt: iso(raw.lastOpenedAt),
    firstOpenedAt: iso(raw.firstOpenedAt)
  }
}

/** The opens of each build, by build id; a build that never had a link is absent. */
export async function opensOf(db, buildIds) {
  const ids = [...new Set((buildIds ?? []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { rows } = await db.query(
    `select b.id, ${opensJsonSql('b')} as opens from wo_build b where b.id = any($1::uuid[])`,
    [ids]
  )
  return new Map(rows.filter((r) => r.opens).map((r) => [r.id, opensShape(r.opens)]))
}

/**
 * The device class of an open: `phone` for a handheld (phone or tablet, or a browser that says it is mobile),
 * `desktop` for anything else. Read from the request and never stored.
 * @param {Headers | { get: (name: string) => string | null | undefined }} headers
 */
export function deviceClassOf(headers) {
  if (headers.get('sec-ch-ua-mobile') === '?1') return 'phone'
  const ua = headers.get('user-agent') ?? ''
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|BlackBerry|Kindle|Silk/i.test(ua)
    ? 'phone'
    : 'desktop'
}

/** A program's User-Agent: crawlers, link previews of chat apps and mail scanners, HTTP libraries, headless browsers. */
const PROGRAM =
  /bot\b|crawl|spider|slurp|facebookexternalhit|facebot|embedly|preview|headless|phantomjs|lighthouse|pingdom|uptime|monitor|scanner|validator|inspectiontool|ia_archiver|safelinks|proofpoint|mimecast|barracuda|python|curl|wget|httpclient|okhttp|go-http|java\/|node-fetch|undici|axios|postman/i

/**
 * Whether a request to a share link is not a person opening it: any method but GET, a prefetch or prerender, a
 * User-Agent that is not a browser's (every current browser and in-app browser starts with `Mozilla/`), or one that
 * names a program. (`Cubot` is a phone maker, not a bot.)
 */
export function automatedOpen(method, headers) {
  if (method !== 'GET') return true
  const purpose = ['sec-purpose', 'purpose', 'x-purpose', 'x-moz'].map((h) => headers.get(h) ?? '').join(' ')
  if (/prefetch|prerender|preview/i.test(purpose)) return true
  return programAgent(headers)
}

/**
 * Whether a request's User-Agent is a program's, not a browser's: what `automatedOpen` reads after the method and the
 * purpose, and all a pick (a POST, never prefetched) is judged by.
 * @param {Headers | { get: (name: string) => string | null | undefined }} headers
 */
export function programAgent(headers) {
  const ua = (headers.get('user-agent') ?? '').replace(/cubot/gi, '')
  if (!ua.startsWith('Mozilla/')) return true
  return PROGRAM.test(ua)
}

/**
 * The path a share link was asked for after its token (`/d/<token>/menu` → `/menu`), as it will be stored and sent on:
 * `/` when there is none, or when it is longer than 200 characters, holds characters a path does not, or names a dot
 * segment. Repeated slashes become one.
 */
export function askedPath(rest) {
  if (!rest || rest === '/') return '/'
  if (rest.length > PATH_MAX || !/^\/[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/.test(rest)) return '/'
  const path = rest.replace(/\/{2,}/g, '/')
  if (path.split('/').some((s) => /^(\.|%2e){1,2}$/i.test(s))) return '/'
  return path
}

/**
 * Where an open of `asked` goes: the demo's address with the asked path under its own path, and the query sent along.
 * Built on the address's own URL, so no path can leave its host. Null for an address that is not http(s).
 */
export function demoTarget(address, asked, search = '') {
  let target
  try {
    target = new URL(address)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(target.protocol)) return null
  if (asked !== '/') target.pathname = `${target.pathname.replace(/\/+$/, '')}${asked}`
  if (search) target.search = search
  target.hash = ''
  return target.href
}

/**
 * Count one open of link `linkId`: the open row, and the link's first open when it is the first.
 * @param {{ query: Function }} db
 */
export async function recordOpen(db, { linkId, path, device, at }) {
  await db.query(
    `with o as (insert into wo_demo_open (id, link_id, opened_at, path, device)
                values ($1, $2, $3, $4, $5) returning link_id)
     update wo_demo_link set first_opened_at = coalesce(first_opened_at, $3)
      where id = (select link_id from o)`,
    [randomUUID(), linkId, new Date(at), path, device]
  )
}

/**
 * Count one pick of link `linkId`: the owner pressed "I like this look" on `systemId` (`current`, or the library id of
 * the system previewed), shown as look `n` (null for `current`), named `name` in the library at that moment.
 * @param {{ query: Function }} db
 * @param {{ linkId: string, systemId: string, n: number | null, name: string | null, device: 'phone' | 'desktop',
 *   at: number }} pick
 */
export async function recordSystemPick(db, { linkId, systemId, n, name, device, at }) {
  await db.query(
    `insert into wo_demo_system_pick (id, link_id, picked_at, system_id, n, name, device)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      randomUUID(),
      linkId,
      new Date(at),
      systemId,
      systemId === CURRENT_LOOK ? null : n,
      systemId === CURRENT_LOOK ? null : (name ?? null),
      device
    ]
  )
}

/**
 * The picks of one build's links as one jsonb (null when the build never had a link: nothing was asked), for a query
 * that names the build row `alias`: every pick counted, the newest `SYSTEM_PICKS_LISTED` listed. Read by
 * `systemPicksShape`.
 */
export const systemPicksJsonSql = (alias) => `(select jsonb_build_object('total', count(dsp.id),
    'recent', coalesce((select jsonb_agg(r order by r.at desc) from (
        select q.system_id as id, q.n, q.name, q.device, q.picked_at as at
          from wo_demo_system_pick q join wo_demo_link ql on ql.id = q.link_id
         where ql.build_id = ${alias}.id order by q.picked_at desc limit ${SYSTEM_PICKS_LISTED}) r), '[]'::jsonb))
  from wo_demo_link dsl left join wo_demo_system_pick dsp on dsp.link_id = dsl.id
  where dsl.build_id = ${alias}.id having count(dsl.id) > 0)`

/**
 * `{total, latest, recent}` of `systemPicksJsonSql`, or null when no link was ever made. Each pick is
 * `{id, n, name, device, pickedAt}`: `id` `current` (the demo as built; `n` and `name` null) or the library id of the
 * system the owner liked; `latest` is the newest, null before the first.
 */
export function systemPicksShape(raw) {
  if (!raw || typeof raw !== 'object') return null
  const recent = (Array.isArray(raw.recent) ? raw.recent : [])
    .filter((p) => p && typeof p.id === 'string')
    .map((p) => ({
      id: p.id,
      n: Number.isInteger(p.n) ? p.n : null,
      name: typeof p.name === 'string' ? p.name : null,
      device: p.device === 'phone' ? 'phone' : 'desktop',
      pickedAt: iso(p.at)
    }))
  return {
    total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : 0,
    latest: recent[0] ?? null,
    recent
  }
}

/** The picks of each build, by build id; a build that never had a link is absent. */
export async function systemPicksOf(db, buildIds) {
  const ids = [...new Set((buildIds ?? []).filter(Boolean))]
  if (!ids.length) return new Map()
  const { rows } = await db.query(
    `select b.id, ${systemPicksJsonSql('b')} as picks from wo_build b where b.id = any($1::uuid[])`,
    [ids]
  )
  return new Map(rows.filter((r) => r.picks).map((r) => [r.id, systemPicksShape(r.picks)]))
}
