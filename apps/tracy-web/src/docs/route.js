/**
 * The documentation site (`apps/tracy-docs`, Astro Starlight) — served off disk at the ROOT of its
 * own host (`DOCS_ORIGIN`, e.g. `docs.tracy.ai`; tasks/todo-desktop-update-policy.md H2/H3), and
 * nowhere else. Three exports, one per question:
 *
 *   `docsRoutes`      the static server: a path becomes a file of the built site.
 *   `docsHostRoutes`  everything the docs host answers — the static site, the interactive API
 *                     reference handed in by `app.js`, `/.well-known/*` — behind an allowlist:
 *                     anything else is 404 `NOT_ON_THIS_HOST`, so no Tracy door (sign-in, the seat
 *                     doors, /ops, /v1) ever answers on this hostname.
 *   `docsRedirects`   `/docs` and `/docs/*` on every OTHER hostname that reaches Tracy's own app
 *                     (Tracy's own, the API host, a local address): a 302 to the same page on the
 *                     docs host. A customer site never gets here — the site router took its
 *                     hostname first (`app.js`) — so a site's own `/docs` is never touched.
 *
 * WHERE THE FILES COME FROM. `apps/tracy-web/Dockerfile` COPYs the built `apps/tracy-docs/dist` to
 * `static/docs`, exactly as it copies the harness SPA to `static/ops` — and `DEFAULT_STATIC_DIR`
 * resolves relative to THIS file for the same reason `ops/route.js` does: the path is right whether
 * the process starts from the repo root or from `/opt/tracy-web`. A local checkout has no `dist/`
 * until someone runs `pnpm --filter @tracy/docs build`; then every page answers a 404 that SAYS so
 * (`docsNotBuiltPage`), never a bare 404 that reads as "wrong address".
 *
 * HOW A PATH BECOMES A FILE. The site is built with `base: '/'` and `trailingSlash: 'always'`
 * (directory output), so `/quickstart/` is `quickstart/index.html`. The lookup order is: the exact
 * file (`_astro/x.css`), then `<path>/index.html` — so `/quickstart` without a slash is served too —
 * then the site's own `404.html` with status 404. Hashed assets under `_astro/` and `pagefind/` are
 * immutable by construction (the hash is in the name), so they get a year of cache; HTML gets
 * `no-cache` so a redeploy is seen at once.
 *
 * NO SESSION, NO SEAT: the documentation is public. Nothing here reads a cookie or sets one; the
 * docs host's gate in `app.js` also drops both at the door, so that stays true of whatever the
 * reference router does.
 */
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { pageShell } from '../lib/page-shell.js'
import { renderedPage } from '../lib/security-headers.js'

/** `/opt/tracy-web/static/docs` in the image; `apps/tracy-web/static/docs` in a checkout. */
const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../../static/docs/', import.meta.url))

/**
 * Does this process carry the built documentation site? `server.js` asks once at boot: with the
 * site on disk, `DOCS_ORIGIN` is required (`config.js`, `readDocsOrigin`).
 * @param {string} [staticDir]
 */
export function docsSiteBuilt(staticDir = DEFAULT_STATIC_DIR) {
  return existsSync(join(staticDir, 'index.html'))
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  // The changelog pages as raw markdown, `/changelog/desktop/<X.Y>.md` (E3): read by the desktop
  // release tooling's "docs deployed" check, so `no-cache` like HTML — a redeploy is seen at once.
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

/** Directories whose file names carry a content hash: safe to cache for a year. */
const IMMUTABLE_DIRS = ['_astro/', 'pagefind/']

/**
 * The request path relative to the site root, with no way to climb out of `staticDir`: decoded,
 * normalised, and any leading `../` that survives is dropped (a path that legitimately needs to
 * leave the directory does not exist). Returns '' for the site root, null for a path that can name
 * no file at all.
 */
export function relPathFor(pathname) {
  const stripped = pathname.replace(/^\/+/, '')
  if (stripped === '') return ''
  let decoded
  try {
    decoded = decodeURIComponent(stripped)
  } catch {
    return null // malformed percent-encoding: no such file
  }
  if (decoded.includes('\0')) return null
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '')
  return safe === '.' || safe === '..' || safe === '' ? '' : safe
}

