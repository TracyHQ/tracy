/**
 * Preparing ONE stock instance: the site row, the inventory row, and the host's `/provision`.
 *
 * 🔒 THIS ROAD IS THE CUSTOMER'S, NOT THE DEMO'S, AND THE DIFFERENCE IS THE WHOLE POINT. The
 * obvious reuse is `lib/demo-sites.js`'s `provisionDemo`, and it is the wrong one: a demo carries
 * `frameAncestors` (a clickjacking surface a customer's site must never become), `demo = true` on
 * its row, `badge`, and a lifecycle that takes it public by itself (`advanceDemo` → `/go-live`)
 * and may tear it down and rebuild it (`sweepDemos`). Stock is a site a customer will be handed:
 * it is built exactly the way `sites/route.js`'s create door builds one (:1166), minus the parts
 * that need a person — no design plan, no GitHub repo, no seat.
 *
 * 🔒 AND IT IS OWNED BY NOBODY, ON PURPOSE. `createSite` is called with `createdBy: null` and
 * `claimOwnership` is NOT called, so no seat row exists for this site. That is not a gap to be
 * filled at activation time only — it is what keeps stock out of a customer's sight, because
 * `/api/sites` and My Sites answer from the seat book. A stock row with a seat would be listed to
 * whoever holds it; a stock row with none cannot be returned by any query a viewer can reach.
 * `026-site-inventory.sql` states the same invariant from the schema's side.
 *
 * 🔒 `sites` AND `doors` ARE PASSED IN AND HAVE NO DEFAULT, AND THAT IS A RULE, NOT A TASTE.
 * `test/module-graph.test.mjs` forbids one domain directory under `src/` from importing another:
 * `inventory/` may reach `lib/` and `db/` and nothing else. The site row lives in `sites/store.js`
 * and the content-door paths in `sites/pair-component.js`, so both arrive as parameters from the
 * composition root (`cron.js`/`server.js`, which are top-level and exempt) — the same way
 * `sitesRoutes` already receives `seats`, `host` and `workspaces`. There is deliberately no lazy
 * `import()` fallback either: that would pass the gate's regex while breaking the rule it encodes,
 * which is worse than either honest option. A caller that forgets is refused by name, at once.
 *
 * ⚠ THE OTHER SEAMS — `store`, `probe`, `labelOf`, `verifierVersion` — do have lazy defaults, for a
 * different reason: `inventory/store.js` and `lib/inventory-pool-key.js` are written by a parallel
 * branch, and a lazy default lets this file and its tests exist before they do. They are wiring and
 * test seams, not a runtime strategy switch.
 */
import { bornLabel } from '../lib/born-label.js'
import { bornSiteAddress } from '../lib/site-address.js'
import { relaySenderFor } from '../lib/site-relay-sender.js'

/**
 * What a caller that forgot to wire a domain module gets: a named refusal on the first use, not an
 * `undefined is not a function` three frames deeper.
 */
function required(name, what) {
  throw new TypeError(`inventory/prepare.js: ${name} must be injected by the composition root (${what})`)
}

let inventoryStore = null
async function defaultStore() {
  inventoryStore ??= await import('./store.js')
  return inventoryStore
}

let poolKeyLib = null
async function defaultVerifierVersion() {
  poolKeyLib ??= await import('../lib/inventory-pool-key.js')
  return poolKeyLib.VERIFIER_VERSION
}

/**
 * The name a stock instance is filed under, decided BEFORE the host is called and never changed
 * afterwards (§3). `inv-` says what it is to anyone reading the fleet's directory listing, the CMS
 * short name says which CMS it holds (`inv-j-35m9pa`, 22/09), and the random tail is what keeps
 * two concurrent prepares of the same pool from colliding on one folder. The table is `bornLabel`'s,
 * shared with the claim door. The prefix is the deployment's own (`config.siteAddressPrefix`), the
 * same one the create door applies, so a stock label is legal wherever a customer's is.
 * @param {{siteAddressPrefix?: string}} config
 * @param {string} platform
 * @param {() => number} [random]
 */
export function stockLabel(config, platform, random = Math.random) {
  return `${config.siteAddressPrefix ?? ''}${bornLabel(platform, { stock: true, random })}`
}

