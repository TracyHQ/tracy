/**
 * 🔒 A SITE BUILT BEFORE ITS CONTENT READER EXISTED GETS ITS CONTENT IDENTITY ONCE, WHEN tracy-host STARTS.
 *
 * The Content API (`content.read`, and the Comment picker's `content.locate` built on it) answers
 * only on a site its Claude Cowork plugin has been opted into: a content seed for the site and a uid
 * for every row. Provision does that for every WordPress and Joomla site it builds since 25/09/2026
 * (7484e7fee); a site built before it answers every read with CONTENT_ADAPTER_UNSUPPORTED ("Content
 * identity is not set up on this site yet"). Measured 27/09/2026 on the local stand: the picker's
 * locate was always `unchecked` there, and the agent spent a refused call on nearly every Comment
 * turn (13 in 24 bench cases). This pass reaches those sites, on every host, the next time tracy-host
 * is deployed there — the same way `mtimes.js` reaches the webroots an archive left at mtime 0.
 *
 * THE PROVISION'S OWN ROAD, WITH ONE DIFFERENCE: AN EXISTING SITE KEEPS ITS SEED.
 *   - Joomla: `provision/joomla-content-identity.php` down `docker compose exec -T web php` from the
 *     site's own folder, exactly as `platform/joomla.sh` runs it, but never with `TRACY_NEW_SITE`:
 *     `ContentIdentity::install($db, false)` creates a seed only where there is none (INSERT IGNORE).
 *   - WordPress: the plugin's own door, `content.identity {newSite: false}` with the site's token,
 *     as `platform/wordpress.sh` calls it: `ensureIdentity(false)` creates a seed only where there is
 *     none. `newSite: true` is a fork — the provision's alone, for a site it has just restored from an
 *     archive. An existing site's ids are what its readers and cursors already hold.
 * A plugin that predates the reader is skipped, not failed, as at provision: WordPress answers
 * "unknown action", Joomla's script says `none`, `unsupported` (not Joomla 6) or `outdated` (a
 * reader from 0.18.0-rc.1 to rc.6, whose trigger on #__menu blocks every menu write).
 *
 * ONCE PER SITE. `<privateRoot>/<label>/content-identity.done` — the marker both provision roads
 * write — is written once a site is enabled, and a site that holds it is never touched again. A
 * skipped site gets no marker, so a plugin upgraded later is picked up at a later start; a site that
 * failed (stopped, refused, unreachable) is tried again at the next start, and never stops the others.
 *
 * NEVER BESIDE A PROVISION OF THE SAME SITE. `provision.sh` holds
 * `/var/lock/tracy-provision-<label>.lock` for its whole run; a site whose lock is held is left for
 * the next start. The provision enables the reader itself, and a marker written under it would tell
 * a Joomla first pass the site already has its own seed.
 *
 * WHO WRITES: this host process, with the authority the provision already uses (the site's own token,
 * or a shell in the site's own container) — never an agent and never a seat
 * (`docs/references/content-api-integration.md`, "Identity WP"). What it writes: WordPress a seed
 * option, a marker option and a `_tracy_content_uid` meta per page, post, template part, pattern,
 * navigation and attachment; Joomla its two identity tables and four triggers on #__content and
 * #__modules. No content, title, slug or setting changes.
 *
 * In the background after the server listens, one site at a time, and never fails the process.
 * `TRACY_HOST_CONTENT_IDENTITY=0` turns it off (`server.js`).
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { captureTarget } from './capture.js'
import { SITE_LABEL } from './mtimes.js'

/** The marker both provision roads write (`platform/joomla.sh`, `platform/wordpress.sh`). */
export const CONTENT_IDENTITY_MARKER = 'content-identity.done'

/** The provision's own script, under `TRACY_FLEET_DIR` (the Dockerfile copies the fleet scripts there). */
export const JOOMLA_SCRIPT = path.join('provision', 'joomla-content-identity.php')

