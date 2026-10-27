/**
 * THE `/v1` TABLE — one row per public REST route, the ONE source for the routes `api/route.js`
 * registers and the paths `api-reference/spec.js` documents (`tasks/todo-api-public.md` S3/S4).
 *
 * Every `/v1` route is a thin alias of one Apply action: the route builds the action's `params`
 * from its path, query, body and a few headers, then calls the same `applyDoor` the cookie and actor
 * doors call. Nothing here reads a database or a header itself — a row only says HOW to map, so the
 * reference can describe the mapping without running it and a test can call `params()` on a plain
 * object. Lives in `lib/` because two domains read it and a domain may not import another
 * (`test/module-graph.test.mjs`).
 *
 * Shape of one row:
 *   method, path   as Hono registers them (`/v1/sites/:key/contents/:id`)
 *   kind           'door' (an Apply action) · 'me' (the key itself) · 'applies' (the audit listing)
 *   action         the Apply action a `door` row calls, else null
 *   writes         whether the call changes the site (mirrors `APPLY_ACTION_DOCS[action].writes`)
 *   etag           what the ETag of a 200 is: 'snapshot' (`snapshot.revision` of a content envelope),
 *                  'version' (the relay's `version` of a pages/changes document), 'record' (the whole
 *                  editable record, `recordRevision`), or null; a read row with one takes `If-None-Match` → 304
 *   query          { name: description } — the query parameters the route reads (for the reference)
 *   headers        header names the route reads, beyond Authorization (for the reference)
 *   body           null, or how the request body is documented: { fields: [...names of the action's
 *                  params the body may carry], required: [...], extra: { name: schema } }
 *   params(input)  → { params } or { refusal: { code, message } } (a 400 before the door is called).
 *                  `input` = { path, query, body, headers, keyId, now } — headers lower-cased. A
 *                  write may also answer `precondition: { revision, read }`: the router reads the
 *                  record with `read` first and holds the write to that revision (records `If-Match`).
 *   summary, description   words for the reference
 */

import { createHash } from 'node:crypto'

/** `^[a-zA-Z0-9._:-]{1,100}$` — the plugin's own `request_id` shape (`actions.js` REQUEST_ID). */
const REQUEST_ID_SHAPE = /^[a-zA-Z0-9._:-]{1,100}$/
const APPLY_ID_SHAPE = /^[^\s]{1,200}$/
const INTEGER = /^\d{1,12}$/

const bad = (message) => ({ refusal: { code: 'INVALID_REQUEST', message } })

/**
 * The query keys named, strings kept, integers made numbers (the door validates ranges). An empty value is
 * no value; for the names in `blankless` so is one of only whitespace (a filter that says nothing).
 */
function pick(query, names, integers = [], blankless = []) {
  const out = {}
  for (const name of names) {
    const value = query[name]
    if (value === undefined || value === '') continue
    if (blankless.includes(name) && typeof value === 'string' && value.trim() === '') continue
    out[name] = integers.includes(name) && INTEGER.test(value) ? Number(value) : value
  }
  return out
}

/** `include_body=true|1` as a boolean. */
const flag = (value) => (value === undefined ? undefined : value === 'true' || value === '1')

/**
 * `If-Match` for `contract/apply`: one or more entity tags, each `"<contentId>:<revision>"` (weak
 * `W/` accepted), read into `expected_content_revisions` `{ contentId: revision }`. A content's
 * revision is the `revision` field `content.read` lists for it — NOT the envelope's
 * `snapshot.revision`, which names the whole read; that is why the tag carries the content id.
 */
export function parseIfMatch(header) {
  const tags = header.split(',').map((tag) => tag.trim())
  const out = {}
  for (const raw of tags) {
    const m = /^(?:W\/)?"([^"]+)"$/.exec(raw) ?? /^(?:W\/)?([^"\s]+)$/.exec(raw)
    if (!m) return null
    const sep = m[1].indexOf(':')
    if (sep <= 0 || sep === m[1].length - 1) return null
    out[m[1].slice(0, sep)] = m[1].slice(sep + 1)
  }
  return Object.keys(out).length ? out : null
}

/** `Tracy-Apply-Id` when sent, else `api-<keyId>-<unix ms>`. */
function applyIdOf(input) {
  const named = input.headers['tracy-apply-id']
  if (named === undefined) return { apply_id: `api-${input.keyId}-${input.now}` }
  if (!APPLY_ID_SHAPE.test(named)) return bad('Tracy-Apply-Id: 1–200 characters, no spaces')
  return { apply_id: named }
}

