// The three site actions the brand stage's EmDash writer asks (`brand-writes.js`, orders `via: 'emdash-setting'`), done
// against an EmDash site's own REST API. Whoever holds the site's agent token mounts this behind the Apply door: tracy-web
// itself holds only a read-only token (ADR 0020), so it never calls this directly. `api(method, route, body)` answers the
// `data` of a successful call and throws on any other (the `makeApi` of the theme's `tools/personalize.mjs`).
//
//   media.upload      {path, content_b64}        -> {ok, id, url, path}   one picture into the media library, by its hash
//   emdash.settings   {operation: 'set', fields} -> {ok}                  `POST /_emdash/api/settings`, `fields` is
//                     {logo?: {mediaId, alt?}, favicon?: {mediaId, alt?}} (the shape of the MCP tool `settings_update`)
//   emdash.settings   {operation: 'read'}        -> {ok, fields}          `GET /_emdash/api/settings`
//   emdash.entryField {operation: 'set', collection, slug, field, label, media}
//                                                -> {ok, locales}         the image field of a template's singleton entry
//                     (the dark logo of the chrome entry): the field is made when the schema has none, then every PUBLISHED
//                     language of the entry gets the picture and is published again; a language that is a draft is left
//                     as it is, so a hidden language stays hidden
//   emdash.entryField {operation: 'read', collection, slug, field} -> {ok, mediaId, locales}
// The request shapes are the ones the theme's own personalize tool sends (`writeBrand`) and the MCP tools take
// (`settings_update`, `schema_create_field`, `content_update` in vendor/emdash/emdash/packages/core/src/mcp/server.ts).
import { createHash } from 'node:crypto'
import path from 'node:path'

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
const refuse = (error, message) => ({ ok: false, error, message })

/**
 * @param {{ api: (method: string, route: string, body?: unknown) => Promise<any>, siteUrl: string, token: string,
 *   fetchImpl?: typeof fetch }} input
 * @returns {(action: string, params: Record<string, any>) => Promise<Record<string, any>>}
 */
