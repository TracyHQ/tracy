// Helpers the cms assertions share: loading product modules from a given root (the real tree or a
// mutated scratch copy), a scripted GitHub, an in-memory pool and a throwaway directory.
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { HarnessError } from './kit.mjs'

/** Paths of the product modules, relative to a root. */
export const PRODUCT = Object.freeze({
  releaseAssets: 'apps/tracy-web/src/lib/release-assets.js',
  quickstartReleases: 'apps/tracy-web/src/lib/quickstart-releases.js',
  localReleases: 'apps/tracy-web/src/lib/local-releases.js',
  tracySetting: 'apps/tracy-web/src/lib/tracy-setting.mjs',
  contracts: 'apps/tracy-web/src/lib/contracts.js',
  buildQuestions: 'apps/tracy-web/src/lib/build-questions.js',
  questionSets: 'apps/tracy-web/src/lib/question-sets.js',
  quickstartPy: 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstart.py',
  quickstartJpaPy: 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstart_jpa.py'
})

/** What a scratch copy of the web code needs: relative imports reach `github/`, `questions/` and the pin file. */
export const WEB_COPY = Object.freeze([
  'apps/tracy-web/src/lib',
  'apps/tracy-web/src/github',
  'apps/tracy-web/src/questions',
  'apps/tracy-web/src/quickstarts.json'
])
export const PY_COPY = Object.freeze([PRODUCT.quickstartPy, PRODUCT.quickstartJpaPy])

/** Import a product module from `root`. A module that does not load is a harness fault, never a product verdict. */
export async function load(root, rel) {
  const file = path.join(root, rel)
  try {
    return await import(pathToFileURL(file).href)
  } catch (error) {
    throw new HarnessError(`cannot import ${rel} from ${root}: ${error.message}`)
  }
}

export const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')

/** A directory that is removed after `fn`, under the run's own scratch area when one is given. */
export async function withTempDir(prefixBase, fn) {
  const base = prefixBase ?? os.tmpdir()
  await fs.mkdir(base, { recursive: true })
  const dir = await fs.mkdtemp(path.join(base, 'qa-cms-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

/**
 * A scripted GitHub: one release, its assets, and chosen failures. Every request is recorded.
 * @param {{ tag: string, files?: Record<string, Buffer|string>, releaseStatus?: number, assetStatus?: number,
 *   assetsField?: boolean, existing?: string[], uploadStatus?: number, throwOn?: string }} spec
 */
export function scriptedGithub(spec) {
  const files = new Map(Object.entries(spec.files ?? {}).map(([n, b]) => [n, Buffer.from(b)]))
  const ids = new Map([...files.keys()].map((name, i) => [name, 1000 + i]))
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const u = String(url)
    const method = init.method ?? 'GET'
    calls.push({ method, url: u })
    if (spec.throwOn && u.includes(spec.throwOn)) throw new TypeError('network down')
    if (u.includes('/releases/tags/')) {
      if (spec.releaseStatus && spec.releaseStatus !== 200)
        return new Response('x', { status: spec.releaseStatus })
      const body = { id: 7, tag_name: spec.tag }
      if (spec.assetsField !== false)
        body.assets = [...files.keys()].map((name) => ({ name, id: ids.get(name) }))
      return new Response(JSON.stringify(body), { status: 200 })
    }
    const asset = /\/releases\/assets\/(\d+)$/.exec(u)
    if (asset && method === 'GET') {
      if (spec.assetStatus && spec.assetStatus !== 200) return new Response('x', { status: spec.assetStatus })
      const name = [...ids.entries()].find(([, id]) => id === Number(asset[1]))?.[0]
      return name ? new Response(files.get(name), { status: 200 }) : new Response('x', { status: 404 })
    }
    if (asset && method === 'DELETE') return new Response(null, { status: 204 })
    if (u.includes('/assets?name=') && method === 'POST')
      return spec.uploadStatus && spec.uploadStatus !== 201
        ? new Response('x', { status: spec.uploadStatus })
        : new Response(JSON.stringify({ id: 5000 }), { status: 201 })
    return new Response('not scripted', { status: 599 })
  }
  return { fetchImpl, calls }
}

/** A pool that keeps rows for the three tables the release code writes, enough for its queries. */
export function memoryPool() {
  const rows = {
    quickstart_releases: new Map(),
    question_set: new Map(),
    question_choice: new Map(),
    build_questions: new Map()
  }
  return {
    rows,
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (text.startsWith('insert into quickstart_releases')) {
        rows.quickstart_releases.set(params[0], {
          tag: params[0],
          release: params[1],
          setting: params[2],
          inspiration: params[3],
          tracy: params[4],
          reason: params[5],
          inspiration_hidden: params[6],
          fetched_at: '2026-10-05T00:00:00Z'
        })
        return { rows: [] }
      }
      if (text.startsWith('select tag')) return { rows: [...rows.quickstart_releases.values()] }
      if (text.startsWith('select id, owner, sha256, source from question_set'))
        return { rows: [...rows.question_set.values()] }
      if (text.startsWith('insert into question_set')) {
        rows.question_set.set(params[0], {
          id: params[0],
          owner: params[1],
          name: params[2],
          source: params[3],
          version: params[4],
          sha256: params[5],
          doc: params[6]
        })
        return { rows: [] }
      }
      return { rows: [] }
    }
  }
}

/** A GitHub that lists releases (one page) and serves each release's files. */
export function releasesGithub(releases, { failAfter = null, status = 200 } = {}) {
  const urls = new Map()
  const list = releases.map((r) => ({
    tag_name: r.tag,
    name: r.tag,
    draft: false,
    prerelease: false,
    published_at: '2026-09-14T19:33:55Z',
    assets: Object.entries(r.files ?? {}).map(([name, body]) => {
      const url = `https://api.github.invalid/${r.tag}/${name}`
      urls.set(url, typeof body === 'string' ? body : JSON.stringify(body))
      return { name, url, id: urls.size }
    })
  }))
  let calls = 0
  const fetchImpl = async (url) => {
    calls += 1
    if (status !== 200) return new Response('bad gateway', { status })
    if (failAfter !== null && calls > failAfter) return new Response('bad gateway', { status: 502 })
    if (String(url).includes('/releases?')) return new Response(JSON.stringify(list), { status: 200 })
    const body = urls.get(String(url))
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 })
  }
  return { fetchImpl, calls: () => calls }
}

/** Run a product call and report a throw as data: a throw where a sentence was promised is a finding, not a crash of the harness. */
export async function observe(fn) {
  try {
    return { value: await fn(), threw: null }
  } catch (error) {
    return { value: undefined, threw: `${error?.name}: ${error?.message}` }
  }
}

/** A valid EmDash-shaped or PHP-shaped setting over the given files (hashes computed from the bytes). */
export function settingFor(platform, files, over = {}) {
  const part = (name) => ({ file: name, sha256: sha256Hex(files[name]) })
  const names = Object.keys(files)
  const install =
    platform === 'emdash'
      ? { source: part(names[0]), state: part(names[1]) }
      : { webroot: part(names[0]), database: part(names[1]) }
  return {
    schemaVersion: 'tracy-setting/v1',
    platform,
    label: 'QA Template',
    version: '1.0.0',
    cms: platform === 'joomla' ? '6.1.1' : platform === 'wordpress' ? '7.1' : '0.37.0',
    install,
    ...over
  }
}
