// The shape every place-profile demo journey shares: who acts (the run's own account, minted, in a watched
// browser context), how the demo is asked for (in-app Build, or `/v1/demos` from outside), and how its site is
// judged (`judge-demo.mjs`, both viewports, every page of `paths`). A journey file names its case and adds the
// checks that are its own; this file records the evidence plan §7 asks of each: deploy, release, sidecar and
// profile hashes, URL, assertions.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { siteOrigin } from '../env.mjs'
import { check, writeEvidence } from '../journey.mjs'
import { noteAccountSites } from '../account-sites.mjs'
import { runAccount } from '../run-site.mjs'
import { chromeWatchErrors, localStamp, watchedRole } from '../watched-browser.mjs'
import { findContractDir, templateBaseline } from './baseline.mjs'
import { judgeSite } from './judge-demo.mjs'
import { profileHash } from './line.mjs'
import { profileFacts } from './profile-facts.mjs'

/** The releases that carry a sidecar today (T4); a case names one of them. */
export const RELEASES = Object.freeze({
  'tracy-base/j6': Object.freeze({ cms: 'joomla', slug: 'tracy-base', line: 'j6', version: '1.0.5' }),
  'ja-restaurant/wp7': Object.freeze({
    cms: 'wordpress',
    slug: 'ja-restaurant',
    line: 'wp7',
    version: '1.0.1'
  }),
  'tracy-base/emdash-0.x': Object.freeze({ cms: 'emdash', slug: 'tracy-base', line: null, version: '0.5.6' })
})

/** The deploy J13 measured for this run, if it ran first. */
export function deployOf(runDir) {
  const file = join(runDir, 'deploy.json')
  if (!existsSync(file)) return null
  const d = JSON.parse(readFileSync(file, 'utf8'))
  return {
    appImageTag: d.env?.APP_IMAGE_TAG ?? null,
    dshCommit: d.env?.DSH_SOURCE_COMMIT ?? null,
    images: d.images
  }
}

/** The baseline and its hashes for a release key of RELEASES; `null` for a release with no sidecar. */
export function releaseBaseline(key) {
  if (key === null) return { release: { key: null }, baseline: null }
  const release = RELEASES[key]
  if (!release) throw new Error(`no release ${key} in RELEASES`)
  const dir = findContractDir(release)
  return { release: { key, ...release }, baseline: dir ? templateBaseline(dir) : null }
}

/** The run account and its watched browser context. */
export async function actor(run, role = 'owner') {
  const owner = await runAccount(run, role)
  noteAccountSites(run.manifest, owner.email)
  const browser = await watchedRole({ name: role, token: owner.token })
  return { owner, browser }
}

/**
 * Judge a demo site and write everything into `details` (and an evidence file).
 * @param {{ run: any, details: Record<string, any>, browser: any, id: string, siteKey: string, profile: any,
 *   releaseKey: string, paths?: string[] }} c
 */
export async function judgeDemo({ run, details, browser, id, siteKey, profile, releaseKey, paths = ['/'] }) {
  const { release, baseline } = releaseBaseline(releaseKey)
  const origin = siteOrigin(siteKey.split('.')[0])
  const facts = profileFacts(profile)
  // E13 judges every demo of the run again, against the profile it was built from.
  writeEvidence(run.runDir, `profile-${siteKey}.json`, profile)
  const since = localStamp()
  const judged = await judgeSite(browser, { origin, paths, facts, baseline, runDir: run.runDir, tag: id })
  // E13: every same-site page the home links to opens (bounded), in desktop.
  const linked = [...new Set(judged.pages.flatMap((p) => p.links))].slice(0, 12)
  const extra = linked.filter((u) => !paths.some((p) => u === `${origin}${p}`))
  const more = extra.length
    ? await judgeSite(browser, {
        origin,
        paths: extra.map((u) => new URL(u).pathname),
        facts,
        baseline,
        runDir: run.runDir,
        tag: `${id}-linked`
      })
    : { pages: [], failed: [] }
  // Read after the last reload: every error chrome-watch logged on the demo's pages while it was judged.
  const errors = await chromeWatchErrors({ since, page: origin }).catch((e) => [{ error: e.message }])
  Object.assign(details, {
    deploy: deployOf(run.runDir),
    release,
    sidecar: baseline
      ? { state: baseline.state, sha256: baseline.sidecarSha256, baseHash: baseline.baseHash }
      : null,
    profile: { hash: profileHash(profile), trade: facts.trade, offerings: facts.offerings.length },
    url: origin,
    linked,
    pages: [...judged.pages, ...more.pages].map(({ links: _links, ...p }) => p),
    browserErrors: { since, count: errors.length, first: errors.slice(0, 20) }
  })
  writeEvidence(run.runDir, `${id}-judged.json`, details)
  const failed = [...judged.failed, ...more.failed]
  check(failed.length === 0, `${failed.length} page check(s) failed: ${failed.slice(0, 6).join(' | ')}`)
  return { origin, facts, baseline }
}

