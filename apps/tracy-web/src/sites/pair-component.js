/**
 * Connecting a site's CONTENT DOOR — the one call `tracy_site` needs before it can read or write a
 * single record, and the reason it lives here rather than in a route.
 *
 * 🔒 IT NEEDS NO VIEWER, AND BELIEVING OTHERWISE COST EVERY UNWATCHED BUILD ITS DOOR. This ran only
 * inside `GET /api/sites/:key/jobs/:id`, on the stated grounds that pairing is minted out of the
 * polling viewer's grant. Read what it actually does: one signed host call for the token
 * (`/agent-token`, this deployment's own secret), one call to the site's own door with that token.
 * The viewer's email reaches exactly one line — `created_by` on the custody row, an audit string no
 * code ever reads back. So a build that finished with the tab closed got no door at all.
 *
 * Measured 21/09/2026 on the local stand: three sites built from design inspirations, `site_component`
 * empty for all three. On `site-kutise` — quickstart `tracy-business/j6` — that is a site whose own
 * `templates/tracy_business/AGENTS.md` rule 3 says content is read and written through this door and
 * NOWHERE else ("no `docker exec … mariadb`, no `UPDATE`, no ad-hoc PHP"), while `refusalNext` for
 * `COMPONENT_NOT_REGISTERED` sends the agent to edit files instead — which rule 4 forbids in turn.
 * A closed tab boxed the agent between a door that was never opened and two roads its own site
 * documentation bars.
 *
 * `createdBy` is who to record, not who authorises: an email from the poll door, the sweep's own
 * name from `cron.js`.
 *
 * `buildIsDone`: the caller knows the build has finished pairing (the host's job reached its last step, the site
 * folder; "Apply" in the Add site popup starts writing there), so the check that refuses to mint a token while the
 * build still owns the pairing is skipped. The token is then READ BACK, never minted: the build collected it earlier.
 */
import { siteTarget } from './resolver.js'
import {
  currentComponent,
  currentContentDoor,
  latestProvisionJob,
  updateJob,
  writeComponent
} from './store.js'

/**
 * Where each platform's Cowork component answers, relative to the site's own address — the same two
 * doors `bar/route.js`'s `isComponentApiExec` lets through. WordPress registers its handler on
 * admin-ajax's `nopriv` hook, so the token in the body is the whole credential there as well
 * (`tracy-add-site/src/host/wordpress.ts`, `apiEndpoint`). Both answer `core.manifest` with
 * `{ok: true, manifest: {platform}}`, and provision writes both tokens to `tracy-agent.token`
 * (`provision/platform/joomla.sh`, `provision/platform/wordpress.sh`).
 */
export const COMPONENT_DOORS = Object.freeze({
  joomla: Object.freeze({
    name: 'Joomla',
    path: 'index.php?option=com_claudecowork&task=api.exec&format=json'
  }),
  wordpress: Object.freeze({ name: 'WordPress', path: 'wp-admin/admin-ajax.php?action=claude_cowork' })
})

/**
 * What the host refused the token with, as a sentence the person reading `custodyDetail` can act
 * on. `{platform}` is the door's own name (`COMPONENT_DOORS`).
 *
 * `POST /_host/agent-token` MINTS now (`apps/tracy-host/src/app.js`), so a refusal has become an
 * answer worth reading: four states stand between a site and its content door, and each one is a
 * different repair. They all used to arrive as "the provisioned component token is unavailable",
 * which is true of every one of them and tells the person nothing — a site that is simply switched
 * off read exactly like a site that never had the component installed. That sentence is still the
 * fallback, for a host that answered something this map has never heard of.
 *
 * The sentence is written HERE and the host's own `detail` is deliberately not forwarded: that
 * field names fleet filesystem paths (`/srv/tracy/<label>/.env`), which belong in a host log and
 * not in a customer's browser.
 */
export const PAIRING_REFUSALS = Object.freeze({
  SITE_UNKNOWN: 'its host has no record of this site',
  NOT_JOOMLA: 'a {platform} site cannot have its component token minted after the site was built',
  SITE_DOWN: 'the site is not running, so its component token could not be read',
  COMPONENT_NOT_INSTALLED: 'the {platform} component is not installed on this site'
})

/**
 * Pair a freshly provisioned Joomla or WordPress site through the signed host channel. The token
 * never travels through the browser or the agent. Imported sites retain their registered endpoint.
 *
 * `/agent-token` mints the token when provision never collected one, so this is also the repair
 * for a site built before that collection existed — and when it refuses, `PAIRING_REFUSALS`
 * turns the host's code into the one sentence that says which repair this site needs.
 */
