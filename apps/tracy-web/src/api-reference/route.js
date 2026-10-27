/**
 * The API reference, drawn by Scalar from the OpenAPI documents this app builds for itself.
 * Two routers, one page renderer:
 *
 *   `docsReferenceRoutes`  on the docs host (`DOCS_ORIGIN`; tasks/todo-desktop-update-policy.md H4):
 *                          the reader's page at `/api/reference/`, its bundle, and the three
 *                          machine-read documents at `/api/openapi.json`, `/api/claude-cowork.json`
 *                          and `/api/llms.txt`. `app.js` mounts it behind the docs host's gate.
 *   `apiReferenceRoutes`   on the hostnames of Tracy's own app: the same three documents at their
 *                          published addresses (`/docs/api/<file>`, kept on the API host; anywhere
 *                          else `app.js` sends `/docs/*` to the docs host first), and the staff
 *                          reference at `/ops/api`.
 *
 * "TEST REQUEST" GOES TO THE API HOST. On the docs host the document is the `/v1` variant with
 * `API_ORIGIN` as its server, and the page's CSP names that origin in `connect-src` — the one
 * origin it may call besides its own. The API host answers those calls cross-origin for the docs
 * origin alone, without credentials (`app.js`, the API host gate): a key in `Authorization`, never
 * a cookie.
 *
 * SELF-HOSTED, NOTHING FETCHED FROM A CDN. The page loads Scalar's prebuilt browser bundle
 * (`@scalar/api-reference`, `dist/browser/standalone.js`, one file with its CSS inside) from this
 * app, beside the page. A CDN copy would be a second supplier deciding what code runs on Tracy's
 * own hostname, and a version nobody pinned. The bundle's version is the one `package.json` pins;
 * its URL carries a hash of the bytes, so the long cache can never serve an old bundle after an
 * upgrade.
 *
 * NO INLINE SCRIPT. Scalar's standalone bundle reads its configuration from a `data-configuration`
 * attribute on `<script id="api-reference">`, so the page's CSP can say `script-src 'self'` and
 * nothing else of ours (the edge's beacon is the one host beside it: `cspFor`). Styles are `'unsafe-inline'` because the bundle injects its own `<style>` element.
 * The configuration also turns off everything that would reach a Scalar service from a reader's
 * browser: default fonts (fonts.scalar.com), telemetry, the AI agent and the MCP panel. No
 * `proxyUrl` is set, so "Test request" calls go straight to the document's server.
 *
 * NOT A DOMAIN THAT KNOWS THE DOORS. The document itself is built by `spec.js` from the door
 * tables the composition root hands it (`app.js` wires `buildSpec`): this module may reach only
 * `lib/` and `db/` (`test/module-graph.test.mjs`), and the door tables live in `sites/`.
 *
 * Public: no seat, no session — except `/ops/api*`, behind the staff gate.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { escapeHtml } from '../lib/html.js'
import { EDGE_BEACON_REPORT, EDGE_BEACON_SCRIPT } from '../lib/security-headers.js'
import { buildAgentToolsOpenApi } from './sources/agent-tools.js'
import { buildCoworkOpenApi } from './sources/claude-cowork.js'
import { buildSiteAddressOpenApi } from './sources/site-address.js'
import { buildLlmsTxt } from './llms.js'

const TITLE = 'Tracy API reference'

// Same relative path in a checkout (`apps/tracy-web/node_modules`, a pnpm link) and in the image
// (`/opt/tracy-web/node_modules`, where the Dockerfile copies the one file in from a build stage).
const DEFAULT_BUNDLE = new URL(
  '../../node_modules/@scalar/api-reference/dist/browser/standalone.js',
  import.meta.url
)

/**
 * The page's CSP. `connectOrigin`: the one other origin "Test request" may call (the API host).
 * The edge's analytics beacon is the one script not of this app: Cloudflare injects it into every
 * HTML answer, and without its two hosts each visit logs two CSP refusals (measured 11/10/2026 on
 * docs.tracy.site; `lib/security-headers.js` explains the beacon).
 */
const cspFor = (connectOrigin = null) =>
  [
    "default-src 'self'",
    `script-src 'self' ${EDGE_BEACON_SCRIPT}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    ['connect-src', "'self'", connectOrigin, EDGE_BEACON_REPORT].filter(Boolean).join(' '),
    "worker-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ')

/**
 * The origin the reader is on, so the document's `servers` entry — and every "Test request" — is
 * same-origin. Behind the tunnel the socket is plain http, so the scheme comes from
 * `x-forwarded-proto` when it names one of the two schemes this app serves.
 *
 * @param {import('hono').Context} c
 */
function requestOrigin(c) {
  const url = new URL(c.req.url)
  const forwarded = (c.req.header('x-forwarded-proto') ?? '').split(',')[0].trim().toLowerCase()
  const scheme = forwarded === 'https' || forwarded === 'http' ? forwarded : url.protocol.slice(0, -1)
  const host = c.req.header('host') ?? url.host
  return `${scheme}://${host}`
}