/** The lock `provision.sh` holds for one site's whole run — the same path, so the two see each other. */
export const provisionLock = (/** @type {string} */ label) => `/var/lock/tracy-provision-${label}.lock`

/**
 * The Joomla run, from the site's own folder — where compose finds the stack and its `.env` — like
 * the provision's `(cd "$SITE_DIR"; docker compose exec -T web php < …)`. `timeout` bounds one site:
 * the pass is serial, and a hung exec must not hold every site after it until the next deploy.
 */
/**
 * 🔒 THE PROVISION LOCK IS HELD FOR THE WHOLE PASS, NOT PROBED (28/09/2026). It used to be a separate
 * `flock -n <lock> true` — which takes the lock and gives it straight back — so a provision starting in
 * the moment after the probe ran beside this pass. What that cost: a half-provisioned Joomla got its
 * identity installed with `newSite: false`, which KEEPS the `site_id` and secret the quickstart
 * database came with, and the marker was written; the retry then reused the label, skipped the
 * re-import because the marker was there, and two sites answered as ONE identity.
 *
 * `flock -n <file> <command>` holds the lock until the command exits, so the identity work runs inside
 * it or does not run at all. It is `exec`'d, and stdin passes straight through to `php` — `flock` with
 * a command reads none of it. `-E` is what makes the two tellable apart: a lock it could not take
 * exits {@link LOCK_BUSY} and nothing else does — `docker compose exec` answers 1 for "service is not
 * running", which was indistinguishable from a busy lock while `flock` used its own 1.
 */
// 🔒 AS THE WEB USER (16/10/2026), like every other exec into a site (the agent's commands, ds-slot,
// cms-log): the pass boots Joomla and its plugin, and as root it left cache folders the site itself
// could not write again.
export const JOOMLA_EXEC =
  'cd "$2" && exec flock -n -E 75 "$1" timeout 600 docker compose exec -T -u www-data web php'

/** What `flock -E` answers when the provision lock is held: EX_TEMPFAIL, which no road here returns. */
export const LOCK_BUSY = 75

/** How long the WordPress door may take: the provision's own `curl -m 300`. */
const WORDPRESS_TIMEOUT_MS = 300_000

/** What Joomla's script reports when it skips, by its `TRACY_RESULT content_reader=` word. */
const JOOMLA_SKIPPED = Object.freeze({
  none: 'this Cowork component has no reader',
  unsupported: 'the reader needs Joomla 6',
  outdated: 'this Cowork component predates the menu-trigger fix (0.18.0-rc.7)'
})

/**
 * 🔒 A SITE IMPORTED FROM A CUSTOMER'S OWN SERVER GETS A DERIVED CONTENT CONTRACT ONCE, AFTER ITS
 * CONTENT IDENTITY IS DONE.
 *
 * Only an imported site — `.tracy/site.json` in the site's own folder (the sites root, not the
 * private root `identifySite` reads) recording `"origin": "imported"` (`siteFolder.mjs:854`) — has no
 * quickstart contract to bind: nothing here shipped Tracy's own slot map. `content.contract` operation
 * `derive` asks the plugin to read the site's own database (five codecs: text, html, shortcode, json,
 * php-serialize) and build one, calibrated against the rendered page. `packages/fleet/tracy-fleet-
 * operation/scripts/provision/joomla-content-derive.php` runs the same call on Joomla, through a
 * loopback exec, the way `joomla-content-identity.php` does for identity.
 *
 * `<privateRoot>/<label>/contract-derived.done`, next to `CONTENT_IDENTITY_MARKER`, is written once a
 * site is derived and never touched again — same shape as identity: a plugin too old for the `derive`
 * operation is skipped, not failed, so an upgrade is picked up at a later start.
 */
export const CONTRACT_DERIVED_MARKER = 'contract-derived.done'

