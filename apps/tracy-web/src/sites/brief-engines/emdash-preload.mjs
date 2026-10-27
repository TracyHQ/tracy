/**
 * Preloaded into the EmDash personalize tool — `node --import <this file> tools/personalize.mjs …` — so the tool's
 * model calls can be made BEFORE the site exists and answered from memory once it does.
 *
 * WHY. The tool (`tools/personalize.mjs` of the three `tracy-emdash-theme-*` packages) writes a customer's words by asking a model
 * for the copy of every page, the bodies of the demo entries, the card lists and a few pictures, then writing the
 * answers into the site. The writes are quick; the model is the part that takes half a minute, and it needs nothing
 * from the site but the template's own seed. So the tool is run TWICE with the same arguments:
 *
 *   record  while the site installs, against a stand-in for the site that lives in this file. Every model call goes
 *           out for real and its answer is written down; every call to the "site" is answered from the seed.
 *   replay  the moment the site is up, against the real site. Every model call is answered from what was written
 *           down; the calls to the site go through untouched.
 *
 * 🔒 A MISS IS SAFE, A HIT IS EXACT. The tool is deterministic given its answers (same arguments, same seed, same
 * replies → same next question), so a replayed run asks the model exactly what the recorded run asked, and each
 * question is answered by the reply it got before. What the stand-in could not foresee — a question that depends on
 * what the REAL site holds — is simply not in the file: it goes to the model live and the run is a little slower, never
 * wrong. Identical questions are answered in the order they were first answered (a retry of the same question gets the
 * second answer, as it would have), and only successful answers are kept.
 *
 * A request is the site's when its origin is `TRACY_FETCH_SITE`; anything else is a model call.
 *
 *   TRACY_FETCH_MODE   record | replay
 *   TRACY_FETCH_CACHE  the file the answers are kept in (JSON lines)
 *   TRACY_FETCH_SITE   the origin of the site the tool was given with `--site`
 *   TRACY_FETCH_SEED   (record) the seed folder the tool was given, which the stand-in answers from
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const mode = process.env.TRACY_FETCH_MODE
const cacheFile = process.env.TRACY_FETCH_CACHE
const siteOrigin = process.env.TRACY_FETCH_SITE ? new URL(process.env.TRACY_FETCH_SITE).origin : null
const seedDir = process.env.TRACY_FETCH_SEED
/** An answer larger than this is not kept: a picture the model drew is a few MB, nothing else comes close. */
const KEEP_AT_MOST = 24 * 1024 * 1024

if ((mode === 'record' || mode === 'replay') && cacheFile && siteOrigin) install()

function install() {
  const realFetch = globalThis.fetch.bind(globalThis)
  const stats = { hits: 0, misses: 0, kept: 0 }
  /** @type {Map<string, Array<{status: number, text: string}>>} */
  const answers = new Map()
  if (mode === 'replay' && existsSync(cacheFile)) {
    for (const line of readFileSync(cacheFile, 'utf8').split('\n')) {
      if (line.trim() === '') continue
      try {
        const row = JSON.parse(line)
        const list = answers.get(row.key) ?? []
        list.push({ status: row.status, text: row.text })
        answers.set(row.key, list)
      } catch {
        // a line cut short by a killed run is not an answer
      }
    }
  }
  const fake = mode === 'record' ? standIn() : null

  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
    if (url.origin === siteOrigin) return fake ? fake(url, init ?? {}) : realFetch(input, init)
    const key = createHash('sha256')
      .update(`${url.href}\n${typeof init?.body === 'string' ? init.body : ''}`)
      .digest('hex')
    if (mode === 'replay') {
      const next = answers.get(key)?.shift()
      if (next) {
        stats.hits += 1
        return new Response(next.text, {
          status: next.status,
          headers: { 'content-type': 'application/json' }
        })
      }
      stats.misses += 1
      return realFetch(input, init)
    }
    const response = await realFetch(input, init)
    if (!response.ok) return response
    const text = await response.text()
    if (text.length <= KEEP_AT_MOST) {
      appendFileSync(cacheFile, `${JSON.stringify({ key, status: response.status, text })}\n`)
      stats.kept += 1
    }
    return new Response(text, { status: response.status, headers: { 'content-type': 'application/json' } })
  }
  process.on('exit', () => {
    process.stderr.write(
      `fetch-cache ${mode}: hits=${stats.hits} misses=${stats.misses} kept=${stats.kept}\n`
    )
  })
}