/** Scalar's bundle, read once and named by a hash of its bytes; a missing file is retried later. */
function bundleLoader(bundlePath) {
  /** @type {Promise<{ bytes: Buffer, version: string } | null> | null} */
  let bundle = null
  return () => {
    bundle ??= readFile(bundlePath).then(
      (bytes) => ({ bytes, version: createHash('sha256').update(bytes).digest('hex').slice(0, 16) }),
      () => {
        bundle = null // a missing file is retried on the next request, not remembered forever
        return null
      }
    )
    return bundle
  }
}

/** The bundle itself, at whichever path the page names it. */
async function serveBundle(c, loadBundle) {
  const loaded = await loadBundle()
  if (!loaded) return c.text('The API reference viewer is not installed on this server.', 503)
  c.header('content-type', 'text/javascript; charset=utf-8')
  c.header('x-content-type-options', 'nosniff')
  // Immutable only when the URL names these exact bytes; a bare URL may change on upgrade.
  c.header(
    'cache-control',
    c.req.query('v') === loaded.version ? 'public, max-age=31536000, immutable' : 'public, max-age=300'
  )
  return c.body(loaded.bytes)
}

/**
 * The Scalar page for one set of documents.
 * @param {import('hono').Context} c
 * @param {{ sources: {title: string, slug: string, url: string}[], title: string, bundleUrl: string,
 *   loadBundle: () => Promise<{ version: string } | null>, connectOrigin?: string | null }} page
 */