/** `joomla-content-derive.php`, under `TRACY_FLEET_DIR` — same tree `JOOMLA_SCRIPT` reads from. */
export const JOOMLA_DERIVE_SCRIPT = path.join('provision', 'joomla-content-derive.php')

/**
 * 🔒 `JOOMLA_EXEC` HAS NO `-e`: identity never needed to hand the container anything beyond what
 * `docker compose exec` already knows. `joomla-content-derive.php` reads the site's label from
 * `TRACY_LABEL` (its own env var), so this exec line carries it explicitly — `-e TRACY_LABEL="$3"` —
 * with a third positional argument alongside the lock file (`$1`) and the site folder (`$2`).
 */
export const JOOMLA_DERIVE_EXEC =
  'cd "$2" && exec flock -n -E 75 "$1" timeout 600 docker compose exec -T -u www-data -e TRACY_LABEL="$3" web php'

/** A Claude Cowork plugin too old to know the `derive` contract operation, either engine's wording. */
const UNKNOWN_DERIVE_OPERATION = /unknown .*operation|unknown action/i

/**
 * @typedef {{ state: 'enabled' | 'skipped' | 'failed', why: string }} Outcome
 * @typedef {{ enabled: string[], skipped: string[], failed: string[], why: Record<string, string> }} Backfill
 * @typedef {(input: { script: string, args?: string[], env?: object, stdin?: string }) =>
 *   Promise<{ code: number, tail: string[] }>} Run
 */

/**
 * @param {object} input
 * @param {{ privateRoot: string, sitesRoot: string, scriptsDir: string }} input.config
 * @param {Run} input.run - `run.js`'s `runScript`, or a test's fake.
 * @param {typeof fetch} [input.fetchImpl]
 * @param {{ log: (m: string) => void, warn: (m: string) => void }} [input.log]
 * @param {() => Date} [input.now]
 * @param {number} [input.timeoutMs] - the WordPress door's bound.
 * @returns {Promise<Backfill>}
 */
export async function backfillContentIdentity({
  config,
  run,
  fetchImpl = fetch,
  log = console,
  now = () => new Date(),
  timeoutMs = WORDPRESS_TIMEOUT_MS
}) {
  /** @type {Backfill} */
  const result = { enabled: [], skipped: [], failed: [], why: {} }
  let entries
  try {
    entries = await readdir(config.privateRoot, { withFileTypes: true })
  } catch {
    return result
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (!entry.isDirectory() || !SITE_LABEL.test(entry.name)) continue
    const label = entry.name
    /** @type {Outcome | null} */
    let outcome
    try {
      outcome = await identifySite({ label, config, run, fetchImpl, log, now, timeoutMs })
    } catch (error) {
      outcome = { state: 'failed', why: String(/** @type {any} */ (error)?.message ?? error) }
    }
    if (outcome === null) continue
    result[outcome.state].push(label)
    result.why[label] = outcome.why
    if (outcome.state === 'enabled') log.log(`[host] ${label}: content identity set up (${outcome.why})`)
    if (outcome.state === 'failed')
      log.warn(`[host] ${label}: content identity not set up — ${outcome.why}; tried again at the next start`)
  }
  const seen = result.enabled.length + result.skipped.length + result.failed.length
  if (seen > 0)
    log.log(
      `[host] content identity: ${result.enabled.length} site(s) set up, ${result.skipped.length} skipped (no reader yet, or a provision running), ${result.failed.length} failed`
    )
  return result
}

/**
 * One site: `null` when there is nothing to do (marked already, not a stack, not WordPress or Joomla).
 * @param {{ label: string, config: { privateRoot: string, sitesRoot: string, scriptsDir: string },
 *   run: Run, fetchImpl: typeof fetch, log: { warn: (m: string) => void }, now: () => Date,
 *   timeoutMs: number }} input
 * @returns {Promise<Outcome | null>}
 */