/**
 * Prepare one instance for `poolKey`: write the site row and the inventory row, then ask the host
 * to install.
 *
 * 🔒 THE HOST CALL IS MADE AFTER THE WRITES ARE COMMITTED, NEVER INSIDE THEM. A provision takes
 * minutes; a transaction (or an advisory lock) held across it is a lock held across the network,
 * which is how one slow refill stops every other writer of these tables. So: one short transaction
 * that reserves the identity, commit, and only then the call. The reverse order has a worse failure
 * too — a host that installed while the transaction rolled back leaves a site nothing knows about.
 *
 * @param {object} input
 * @param {import('pg').Pool} input.pool
 * @param {{siteDomain: string, origin: string, siteAddressPrefix?: string}} input.config
 * @param {{hostCall: Function}} input.host
 * @param {typeof fetch} [input.fetchImpl]
 * @param {string} input.poolKey
 * @param {object} input.install - `resolveInstall()`'s entry for this release.
 * @param {{tag: string, platform: string}} input.release
 * @param {string|null} [input.releasesToken]
 * @param {{createSite: Function, putJob: Function, siteByKey: Function}} input.sites - REQUIRED,
 *   injected: see the module comment on the module-graph rule.
 * @param {() => string} [input.labelOf] - seam; defaults to `stockLabel`.
 * @param {string} [input.instanceId] - retry an instance that already exists instead of making one.
 * @param {string|null} [input.ownerEmail] - see the note below; omitted by default.
 * @returns {Promise<{ok: true, instanceId: string, jobId: string} | {ok: false, code: string, detail?: any}>}
 */
export async function prepareInstance({
  pool,
  config,
  host,
  fetchImpl = fetch,
  poolKey,
  install,
  release,
  releasesToken = null,
  labelOf,
  instanceId = null,
  ownerEmail = null,
  // Seams — see the module comment.
  sites,
  store,
  random = Math.random
}) {
  const sitesApi = sites ?? required('sites', 'createSite, putJob from sites/store.js')
  const storeApi = store ?? (await defaultStore())

  const poolRow = await storeApi.readPool(pool, poolKey)
  if (!poolRow) return { ok: false, code: 'UNKNOWN_POOL', detail: poolKey }

  const platform = release?.platform ?? install?.platform ?? poolRow.platform
  const hostName = poolRow.host

  let instance = instanceId ? await storeApi.instanceById(pool, instanceId) : null
  if (instanceId && !instance) return { ok: false, code: 'UNKNOWN_INSTANCE', detail: instanceId }

  let label = instance?.label ?? null
  let siteKey = instance?.site_key ?? null

  if (!instance) {
    label = (labelOf ?? (() => stockLabel(config, platform, random)))()
    siteKey = `${label}.${config.siteDomain}`
    // One transaction, two rows, then out. Both or neither: an inventory row pointing at a site row
    // that does not exist fails its own foreign key, and a site row with no inventory row is a
    // folder on the fleet nothing will ever reclaim.
    const client = await pool.connect()
    try {
      await client.query('begin')
      const row = await sitesApi.createSite(client, {
        siteKey,
        label,
        host: hostName,
        platform,
        // `fleet_born`, not a new word: this site IS born on the fleet, and `pairComponent` refuses
        // to connect the content door of a site whose origin says anything else — a stock instance
        // that could never be paired is a stock instance no agent can edit after handover.
        origin: 'fleet_born',
        // 🔒 NOBODY OWNS IT YET, AND THAT IS THE FACT BEING RECORDED. See the module comment.
        createdBy: null,
        quickstartTag: release?.tag ?? null,
        quickstartVersion: install?.version ?? null,
        quickstartSha256:
          Object.values(install ?? {}).find((p) => p && typeof p === 'object' && p.sha256)?.sha256 ?? null
      })
      if (!row) {
        await client.query('rollback')
        return { ok: false, code: 'LABEL_TAKEN', detail: siteKey }
      }
      instance = await storeApi.insertInstance(client, {
        poolKey,
        siteKey,
        label,
        host: hostName,
        generation: poolRow.generation
      })
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      return { ok: false, code: 'CLAIM_FAILED', detail: String(error?.message ?? error) }
    } finally {
      client.release()
    }
  }

  // The attempt number this call is, read off the row rather than counted by the caller: a retry
  // that resumed after a crash must not reuse the attempt number the host already has a job for.
  const attempt = (instance.attempts ?? 0) + 1
  // 🔒 `inv:` AND NOT `demo:`. tracy-host collapses two calls carrying the same `jobKey` into one
  // job (`keyedJobId`), which is exactly right within one lifecycle and catastrophic across two:
  // a stock prepare and a demo redeploy of the same label and version would otherwise be handed
  // each other's job, and each would then report the other's ending.
  const jobKey = `inv:${label}:${install?.version ?? 'none'}:${attempt}`

  await storeApi.setInstanceState(pool, instance.id, { state: 'preparing', bumpAttempt: true })

  const mailSender = relaySenderFor(label, config.siteMail)
  const instruction = {
    site: siteKey,
    siteKey,
    // Both flags, for the reason `sites/route.js:1154` measured: with neither, `provision.sh` falls
    // back to a literal `.tracy.ai` address and the CMS writes a hostname this site does not answer at.
    liveSite: bornSiteAddress(label, config),
    label,
    platform,
    fresh: true,
    ...(release?.tag ? { quickstart: release.tag } : {}),
    ...(install ? { quickstartEntry: install } : {}),
    ...(releasesToken ? { releasesToken } : {}),
    // A sealed card refuses to bind without its floor as a flag, even though the entry carries it
    // (`demo-sites.js` has the measurement; the create door threads it the same way).
    ...(install?.coworkMinVersion ? { coworkMinVersion: install.coworkMinVersion } : {}),
    // ⚠ OPEN POINT, deliberately not invented here: a customer's provision names the buyer, and
    // stock has no buyer yet. Passed only when the caller states one, so that nothing in this file
    // silently installs a site under an operator's identity that activation would then have to
    // undo. See the branch report.
    ...(ownerEmail ? { ownerEmail } : {}),
    // A sender without a buyer: the site's own relay address, so EmDash's mail step does not refuse
    // a site with no fromEmail (#827, `inv-ed-v5m9wz`). Never an owner: see `lib/site-relay-sender.js`.
    ...(mailSender ? { mailSender } : {}),
    jobKey
  }

  const answer = await host.hostCall(config, hostName, '/provision', instruction, { fetchImpl })
  if (!answer.ok || typeof answer.body?.jobId !== 'string') {
    // Back to `queued` rather than quarantined: one refusal is what the backoff in `reconcile.js`
    // exists for, and only running out of attempts is a verdict about the instance.
    await storeApi.setInstanceState(pool, instance.id, {
      state: 'queued',
      lastError: `host refused /provision (${String(answer.status)})`
    })
    return { ok: false, code: 'HOST_REFUSED', detail: { status: answer.status, body: answer.body } }
  }

  await sitesApi.putJob(pool, { id: answer.body.jobId, siteKey, host: hostName, kind: 'provision' })
  await storeApi.setInstanceState(pool, instance.id, { state: 'preparing', jobId: answer.body.jobId })
  return { ok: true, instanceId: instance.id, jobId: answer.body.jobId }
}