async function scalarPage(c, { sources, title, bundleUrl, loadBundle, connectOrigin = null }) {
  const specUrl = sources[0].url
  const loaded = await loadBundle()
  const configuration = {
    sources: sources.map((source, index) => ({ ...source, default: index === 0 })),
    withDefaultFonts: false,
    telemetry: false,
    agent: { disabled: true },
    mcp: { disabled: true },
    showDeveloperTools: 'never',
    metaData: { title }
  }
  const src = `${bundleUrl}${loaded ? `?v=${loaded.version}` : ''}`
  c.header('content-security-policy', cspFor(connectOrigin))
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'no-referrer')
  c.header('cache-control', 'no-cache')
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
</head>
<body>
<noscript>This page needs JavaScript. The raw document is at <a href="${escapeHtml(specUrl)}">${escapeHtml(specUrl)}</a>.</noscript>
<script id="api-reference" type="application/json" data-url="${escapeHtml(specUrl)}" data-configuration="${escapeHtml(JSON.stringify(configuration))}"></script>
<script src="${escapeHtml(src)}"></script>
</body>
</html>
`)
}

/** The three machine-read documents, served the same way on both hosts. */
function serveDocuments(app, prefix, { buildSpec, specArgs, coworkOrigin }) {
  app.get(`${prefix}/llms.txt`, async (c) => {
    c.header('cache-control', 'no-store')
    return c.text(buildLlmsTxt(await buildSpec(specArgs(c))))
  })
  app.get(`${prefix}/claude-cowork.json`, (c) => {
    c.header('cache-control', 'no-store')
    c.header('access-control-allow-origin', '*')
    return json(c, buildCoworkOpenApi({ origin: coworkOrigin(c) }))
  })
  app.get(`${prefix}/openapi.json`, async (c) => {
    c.header('cache-control', 'no-store')
    c.header('access-control-allow-origin', '*')
    return json(c, await buildSpec(specArgs(c)))
  })
}

/** Where the docs host draws the reference. */
const DOCS_REFERENCE_PAGE = '/api/reference/'
const DOCS_REFERENCE_PATHS = new Set([
  '/api/reference',
  DOCS_REFERENCE_PAGE,
  `${DOCS_REFERENCE_PAGE}scalar.js`,
  '/api/openapi.json',
  '/api/claude-cowork.json',
  '/api/llms.txt'
])

/** Is this one of the paths `docsReferenceRoutes` answers? The docs host's gate asks (`app.js`). */
export function ownsDocsReferencePath(pathname) {
  return DOCS_REFERENCE_PATHS.has(pathname)
}

/**
 * The reader's reference on the docs host.
 *
 * @param {object} deps
 * @param {(args: { origin: string, publicApi?: boolean }) => object | Promise<object>} deps.buildSpec
 * @param {string|null} deps.apiOrigin - `API_ORIGIN`: the document's server and the one origin the
 *   page may call. Null (no API host): the document is the full public one for the reader's own
 *   origin, as Tracy's own hostname served it before the docs host existed.
 * @param {URL | string} [deps.bundlePath] — Scalar's standalone bundle; overridable for tests
 */
export function docsReferenceRoutes({ buildSpec, apiOrigin, bundlePath = DEFAULT_BUNDLE }) {
  const app = new Hono()
  const loadBundle = bundleLoader(bundlePath)
  const page = (c) =>
    scalarPage(c, {
      sources: [
        { title: 'Tracy API', slug: 'tracy', url: '/api/openapi.json' },
        { title: 'Claude Cowork plugin', slug: 'claude-cowork', url: '/api/claude-cowork.json' }
      ],
      title: TITLE,
      bundleUrl: `${DOCS_REFERENCE_PAGE}scalar.js`,
      loadBundle,
      connectOrigin: apiOrigin
    })
  app.get('/api/reference', page)
  app.get(DOCS_REFERENCE_PAGE, page)
  app.get(`${DOCS_REFERENCE_PAGE}scalar.js`, (c) => serveBundle(c, loadBundle))
  serveDocuments(app, '/api', {
    buildSpec,
    specArgs: (c) => (apiOrigin ? { origin: apiOrigin, publicApi: true } : { origin: requestOrigin(c) }),
    coworkOrigin: (c) => apiOrigin ?? requestOrigin(c)
  })
  return app
}

/**
 * @param {object} deps
 * @param {(args: { origin: string, internal?: boolean, publicApi?: boolean }) => object | Promise<object>} deps.buildSpec — the OpenAPI 3.1 document
 * @param {(c: import('hono').Context) => boolean} [deps.isApiHost] — is this request on the api host
 * @param {URL | string} [deps.bundlePath] — Scalar's standalone bundle; overridable for tests
 */
export function apiReferenceRoutes({
  buildSpec,
  admitInternal = null,
  bundlePath = DEFAULT_BUNDLE,
  // On the api host (`tasks/todo-api-public.md` Q5/S4) the public document is the `/v1` variant
  // (`publicApi: true`): the routes that exist THERE, with that host as `servers`. Everywhere else
  // the full public reference is served, unchanged. Defaults to "never the api host".
  isApiHost = () => false
}) {
  const app = new Hono()
  const loadBundle = bundleLoader(bundlePath)

  // The published addresses of the three documents. On the API host they are what a caller was
  // given; anywhere else `app.js` only lets them through when there is no docs host to send to.
  serveDocuments(app, '/docs/api', {
    buildSpec,
    specArgs: (c) => ({ origin: requestOrigin(c), ...(isApiHost(c) ? { publicApi: true } : {}) }),
    coworkOrigin: requestOrigin
  })

  // The staff reference: every route, the internal ones included — behind a Tracy admin seat,
  // decided by the caller's `admitInternal` (ops/admit.js, wired in app.js; this domain may not
  // import ops/). With no gate wired it is not served at all. Its bundle and the plugin document
  // are served under `/ops/api` too: `/docs/*` on this hostname now leaves for the docs host,
  // and the page's CSP allows only its own origin.
  const internalGate = async (c) => (admitInternal ? await admitInternal(c) : c.body(null, 404))
  app.get('/ops/api', async (c) => {
    const refused = await internalGate(c)
    if (refused) return refused
    return scalarPage(c, {
      sources: [
        { title: 'Tracy API (internal)', slug: 'tracy-internal', url: '/ops/api/openapi.json' },
        { title: 'Claude Cowork plugin', slug: 'claude-cowork', url: '/ops/api/claude-cowork.json' },
        { title: 'Agent tools', slug: 'agent-tools', url: '/ops/api/agent-tools.json' },
        { title: 'Customer site address', slug: 'site-address', url: '/ops/api/site-address.json' }
      ],
      title: `${TITLE} (internal)`,
      bundleUrl: '/ops/api/scalar.js',
      loadBundle
    })
  })
  app.get('/ops/api/scalar.js', (c) => serveBundle(c, loadBundle))
  app.get('/ops/api/openapi.json', async (c) => {
    const refused = await internalGate(c)
    if (refused) return refused
    c.header('cache-control', 'no-store')
    return json(c, await buildSpec({ origin: requestOrigin(c), internal: true }))
  })

  for (const [path, build] of [
    ['/ops/api/agent-tools.json', buildAgentToolsOpenApi],
    ['/ops/api/site-address.json', buildSiteAddressOpenApi],
    ['/ops/api/claude-cowork.json', (c) => buildCoworkOpenApi({ origin: requestOrigin(c) })]
  ])
    app.get(path, async (c) => {
      const refused = await internalGate(c)
      if (refused) return refused
      c.header('cache-control', 'no-store')
      return json(c, build(c))
    })

  return app
}