/**
 * The preconditions a records route does not honour: `Idempotency-Key` on every one (the plugin keeps
 * no request_id for records), and `If-Match` on a delete (the plugin checks no revision there). A
 * records `PATCH` honours `If-Match` (`recordIfMatch`).
 * @param {{ headers: Record<string, string> }} input
 * @param {{ ifMatch: boolean }} [allow]
 */
function refuseRecordHeaders(input, { ifMatch = false } = {}) {
  if (!ifMatch && input.headers['if-match'] !== undefined)
    return {
      refusal: {
        code: 'IF_MATCH_NOT_SUPPORTED',
        message:
          'a delete has no revision check; If-Match is honoured on PATCH of a record and on POST …/contract/apply'
      }
    }
  if (input.headers['idempotency-key'] !== undefined)
    return {
      refusal: {
        code: 'IDEMPOTENCY_KEY_NOT_SUPPORTED',
        message: 'the plugin keeps no request_id for records; use one Tracy-Apply-Id per change instead'
      }
    }
  return null
}

/** One record revision as an entity tag: `"<sha256 hex>"`, or weak `W/"…"` (the comparison is exact either way). */
const RECORD_TAG = /^(?:W\/)?"([a-f0-9]{64})"$/
const HEX64 = /^[a-f0-9]{64}$/

/**
 * `If-Match` on a records `PATCH`: exactly one tag naming a record revision — the record's `ETag`
 * (`recordRevision`). `*`, a list, or any other form is refused by name: a write held to "some
 * revision" is held to nothing.
 * @param {string | undefined} header
 * @returns {{ revision: string } | { refusal: { code: string, message: string } } | null}
 */
export function recordIfMatch(header) {
  if (header === undefined) return null
  const m = RECORD_TAG.exec(header.trim())
  if (!m)
    return bad(
      'If-Match: one entity tag, the record’s ETag — "<revision>" (64 lowercase hex) or W/"<revision>"; no list, no *'
    )
  return { revision: m[1] }
}

/**
 * Fields a WordPress record answers that no write of it sets: a visitor's comment moves `comment_count`,
 * and `filter` / `ancestors` are how the read was made. Left out of the revision, so the tag moves on an
 * edit and only on an edit.
 */
const DERIVED_RECORD_FIELDS = new Set(['comment_count', 'filter', 'ancestors'])

/** A value as the revision hashes it: keys sorted, text NFC with LF line ends, numbers as text. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    )
  if (typeof value === 'string') return value.normalize('NFC').replace(/\r\n?/g, '\n')
  if (typeof value === 'number') return String(value)
  return value
}

/**
 * 🔒 THE ETAG OF A RECORD IS THE WHOLE EDITABLE RECORD (sweep #2, council 11/10/2026). Until 11/10 it was
 * the body's `body_revision` alone, so a stale `If-Match` still matched after a title changed and a second
 * `PATCH` overwrote it without a word (04/10 dev E2E J13.2). Now: sha256 of the record's every field —
 * title, content, excerpt, status, slug, meta, whatever `PATCH` can write — normalised (`canonical`), less
 * the fields no write sets (`DERIVED_RECORD_FIELDS`).
 *
 * Only for a record whose site answers a `body_revision` (WordPress `post`, `templatePart`, `template`,
 * plugin 0.17.0+): that is the site that checks the body again inside its write lock
 * (`expected_body_revision`). Anything else has no ETag, and `If-Match` on it is refused, never checked
 * by Tracy alone.
 * @param {any} answer a `content.get` answer
 * @returns {string | null} 64 hex, or null
 */
export function recordRevision(answer) {
  const item = answer?.item
  if (typeof answer?.body_revision !== 'string' || !HEX64.test(answer.body_revision)) return null
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const editable = Object.fromEntries(Object.entries(item).filter(([k]) => !DERIVED_RECORD_FIELDS.has(k)))
  const record = { kind: answer.kind ?? null, id: answer.id ?? null, key: answer.key ?? null, item: editable }
  return createHash('sha256')
    .update(JSON.stringify(canonical(record)), 'utf8')
    .digest('hex')
}

function recordId(input) {
  if (!INTEGER.test(input.path.id)) return bad('id: a non-negative integer (a WordPress key goes in ?key=)')
  return { id: Number(input.path.id) }
}