async function identifySite({ label, config, run, fetchImpl, log, now, timeoutMs }) {
  const siteDir = path.join(config.privateRoot, label)
  const marker = path.join(siteDir, CONTENT_IDENTITY_MARKER)
  let identityDone = await exists(marker)
  if (!identityDone) {
    // What provision leaves in every site's folder; a folder without it is no stack to reach.
    if (!(await exists(path.join(siteDir, 'docker-compose.yml')))) return null
  }
  const env = await readSiteEnv(siteDir)
  const platform = env.PLATFORM || (await platformOfWebroot(path.join(config.sitesRoot, label, '.webroot')))
  if (platform !== 'joomla' && platform !== 'wordpress') return null

  /** @type {Outcome | null} */
  let outcome = null
  if (!identityDone) {
    // WordPress is probed as before: its door is an HTTP call this process makes, not a child a lock
    // can wrap. Joomla holds the lock for its whole pass instead (`JOOMLA_EXEC`) — that is where a
    // provision running beside this pass wrote one identity onto two sites.
    if (platform === 'wordpress') {
      const probe = await run({ script: 'flock', args: ['-n', provisionLock(label), 'true'] })
      // `flock -n` answers 1 for a lock someone holds, and only for that (a missing binary is 127).
      if (probe.code === 1) outcome = { state: 'skipped', why: 'a provision of this site is running' }
    }
    if (outcome === null)
      outcome =
        platform === 'joomla'
          ? await identifyJoomla({ label, siteDir, config, run })
          : await identifyWordPress({ label, siteDir, port: Number(env.HOST_PORT), fetchImpl, timeoutMs })
    if (outcome.state === 'enabled') {
      try {
        await writeFile(marker, `${now().toISOString()} tracy-host start-up pass (${platform})\n`)
        identityDone = true
      } catch (error) {
        // Enabled all the same: the next start sends the same seed-keeping call once more.
        log.warn(
          `[host] ${label}: content identity set up, but ${CONTENT_IDENTITY_MARKER} was not written: ${/** @type {any} */ (error)?.message ?? error}`
        )
      }
    }
  }

  // Contract derivation is a separate pass with its own gate (imported sites only) and its own
  // marker; a failure here must never turn an identity success into a failure the caller retries.
  if (identityDone) {
    try {
      const derived = await deriveSite({ label, siteDir, platform, config, run, fetchImpl, timeoutMs })
      if (derived !== null) {
        if (derived.state === 'enabled') log.log(`[host] ${label}: content contract derived (${derived.why})`)
        if (derived.state === 'failed')
          log.warn(
            `[host] ${label}: content contract not derived — ${derived.why}; tried again at the next start`
          )
      }
    } catch (error) {
      log.warn(
        `[host] ${label}: content contract not derived — ${/** @type {any} */ (error)?.message ?? error}; tried again at the next start`
      )
    }
  }

  return outcome
}

/**
 * After content identity, on an IMPORTED site only: bind a derived content contract, once.
 * `null` when there is nothing to do — not imported, or `CONTRACT_DERIVED_MARKER` already there.
 * @param {{ label: string, siteDir: string, platform: 'joomla' | 'wordpress',
 *   config: { sitesRoot: string, scriptsDir: string }, run: Run, fetchImpl: typeof fetch,
 *   timeoutMs: number }} input
 * @returns {Promise<{ state: 'enabled' | 'skipped' | 'failed', why: string } | null>}
 */
async function deriveSite({ label, siteDir, platform, config, run, fetchImpl, timeoutMs }) {
  const derivedMarker = path.join(siteDir, CONTRACT_DERIVED_MARKER)
  if (await exists(derivedMarker)) return null
  const origin = await siteOrigin(config.sitesRoot, label)
  if (origin !== 'imported') return null

  const outcome =
    platform === 'joomla'
      ? await deriveJoomla({ label, siteDir, config, run })
      : await deriveWordPress({ label, siteDir, fetchImpl, timeoutMs })
  if (outcome.state === 'enabled') {
    try {
      await writeFile(derivedMarker, `${new Date().toISOString()} tracy-host backfill (${platform})\n`)
    } catch {
      // Bound all the same: `derive` reads the DB, it does not consume anything, so the next start
      // sending the same call once more is harmless.
    }
  }
  return outcome
}