/**
 * The stand-in for the site, as far as the tool's QUESTIONS depend on it: the entries it holds (the seed's own, which
 * is what a fresh site holds), the pictures its fields already carry, and nothing else. Writes are accepted and forgotten.
 */
function standIn() {
  /** The seed and the map, read when the first question about the site arrives; a run with none has an empty site. */
  let loaded = null
  const held = () => {
    if (loaded) return loaded
    const read = (name) => {
      try {
        return JSON.parse(readFileSync(path.join(seedDir ?? '', name), 'utf8'))
      } catch {
        return {}
      }
    }
    loaded = { seed: read('seed.json'), map: read('personalize.json') }
    return loaded
  }
  /** The picture fields a fresh site's entries carry (the importer puts them there; the seed does not). */
  const pictureFields = (collection, slug) => {
    const out = []
    for (const t of held().map.images?.targets ?? [])
      if (t.collection === collection && t.slug === slug) out.push(t.field)
    for (const r of held().map.images?.entries ?? []) if (r.collection === collection) out.push(r.field)
    return out
  }
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const ok = (data = {}) => json(200, { success: true, data })
  const missing = () => json(404, { success: false, error: { code: 'NOT_FOUND', message: 'not found' } })

  return async (url, init) => {
    const method = String(init.method ?? 'GET').toUpperCase()
    const route = url.pathname
    const locale = url.searchParams.get('locale') ?? 'en'
    let m = route.match(/^\/_emdash\/api\/content\/([^/]+)\/([^/]+)$/)
    if (m && method === 'GET') {
      const collection = decodeURIComponent(m[1])
      const slug = decodeURIComponent(m[2])
      const row = (held().seed.content?.[collection] ?? []).find(
        (e) => e.slug === slug && (e.locale ?? 'en') === locale
      )
      if (!row) return missing()
      const data = { ...row.data }
      for (const field of pictureFields(collection, slug))
        if (data[field] === undefined) data[field] = { id: 'stand-in' }
      return ok({
        item: {
          id: `${collection}:${slug}:${locale}`,
          type: collection,
          slug,
          locale,
          status: 'published',
          data,
          liveData: data
        },
        _rev: 'stand-in'
      })
    }
    if (m && method === 'PUT') return ok({ _rev: 'stand-in' })
    if (/^\/_emdash\/api\/content\/[^/]+\/[^/]+\/(?:publish|unpublish)$/.test(route))
      return ok({ _rev: 'stand-in' })
    if (/^\/_emdash\/api\/menus\/[^/]+$/.test(route) && method === 'GET') return ok({ items: [] })
    if (route.startsWith('/_emdash/api/taxonomies/')) return ok({})
    if (route === '/_emdash/api/settings') return ok({})
    if (route === '/_emdash/api/plugins/emdash-forms/forms/list') return ok({ forms: [] })
    if (route === '/_emdash/api/media/upload-url')
      return ok({
        mediaId: 'stand-in-media',
        uploadUrl: '/_emdash/api/media/stand-in-media/upload',
        method: 'PUT',
        headers: {}
      })
    if (/^\/_emdash\/api\/media\/[^/]+\/upload$/.test(route)) return ok({})
    if (/^\/_emdash\/api\/media\/[^/]+\/confirm$/.test(route)) return ok({})
    m = route.match(/^\/_emdash\/api\/media\/([^/]+)$/)
    if (m && method === 'GET')
      return ok({
        item: {
          id: decodeURIComponent(m[1]),
          url: '/stand-in.jpg',
          width: 1,
          height: 1,
          filename: 'stand-in.jpg'
        }
      })
    if (m && method === 'PUT') return ok({})
    return missing()
  }
}