const KEY_PATH =
  'The site key, as My Sites shows it (`shop.example.com`); a public name of the site is accepted too.'
const RECORD_KIND = 'Record kind (`article`, `post`, `option`, `menuItem`, …; see `content.list`).'
/**
 * `?search=` of the records list (30/09/2026): the door's `content.list` `search` (`actions.js`), by the
 * words of its reference. A blank value (empty, or only whitespace) is dropped HERE, before the door: a
 * plugin that reads `search` takes it for no filter, but one that predates the release ignores whatever it
 * is sent, and the relay would refuse that as an answer to a filter nobody asked for. A plugin that
 * predates the release and is sent a real text is refused `501 LIST_SEARCH_UNSUPPORTED` by the relay, so
 * the caller never gets a whole list that looks filtered. A kind with no title is refused by the plugin
 * as `bad_params`, which `/v1` says as `400 BAD_PARAMS` (`v1RefusalCode`: the plugin's word, upper-cased).
 */
const LIST_SEARCH_QUERY =
  'Keep the records whose title holds this text (Joomla: title or alias; WordPress: title or slug, in every language), ignoring case; at most 200 characters, a single piece of text, not split into words; a blank value filters nothing. Read by Joomla plugin 0.20.0 and WordPress plugin 0.16.0 and later; an older plugin is refused (501 `LIST_SEARCH_UNSUPPORTED`). The answer carries `search` and `matched` (every match, whatever `offset` and `limit` are). Kinds with no title (Joomla `user`, `redirect`, `extensionParams`, `languageFilter`, the association kinds, `fieldValue`; WordPress `templatePart`, `template`) are refused `400 BAD_PARAMS`.'
const RECORD_ID_PATH = 'Numeric record id; `0` with `?key=` for a WordPress record addressed by key.'