/** The `origin` field of the site's own `.tracy/site.json`, under the sites root, or `null`. */
async function siteOrigin(/** @type {string} */ sitesRoot, /** @type {string} */ label) {
  let text
  try {
    text = await readFile(path.join(sitesRoot, label, '.tracy', 'site.json'), 'utf8')
  } catch {
    return null
  }
  try {
    return JSON.parse(text)?.origin ?? null
  } catch {
    return null
  }
}

/**
 * @param {{ label: string, siteDir: string, config: { scriptsDir: string }, run: Run }} input
 * @returns {Promise<{ state: 'enabled' | 'skipped' | 'failed', why: string }>}
 */
async function deriveJoomla({ label, siteDir, config, run }) {
  const script = await readFile(path.join(config.scriptsDir, JOOMLA_DERIVE_SCRIPT), 'utf8')
  const { code, tail } = await run({
    script: 'bash',
    args: ['-c', JOOMLA_DERIVE_EXEC, 'contract-derive', provisionLock(label), siteDir, label],
    stdin: script
  })
  const said = tail
    .map((line) =>
      /^TRACY_RESULT derived=(\S+) entities=(\S+) slots=(\S+) calibrated=(\S+)$/.exec(line.trim())
    )
    .filter(Boolean)
    .at(-1)
  // `flock` could not take the lock (`-E`): the script never ran, and no other road answers this code.
  if (code === LOCK_BUSY) return { state: 'skipped', why: 'a provision of this site is running' }
  if (code !== 0) return { state: 'failed', why: problemOf(tail) ?? `exit ${code}` }
  if (!said) return { state: 'failed', why: 'the script named no outcome' }
  const [, derived, entities, slots, calibrated] = said
  if (derived === 'bound')
    return { state: 'enabled', why: `Joomla, ${entities} entities, ${slots} slots, calibrated=${calibrated}` }
  if (derived === 'unsupported')
    return { state: 'skipped', why: 'this Cowork component has no derive operation' }
  return { state: 'failed', why: `the script reported derived=${derived}` }
}

/**
 * @param {{ label: string, siteDir: string, fetchImpl: typeof fetch, timeoutMs: number }} input
 * @returns {Promise<{ state: 'enabled' | 'skipped' | 'failed', why: string }>}
 */
