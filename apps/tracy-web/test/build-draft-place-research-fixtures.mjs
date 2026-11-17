// The build chat's research of links through the step chain's own research (#575), as a running server and the step
// chain's executor run it: the app's build draft doors (as the dsh tool calls them), the Website Opportunities domain
// with its network doors faked (`build-draft-gather-fakes.mjs`) and the place executor drained by the test, as the
// shared research tests drain it. Every business, address, link and picture here is invented.
import sharp from 'sharp'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { createTracyWoHost } from '../src/wo-host.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { ACTOR_SECRET, OWNER, actor, kits, needsReading } from './build-draft-engine-fixtures.mjs'
import { connector, fakeDomain, websiteResult } from './build-draft-gather-fakes.mjs'

export { OWNER }
const woHost = createTracyWoHost()
export const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  MCP_TRACY_ACTOR_SECRET: ACTOR_SECRET,
  GOOGLE_API_KEY: 'google-test',
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})

/** A real PNG, so the step chain's media rules store it as a picture. */
export const pngBytes = async (r = 180) =>
  new Uint8Array(
    await sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g: 92, b: 60 } } })
      .png()
      .toBuffer()
  )

/** The object store both the step chain and the draft pictures keep bytes in, in memory. */
export function memoryObjects() {
  const held = new Map()
  return {
    held,
    put: async (key, bytes) => (held.set(key, new Uint8Array(bytes)), true),
    get: async (key) => (held.has(key) ? new Response(held.get(key), { status: 200 }) : null),
    delete: async (key) => held.delete(key),
    publicUrl: async () => null
  }
}

/**
 * The invented bakery's domain: its website read, its Facebook page as `facebook` answers (`failed` by default: the
 * page could not be read), its Google place, and every picture a PNG.
 */
export async function bakeryDomain({ facebook = null, png } = {}) {
  const { domain, calls } = await fakeDomain({
    connectors: {
      website: connector(websiteResult()),
      facebook: connector(
        facebook ?? { source: 'facebook', status: 'failed', reason: 'error', media: [], posts: [] }
      )
    }
  })
  domain.fetchLimited = async (url) => ({
    url,
    status: 200,
    mime: 'image/png',
    bytes: png,
    truncated: false
  })
  return { domain, calls }
}

/** The step chain's place executor over the test's database and domain, drained by the test. */
export function placeExecutor(pool, domain, objects, settings = {}, extra = {}) {
  return createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'google-test', apify: null },
      settings: normalizeWoOpsSettings({
        pageSpeedCheckEnabled: false,
        googlePlacesPhotos: false,
        ...settings
      })
    }),
    objects,
    switchOn: async () => true,
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} },
    providerRetry: { maxWaitMs: 0 },
    ...extra
  })
}

/** Run every claimable place job until none is left. */
export async function drain(ex) {
  for (let i = 0; i < 20; i += 1) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}

/** One running server: the build draft doors as the owner's build chat calls them, with the step chain's research. */
export function server(
  pool,
  { domain, objects, model = club.scriptedModel(JSON.stringify(needsReading())), gatherDoors, appDeps = {} }
) {
  const app = buildApp({
    ...appDeps,
    config,
    pool,
    mail: { send: async () => {} },
    aiQuickstarts: kits,
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesObjects: objects,
    dnsResolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 }),
    buildEngine: {
      buildModel: async () => model,
      buildChatOn: async () => true,
      pictureDoors: { objects },
      ...(gatherDoors ? { gatherDoors } : {})
    }
  })
  async function call(method, path, body, { as = OWNER } = {}) {
    const headers = {
      'x-tracy-actor': actor(as),
      // The build session of the person's current generation: a start over moves it on (`fresh-start.js`).
      'x-tracy-session': await buildSessionIdFor(
        as,
        config.sessionSecret,
        await app.buildChatFresh.generationOf(as)
      )
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${config.origin}/api/build-draft${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
    return { status: res.status, body: await res.json() }
  }
  const accountId = async (email = OWNER) =>
    (await pool.query('select id from account where email = $1', [email])).rows[0]?.id
  /** Read the engine as the tool's poll does, then wait for what that poll started, and read it again. */
  async function poll() {
    const first = await call('GET', '/engine')
    await app.buildDraftEngine.settled(await accountId())
    return { first, later: await call('GET', '/engine') }
  }
  return { app, call, poll, accountId }
}