/** @type {ReadonlyArray<object>} */
export const V1_ROUTES = Object.freeze([
  {
    method: 'GET',
    path: '/v1/me',
    kind: 'me',
    action: null,
    writes: false,
    etag: null,
    query: {},
    headers: [],
    body: null,
    params: () => ({ params: {} }),
    summary: 'Read who this key is',
    description:
      'Answers the identity behind the Bearer key: `email` (the person who minted it), `keyId`, the one `siteKey` it names and its `scopes`. Nothing is asked of the site. A first call to make after minting a key. An account token (`tra_…`, from the device flow) answers `{email, displayName}` only, and is refused 403 `ACCOUNT_TOKEN_NOT_ALLOWED` on every `/v1/sites` route.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key',
    kind: 'door',
    action: 'content.read',
    writes: false,
    etag: null,
    query: {},
    headers: [],
    body: null,
    params: () => ({ params: { describe: true } }),
    summary: 'Describe the site',
    description:
      'What the site holds and what this key may change there — locales, content types, block kinds, capabilities and `permissions` (the seat’s toolsets ∩ the key’s scopes). `content.read { describe: true }`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/pages',
    kind: 'door',
    action: 'content.read',
    writes: false,
    etag: 'version',
    query: {
      locale: 'Only pages in this language (BCP 47 tag the site lists).',
      url: 'Only the page(s) this link shows.'
    },
    headers: ['If-None-Match'],
    body: null,
    params: ({ query }) => ({ params: { view: 'pages', ...pick(query, ['locale', 'url']) } }),
    summary: 'List every page with an address',
    description:
      'Every page with a URL, walked over the site’s listing: `id`, `title`, `url`, `path`, `locale`, `status` and the CMS records behind it (`native`). The answer’s `version` is its ETag; send it back as `If-None-Match` to get `304` when nothing moved, or as `since` on `/changes`. `content.read { view: "pages" }`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/contents',
    kind: 'door',
    action: 'content.read',
    writes: false,
    etag: 'snapshot',
    query: {
      type: 'Only contents of this type: `page`, `article`, `service`, `project`, `shared`, `generic`.',
      locale: 'Only contents in this language.',
      limit: 'Contents per page (1–100).',
      cursor: '`pagination.nextCursor` of the previous page, with the same filters.',
      fields: 'Only these keys of each content (`title,url`); ids are always kept.',
      maxBytes: 'Size budget of the answer in bytes; a listing is cut at whole contents.'
    },
    headers: ['If-None-Match'],
    body: null,
    params: ({ query }) => ({
      params: pick(query, ['type', 'locale', 'limit', 'cursor', 'fields', 'maxBytes'], ['limit', 'maxBytes'])
    }),
    summary: 'List contents',
    description:
      'One page of the site’s published contents as a Content API envelope (`contents[]` with fields, blocks and per-content `revision`). ETag = `snapshot.revision`. `content.read` with the query as filters.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/contents/:id',
    kind: 'door',
    action: 'content.read',
    writes: false,
    etag: 'snapshot',
    query: {
      fields: 'Only these keys of the content.',
      blockId: 'One block of the content.',
      blocksCursor: 'The next page of the content’s blocks.',
      itemsCursor: 'The next page of one block’s repeated items.',
      maxBytes: 'Size budget of the answer in bytes.'
    },
    headers: ['If-None-Match'],
    body: null,
    params: ({ path, query }) => ({
      params: {
        id: path.id,
        ...pick(query, ['fields', 'blockId', 'blocksCursor', 'itemsCursor', 'maxBytes'], ['maxBytes'])
      }
    }),
    summary: 'Read one content',
    description:
      'One content in full — its fields, blocks and `native` records — by the id a listing or the pages view returned. Its `revision` (in `contents[0].revision`) is what `If-Match` on `POST …/contract/apply` checks. `content.read { id }`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/changes',
    kind: 'door',
    action: 'content.read',
    writes: false,
    etag: 'version',
    query: {
      since: 'Required: the `version` a `/pages` answer (or an earlier `/changes` answer) carried.',
      locale: 'Only changes in this language.'
    },
    headers: ['If-None-Match'],
    body: null,
    params: ({ query }) =>
      typeof query.since === 'string' && query.since !== ''
        ? { params: { changedSince: query.since, ...pick(query, ['locale']) } }
        : bad('since: the version an earlier /pages or /changes answer carried is required'),
    summary: 'List what changed since a version',
    description:
      'The pages added, changed or removed since `since`, and the new `version` to ask from next time. The versions are held in the server’s memory for 30 minutes and at most 500 reads; an expired one answers `409 CONTENT_SNAPSHOT_EXPIRED` — read `/pages` again. Not a durable log. `content.read { changedSince }`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/design',
    kind: 'design',
    action: null,
    writes: false,
    etag: 'design',
    query: {},
    headers: ['If-None-Match'],
    body: null,
    params: () => ({ params: {} }),
    summary: 'Read the design system the site wears',
    description:
      'The design system the site is dressed in: its catalogue `id` and `name`, where it comes from (`source`: `catalog`, `brand`, `quickstart`, `template` or `none`), the CMS (`platform`), and the `tokens` it wears — CSS custom property names and their values, frozen when the site was built and rewritten when its look is switched. Use the tokens to keep new content inside the site’s palette and fonts. `{"design": null}` is an answer, not an error: the site wears no system Tracy knows of. Reads Tracy’s own record, not the site; needs the `content` scope. The ETag follows `updatedAt`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/records/:kind',
    kind: 'door',
    action: 'content.list',
    writes: false,
    etag: null,
    query: {
      offset: 'Skip this many records (default 0).',
      limit: 'Records per page (at most 200, or 25 with `include_body`).',
      include_body: '`true` for full rows instead of summaries.',
      post_type: 'WordPress only: narrow posts to one post type.',
      name: 'WordPress only: find the post with this slug.',
      search: LIST_SEARCH_QUERY,
      category:
        'WordPress, kind `pattern` only: keep the patterns filed under this category slug (`banner`, …), matched exactly. WordPress plugin 0.17.0 and later; a blank value filters nothing.'
    },
    headers: [],
    body: null,
    params: ({ path, query }) => ({
      params: {
        kind: path.kind,
        ...pick(
          query,
          ['offset', 'limit', 'post_type', 'name', 'search', 'category'],
          ['offset', 'limit'],
          ['search', 'category']
        ),
        ...(query.include_body !== undefined ? { include_body: flag(query.include_body) } : {})
      }
    }),
    summary: 'List records of one kind',
    description:
      'The CMS’s own records of `kind`, one page at a time (`{kind, offset, items}`). This is the raw record surface: no revision, no ETag. On WordPress, kind `pattern` lists the block patterns the theme and plugins register (`{name, title, categories, description, chars}`, sorted by name, `limit` 1 to 200, default 50, `truncated: true` on a page cut at 64 KB) — WordPress plugin 0.17.0 and later; an older plugin answers its refusal (`400 BAD_PARAMS`). `content.list`.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/records/:kind/:id',
    kind: 'door',
    action: 'content.get',
    writes: false,
    etag: 'record',
    query: {
      key: 'WordPress only: the record key where a kind has no numeric id (an option name, a template part slug).'
    },
    headers: ['If-None-Match'],
    body: null,
    params: (input) => {
      const id = recordId(input)
      if (id.refusal) return id
      return { params: { kind: input.path.kind, ...id, ...pick(input.query, ['key']) } }
    },
    summary: 'Read one record',
    description:
      'The full row of one record exactly as the site holds it. A WordPress `post`, `templatePart` or `template` also answers `body_revision` (WordPress plugin 0.17.0 and later) and an `ETag`: the revision of the whole editable record — every field it holds (title, content, excerpt, status, slug, meta…), normalised, not the body alone. Send it back as `If-None-Match` to get `304` while nothing in the record changed, or as `If-Match` on `PATCH` to write only over this record. `content.get`.'
  },
  {
    method: 'PATCH',
    path: '/v1/sites/:key/records/:kind/:id',
    kind: 'door',
    action: 'content.update',
    writes: true,
    etag: null,
    query: {},
    headers: ['If-Match', 'Tracy-Apply-Id'],
    body: { fields: ['fields', 'key'], required: ['fields'], extra: {} },
    params: (input) => {
      const refused = refuseRecordHeaders(input, { ifMatch: true })
      if (refused) return refused
      const ifMatch = recordIfMatch(input.headers['if-match'])
      if (ifMatch?.refusal) return ifMatch
      const id = recordId(input)
      if (id.refusal) return id
      const body = input.body
      if (!body || typeof body !== 'object' || Array.isArray(body))
        return bad('body: a JSON object `{ fields, key? }`')
      if (!body.fields || typeof body.fields !== 'object' || Array.isArray(body.fields))
        return bad('fields: an object of the columns to write is required')
      const applyId = applyIdOf(input)
      if (applyId.refusal) return applyId
      const record = {
        kind: input.path.kind,
        ...id,
        ...(body.key !== undefined ? { key: body.key } : {})
      }
      return {
        params: { ...record, fields: body.fields, ...applyId },
        ...(ifMatch ? { precondition: { revision: ifMatch.revision, read: record } } : {})
      }
    },
    summary: 'Write the fields of one record',
    description:
      'Writes `fields` of the record (`id: 0` creates one where the kind allows) and records how to undo it under an apply id: the `Tracy-Apply-Id` header, or one Tracy makes (`api-<keyId>-<ms>`). `If-Match` (the record’s `ETag` from a read; one tag, weak `W/` accepted) writes only over that record — WordPress `post`, `templatePart` or `template`, plugin 0.17.0 and later: Tracy reads the record first and answers `412 REVISION_STALE` with the current `ETag` when ANY field of it changed (title, content, excerpt, status…), else writes with `expected_body_revision`, which the plugin checks again inside its lock (a body write that landed in between is `412 REVISION_STALE` too). A site that answers no `body_revision` — Joomla, a kind without a body, or a WordPress plugin older than 0.17.0, which would ignore the condition and write — is refused `400 IF_MATCH_NOT_SUPPORTED` and nothing is written. A success carries the new `body_revision` in its body and no `ETag`: read the record for its new one. Not a guard against a non-body field saved in the WordPress editor in the same instant. `content.update`.'
  },
  {
    method: 'DELETE',
    path: '/v1/sites/:key/records/:kind/:id',
    kind: 'door',
    action: 'content.delete',
    writes: true,
    etag: null,
    query: { key: 'WordPress only: the record key where a kind has no numeric id.' },
    headers: ['Tracy-Apply-Id'],
    body: null,
    params: (input) => {
      const refused = refuseRecordHeaders(input)
      if (refused) return refused
      const id = recordId(input)
      if (id.refusal) return id
      const named = input.headers['tracy-apply-id']
      if (named === undefined)
        return {
          refusal: {
            code: 'APPLY_ID_REQUIRED',
            message:
              'DELETE needs a Tracy-Apply-Id header: the receipt `POST …/applies/{id}/revert` brings the record back under'
          }
        }
      const applyId = applyIdOf(input)
      if (applyId.refusal) return applyId
      return { params: { kind: input.path.kind, ...id, ...pick(input.query, ['key']), ...applyId } }
    },
    summary: 'Move one record to the trash',
    description:
      'Trashes the record (never purges) under the apply id `Tracy-Apply-Id` names — required here, so that every delete has a receipt to revert. `content.delete`.'
  },
  {
    method: 'POST',
    path: '/v1/sites/:key/contract/:operation',
    kind: 'door',
    action: 'content.contract',
    writes: true,
    etag: null,
    query: {},
    headers: ['If-Match', 'Idempotency-Key', 'Tracy-Apply-Id'],
    body: { fields: null, required: [], extra: {} },
    params: (input) => {
      const body = input.body ?? {}
      if (typeof body !== 'object' || Array.isArray(body))
        return bad('body: a JSON object of the operation’s params')
      const operation = input.path.operation
      if ('operation' in body && body.operation !== operation)
        return bad(`operation: the body says "${body.operation}" but the path says "${operation}"`)
      const params = { ...body, operation }
      const ifMatch = input.headers['if-match']
      if (ifMatch !== undefined) {
        if (operation !== 'apply')
          return {
            refusal: {
              code: 'IF_MATCH_NOT_SUPPORTED',
              message: 'If-Match is honoured on the `apply` operation only'
            }
          }
        const revisions = parseIfMatch(ifMatch)
        if (!revisions) return bad('If-Match: one or more tags "<contentId>:<revision>"')
        params.expected_content_revisions = revisions
      }
      const requestId = input.headers['idempotency-key']
      if (requestId !== undefined) {
        if (!REQUEST_ID_SHAPE.test(requestId))
          return bad('Idempotency-Key: 1–100 characters of [a-zA-Z0-9._:-]')
        params.request_id = requestId
      }
      const named = input.headers['tracy-apply-id']
      if (named !== undefined && params.apply_id === undefined) {
        if (!APPLY_ID_SHAPE.test(named)) return bad('Tracy-Apply-Id: 1–200 characters, no spaces')
        params.apply_id = named
      }
      return { params }
    },
    summary: 'Inspect or change the site through its content contract',
    description:
      'The body is the operation’s params (`content.contract`), the path names the operation (`inspect`, `apply`, `bind`, `multilingual.plan`, …). On `apply`, `If-Match` carries the content revisions the change is based on — tags `"<contentId>:<revision>"` — and becomes `expected_content_revisions`; a moved content answers `409` with `errors[].code = REVISION_STALE`. `Idempotency-Key` is the plugin’s `request_id`: a retry with the same value answers the stored result.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/applies',
    kind: 'applies',
    action: null,
    writes: false,
    etag: null,
    query: { since: 'Optional ISO time; only calls after it.' },
    headers: [],
    body: null,
    params: ({ query }) => {
      if (query.since === undefined || query.since === '') return { params: { since: null } }
      const since = new Date(query.since)
      return Number.isNaN(since.getTime()) ? bad('since: an ISO 8601 time') : { params: { since } }
    },
    summary: 'List what this key applied',
    description:
      'The Apply calls made with this key (its lease identity `key:<id>` is the session they are recorded under): `applies[]` with `at`, `action`, `ok`, `applyId`, and `applyIds` — the successful changes in the order first applied, which is what to revert, newest first. Reads Tracy’s audit, not the site.'
  },
  {
    method: 'GET',
    path: '/v1/sites/:key/applies/:id',
    kind: 'door',
    action: 'apply.list',
    writes: false,
    etag: null,
    query: {},
    headers: [],
    body: null,
    params: ({ path }) => ({ params: { apply_id: path.id } }),
    summary: 'List what one apply changed',
    description:
      'The steps recorded under one apply id — kind, id or media path, created or not. `apply.list`.'
  },
  {
    method: 'POST',
    path: '/v1/sites/:key/applies/:id/revert',
    kind: 'door',
    action: 'apply.revert',
    writes: true,
    etag: null,
    query: {},
    headers: [],
    body: null,
    params: ({ path }) => ({ params: { apply_id: path.id } }),
    summary: 'Undo everything recorded under one apply',
    description:
      'Puts back, newest first, every change recorded under the apply id and answers `{reverted}` plus any step that failed. `apply.revert`.'
  }
])