/**
 * Ask ONE instance what it is, on the instance itself.
 *
 * 🔒 A JOB THAT ENDED `done` IS NOT A HEALTHY SITE, AND READING THE JOB INSTEAD OF THE SITE IS THE
 * FAILURE THIS FUNCTION EXISTS TO PREVENT. `job.state` says the script exited 0 on the host; it
 * says nothing about whether the CMS boots, whether the Claude Cowork plugin that was installed is the one the
 * release named, or whether anything has happened to the instance in the hours since. So the check
 * is a round trip THROUGH the instance's own content door: mint its token (`/agent-token`, this
 * deployment's own signature), then `core.manifest` against the site — the same pair
 * `pairComponent` makes, which is the narrowest call that proves the CMS is up and its Cowork
 * component is installed and answering.
 *
 * What is written to `hashes` is what came BACK, never what the release promised: platform,
 * platform version, and the installed Claude Cowork plugin's version read off the manifest's extension list.
 *
 * ⚠ NOT YET CONNECTED, AND SAID OUT LOUD RATHER THAN FAKED: `core.manifest` is the only read-back
 * this deployment has. It carries no artifact checksum and no contract-binding hash, so
 * `hashes.contract` below is the contract the ENTRY named, not one read off the instance, and it is
 * labelled `declared` in the record for exactly that reason. A door that reports the bound contract
 * has to exist on the Claude Cowork plugin before that field can mean what §3 wants it to mean.
 *
 * @returns {Promise<{ok: boolean, healthOk: boolean, hashes: object, detail: string|null}>}
 */
