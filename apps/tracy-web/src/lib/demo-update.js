/**
 * Updating a demo that is LIVE: the new release is fetched and verified on the demo host first,
 * and the old copy comes down only once that has worked.
 *
 * 🔒 WHY (25/10/2026). The install door used to tear a live demo down and only then ask for the new
 * copy, whose first step is downloading the release from GitHub. On dev, JA Boxing 1.0.3 → 1.0.4
 * met a 403 at that download twice (the GitHub App's hourly quota, shared by every stack that uses
 * it, was spent until 09:05:13 UTC) and https://ja-boxing-joomla.tracy.site stood blank from 08:56
 * to 09:08. Customers opening the template preview in that window saw an empty demo.
 *
 * Now the press asks the host for a `prefetch` job (`apps/tracy-host/src/prefetch.js`): it downloads
 * every part, checks its size and sha256, and keeps it in the host's quickstart cache. The site row
 * is not touched, so the old copy keeps serving. Only when the host says `done` does the poll (or
 * the cron sweep) ask for the teardown; the provision after it reads the verified files from the
 * cache, with no second trip to GitHub. A prefetch that fails ends there: the job carries the
 * host's sentence (a 403 says until when), the demo stays live, and pressing Update again retries.
 *
 * ⚠ WHAT THIS DOES NOT COVER: a provision that fails AFTER the teardown for a reason other than the
 * download (the restore itself, the installer, the mail step) still leaves the address empty until
 * a retry. A true side-by-side switch needs a copy under a second label and a way to move the public
 * name onto it, which the fleet does not have yet.
 */
import { demoJob, forgetDemoAddress, noteDemoJob, recordDemoJob, upsertDemoSite } from './demo-sites.js'

/** The sentence a prefetch-done update stops on when a newer release appeared in the meantime. */
export const NEWER_RELEASE = 'NEWER_RELEASE'

/**
 * Ask a demo host to fetch and verify `release` into its cache. Same answer shape as
 * `host.hostCall`, so the install door's `handOff` follows it like a teardown.
 */
export function prefetchDemo({
  config,
  host,
  fetchImpl,
  label,
  release,
  install,
  releasesToken,
  hostName,
  jobKey,
  timeoutMs
}) {
  return host.hostCall(
    config,
    hostName,
    '/prefetch',
    {
      label,
      quickstart: release.tag,
      quickstartEntry: install,
      ...(releasesToken ? { releasesToken } : {}),
      jobKey
    },
    { fetchImpl, timeoutMs }
  )
}

/**
 * The step after a prefetch the host finished: take the old copy down (the existing teardown →
 * provision road does the rest), and only then mark the row as the new release.
 *
 * Order matters for the same reason as the whole file: the teardown is ASKED before the row is
 * rewritten, so a host that refuses the teardown leaves the row published and the old copy serving.
 * Its key is derived from the prefetch job, so the poll door and the sweep advancing the same
 * prefetch at once start one teardown between them (`keyedJobId` on the host).
 * @returns {Promise<object>} the view the poll answers: the teardown job's, or this job's with an error
 */
export async function replaceAfterPrefetch({ pool, config, host, fetchImpl, job, releases, viewOf }) {
  const plan = job.detail?.plan
  if (!plan || typeof plan !== 'object') return viewOf(job, { error: 'NO_PLAN' })
  // 🔒 ONCE. A prefetch already moved on answers with the job it started. Asking again would
  // rewrite the row (`upsertDemoSite` resets it to draft) under a demo that may be live by now.
  if (typeof plan.next === 'string') {
    const next = await demoJob(pool, plan.next)
    return next ? viewOf(next) : viewOf(job)
  }
  const release = (await releases.releases()).find((r) => r.tag === plan.tag && r.choosable)
  const install = release ? await releases.install(release.tag) : null
  if (!release || !install) return viewOf(job, { error: 'UNKNOWN_QUICKSTART' })
  if (install.version !== plan.version) {
    // What was fetched is no longer what would be installed: say so and change nothing.
    const tracyRefusal = {
      code: NEWER_RELEASE,
      message: `Version ${install.version} was published while ${plan.version} was being fetched. Nothing was changed; press Update again.`
    }
    const detail = { ...(job.detail ?? {}), tracyRefusal }
    await noteDemoJob(pool, job.id, { state: 'failed', detail })
    return viewOf({ ...job, state: 'failed', detail }, { error: NEWER_RELEASE })
  }

  const jobKey = `demo:${plan.oldLabel}:teardown:${job.id}`
  const asked = await host.hostCall(
    config,
    plan.oldHost,
    '/teardown',
    { label: plan.oldLabel, jobKey },
    { fetchImpl }
  )
  if (!asked.ok || typeof asked.body?.jobId !== 'string')
    return viewOf(job, { error: 'HOST_REFUSED', hostStatus: asked.status })

  const claimed = await upsertDemoSite(pool, {
    siteKey: plan.siteKey,
    label: plan.label,
    host: plan.onto,
    platform: release.platform,
    tag: release.tag,
    version: install.version,
    sha256: plan.sha256 ?? null,
    badge: plan.badge !== false
  })
  if (claimed.error) return viewOf(job, { error: claimed.error })
  await recordDemoJob(pool, {
    id: asked.body.jobId,
    siteKey: plan.siteKey,
    host: plan.oldHost,
    kind: 'teardown',
    by: typeof job.detail?.by === 'string' ? job.detail.by : null
  })
  await pool.query(
    `update job set detail = jsonb_set(detail, '{plan,next}', to_jsonb($2::text)) where id = $1`,
    [job.id, asked.body.jobId]
  )
  // A move frees the name on the machine it is leaving, as the install door does for a direct teardown.
  if (plan.oldHost !== plan.onto)
    await forgetDemoAddress({ config, host, fetchImpl, hostName: plan.oldHost, label: plan.oldLabel }).catch(
      () => null
    )
  const teardown = await demoJob(pool, asked.body.jobId)
  return teardown ? viewOf(teardown) : viewOf(job)
}