/**
 * The Q9 table: a plugin refusal (`{ ok: false, error }`, relayed inside a 200 by the Apply door)
 * gets ONE HTTP status here, by its `error` word. `unauthorized` never reaches this layer (the door
 * answers `409 COMPONENT_UNAUTHORIZED` itself) and is listed for the reader. Rows are matched in
 * order; a `REVISION_STALE` entry in `errors[]` is a conflict whatever the outer word says.
 *
 * @type {ReadonlyArray<{ errors: string[], status: number, note: string }>}
 */
export const V1_REFUSAL_STATUS = Object.freeze([
  { errors: ['bad_params', 'bad_action'], status: 400, note: 'the request cannot be taken as sent' },
  { errors: ['refused'], status: 403, note: 'the plugin refuses this change by rule' },
  { errors: ['not_found'], status: 404, note: 'the record, table or file does not exist' },
  { errors: ['unauthorized'], status: 409, note: 'answered by Tracy as `COMPONENT_UNAUTHORIZED`' },
  {
    errors: ['conflict', 'locked', 'writer_busy', 'revision_stale'],
    status: 409,
    note: 'the site is not in the state the call assumed'
  },
  { errors: ['too_large'], status: 413, note: 'more than the plugin carries inline' },
  { errors: ['contract_*'], status: 422, note: 'the contract refused the change; `errors[]` says per slot' },
  { errors: ['unsupported', 'unavailable'], status: 501, note: 'this site or plugin cannot do it' },
  // 500, not 502: the API host answers through Cloudflare, which replaces a 502's body with its own
  // page ("error code: 502", then an HTML page — measured on api.tracy.site 29/09/2026), so a caller
  // lost the plugin's own words (`no writable field … allowed post_title, …`). A 500 reaches the
  // caller as sent.
  {
    errors: ['*_failed', 'fatal'],
    status: 500,
    note: 'the site failed while doing it; read it before retrying'
  }
])