async function readStatic(staticDir, relPath) {
  try {
    const body = await readFile(join(staticDir, relPath))
    return { body, contentType: MIME_TYPES[extname(relPath).toLowerCase()] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

/** Shown when the site was not built into this deployment — a 404 that names the cause. */
function docsNotBuiltPage() {
  return pageShell(
    'Documentation not built',
    `<h1>Documentation not built</h1>
<p class="card-description">This checkout has no <code>static/docs</code> to serve. The documentation
site (<code>apps/tracy-docs</code>) is built by <code>pnpm --filter @tracy/docs build</code> and
only copied in by <code>apps/tracy-web/Dockerfile</code>'s own <code>COPY … dist</code> — a local
checkout never runs that step. Nothing is broken; there is simply no site here yet. The API
reference is still at <a href="/api/reference/">/api/reference/</a>.</p>`
  )
}

/**
 * The static server, at the root of whatever hostname it is mounted for.
 * @param {object} [deps]
 * @param {string} [deps.staticDir] - override for tests; production uses `DEFAULT_STATIC_DIR`.
 */
export function docsRoutes({ staticDir = DEFAULT_STATIC_DIR } = {}) {
  const app = new Hono()

  app.get('/*', async (c) => {
    const rel = relPathFor(new URL(c.req.url).pathname)
    let file = null
    let status = 200
    if (rel !== null) {
      // A file with an extension is asked for as itself; anything else is a page directory.
      if (rel !== '' && extname(rel) !== '') file = await readStatic(staticDir, rel)
      file ??= await readStatic(staticDir, rel === '' ? 'index.html' : join(rel, 'index.html'))
    }
    if (!file) {
      // The site's own 404 page, when the site is there at all; otherwise say what is missing.
      const notFound = await readStatic(staticDir, '404.html')
      if (!notFound) return renderedPage(c, docsNotBuiltPage(), 404)
      file = notFound
      status = 404
    }

    const immutable = rel !== null && IMMUTABLE_DIRS.some((dir) => rel.startsWith(dir)) && status === 200
    return c.body(file.body, status, {
      'content-type': file.contentType,
      'x-content-type-options': 'nosniff',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    })
  })
  return app
}

/** The refusal for anything the docs host does not serve — the API host's own shape. */
function notOnThisHost(c) {
  c.header('cache-control', 'private, no-store')
  return c.json({ code: 'NOT_ON_THIS_HOST' }, 404)
}

/**
 * The names at the top of the built site (`quickstart`, `vi`, `_astro`, `favicon.svg`, …): a path
 * whose first segment is one of them belongs to the site, so a missing page under it is the site's
 * own 404 page. Read from the build rather than listed here, so a page added to `apps/tracy-docs`
 * needs no edit in this file. An unbuilt site reads as empty and is read again next time.
 */
function topLevelNames(staticDir) {
  let cached = null
  return () => {
    if (cached) return cached
    try {
      const names = new Set(readdirSync(staticDir))
      if (names.size > 0) cached = names
      return names
    } catch {
      return new Set()
    }
  }
}

/**
 * Everything the docs host answers, behind its allowlist. Mounted by `app.js` for that hostname
 * alone, before customer-site routing (`docs.tracy.ai` is also the shape of a site address).
 *
 * @param {object} deps
 * @param {string} [deps.staticDir] - override for tests; production uses `DEFAULT_STATIC_DIR`.
 * @param {import('hono').Hono} [deps.reference] - the interactive API reference and its documents
 *   (`api-reference/route.js`, `docsReferenceRoutes`), which this domain may not import.
 * @param {(pathname: string) => boolean} [deps.referenceOwns] - the paths `reference` answers.
 */
export function docsHostRoutes({
  staticDir = DEFAULT_STATIC_DIR,
  reference = null,
  referenceOwns = () => false
}) {
  const app = new Hono()
  const siteNames = topLevelNames(staticDir)

  app.use('*', async (c, next) => {
    // The documentation is read, never written to.
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return notOnThisHost(c)
    const pathname = new URL(c.req.url).pathname
    if (pathname === '/' || pathname.startsWith('/.well-known/') || referenceOwns(pathname)) return next()
    const first = pathname.split('/')[1] ?? ''
    let name
    try {
      name = decodeURIComponent(first)
    } catch {
      return notOnThisHost(c)
    }
    return siteNames().has(name) ? next() : notOnThisHost(c)
  })
  if (reference) app.route('/', reference)
  // Nothing is published under `/.well-known/` yet: a plain 404, past the gate.
  app.get('/.well-known/*', (c) => c.body(null, 404))
  app.route('/', docsRoutes({ staticDir }))
  return app
}

/**
 * Where a `/docs…` address of the old layout (the site under `/docs`, the reference at `/docs/api`)
 * lives on the docs host, or null when the path is not one. The reference moved to
 * `/api/reference/` and its three documents to `/api/<file>`, so `/docs/api` is not merely the
 * prefix cut off: it would name a page the site does not have.
 */
export function docsLocation(pathname) {
  if (pathname !== '/docs' && !pathname.startsWith('/docs/')) return null
  const rest = pathname.slice('/docs'.length) || '/'
  if (rest === '/api' || rest === '/api/') return '/api/reference/'
  if (rest.startsWith('/api/')) {
    const file = rest.slice('/api/'.length)
    if (REFERENCE_FILES.includes(file)) return `/api/${file}`
    if (file === 'scalar.js') return '/api/reference/scalar.js'
    return '/api/reference/'
  }
  return rest
}

/** The three machine-read documents, by file name: `/docs/api/<file>` before, `/api/<file>` now. */
export const REFERENCE_FILES = ['openapi.json', 'claude-cowork.json', 'llms.txt']

/** Said where the docs host is not configured: there is nowhere to send the reader. */
function noDocsHostPage() {
  return pageShell(
    'Documentation not on this deployment',
    `<h1>Documentation not on this deployment</h1>
<p class="card-description">The documentation is served at the root of its own host,
<code>DOCS_ORIGIN</code>, which this deployment does not set. Set it in the environment of
tracy-web (see <code>deploy/.env.example</code>) and restart.</p>`
  )
}

/**
 * `/docs` and `/docs/*` on every hostname that reaches Tracy's own app: a 302 to the docs host,
 * query kept, uncacheable (302 before 301: a browser remembers a 301 across a rollback). Steps
 * aside (`next()`) where `servesHere` says the address is still answered on this hostname — the
 * API host's three published documents.
 *
 * @param {object} deps
 * @param {string|null} deps.docsOrigin
 * @param {(c: import('hono').Context) => boolean} [deps.servesHere]
 */
export function docsRedirects({ docsOrigin, servesHere = () => false }) {
  const app = new Hono()
  const send = (c, next) => {
    if (servesHere(c)) return next()
    if (!docsOrigin) return renderedPage(c, noDocsHostPage(), 404)
    const url = new URL(c.req.url)
    c.header('cache-control', 'no-store')
    return c.redirect(`${docsOrigin}${docsLocation(url.pathname)}${url.search}`, 302)
  }
  app.get('/docs', send)
  // Two addresses of the published reference contract (`api-spec` gate), registered by name so the
  // reference keeps documenting them: the same redirect as every other `/docs/*` path.
  app.get('/docs/api', send)
  app.get('/docs/api/scalar.js', send)
  app.get('/docs/*', send)
  return app
}