export function emdashBrandDoor({ api, siteUrl, token, fetchImpl = fetch }) {
  async function upload(params) {
    const filename = path.posix.basename(String(params.path ?? ''))
    const type = TYPES[filename.split('.').pop()?.toLowerCase() ?? '']
    if (!type) return refuse('BAD_PICTURE', 'a .png, .jpg or .webp file name')
    const bytes = Buffer.from(String(params.content_b64 ?? ''), 'base64')
    if (!bytes.length) return refuse('BAD_PICTURE', 'no picture bytes')
    const hash = `sha1:${createHash('sha1').update(bytes).digest('hex')}`
    const ask = await api('POST', '/_emdash/api/media/upload-url', {
      filename,
      contentType: type,
      size: bytes.length,
      contentHash: hash,
      deduplicate: true,
      ensureUniqueFilename: true
    })
    if (!ask.existing) {
      // EmDash answers either its own relative route or a signed URL on the storage's origin (`upload-url.ts`:
      // `signedUrl?.url ?? /_emdash/api/media/<id>/upload`). The site's token goes to the site's own origin only: a
      // signed URL carries its own authority, and a foreign origin must never see the bearer.
      const target = new URL(ask.uploadUrl, siteUrl)
      const own = target.origin === new URL(siteUrl).origin
      const headers = new Headers(ask.headers ?? {})
      if (own) {
        headers.set('authorization', `Bearer ${token}`)
        headers.set('X-EmDash-Request', '1')
      } else {
        headers.delete('authorization')
        headers.delete('x-emdash-request')
      }
      headers.set('content-type', type)
      const put = await fetchImpl(target, {
        method: ask.method ?? 'PUT',
        headers,
        body: bytes,
        redirect: 'error'
      })
      if (!put.ok) return refuse('UPLOAD_FAILED', `HTTP ${put.status}`)
      await api('POST', `/_emdash/api/media/${ask.mediaId}/confirm`, {
        contentHash: hash,
        size: bytes.length
      })
    }
    const item = await api('GET', `/_emdash/api/media/${ask.mediaId}`)
    const media = item.item ?? item
    const url = media.url ?? (media.storageKey ? `/_emdash/api/media/file/${media.storageKey}` : null)
    return { ok: true, id: ask.mediaId, url, path: url, deduplicated: Boolean(ask.existing) }
  }

  /** The value an image field holds, as the importer and the theme's personalize tool write it. */
  async function imageValue(mediaId) {
    const item = await api('GET', `/_emdash/api/media/${mediaId}`)
    const media = item.item ?? item
    const url = media.url ?? (media.storageKey ? `/_emdash/api/media/file/${media.storageKey}` : null)
    return {
      id: mediaId,
      src: url,
      alt: '',
      ...(media.width ? { width: media.width, height: media.height } : {}),
      filename: media.filename,
      mimeType: media.mimeType,
      ...(media.storageKey ? { provider: 'local', meta: { storageKey: media.storageKey } } : {})
    }
  }

  const entries = async (collection, slug) =>
    ((await api('GET', `/_emdash/api/content/${encodeURIComponent(collection)}`))?.items ?? []).filter(
      (e) => e.slug === slug
    )

  async function entryField(params) {
    const { collection, slug, field } = params
    if (![collection, slug, field].every((v) => typeof v === 'string' && /^[a-z][a-z0-9_-]*$/.test(v)))
      return refuse('BAD_PARAMS', 'collection, slug and field are plain names')
    const found = await entries(collection, slug)
    if (params.operation === 'read') {
      // Only the published languages count (a draft is never written here), and every one of them must hold the same
      // picture: `mediaId` is that picture, or null when they differ or none is published.
      const live = found.filter((e) => e.status === 'published')
      const ids = live.map((e) => e.data?.[field]?.id ?? null)
      const same = ids.length > 0 && ids.every((id) => id && id === ids[0])
      return {
        ok: true,
        mediaId: same ? ids[0] : null,
        locales: Object.fromEntries(live.map((e, i) => [e.locale, ids[i]]))
      }
    }
    if (typeof params.media !== 'string' || !params.media)
      return refuse('BAD_PARAMS', 'media is the id of a picture')
    const fields = await api(
      'GET',
      `/_emdash/api/schema/collections/${encodeURIComponent(collection)}/fields`
    )
    if (!(fields?.items ?? []).some((f) => f.slug === field))
      await api('POST', `/_emdash/api/schema/collections/${encodeURIComponent(collection)}/fields`, {
        slug: field,
        label: params.label ?? 'Logo for dark backgrounds',
        type: 'image',
        required: false,
        validation: null
      })
    const value = await imageValue(params.media)
    const written = []
    for (const entry of found.filter((e) => e.status === 'published')) {
      const live = await api(
        'GET',
        `/_emdash/api/content/${collection}/${encodeURIComponent(slug)}?locale=${entry.locale}`
      )
      const item = live.item ?? live
      const data = item.liveData ?? item.data ?? {}
      await api('PUT', `/_emdash/api/content/${collection}/${item.id}?locale=${entry.locale}`, {
        data: { ...data, [field]: value },
        _rev: live._rev
      })
      await api('POST', `/_emdash/api/content/${collection}/${item.id}/publish?locale=${entry.locale}`, {})
      written.push(entry.locale)
    }
    return written.length
      ? { ok: true, locales: written }
      : refuse('NO_PUBLISHED_ENTRY', `no published ${collection}/${slug} to write`)
  }

  return async function ask(action, params = {}) {
    try {
      if (action === 'media.upload') return await upload(params)
      if (action === 'emdash.settings') {
        if (params.operation === 'read')
          return { ok: true, fields: await api('GET', '/_emdash/api/settings') }
        const fields = params.fields ?? {}
        const bad = Object.keys(fields).filter((k) => !['logo', 'favicon'].includes(k))
        if (bad.length)
          return refuse('unsupported', `only logo and favicon are written here, not ${bad.join(', ')}`)
        await api('POST', '/_emdash/api/settings', fields)
        return { ok: true }
      }
      if (action === 'emdash.entryField') return await entryField(params)
      return refuse('unsupported', `no ${action} on an EmDash site`)
    } catch (error) {
      return refuse('site_refused', error instanceof Error ? error.message : String(error))
    }
  }
}