/** @param {Record<string, unknown>} body a plugin answer with `ok: false` */
export function v1RefusalStatus(body) {
  const word = typeof body.error === 'string' ? body.error : ''
  if (Array.isArray(body.errors) && body.errors.some((e) => e?.code === 'REVISION_STALE')) return 409
  for (const row of V1_REFUSAL_STATUS)
    for (const pattern of row.errors) {
      if (pattern === word) return row.status
      if (pattern.endsWith('*') && word.startsWith(pattern.slice(0, -1))) return row.status
      if (pattern.startsWith('*') && word.endsWith(pattern.slice(1))) return row.status
    }
  return 400
}

/** `not_found` → `NOT_FOUND`; a plugin's own `code` field (e.g. `SLOT_LOCKED_BY_USER`) wins. */
export function v1RefusalCode(body) {
  if (typeof body.code === 'string' && body.code !== '') return body.code
  return String(body.error ?? 'REFUSED')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

/**
 * What `/v1` answers where the door says `502`/`504` (the site did not answer): Cloudflare, in front
 * of the API host, replaces a 502 or 504 body with its own page, so the caller would never read the
 * door's code. Named once here: the router applies it and the reference documents it.
 */
export const V1_GATEWAY_STATUS = 503

/** The ETag value of a 200 for a row (its `etag`), or null. */
export function v1EtagOf(row, body) {
  // A WordPress record (plugin 0.17.0+): a hash of the whole editable record, so a strong tag.
  if (row.etag === 'record') {
    const revision = recordRevision(body)
    return revision ? `"${revision}"` : null
  }
  if (row.etag === 'snapshot') {
    const revision = body?.snapshot?.revision
    return typeof revision === 'string' && revision !== '' ? `W/"${revision}"` : null
  }
  if (row.etag === 'design') {
    const at = body?.design?.updatedAt
    return `W/"design:${typeof at === 'string' && at !== '' ? at : 'none'}"`
  }
  if (row.etag === 'version')
    return typeof body?.version === 'string' && body.version !== '' ? `W/"${body.version}"` : null
  return null
}

/** Weak comparison: `If-None-Match: W/"a", "b"` matches ETag `W/"a"` or `"a"`; `*` matches any. */
export function etagMatches(ifNoneMatch, etag) {
  if (typeof ifNoneMatch !== 'string' || !etag) return false
  const strip = (tag) => tag.trim().replace(/^W\//, '')
  const mine = strip(etag)
  return ifNoneMatch.split(',').some((tag) => tag.trim() === '*' || strip(tag) === mine)
}