export async function pairComponent({ pool, config, host, fetchImpl, site, createdBy, buildIsDone = false }) {
  const door = COMPONENT_DOORS[site.platform]
  if (!door || site.origin !== 'fleet_born')
    return {
      custody: 'skipped',
      custodyDetail: 'automatic pairing is available for new Joomla and WordPress sites'
    }
  if (await currentComponent(pool, site.site_key)) return { custody: 'registered' }
  if (site.host !== config.hostName)
    return { custody: 'unavailable', custodyDetail: `remote ${door.name} pairing is not configured` }
  if (!buildIsDone && (await stillProvisioning({ pool, config, host, fetchImpl, siteKey: site.site_key })))
    return {
      custody: 'provisioning',
      custodyDetail: 'the site is still being built; its content door is connected when the build finishes'
    }
  const answer = await host.hostCall(config, site.host, '/agent-token', { label: site.label }, { fetchImpl })
  const token = answer.body?.token
  if (!answer.ok || typeof token !== 'string' || token.length < 16) {
    // `Object.hasOwn`, not a bare lookup: the code comes off the wire, and `constructor` or
    // `toString` would otherwise read as a hit and hand a function to `.replaceAll`.
    const code = answer.body?.code
    const refusal =
      typeof code === 'string' && Object.hasOwn(PAIRING_REFUSALS, code) ? PAIRING_REFUSALS[code] : null
    return {
      custody: 'unavailable',
      custodyDetail: refusal
        ? refusal.replaceAll('{platform}', door.name)
        : 'the provisioned component token is unavailable'
    }
  }
  const endpoint = new URL(door.path, siteTarget(site, config)).href
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, action: 'core.manifest', params: {} }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    const body = await response.json()
    if (!response.ok || body?.ok !== true || body.manifest?.platform !== site.platform)
      return {
        custody: 'unavailable',
        custodyDetail: `the ${door.name} component did not verify its token`
      }
    await writeComponent(pool, site.site_key, { endpoint, token }, createdBy)
    return { custody: 'registered' }
  } catch {
    return { custody: 'unavailable', custodyDetail: `the ${door.name} component could not be reached` }
  }
}

/**
 * An EmDash site's Content API door: its own `/content.json`, read with the site's read-only relay
 * PAT (scope `content:read`, generated by provision, handed over by `/_host/content-token`).
 * EmDash has no Tracy component, so this door serves `content.read` and nothing else; every other
 * Apply action on an EmDash site is refused exactly as before.
 *
 * The token stays server-side: it is kept as a `door: 'content-api'` custody row (so
 * `currentComponent` never takes it for a write door) and sent only as the Bearer of the relay's
 * own request. Returns `{endpoint, token}` or null when the site has no reader — an image built
 * without it, a host that is not this one, or a host that cannot answer.
 */
export async function emdashContentDoor({ pool, config, host, fetchImpl, site, createdBy }) {
  if (site.platform !== 'emdash' || site.origin !== 'fleet_born') return null
  const held = await currentContentDoor(pool, site.site_key)
  if (held?.config?.endpoint && held?.config?.token) return held.config
  if (site.host !== config.hostName) return null
  const answer = await host.hostCall(
    config,
    site.host,
    '/content-token',
    { label: site.label },
    { fetchImpl }
  )
  const token = answer.body?.token
  if (!answer.ok || typeof token !== 'string' || !/^ec_pat_[A-Za-z0-9_-]{16,}$/.test(token)) return null
  const door = {
    door: 'content-api',
    endpoint: new URL('content.json', siteTarget(site, config)).href,
    token
  }
  await writeComponent(pool, site.site_key, door, createdBy)
  return door
}

/**
 * 🔒 NEVER MINT WHILE THE BUILD STILL OWNS THE PAIRING. A provision pairs the component itself, near
 * its end, and takes the verify-only road when a token already exists. `/agent-token` mints one when
 * none was collected — so any door that repairs a missing pairing DURING the build (the Apply door
 * on an agent's first `tracy_site` call, `POST /api/sites/:key/agent`) hands the build a token of
 * the old shape it then refuses. Measured 25/09/2026 on the dev machine, site `capij1400`
 * (quickstart `tracy-business/j6`): a `content.read` through the relay at 10:02:15 minted a 40-hex
 * token, the build's own pairing at 10:02:26 found it and died on "Cowork pairing is missing", and
 * the webroot fell back to the previous component. A customer who chats before the build finishes
 * hits the same race.
 *
 * The row alone is not trusted to say "running": nobody may have polled it since the build ended,
 * so a row that is not settled is asked of its host once. A host that cannot answer does not block
 * the repair — that is exactly the site the repair exists for.
 */
async function stillProvisioning({ pool, config, host, fetchImpl, siteKey }) {
  const job = await latestProvisionJob(pool, siteKey)
  if (!job || job.state === 'done' || job.state === 'failed') return false
  const polled = await host.hostJob(config, job.host, job.id, { fetchImpl })
  const state = polled.ok ? polled.body?.state : undefined
  if (typeof state !== 'string') return false
  await updateJob(pool, job.id, { state, step: polled.body?.step, detail: polled.body })
  return state !== 'done' && state !== 'failed'
}