/**
 * Ask `/v1/demos` for a demo as an outside client: connect (device flow), read `options`, send `body` with a fresh
 * Idempotency-Key (named in the manifest first), and follow the demo until it waits for the seller, is ready, or
 * ends. With `drive`, the seller's chat link is opened in the watched browser (that is what sends the brief) and
 * the demo is followed to its end.
 * @param {{ run: any, details: Record<string, any>, owner: import('../api.mjs').Client, browser: any,
 *   body: any, drive?: boolean, key?: string }} c
 */
export async function askPublicDemo({
  run,
  details,
  owner,
  browser,
  body,
  drive = false,
  key = `e2e-${run.runId}-${Date.now().toString(36)}`
}) {
  const { connectDemosToken, demosApi, waitForDemo } = await import('../public-demos.mjs')
  const token = await connectDemosToken(owner)
  details.connect = token.steps
  const api = demosApi(token.accessToken)
  const options = await api.options()
  details.options = {
    status: options.status,
    accepts: options.json?.accepts ?? null,
    defaultCms: options.json?.defaultCms ?? null
  }
  run.manifest.intend('demo', key, { owner: owner.email })
  const created = await api.create(body, key)
  details.create = {
    status: created.status,
    code: created.json?.error?.code ?? null,
    demo: created.json?.demo?.id ?? null
  }
  if (created.status !== 202) {
    run.manifest.mark('demo', key, 'never-created', { status: created.status })
    return { api, token, created, demo: null, options: details.options }
  }
  run.manifest.mark('demo', key, 'created', { demo: created.json.demo.id })
  let followed = await waitForDemo(api, created.json.demo.id, {
    until: ['waiting-for-you', 'ready', 'needs-review', 'failed', 'cancelled']
  })
  if (drive && followed.demo?.status === 'waiting-for-you' && followed.demo.site?.editUrl) {
    await browser.goto(followed.demo.site.editUrl, { settleMs: 20_000 })
    const rest = await waitForDemo(api, created.json.demo.id, {
      capMs: 30 * 60_000,
      until: ['ready', 'needs-review', 'failed', 'cancelled']
    })
    followed = { ...rest, seen: [...followed.seen, ...rest.seen] }
  }
  const siteKey = followed.demo?.site?.key ?? null
  if (siteKey && !run.manifest.read().resources.some((r) => r.kind === 'site' && r.id === siteKey)) {
    run.manifest.intend('site', siteKey, {
      label: siteKey.split('.')[0],
      owner: owner.email,
      wo: 'public-demo'
    })
    run.manifest.mark('site', siteKey, 'created', { demo: created.json.demo.id })
  }
  details.demo = {
    id: created.json.demo.id,
    status: followed.demo?.status ?? null,
    seen: followed.seen,
    ms: followed.ms,
    timeout: followed.timeout ?? false,
    siteKey: followed.demo?.site?.key ?? null,
    cms: followed.demo?.cms ?? null,
    template: followed.demo?.template ?? null,
    error: followed.demo?.error ?? null
  }
  return { api, token, created, demo: followed.demo, options: details.options }
}

/** What the host announces at `GET /v1/demos/options`, read with a token that is revoked right after. */
export async function hostAccepts(owner) {
  const { connectDemosToken, demosApi, revokeDemosToken } = await import('../public-demos.mjs')
  const probe = await connectDemosToken(owner)
  try {
    const opts = await demosApi(probe.accessToken).options()
    return { status: opts.status, accepts: opts.json?.accepts ?? null }
  } finally {
    await revokeDemosToken(probe.refreshToken)
  }
}
