// A tiny in-memory stand-in for the parts of the EmDash 0.37 admin API that tools/seed-apply.mjs
// uses, with the same observable shapes (draft overlay on GET, liveData, _rev, draftRevisionId,
// media upload-url/upload/confirm with `sha1:` content hashes and hash dedupe, forms routes,
// schema routes). It records every request so a test can assert what the importer DID, not
// only what it printed. Not a general emulator: only the behaviours the tests need.
import { createHash } from 'node:crypto'
import http from 'node:http'

export function createMockEmdash() {
  const state = {
    entries: new Map(),
    media: new Map(),
    forms: new Map(),
    schema: new Map(),
    menuItems: new Map(),
    terms: new Map(),
    faults: [],
    log: [],
    counter: 0
  }
  const id = (p = '01M') => `${p}${(++state.counter).toString(36).toUpperCase().padStart(10, '0')}`
  const revOf = (e) => Buffer.from(`${e.version}:${e.updatedAt}`).toString('base64')
  const findEntry = (coll, key, locale) =>
    [...state.entries.values()].find(
      (e) => e.collection === coll && (e.id === key || e.slug === key) && e.locale === locale
    ) ?? null
  const now = () => new Date(Date.now() + state.counter).toISOString()
  function view(e) {
    const item = {
      id: e.id,
      type: e.collection,
      slug: e.slug,
      status: e.status,
      locale: e.locale,
      version: e.version,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      publishedAt: e.publishedAt,
      liveRevisionId: e.liveRevisionId,
      draftRevisionId: e.draft ? e.draftRevisionId : null,
      data: e.draft ? { ...e.live, ...e.draft } : { ...e.live },
      liveData: { ...e.live }
    }
    return { item, _rev: revOf(e) }
  }
  /** Seed the mock as EmDash's first-run setup would: published entries from live data. */
  state.addEntry = (collection, slug, locale, live, extra = {}) => {
    const e = {
      id: id(),
      collection,
      slug,
      locale,
      status: 'published',
      version: 1,
      createdAt: now(),
      updatedAt: null,
      publishedAt: now(),
      live: { ...live },
      draft: null,
      liveRevisionId: id('REV'),
      draftRevisionId: null,
      ...extra
    }
    e.updatedAt = e.createdAt
    state.entries.set(e.id, e)
    return e
  }
  state.addMedia = (filename, bytes, extra = {}) => {
    const m = {
      id: id(),
      filename,
      size: bytes.length,
      contentHash: `sha1:${createHash('sha1').update(bytes).digest('hex')}`,
      status: 'ready',
      mimeType: 'image/png',
      url: `/_emdash/api/media/file/${filename}`,
      width: 10,
      height: 10,
      ...extra
    }
    state.media.set(m.id, m)
    return m
  }
  /** A menu item as the site holds it; `menuItems` is keyed `<menu>/<id>`. */
  state.addMenuItem = (menu, locale, label, customUrl) => {
    const item = { id: id('MNU'), menu, locale, type: 'custom', label, customUrl, sortOrder: 0 }
    state.menuItems.set(`${menu}/${item.id}`, item)
    return item
  }
  /**
   * Make the `nth` request matching `method` + `path` (a RegExp over pathname) answer `status`
   * with `code` — a 409 in the middle of a run, not before it, is what a test of the error
   * path needs. Each fault fires once.
   */
  state.fail = (method, path, nth, status = 409, code = 'CONFLICT') => {
    state.faults.push({ method, path, nth, status, code, seen: 0, fired: false })
  }
  const json = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const ok = (res, data) => json(res, 200, { success: true, data })
  const err = (res, code, c, m) => json(res, code, { success: false, error: { code: c, message: m } })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks)
    let body = {}
    try {
      body = raw.length ? JSON.parse(raw.toString()) : {}
    } catch {}
    state.log.push({
      method: req.method,
      path: url.pathname + url.search,
      body: raw.length && !url.pathname.endsWith('/upload') ? body : undefined
    })
    const p = url.pathname
    const locale = url.searchParams.get('locale') ?? 'en'
    for (const f of state.faults) {
      if (f.fired || f.method !== req.method || !f.path.test(p)) continue
      f.seen += 1
      if (f.seen === f.nth) {
        f.fired = true
        return err(res, f.status, f.code, `injected ${String(f.status)} on ${req.method} ${p}`)
      }
    }
    let m
    if ((m = p.match(/^\/_emdash\/api\/taxonomies\/([^/]+)\/terms\/([^/]+)$/)) && req.method === 'PUT') {
      const key = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}/${locale}`
      const term = { ...(state.terms.get(key) ?? { slug: decodeURIComponent(m[2]) }), ...body }
      state.terms.set(key, term)
      return ok(res, { term })
    }
    if ((m = p.match(/^\/_emdash\/api\/menus\/([^/]+)$/)) && req.method === 'GET') {
      const name = decodeURIComponent(m[1])
      const items = [...state.menuItems.values()].filter((i) => i.menu === name && i.locale === locale)
      return ok(res, { name, items })
    }
    if ((m = p.match(/^\/_emdash\/api\/menus\/([^/]+)\/items$/)) && req.method === 'POST') {
      const item = state.addMenuItem(decodeURIComponent(m[1]), locale, body.label, body.customUrl)
      return ok(res, { item })
    }
    if ((m = p.match(/^\/_emdash\/api\/content\/([^/]+)\/([^/]+)\/unpublish$/)) && req.method === 'POST') {
      const e = findEntry(m[1], m[2], locale)
      if (!e) return err(res, 404, 'NOT_FOUND', 'no entry')
      e.status = 'draft'
      e.publishedAt = null
      e.version++
      e.updatedAt = now()
      return ok(res, view(e))
    }
    if ((m = p.match(/^\/_emdash\/api\/menus\/([^/]+)\/items\/([^/]+)$/)) && req.method === 'PUT') {
      const item = state.menuItems.get(`${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`)
      if (!item) return err(res, 404, 'NOT_FOUND', 'no such item')
      Object.assign(item, body)
      return ok(res, { item })
    }
    if ((m = p.match(/^\/_emdash\/api\/menus\/([^/]+)\/items\/([^/]+)$/)) && req.method === 'DELETE') {
      const key = `${decodeURIComponent(m[1])}/${decodeURIComponent(m[2])}`
      if (!state.menuItems.has(key)) return err(res, 404, 'NOT_FOUND', 'no such item')
      state.menuItems.delete(key)
      return ok(res, { deleted: true })
    }
    if ((m = p.match(/^\/_emdash\/api\/content\/([^/]+)\/([^/]+)\/publish$/)) && req.method === 'POST') {
      const e = findEntry(m[1], m[2], locale)
      if (!e) return err(res, 404, 'NOT_FOUND', 'no entry')
      if (e.draft) {
        e.live = { ...e.live, ...e.draft }
        e.draft = null
        e.draftRevisionId = null
      }
      e.status = 'published'
      e.version++
      e.updatedAt = now()
      e.liveRevisionId = id('REV')
      e.publishedAt ??= now()
      return ok(res, view(e))
    }
    if ((m = p.match(/^\/_emdash\/api\/content\/([^/]+)\/([^/]+)$/))) {
      const e = findEntry(m[1], m[2], locale)
      if (req.method === 'GET') return e ? ok(res, view(e)) : err(res, 404, 'NOT_FOUND', 'no entry')
      if (req.method === 'PUT') {
        if (!e) return err(res, 404, 'NOT_FOUND', 'no entry')
        if (body._rev && body._rev !== revOf(e)) return err(res, 409, 'CONFLICT', 'rev mismatch')
        if (body.data) {
          e.draft = { ...e.draft, ...body.data }
          e.draftRevisionId ??= id('DRF')
        }
        e.version++
        e.updatedAt = now()
        return ok(res, view(e))
      }
    }
    if ((m = p.match(/^\/_emdash\/api\/content\/([^/]+)$/)) && req.method === 'POST') {
      const e = state.addEntry(m[1], body.slug, body.locale ?? 'en', body.data, {
        status: 'draft',
        publishedAt: null
      })
      return ok(res, view(e))
    }
    if (p === '/_emdash/api/media/upload-url' && req.method === 'POST') {
      if (body.deduplicate !== false && body.contentHash) {
        const ex = [...state.media.values()].find(
          (x) => x.contentHash === body.contentHash && x.status === 'ready'
        )
        if (ex) return ok(res, { existing: true, mediaId: ex.id, storageKey: ex.filename, url: ex.url })
      }
      const mid = id()
      state.media.set(mid, {
        id: mid,
        filename: body.filename,
        size: body.size,
        contentHash: null,
        status: 'pending',
        mimeType: body.contentType,
        url: `/_emdash/api/media/file/${mid}`
      })
      return ok(res, {
        uploadUrl: `/_emdash/api/media/${mid}/upload`,
        method: 'PUT',
        headers: {},
        mediaId: mid,
        storageKey: mid
      })
    }
    if ((m = p.match(/^\/_emdash\/api\/media\/([^/]+)\/upload$/)) && req.method === 'PUT') {
      const x = state.media.get(m[1])
      if (!x) return err(res, 404, 'NOT_FOUND', 'no media')
      x.contentHash = `sha1:${createHash('sha1').update(raw).digest('hex')}`
      x.bytes = raw
      return ok(res, { uploaded: true, size: raw.length })
    }
    if ((m = p.match(/^\/_emdash\/api\/media\/([^/]+)\/confirm$/)) && req.method === 'POST') {
      const x = state.media.get(m[1])
      if (!x) return err(res, 404, 'NOT_FOUND', 'no media')
      x.status = 'ready'
      Object.assign(x, body.width ? { width: body.width, height: body.height } : {})
      return ok(res, { item: x })
    }
    if ((m = p.match(/^\/_emdash\/api\/media\/([^/]+)$/))) {
      const x = state.media.get(m[1])
      if (!x) return err(res, 404, 'NOT_FOUND', 'no media')
      if (req.method === 'PUT') Object.assign(x, body)
      return ok(res, { item: x })
    }
    if (p === '/_emdash/api/media' && req.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      return ok(res, {
        items: [...state.media.values()].filter((x) => !q || x.filename.toLowerCase().includes(q))
      })
    }
    if (p === '/_emdash/api/plugins/emdash-forms/forms/list')
      return ok(res, { forms: [...state.forms.values()] })
    if (p === '/_emdash/api/plugins/emdash-forms/forms/create') {
      const f = { id: id('FRM'), ...body }
      state.forms.set(f.id, f)
      return ok(res, { form: f })
    }
    if (p === '/_emdash/api/plugins/emdash-forms/forms/update') {
      const f = state.forms.get(body.id)
      if (!f) return err(res, 404, 'NOT_FOUND', 'no form')
      Object.assign(f, body)
      return ok(res, { form: f })
    }
    if ((m = p.match(/^\/_emdash\/api\/schema\/collections\/([^/]+)\/fields$/))) {
      const c = state.schema.get(m[1])
      if (!c) return err(res, 404, 'NOT_FOUND', 'no collection')
      if (req.method === 'POST') c.fields.push({ ...body })
      return ok(res, { items: c.fields })
    }
    if (
      (m = p.match(/^\/_emdash\/api\/schema\/collections\/([^/]+)\/fields\/([^/]+)$/)) &&
      req.method === 'PUT'
    ) {
      const c = state.schema.get(m[1])
      const f = c?.fields.find((x) => x.slug === m[2])
      if (!f) return err(res, 404, 'NOT_FOUND', 'no field')
      Object.assign(f, body)
      return ok(res, { item: f })
    }
    if ((m = p.match(/^\/_emdash\/api\/schema\/collections\/([^/]+)$/))) {
      const c = state.schema.get(m[1])
      if (!c) return err(res, 404, 'NOT_FOUND', 'no collection')
      if (req.method === 'PUT') Object.assign(c.item, body)
      return ok(res, { item: c.item })
    }
    if (p === '/_emdash/api/settings' && req.method === 'POST') {
      // As EmDash's settings door (`setSiteSettings`): the `seo` and `social` groups are merged key by key, not
      // replaced, and a key given null inside one is removed.
      const merged = { ...state.settings, ...body }
      for (const group of ['seo', 'social'])
        if (body?.[group] && typeof body[group] === 'object') {
          const next = { ...state.settings?.[group] }
          for (const [k, v] of Object.entries(body[group]))
            if (v === null) delete next[k]
            else if (v !== undefined) next[k] = v
          merged[group] = next
        }
      state.settings = merged
      return ok(res, state.settings)
    }
    if (p === '/_emdash/api/settings' && req.method === 'GET') return ok(res, state.settings ?? {})
    if (p === '/_emdash/api/setup/status') return ok(res, { needsSetup: state.needsSetup ?? false })
    if (p === '/_emdash/api/setup' && req.method === 'POST') {
      state.setupBody = body
      state.needsSetup = false
      return ok(res, { success: true, setupComplete: false })
    }
    return err(res, 404, 'NOT_FOUND', `unhandled ${req.method} ${p}`)
  })
  return {
    state,
    server,
    listen: () =>
      new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => server.close(r))
  }
}
