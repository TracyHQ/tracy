/**
 * `/v1` — THE PUBLIC REST LAYER (`tasks/todo-api-public.md` S3, Q7, Q9).
 *
 * Fourteen resource routes (`lib/v1-routes.js`, the one table), each a thin alias of ONE Apply
 * action, answered on the api host to a Bearer seat key and nobody else. This module owns exactly
 * three things and nothing the Apply door already owns:
 *
 *   1. WHO. `resolvePrincipal(c, siteKey)` is the door's own key resolver (`requireKeyGrant` in
 *      `sites/route.js`, handed in by `app.js`): Bearer → live key → names THIS site → the minter
 *      still holds a seat. The api host gate in `app.js` has already dropped any cookie, so a
 *      request without a Bearer is nobody (`401 NOT_SIGNED_IN`), never a fall-through.
 *   2. WHICH SITE. `canonicalSiteKey` FIRST — a public name (alias) in the path names the same site
 *      as its canonical key, the way `/api/sites/:key` already resolves (review #6: the old alias
 *      route skipped this).
 *   3. THE ANSWER'S SHAPE. `content.read` bodies are unchanged; every other 200 is what the site
 *      answered. An `ETag` (`snapshot.revision`, `version`, or a WordPress record's whole-record revision)
 *      and, on a read, `If-None-Match` → `304`; `If-Match` on a records `PATCH` (`holdToRecord`). And the
 *      ONE normalisation of refusals (Q9): the door relays a plugin's `{ ok: false, error }` as a 200
 *      so agents and plugins never change; HERE it becomes the HTTP status of `V1_REFUSAL_STATUS`
 *      and `{ error: { code, message }, errors, next, …rest }`. A refusal the door itself made
 *      (`{ code }`, 4xx/5xx) keeps its status and becomes `{ error: { code }, …rest }`; the sentence it
 *      may carry (`SITE_BUSY`, `LIST_SEARCH_UNSUPPORTED`) is the `message` of that envelope.
 *
 * 🔒 NO SECOND IMPLEMENTATION OF THE DOOR. Toolset gate ∩ scopes, the key's hourly caps, the write
 * lease keyed `key:<id>`, the audit row — all happen inside `door()`. This file never touches
 * `x-tracy-session`/`x-tracy-actor` (a key caller's are ignored by the door) and never calls the site.
 *
 * Imports only `lib/` (module graph); the door, the resolver and the audit listing arrive from the
 * composition root.
 */
import { Hono } from 'hono'
import { parseAccountToken } from '../lib/account-token.js'
import { json, normalizeSiteKey } from '../lib/http.js'
import {
  V1_GATEWAY_STATUS,
  V1_ROUTES,
  etagMatches,
  recordRevision,
  v1EtagOf,
  v1RefusalCode,
  v1RefusalStatus
} from '../lib/v1-routes.js'

export const API_VERSION = 'v1'

/**
 * The api host's `/v1` on top of `applyDoor` — see the module comment.
 * @param {{ pool: import('pg').Pool, door: Function, resolvePrincipal: Function, requireAccountToken?: Function | null,
 *   canonicalSiteKey: (pool: any, name: string) => Promise<string>, listApplies: Function,
 *   readDesign: (siteKey: string) => Promise<{ design: unknown }>,
 *   isApiHost: (c: import('hono').Context) => boolean, now?: () => number }} deps
 */
