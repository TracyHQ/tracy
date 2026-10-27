// Stand-local twin of tests/e2e-dev/lib/env.mjs: the same names, the same shapes, a different
// place. Substituted by the resolve hook (hooks.mjs); the journeys import it as "./env.mjs".
// Everything comes from the transport file (QA_FLOWS_TRANSPORT): origin, site domain, container
// names of the tchqa project, the folder the legacy runner writes into.

import { poolLabel } from '../pool.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const cfg = JSON.parse(readTextSync(process.env.QA_FLOWS_TRANSPORT))
const origin = new URL(cfg.origin)

/** One profile: the owned stand. It adds no address prefix and mints its accounts per run. */
export const PROFILES = Object.freeze({
  local: Object.freeze({
    origin: cfg.origin,
    apiOrigin: cfg.apiOrigin ?? cfg.origin,
    ssh: 'local-stand',
    sitePrefix: '',
    results: 'qa-flows',
    accounts: 'per-run'
  })
})

export const ENV = Object.freeze({
  name: 'local',
  origin: cfg.origin,
  apiOrigin: PROFILES.local.apiOrigin,
  sitePrefix: PROFILES.local.sitePrefix,
  accounts: PROFILES.local.accounts,
  siteDomain: cfg.siteDomain,
  sessionCookie: 'tracy_sess',
  cookieDomain: cfg.siteDomain,
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 tracy-qa-flows',
  // Kept so a journey that reads it still finds the shape; nothing here is ever dialled.
  ssh: Object.freeze({ target: 'local-stand', connectTimeoutS: 1 }),
  containers: Object.freeze({ ...cfg.containers }),
  db: Object.freeze({ user: 'tracy', name: 'tracy' }),
  checkServer: '/opt/tracy-fleet/stack/check-server.sh',
  webSessionModule: '/opt/tracy-web/src/lib/session.js',
  dshPlugins: Object.freeze({
    'dsh-better-sidebar': '/desk-home/profiles/native/node_modules/dsh-better-sidebar/package.json'
  }),
  resultsRoot: cfg.resultsRoot,
  emailDomain: 'example.test',
  builds: Object.freeze({
    wordpress: Object.freeze({ design: 'ja-impact' }),
    joomla: Object.freeze({ design: 'ja-essence' }),
    emdash: Object.freeze({ design: 'tracy-business' })
  }),
  readyBudgetMs: Object.freeze({ wordpress: 100_000, joomla: 165_000, emdash: 150_000 }),
  readyCapMs: 15 * 60_000,
  jobPollMs: 3_000
})

export const CMS = Object.freeze({ w: 'wordpress', j: 'joomla', e: 'emdash' })

/** The address label the server builds from a typed label: the stand sets no prefix. */
export function addressLabel(typed) {
  return `${ENV.sitePrefix}${typed}`
}

const sitePort = origin.port ? `:${origin.port}` : ''
/** `http://<label>.<siteDomain>:<port>` — the stand publishes every site on the web port. */
export function siteOrigin(label) {
  return `${origin.protocol}//${label}.${ENV.siteDomain}${sitePort}`
}
export function siteKeyOf(label) {
  return `${label}.${ENV.siteDomain}`
}
export function runEmail(runId, role) {
  return `e2e-${runId}-${role}@${ENV.emailDomain}`
}
/** A run's site label is a slot of the owned pool (`tchqa-<suffix>`); a suffix outside it throws. */
export function runLabel(_runId, suffix) {
  return poolLabel(suffix)
}
export const RUN_ID = /^[a-z0-9]{4,16}$/
