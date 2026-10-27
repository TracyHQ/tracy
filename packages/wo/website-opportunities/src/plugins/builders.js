/**
 * Builders: what turns an opportunity's research into a website, somewhere else. The open router takes one builder
 * (`deps.builder` of `createWebsiteOpportunitiesRouter`); without one nothing builds and the demo fields are left out.
 * A builder is an object with exactly the members the router calls:
 *
 *   id                                         kebab-case
 *   routes(app, ctx)                           mounts the builder's own doors on the router's Hono app, before `/:id`;
 *                                              `ctx` = the router's helpers: caller, refuse, notFound, featureOn,
 *                                              featureOff, domainOr, domainDeps, runtime, body, candidateFields,
 *                                              urlFields, jobShape, startResearch, UUID, REQUEST_ID
 *   settingsOf(domain, accountId)              → object        GET /settings
 *   saveSettings(domain, accountId, sent)      → {status, body} PUT /settings
 *   templateChoicesOf(settings)                → object        `templates` of GET /capabilities
 *   listedDemoOf(accountId, ids)               → Map<id, {latestRevision?, sites?, latestBuild?, demoAction?, demo?}>
 *   detailOf(opp, accountId)                   → {demo?, ...}  the demo half of GET /:id
 *   demoFactsOf(accountId, ids)                → Map<id, {built, liveSiteKey, queuedActionId}>  for Find
 *   demoJourneySql                             null, or (where) → {joins, outreach, demo, attention}: SQL fragments
 *                                              that move a row to the Demo and Outreach stages (`wo-journey.js`)
 *
 * A list of ids may hold ids that are not the account's: answer only for the account's own.
 */
import { loadPluginFiles } from './load.js'

export const BUILDER_METHODS = Object.freeze([
  'routes',
  'settingsOf',
  'saveSettings',
  'templateChoicesOf',
  'listedDemoOf',
  'detailOf',
  'demoFactsOf'
])
const ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** The builder, checked and frozen; a TypeError names the missing member. */
export function defineBuilder(builder) {
  if (!builder || typeof builder !== 'object') throw new TypeError('a builder is an object')
  if (typeof builder.id !== 'string' || !ID.test(builder.id))
    throw new TypeError(`builder id must be kebab-case: ${String(builder.id)}`)
  for (const m of BUILDER_METHODS)
    if (typeof builder[m] !== 'function') throw new TypeError(`builder ${builder.id}: ${m} is missing`)
  const journey = builder.demoJourneySql ?? null
  if (journey !== null && typeof journey !== 'function')
    throw new TypeError(`builder ${builder.id}: demoJourneySql is a function or null`)
  return Object.freeze({ ...builder, demoJourneySql: journey })
}

/**
 * Builder factories from a folder: each file's default export is `(deps) => builder`. Returns
 * `{ [id]: factory }` by file name (`manual.js` → `manual`); the host picks one and calls it with its deps.
 */
export async function loadBuilderFactories(dir) {
  const out = {}
  for (const { file, plugin } of await loadPluginFiles(dir)) {
    if (typeof plugin !== 'function')
      throw new TypeError(`builder file ${file}: the default export is a factory (deps) => builder`)
    out[file.replace(/^.*[\\/]/, '').replace(/\.m?js$/, '')] = (deps) => defineBuilder(plugin(deps))
  }
  return out
}
