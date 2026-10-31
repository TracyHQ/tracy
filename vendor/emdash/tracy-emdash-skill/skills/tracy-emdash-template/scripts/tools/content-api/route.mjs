import { hasPermission } from '@emdash-cms/auth'
import { getRequestContext, runWithContext } from 'emdash/request-context'
import options from 'virtual:tracy-content-map'
import {
  ContentError,
  queryOf,
  envelope,
  hasher,
  sourceRows as freshRows,
  cachedRows,
  changeKey,
  CHANGES_TABLE
} from './reader.mjs'
import { CommandError, requestAuthority } from './command.mjs'
export const prerender = false
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }
const error = (status, code, field, extras = {}) =>
  Response.json(
    {
      error: {
        code,
        message: 'Content request could not be completed.',
        ...(field ? { field } : {}),
        ...extras
      }
    },
    { status, headers }
  )
// Source rows per caller rights, kept while the database is unchanged (reader.mjs, cachedRows).
const kept = new Map()
const coverage = { schema: null, watched: false }
// The identity tool's change counter, the schema cookie and sqlite_master, read in `trx`.
const changeSource = (trx) => ({
  counter: () => trx.selectFrom(CHANGES_TABLE).select(['nonce', 'n']).where('id', '=', 1).executeTakeFirst(),
  schema: async () =>
    (await trx.selectFrom('pragma_schema_version').select('schema_version').executeTakeFirst())
      ?.schema_version,
  master: () => trx.selectFrom('sqlite_master').select(['type', 'name', 'tbl_name', 'sql']).execute()
})
async function read(context, authority = { contentPrincipal: null, contentScope: 'published' }) {
  context.cache?.set(false)
  const { locals } = context
  // This route lives on a native URL, so EmDash's own middleware has already authenticated the
  // token and enforced its scope. Authorization mirrors the native content routes: content:read to
  // read at all, content:read_drafts to see anything but published entries.
  if (!locals.user || !Array.isArray(locals.tokenScopes)) return error(401, 'CONTENT_UNAUTHENTICATED')
  if (!hasPermission(locals.user, 'content:read')) return error(403, 'CONTENT_FORBIDDEN')
  const drafts = hasPermission(locals.user, 'content:read_drafts')
  const key = process.env.EMDASH_ENCRYPTION_KEY
  if (!key || key.length < 32 || !locals.emdash?.db?.transaction)
    return error(501, 'CONTENT_ADAPTER_UNSUPPORTED')
  const start = performance.now()
  let calls = 0
  try {
    const query = queryOf(context.url, options.locales)
    // SQLite-only initial implementation. No transaction fallback; do not promise the same
    // isolation on D1 or default read-committed Postgres.
    if (locals.emdash.config.database?.type !== 'sqlite') return error(501, 'CONTENT_ADAPTER_UNSUPPORTED')
    return await locals.emdash.db.transaction().execute((trx) =>
      // The public handlers read through the request context's db, so every read below sees this
      // transaction's snapshot.
      runWithContext({ ...getRequestContext(), db: trx }, async () => {
        const state = await trx
          .selectFrom('_tracy_content_identity')
          .select(['seed', 'version', 'epoch'])
          .where('id', '=', 1)
          .executeTakeFirst()
        if (!state || state.version !== 1) throw new ContentError(501, 'CONTENT_ADAPTER_UNSUPPORTED')
        const registered = await trx
          .selectFrom('_tracy_identity_fields')
          .select(['collection', 'field'])
          .execute()
        const readOptions = {
          ...options,
          identifiedFields: registered.map((f) => `${f.collection}.${f.field}`)
        }
        const list = async (collection, cursor) => {
          const r = await locals.emdash.handleContentList(collection, {
            limit: 100,
            ...(cursor ? { cursor } : {}),
            ...(drafts ? {} : { status: 'published' })
          })
          calls++
          if (!r.success)
            throw new ContentError(
              r.error?.code === 'FORBIDDEN' ? 403 : 503,
              r.error?.code === 'FORBIDDEN' ? 'CONTENT_FORBIDDEN' : 'CONTENT_SOURCE_UNAVAILABLE'
            )
          return r.data
        }
        // The rows this transaction would read, taken from `kept` when they were read in the same
        // database state; the key is read first, in this transaction's snapshot.
        const change = await changeKey(changeSource(trx), coverage)
        let hit = false
        const sourceRows = async (args) => {
          const answer = await cachedRows(kept, `${drafts}:${args.published}`, change, () => freshRows(args))
          hit = answer.hit
          return answer.rows
        }
        const get = async (collection, id) => {
          const r = await locals.emdash.handleContentGet(collection, id, undefined, { includeDrafts: drafts })
          calls++
          if (!r.success) throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
          const item = r.data.item
          if (drafts) return r.data
          // Without read_drafts the native route answers 404 for an unpublished entry and serves
          // the published values, not the draft overlay handleContentGet puts on item.data.
          if (item.status !== 'published') throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
          const published = { ...item }
          if (item.liveData && typeof item.liveData === 'object') published.data = item.liveData
          delete published.liveData
          delete published.draftRevisionId
          return { ...r.data, item: published }
        }
        // Inspect current native schema, not the seed map: an administrator may add references.
        // This reads metadata only; content and draft hydration still use the public handlers.
        const schemas = await trx.selectFrom('_emdash_collections').select(['id', 'slug']).execute()
        const references = await trx
          .selectFrom('_emdash_fields')
          .select('collection_id')
          .where('type', '=', 'reference')
          .execute()
        const withReferences = new Set(references.map((field) => field.collection_id))
        const referenceFree = new Set(
          schemas.filter((schema) => !withReferences.has(schema.id)).map((schema) => schema.slug)
        )
        const rows = await sourceRows({
          referenceFree,
          collections: Object.keys(options.mapping.collections),
          list,
          get,
          published: authority.contentScope === 'published'
        })
        const auth = context.request.headers.get('authorization') ?? ''
        const identity = {
          ...authority,
          user: locals.user.id,
          role: locals.user.role,
          scopes: locals.tokenScopes,
          token: hasher(key)('token', auth)
        }
        const origin = process.env.EMDASH_SITE_URL || context.url.origin
        const body = envelope(
          rows,
          query,
          readOptions,
          identity,
          hasher(key)('cursor-key', state.seed, state.epoch),
          origin,
          state.seed
        )
        // Serialize while the transaction is still open; no async I/O after its last read.
        const response = new Response(JSON.stringify(body), { headers })
        response.headers.set('X-Tracy-Source-Calls', String(calls))
        response.headers.set('X-Tracy-Source-Cache', hit ? 'hit' : 'miss')
        response.headers.set(
          'Server-Timing',
          `content;dur=${(performance.now() - start).toFixed(2)}, source;desc="${calls} native calls"`
        )
        return response
      })
    )
  } catch (e) {
    if (e instanceof Error && /no such table: _tracy_/.test(e.message))
      return error(501, 'CONTENT_ADAPTER_UNSUPPORTED')
    if (e instanceof ContentError) return error(e.status, e.code, e.field, e.extras)
    return error(503, 'CONTENT_SOURCE_UNAVAILABLE')
  }
}
// One door: GET. Native auth demands content:write for any POST under this prefix, so the
// canonical POST /content.json reaches here as the alias middleware's internal GET rewrite, with
// the relay's authority in two headers that count only for the relay PAT (command.mjs).
export function GET(context) {
  let authority
  try {
    authority = requestAuthority(context.request.headers, process.env)
  } catch (e) {
    if (e instanceof CommandError) return error(e.status, e.code)
    return error(400, 'CONTENT_BAD_QUERY')
  }
  return read(context, authority)
}
export const ALL = () => error(405, 'CONTENT_BAD_QUERY')