export async function verifyInstance({
  pool,
  config,
  host,
  fetchImpl = fetch,
  instanceId,
  install = null,
  // Injected, no default — see the module comment. `sites` is `{siteByKey}`; `doors` is
  // `COMPONENT_DOORS` from `sites/pair-component.js`, passed rather than copied so the content-door
  // paths have one definition and not a second to keep in step with the provisioner.
  sites,
  doors = null,
  // Seams with defaults. `probe` is how a test avoids dialling a site.
  store,
  probe,
  verifierVersion
}) {
  const storeApi = store ?? (await defaultStore())
  const sitesApi = sites ?? required('sites', 'siteByKey from sites/store.js')
  const instance = await storeApi.instanceById(pool, instanceId)
  if (!instance) return { ok: false, healthOk: false, hashes: {}, detail: 'unknown instance' }
  const site = await sitesApi.siteByKey(pool, instance.site_key)
  if (!site) return { ok: false, healthOk: false, hashes: {}, detail: 'the site row is gone' }

  const read = probe ?? manifestProbe
  const seen = await read({ config, host, fetchImpl, site, instance, doors })
  if (!seen.ok) {
    // Carried out so the caller can tell a gap in what this deployment can verify from a site
    // that did not answer this minute.
    if (seen.code === 'NO_DOOR_FOR_PLATFORM' || seen.code === 'NO_DOORS_INJECTED') {
      await storeApi.setInstanceState(pool, instance.id, {
        healthOk: false,
        healthDetail: { reason: seen.detail },
        lastError: seen.detail
      })
      return {
        ok: true,
        healthOk: false,
        verifiable: false,
        code: seen.code,
        hashes: {},
        detail: seen.detail
      }
    }
    await storeApi.setInstanceState(pool, instance.id, {
      healthOk: false,
      healthDetail: { reason: seen.detail ?? 'unreachable' },
      lastError: seen.detail ?? 'the instance did not answer'
    })
    return { ok: true, healthOk: false, hashes: {}, detail: seen.detail ?? 'the instance did not answer' }
  }

  const manifest = seen.manifest ?? {}
  const cowork = Array.isArray(manifest.extensions)
    ? (manifest.extensions.find((e) => /claudecowork|cowork/i.test(String(e?.element ?? e?.name ?? '')))
        ?.version ?? null)
    : null
  const hashes = {
    platform: manifest.platform ?? null,
    platformVersion: manifest.platformVersion ?? null,
    // The version of whatever answered the read-back: the Cowork component on Joomla and
    // WordPress, EmDash's own MCP server on EmDash. One field because it answers one question —
    // "which door version verified this instance" — and it is the door, not the CMS.
    cowork: cowork ?? manifest.door ?? null,
    // `declared`, not read — see the ⚠ above.
    contractDeclared: install?.contract ?? null,
    verifierVersion: verifierVersion ?? (await defaultVerifierVersion())
  }
  const healthOk = manifest.platform === site.platform
  await storeApi.setInstanceState(pool, instance.id, {
    healthOk,
    healthDetail: {
      manifest: { platform: manifest.platform ?? null, platformVersion: manifest.platformVersion ?? null }
    },
    hashes,
    ...(healthOk ? {} : { lastError: 'the component did not report this platform' })
  })
  return {
    ok: true,
    healthOk,
    hashes,
    detail: healthOk ? null : 'the component did not report this platform'
  }
}

/**
 * EmDash's own read-back: one MCP `initialize` against the site's API.
 *
 * 🔒 THE SAME THREE FACTS `core.manifest` PROVES, ASKED THE WAY EMDASH ANSWERS. `initialize` is a
 * handshake — it reads nothing and writes nothing — and its `serverInfo` says both that the site
 * is up and that it IS EmDash. Measured 22/09 against a real instance:
 *
 *   {"result":{"protocolVersion":"2024-11-05","capabilities":{…},
 *              "serverInfo":{"name":"emdash","version":"0.1.0"}},"jsonrpc":"2.0","id":1}
 *
 * ⚠ THE ANSWER ARRIVES AS AN EVENT STREAM, NOT AS JSON. EmDash's endpoint replies
 * `event: message\ndata: {…}` because `accept` names `text/event-stream` — and it MUST name it:
 * asking for `application/json` alone makes 0.37 answer **406**. So the body is unwrapped here
 * rather than handed to `JSON.parse`, which would call a correct answer malformed.
 *
 * The URL and the header set are restated from `@tracy/site-tools`'s `host/emdash.mjs` (`mcpUrl`,
 * `mcpHeaders`) rather than imported: `apps/` does not depend on that package. They are copied as
 * they are, including `X-EmDash-Request` — EmDash's own CSRF marker, required on its admin
 * surface — so a door that works there works here.
 */