export function apiRoutes({
  pool,
  door,
  resolvePrincipal,
  requireAccountToken = null,
  canonicalSiteKey,
  listApplies,
  readDesign,
  isApiHost,
  now = Date.now
}) {
  const app = new Hono()

  /**
   * `REVISION_STALE` on a records `PATCH` with `If-Match`, in ONE wording and ONE status (`412`, RFC 9110
   * §13.1.1) whichever side found it: Tracy's read, or the plugin's own check inside its lock (a write
   * that landed in between). The plugin's sentence is written for an agent ("content.get … body_revision");
   * a `/v1` caller reads the record and its ETag.
   */
  const STALE_RECORD =
    'The record changed since the revision If-Match names, so nothing was written. Read the record again, make the change on what it holds now, and send its ETag.'

  /** A refusal made by this layer: `{ error: { code, message } }`. */
  const refuse = (c, refusal, status = 400) => json(c, { error: refusal }, status)

  /**
   * A door answer as `/v1` speaks it. `content.read` documents (`schemaVersion`) and plain 200s
   * pass through; the rest is normalised once, here.
   * @returns {{ status: number, body: Record<string, unknown> }}
   */
  function shape(answered) {
    const body = answered.body ?? {}
    // The door answers `502` when the site did not answer (`COMPONENT_UNREACHABLE`,
    // `COMPONENT_BAD_RESPONSE`). Behind Cloudflare a 502 or 504 reaches the caller as Cloudflare's own
    // page, never this JSON (measured 29/09/2026), so `/v1` says `503` — "the site is not answering
    // now" — with the same body.
    if (answered.status === 502 || answered.status === 504)
      return shape({ ...answered, status: V1_GATEWAY_STATUS })
    if (answered.status >= 400) {
      // The door's own refusal `{ code, … }`; a content refusal is already `{ error: { code } }`.
      //
      // 🔒 A DOOR REFUSAL'S `error` TEXT IS ITS MESSAGE. Two door refusals carry one — `{ code, error:
      // "<sentence>" }`: `SITE_BUSY` (since 18/09/2026, so on `/v1` since it opened) and
      // `LIST_SEARCH_UNSUPPORTED` (30/09/2026). Spread after `error: { code }` the sentence REPLACED the
      // envelope: a caller got `{ error: "<sentence>" }` and lost the code the reference documents. The
      // sentence goes where `message` goes; `message` wins when both are there. An `error` that is already
      // an object (no door refusal has one today) keeps its fields, and the door's `code` stays the code.
      if (typeof body.code === 'string') {
        const { code, message, error, ...rest } = body
        const said =
          typeof message === 'string' && message !== '' ? message : typeof error === 'string' ? error : ''
        const detail = error !== null && typeof error === 'object' && !Array.isArray(error) ? error : {}
        return {
          status: answered.status,
          body: { error: { ...detail, code, ...(said ? { message: said } : {}) }, ...rest }
        }
      }
      return { status: answered.status, body }
    }
    if (body.ok === false) {
      const { ok: _ok, error, message, errors, next, code: _code, ...rest } = body
      return {
        status: v1RefusalStatus(body),
        body: {
          error: {
            code: v1RefusalCode(body),
            message: typeof message === 'string' ? message : typeof error === 'string' ? error : undefined
          },
          errors: Array.isArray(errors) ? errors : [],
          next,
          ...rest
        }
      }
    }
    return { status: answered.status, body }
  }

  /** Header names lower-cased into one plain object, for the row's `params()`. */
  const headersOf = (c) =>
    Object.fromEntries(
      ['if-match', 'if-none-match', 'idempotency-key', 'tracy-apply-id'].flatMap((name) => {
        const value = c.req.header(name)
        return value === undefined ? [] : [[name, value]]
      })
    )

  for (const row of V1_ROUTES) {
    const method = row.method.toLowerCase()
    app[method](row.path, async (c, next) => {
      // `/v1` exists on the api host alone (Q1): elsewhere the path is somebody else's, unchanged.
      if (!isApiHost(c)) return next()
      // Every `/v1` answer — a 200, a 304, a refusal — says which API version answered (S6).
      c.header('x-tracy-api-version', API_VERSION)
      c.header('cache-control', 'private, no-store')
      // 🔒 An ACCOUNT token (device flow) reads `/v1/me` and opens no site door, whatever its scope.
      if (requireAccountToken && parseAccountToken(c.req.header('authorization'))) {
        const account = await requireAccountToken(c, 'demos')
        if (account.error) return account.error
        if (row.kind === 'me') return json(c, { email: account.email, displayName: account.displayName })
        return refuse(
          c,
          { code: 'ACCOUNT_TOKEN_NOT_ALLOWED', message: 'An account token cannot read or change a site.' },
          403
        )
      }
      // WHICH site, canonically — before the key is compared with it.
      const asked = c.req.param('key')
      const siteKey = asked === undefined ? null : await canonicalSiteKey(pool, normalizeSiteKey(asked))
      // WHO — the door's resolver, Bearer only; for `/v1/me` the key's own site is the site.
      const auth = await resolvePrincipal(c, siteKey)
      if (auth.error) return shapeResponse(c, await fromResponse(auth.error))

      if (row.kind === 'me') {
        return json(c, {
          email: auth.key.email,
          keyId: auth.key.keyId,
          siteKey: auth.key.siteKey,
          scopes: auth.key.scopes
        })
      }

      const body = ['POST', 'PATCH', 'PUT'].includes(row.method)
        ? await c.req.json().catch(() => undefined)
        : undefined
      const built = row.params({
        path: c.req.param(),
        query: c.req.query(),
        body,
        headers: headersOf(c),
        keyId: auth.key.keyId,
        now: now()
      })
      if (built.refusal) return refuse(c, built.refusal)

      if (row.kind === 'applies') {
        const applies = await listApplies(pool, {
          siteKey,
          sessionId: `key:${auth.key.keyId}`,
          since: built.params.since,
          actor: auth.email
        })
        const changes = applies.filter((a) => a.ok && a.applyId && !a.action.startsWith('apply.'))
        return json(c, { applies, applyIds: [...new Set(changes.map((a) => a.applyId))] })
      }

      if (row.kind === 'design') {
        // Tracy's own record of the look (`site_design`, ADR 0023) — no Apply action, so the door's
        // toolset check does not run: the key's scopes are checked here, as the door would.
        if (!auth.key.scopes.includes('content'))
          return refuse(
            c,
            { code: 'TOOLSET_NOT_GRANTED', message: 'reading the design system needs the content scope' },
            403
          )
        const answer = await readDesign(siteKey)
        const etag = v1EtagOf(row, answer)
        c.header('etag', etag)
        if (etagMatches(c.req.header('if-none-match'), etag)) return c.body(null, 304)
        return json(c, answer)
      }

      /** @type {Record<string, unknown>} */
      let params = built.params
      // 🔒 `If-Match` ON A RECORD WRITE (02/10/2026): the write goes only over the body the caller names.
      if (built.precondition) {
        const held = await holdToRecord(auth, siteKey, built.precondition)
        if (held.answer) return held.answer(c)
        params = { ...params, expected_body_revision: held.bodyRevision }
      }
      const answered = await door({ siteKey, action: row.action, params, principal: auth })
      const shaped = shape(answered)
      for (const [name, value] of Object.entries(answered.headers ?? {})) c.header(name, value)
      // The apply id this write is recorded under — the caller's `Tracy-Apply-Id`, or the one Tracy
      // made (`api-<keyId>-<ms>`). Without it the caller of a write that sent none could not undo it:
      // measured on dev 29/09/2026, the made id reached the site's log and no answer named it.
      if (row.headers.includes('Tracy-Apply-Id') && typeof built.params.apply_id === 'string')
        c.header('tracy-apply-id', built.params.apply_id)
      if (shaped.status === 200) {
        const etag = v1EtagOf(row, shaped.body)
        if (etag) {
          c.header('etag', etag)
          // A 304 answers a read only: a write that was made is never "not modified".
          if (row.etag && etagMatches(c.req.header('if-none-match'), etag)) return c.body(null, 304)
        }
      }
      // The plugin's own `revision_stale` (a body write that landed between Tracy's read and its lock): the
      // same 412 and wording as Tracy's own, with the record's ETag as it stands now, read again.
      const error = /** @type {any} */ (shaped.body).error
      if (built.precondition && shaped.status === 409 && error?.code === 'REVISION_STALE') {
        error.message = STALE_RECORD
        const now = await currentRecord(auth, siteKey, built.precondition.read)
        if (now.revision) c.header('etag', `"${now.revision}"`)
        return json(c, shaped.body, 412)
      }
      return json(c, shaped.body, /** @type {any} */ (shaped.status))
    })
  }

  // The end of /v1 on the api host: a path no row claims is this API's 404, not the dsh catch-all
  // that every unmatched path otherwise reaches (measured on dev 29/09: a 302 to sign-in).
  const notFound = (c, next) => {
    if (!isApiHost(c)) return next()
    c.header('x-tracy-api-version', API_VERSION)
    c.header('cache-control', 'private, no-store')
    return json(c, { error: { code: 'NOT_FOUND', message: 'No such /v1 route.' } }, 404)
  }
  app.all('/v1', notFound)
  app.all('/v1/*', notFound)

  /** The record as the caller would read it now: the door's answer, shaped, and its revision. */
  async function currentRecord(principal, siteKey, read) {
    const shaped = shape(await door({ siteKey, action: 'content.get', params: read, principal }))
    return { shaped, revision: shaped.status === 200 ? recordRevision(shaped.body) : null }
  }

  /**
   * `If-Match` on a records `PATCH`: the record read through the same door, as the caller would read it,
   * and the write allowed only over the record revision the caller named (`recordRevision`: the whole
   * editable record, sweep #2).
   *
   * 🔒 NO REVISION, NO CONDITIONAL WRITE. A WordPress plugin older than 0.17.0 IGNORES
   * `expected_body_revision` and writes — so a site whose read answers no `body_revision` (that plugin,
   * Joomla, or a kind without a body) is refused `IF_MATCH_NOT_SUPPORTED` before anything is sent, never
   * written unchecked. A record that differs in any field is `412 REVISION_STALE` with the current ETag.
   * Equal, the write goes with the read's `expected_body_revision`, which the plugin compares again inside
   * its own lock: the body is held atomically at the CMS; the other fields are held by this read, made
   * just before the write (the plugin has no record-wide check yet).
   * @param {any} principal
   * @param {string | null} siteKey
   * @param {{ revision: string, read: Record<string, unknown> }} precondition
   * @returns {Promise<{ answer?: (c: import('hono').Context) => Response, bodyRevision?: string }>}
   */
  async function holdToRecord(principal, siteKey, { revision, read }) {
    const { shaped, revision: current } = await currentRecord(principal, siteKey, read)
    if (shaped.status !== 200)
      return { answer: (c) => json(c, shaped.body, /** @type {any} */ (shaped.status)) }
    if (current === null) {
      const kind = String(read.kind ?? '')
      const why = ['post', 'templatePart', 'template'].includes(kind)
        ? 'this site answered no body revision for it: Joomla, or a WordPress Claude Cowork plugin older than 0.17.0, which would ignore the condition'
        : `kind "${kind.slice(0, 40)}" has no body revision (only post, templatePart and template do, on WordPress plugin 0.17.0+)`
      return {
        answer: (c) =>
          refuse(c, {
            code: 'IF_MATCH_NOT_SUPPORTED',
            message: `If-Match cannot be checked here: ${why}. Nothing was written.`
          })
      }
    }
    if (current !== revision)
      return {
        answer: (c) => {
          c.header('etag', `"${current}"`)
          return json(c, { error: { code: 'REVISION_STALE', message: STALE_RECORD } }, 412)
        }
      }
    return { bodyRevision: /** @type {string} */ (shaped.body.body_revision) }
  }

  /** A resolver's refusal Response → `{status, body}` so `shape` can speak it. */
  async function fromResponse(response) {
    return { status: response.status, body: await response.json().catch(() => ({})) }
  }
  const shapeResponse = (c, answered) => {
    const shaped = shape(answered)
    return json(c, shaped.body, /** @type {any} */ (shaped.status))
  }

  return app
}