async function deriveWordPress({ label, siteDir, fetchImpl, timeoutMs }) {
  let token = ''
  try {
    token = (await readFile(path.join(siteDir, 'tracy-agent.token'), 'utf8')).replace(/\s+/g, '')
  } catch {
    // No file: no door to knock on.
  }
  if (token === '') return { state: 'skipped', why: 'no plugin token' }
  const body = JSON.stringify({
    token,
    action: 'content.contract',
    params: { operation: 'derive', label, requestId: `backfill-${label}` }
  })
  const env = await readSiteEnv(siteDir)
  const port = Number(env.HOST_PORT)
  const bases = [
    ...new Set(
      [
        Number.isInteger(port) && port > 0 ? captureTarget(label, 'wordpress', port) : null,
        captureTarget(label, 'wordpress')
      ].filter((base) => base !== null)
    )
  ]
  let unreachable = ''
  for (const base of bases) {
    let response
    try {
      response = await fetchImpl(`${base}wp-admin/admin-ajax.php?action=claude_cowork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // A redirect is not the plugin's answer; following it would turn the POST into a GET.
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      const cause = /** @type {any} */ (error)?.cause
      unreachable = String(cause?.code ?? cause?.message ?? /** @type {any} */ (error)?.message ?? error)
      continue
    }
    return judgeDerive(response.status, await response.text())
  }
  return { state: 'failed', why: `the site did not answer (${unreachable})` }
}

/**
 * The plugin's answer to `content.contract {operation:'derive'}`.
 * @param {number} status
 * @param {string} text
 * @returns {{ state: 'enabled' | 'skipped' | 'failed', why: string }}
 */
export function judgeDerive(status, text) {
  let answer
  try {
    answer = JSON.parse(text)
  } catch {
    answer = undefined
  }
  // admin-ajax's own `0` (HTTP 400): no active plugin registered the action — no door at all.
  if (answer === 0) return { state: 'skipped', why: 'no active Claude Cowork plugin answers' }
  if (answer === null || typeof answer !== 'object')
    return { state: 'failed', why: `not a JSON answer (HTTP ${status}): ${text.trim().slice(0, 160)}` }
  if (answer.ok) {
    const { entities, slots, calibrated } = answer
    return {
      state: 'enabled',
      why: `derived, ${entities ?? '?'} entities, ${slots ?? '?'} slots, calibrated=${calibrated ? 1 : 0}`
    }
  }
  const said = String(answer.message || answer.error || '')
  if (UNKNOWN_DERIVE_OPERATION.test(said))
    return { state: 'skipped', why: 'this Claude Cowork plugin has no derive operation' }
  return { state: 'failed', why: said.slice(0, 200) || `HTTP ${status}` }
}

/**
 * @param {{ label: string, siteDir: string, config: { scriptsDir: string }, run: Run }} input
 * @returns {Promise<Outcome>}
 */
async function identifyJoomla({ label, siteDir, config, run }) {
  const script = await readFile(path.join(config.scriptsDir, JOOMLA_SCRIPT), 'utf8')
  // 🔒 NEVER A NEW-SITE PASS: no `-e TRACY_NEW_SITE` on the exec, and not in this child's
  // environment either, whatever this process was started with.
  const { TRACY_NEW_SITE: _never, ...env } = process.env
  const { code, tail } = await run({
    script: 'bash',
    args: ['-c', JOOMLA_EXEC, 'content-identity', provisionLock(label), siteDir],
    env,
    stdin: script
  })
  const said = tail
    .map((line) => /^TRACY_RESULT content_reader=(\S+)$/.exec(line.trim())?.[1])
    .filter(Boolean)
    .at(-1)
  // `flock` could not take the lock (`-E`): the script never ran, and no other road answers this code.
  if (code === LOCK_BUSY) return { state: 'skipped', why: 'a provision of this site is running' }
  if (code !== 0) return { state: 'failed', why: problemOf(tail) ?? `exit ${code}` }
  if (said === 'enabled') return { state: 'enabled', why: 'Joomla, seed kept or created' }
  if (said !== undefined && Object.hasOwn(JOOMLA_SKIPPED, said))
    return { state: 'skipped', why: JOOMLA_SKIPPED[/** @type {keyof typeof JOOMLA_SKIPPED} */ (said)] }
  return { state: 'failed', why: 'the script named no outcome' }
}

/**
 * @param {{ label: string, siteDir: string, port: number, fetchImpl: typeof fetch, timeoutMs: number }} input
 * @returns {Promise<Outcome>}
 */
async function identifyWordPress({ label, siteDir, port, fetchImpl, timeoutMs }) {
  let token = ''
  try {
    token = (await readFile(path.join(siteDir, 'tracy-agent.token'), 'utf8')).replace(/\s+/g, '')
  } catch {
    // No file: no door to knock on.
  }
  if (token === '') return { state: 'skipped', why: 'no plugin token' }
  // 🔒 `newSite: false`, ALWAYS: keep the seed a site has, create one only where there is none.
  const body = JSON.stringify({ token, action: 'content.identity', params: { newSite: false } })
  // Where the site answers from THIS process, both ways, as `site_answers` in `platform/wordpress.sh`
  // asks: on a fleet host tracy-host is host-networked and the site's published loopback port is the
  // road; on a Mac stand (`compose.macos.yml`) it sits on the compose bridge, that port is its own
  // empty loopback (refused at once), and the web container's docker-network name is the road.
  const bases = [
    ...new Set(
      [
        Number.isInteger(port) && port > 0 ? captureTarget(label, 'wordpress', port) : null,
        captureTarget(label, 'wordpress')
      ].filter((base) => base !== null)
    )
  ]
  let unreachable = ''
  for (const base of bases) {
    let response
    try {
      response = await fetchImpl(`${base}wp-admin/admin-ajax.php?action=claude_cowork`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        // A redirect is not the plugin's answer; following it would turn the POST into a GET.
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      const cause = /** @type {any} */ (error)?.cause
      unreachable = String(cause?.code ?? cause?.message ?? /** @type {any} */ (error)?.message ?? error)
      continue
    }
    return judgeWordPress(response.status, await response.text())
  }
  return { state: 'failed', why: `the site did not answer (${unreachable})` }
}

/**
 * The plugin's answer to `content.identity`, judged as `tracy_wp_content_identity` judges it.
 * @param {number} status
 * @param {string} text
 * @returns {Outcome}
 */
export function judgeWordPress(status, text) {
  let answer
  try {
    answer = JSON.parse(text)
  } catch {
    answer = undefined
  }
  // admin-ajax's own `0` (HTTP 400): no active plugin registered the action — no door at all.
  if (answer === 0) return { state: 'skipped', why: 'no active Claude Cowork plugin answers' }
  if (answer === null || typeof answer !== 'object')
    return { state: 'failed', why: `not a JSON answer (HTTP ${status}): ${text.trim().slice(0, 160)}` }
  if (answer.ok) {
    const rows = answer.identity?.total
    return {
      state: 'enabled',
      why: `WordPress, ${Number.isInteger(rows) ? rows : '?'} rows, seed kept or created`
    }
  }
  const said = String(answer.message || answer.error || '')
  if (said.toLowerCase().includes('unknown action'))
    return { state: 'skipped', why: 'this Claude Cowork plugin has no reader' }
  return { state: 'failed', why: said.slice(0, 200) || `HTTP ${status}` }
}

/** The line that says why a run failed: its last `!! ` line, else its last line. */
function problemOf(/** @type {string[]} */ tail) {
  const lines = tail.map((line) => line.trim()).filter(Boolean)
  const marked = lines.filter((line) => line.startsWith('!! ')).at(-1)
  const last = marked ?? lines.at(-1)
  return last === undefined ? null : last.slice(0, 200)
}

/** `PLATFORM` and `HOST_PORT` from the site's `.env` — what provision wrote down (`provision.sh`). */
async function readSiteEnv(/** @type {string} */ siteDir) {
  /** @type {Record<string, string>} */
  const env = {}
  let text = ''
  try {
    text = await readFile(path.join(siteDir, '.env'), 'utf8')
  } catch {
    return env
  }
  for (const line of text.split('\n')) {
    const found = /^(PLATFORM|HOST_PORT)=(.*)$/.exec(line.trim())
    if (found && !(found[1] in env)) env[found[1]] = found[2].trim()
  }
  return env
}

/** A site older than `PLATFORM=` in its `.env`: the CMS its webroot holds (render-compose.sh's rule). */
async function platformOfWebroot(/** @type {string} */ webroot) {
  if (await exists(path.join(webroot, 'configuration.php'))) return 'joomla'
  if (await exists(path.join(webroot, 'wp-config.php'))) return 'wordpress'
  return null
}

async function exists(/** @type {string} */ file) {
  return stat(file).then(
    () => true,
    () => false
  )
}