async function emdashProbe({ config, host, fetchImpl, site }) {
  const minted = await host.hostCall(config, site.host, '/agent-token', { label: site.label }, { fetchImpl })
  const token = minted.body?.token
  // `ec_pat_…` is the shape provision writes; a truncated file becomes a 401 that reads like a
  // permission problem rather than a broken token (`site-tools`' `isAgentToken` says the same).
  if (!minted.ok || typeof token !== 'string')
    return { ok: false, detail: `the host would not mint an EmDash token (${String(minted.status)})` }
  // 🔒 A BROKEN TOKEN IS NOT A REFUSING HOST, and the sentence has to say which. The host answering
  // 200 with a truncated file is a different fault from the host saying no, and reporting both as
  // "would not mint (200)" sends whoever reads it to the wrong machine.
  if (!token.trim().startsWith('ec_pat_'))
    return { ok: false, detail: 'the token the host holds is not the shape provision writes' }
  const endpoint = new URL('_emdash/api/mcp', bornSiteAddress(site.label, config)).href
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.trim()}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'X-EmDash-Request': '1'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'tracy-inventory-verify', version: '1' }
        }
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) return { ok: false, detail: `the site answered HTTP ${response.status}` }
    const body = await response.text()
    const line = body.split('\n').find((l) => l.startsWith('data:'))
    const parsed = JSON.parse(line ? line.slice('data:'.length).trim() : body)
    const server = parsed?.result?.serverInfo
    if (!server?.name) return { ok: false, detail: 'the site did not answer with an MCP handshake' }
    // Reported as a manifest so one shape reaches `verifyInstance`, and named honestly: `version`
    // here is the MCP server's, not the CMS's, so it lands under the door rather than under the
    // platform. Claiming it as `platformVersion` would put a number in a field that means
    // something else on every other platform.
    return { ok: true, manifest: { platform: server.name, platformVersion: null, door: server.version } }
  } catch {
    return { ok: false, detail: 'the instance could not be reached' }
  }
}

/**
 * The default read-back: `/agent-token` on the signed host channel, then one `core.manifest` POST
 * to the site's own door. Never throws — a site that is down and a site that answers something
 * unparsable both come back as `{ok: false}` with a sentence.
 */
async function manifestProbe({ config, host, fetchImpl, site, doors }) {
  // 🔒 EMDASH HAS NO COWORK COMPONENT, AND THAT IS NOT AN OVERSIGHT TO PATCH WITH A FAKE DOOR.
  // Joomla and WordPress get a component Tracy builds and installs, answering
  // `{token, action, params}` at one path — `COMPONENT_DOORS` is the list of those. EmDash ships
  // a first-class API of its own (`/_emdash/api/mcp`, MCP over HTTP, a `ec_pat_` bearer) and
  // never needed one. So adding an `emdash` row to `COMPONENT_DOORS` would name a component that
  // does not exist; the right move is to read EmDash back the way EmDash answers.
  if (site.platform === 'emdash') return emdashProbe({ config, host, fetchImpl, site })

  const door = doors?.[site.platform] ?? null
  if (!door)
    return {
      ok: false,
      // 🔒 STRUCTURAL, NOT TRANSIENT — and the difference decides whether retrying is sane. A
      // platform with no way to read a manifest back cannot be verified however long we wait, so
      // this says so in a way the caller can act on rather than looking like a site that happened
      // to be down. (EmDash is handled above; this covers a platform nobody has taught us yet.)
      code: doors ? 'NO_DOOR_FOR_PLATFORM' : 'NO_DOORS_INJECTED',
      detail: doors
        ? `no content door is defined for ${String(site.platform)}`
        : 'no content doors were injected (pass COMPONENT_DOORS from the composition root)'
    }
  const minted = await host.hostCall(config, site.host, '/agent-token', { label: site.label }, { fetchImpl })
  const token = minted.body?.token
  if (!minted.ok || typeof token !== 'string' || token.length < 16)
    return { ok: false, detail: `the host would not mint a component token (${String(minted.status)})` }
  // The site's own address, from the one function all three doors share (`lib/site-address.js`) —
  // the alternative is `sites/resolver.js`'s `siteTarget`, which this domain may not import.
  const endpoint = new URL(door.path, bornSiteAddress(site.label, config)).href
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, action: 'core.manifest', params: {} }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000)
    })
    const body = await response.json()
    if (!response.ok || body?.ok !== true) return { ok: false, detail: 'the component refused its own token' }
    return { ok: true, manifest: body.manifest ?? {} }
  } catch {
    return { ok: false, detail: 'the instance could not be reached' }
  }
}
