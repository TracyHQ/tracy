/**
 * The standalone server's settings, from the environment. Provider keys use the names the open layer
 * already reads (`../wo-settings.js`, `envFallbackKey`); a key left unset turns its source off.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The page served when `UI_DIR` is unset: the package's browser UI, served as it is (no build step).
const PACKAGE_UI = fileURLToPath(new URL('../../ui/public/', import.meta.url))
const DEFAULT_TRACY_URL = 'https://cowork.tracy.ai'
// Tracy answers /v1 on its own API host; another TRACY_URL names its API with TRACY_API_URL, or answers /v1 itself.
const DEFAULT_TRACY_API_URL = 'https://api.tracy.ai'
const LOOPBACK_BIND = new Set(['127.0.0.1', '::1', 'localhost'])

const opt = (env, name) => {
  const v = env[name]
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
const flag = (env, name, fallback) => {
  const v = (opt(env, name) ?? '').toLowerCase()
  if (v === '') return fallback
  return !['0', 'false', 'off', 'no'].includes(v)
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {object} `config` for `websiteOpportunitiesRoutes`, plus `databaseUrl`, `port`, `bind`, `operator*`, `trustProxy`,
 *   `dataDir` (stored photos and logos) and `uiDir` (a web page to serve, or null).
 */
export function readStandaloneConfig(env) {
  const databaseUrl = opt(env, 'DATABASE_URL')
  if (!databaseUrl) throw new Error('DATABASE_URL is required (a Postgres connection string)')
  const port = Number(opt(env, 'PORT') ?? 8080)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a TCP port number')
  const operatorToken = opt(env, 'OPERATOR_TOKEN')
  // Secure by default: without a token nobody but this machine may reach the server.
  const bind = opt(env, 'BIND_ADDRESS') ?? (operatorToken ? '0.0.0.0' : '127.0.0.1')
  // Your own Overpass for OpenStreetMap search; the public instances rate-limit busy addresses.
  const overpassUrl = opt(env, 'OVERPASS_URL')
  if (overpassUrl && !/^https?:\/\//i.test(overpassUrl))
    throw new Error('OVERPASS_URL must be an http(s) address')
  const hubUrl = opt(env, 'HUB_URL')
  const hubToken = opt(env, 'HUB_TOKEN')
  if (hubUrl && !/^https?:\/\//i.test(hubUrl)) throw new Error('HUB_URL must be an http(s) address')
  if (Boolean(hubUrl) !== Boolean(hubToken))
    throw new Error('HUB_URL and HUB_TOKEN go together: set both or neither')
  const hubContribute = flag(env, 'HUB_CONTRIBUTE', false)
  if (hubContribute && !hubUrl) throw new Error('HUB_CONTRIBUTE=1 needs HUB_URL and HUB_TOKEN')
  const tracyUrl = opt(env, 'TRACY_URL') ?? DEFAULT_TRACY_URL
  const tracyApiUrl = opt(env, 'TRACY_API_URL') ?? (opt(env, 'TRACY_URL') ? undefined : DEFAULT_TRACY_API_URL)
  for (const [name, value] of [
    ['TRACY_URL', tracyUrl],
    ['TRACY_API_URL', tracyApiUrl]
  ])
    if (value && !/^https?:\/\//i.test(value)) throw new Error(`${name} must be an http(s) address`)
  if (!operatorToken && !LOOPBACK_BIND.has(bind))
    throw new Error(`BIND_ADDRESS=${bind} needs OPERATOR_TOKEN: without one only localhost may connect`)
  return {
    databaseUrl,
    port,
    bind,
    operatorEmail: opt(env, 'OPERATOR_EMAIL') ?? 'operator@localhost',
    // Signs outreach drafts; blank leaves them unsigned.
    operatorName: opt(env, 'OPERATOR_NAME') ?? '',
    operatorToken,
    trustProxy: flag(env, 'TRUST_PROXY', false),
    // The schema is applied by someone else (no migrator runs at start).
    skipMigrations: flag(env, 'SKIP_MIGRATIONS', false),
    dataDir: resolve(opt(env, 'DATA_DIR') ?? 'data'),
    uiDir: opt(env, 'UI_DIR') ? resolve(opt(env, 'UI_DIR')) : existsSync(PACKAGE_UI) ? PACKAGE_UI : null,
    origin: (opt(env, 'PUBLIC_ORIGIN') ?? `http://localhost:${port}`).replace(/\/+$/, ''),
    // Opens keys sealed in `wo_ops_setting`; this server seals none, so keys come from the environment.
    sessionSecret: opt(env, 'SECRET_KEY'),
    googleApiKey: opt(env, 'GOOGLE_PLACES_API_KEY') ?? opt(env, 'GOOGLE_API_KEY'),
    overpassUrl: overpassUrl ?? null,
    apifyToken: opt(env, 'APIFY_TOKEN'),
    serpapiApiKey: opt(env, 'SERPAPI_API_KEY'),
    litescrapeApiKey: opt(env, 'LITESCRAPE_API_KEY'),
    deepseekApiKey: opt(env, 'DEEPSEEK_API_KEY'),
    firecrawlApiKey: opt(env, 'FIRECRAWL_API_KEY'),
    jinaApiKey: opt(env, 'JINA_API_KEY'),
    rapidapiKey: opt(env, 'RAPIDAPI_KEY'),
    scrapeCreatorsApiKey: opt(env, 'SCRAPECREATORS_API_KEY'),
    monidApiKey: opt(env, 'MONID_API_KEY'),
    woSocialRole: 'standalone',
    woSharedResearch: flag(env, 'WO_SHARED_RESEARCH', true),
    // Site checks read a homepage that refused Node again with Chrome's TLS fingerprint (`impit`); off by default.
    woSiteReadTls: flag(env, 'WO_SITE_READ_TLS', false),
    // Serve a shared research hub under /hub/v1 (off by default).
    hubServe: flag(env, 'HUB_SERVE', false),
    // Read a shared research hub before paying for a place; none by default.
    hubUrl: hubUrl ? hubUrl.replace(/\/+$/, '') : null,
    hubToken,
    // Offer what local research read from Google to that hub; off by default.
    hubContribute,
    // The Tracy the `tracy` builder connects to (device flow, `/oauth/*`) and its API (`/v1`), when that is elsewhere.
    tracyUrl: tracyUrl.replace(/\/+$/, ''),
    tracyApiUrl: tracyApiUrl ? tracyApiUrl.replace(/\/+$/, '') : null
  }
}
