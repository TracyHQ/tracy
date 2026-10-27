/** Keep the native contact form on a Joomla demo, with no invented recipient. Only an owned WO build calls this. */
export async function prepareDemoContact({ site, build, revision, runJob }) {
  if (
    !site ||
    build.site_key !== site.site_key ||
    site.platform !== 'joomla' ||
    revision.cms !== 'joomla' ||
    revision.template?.quickstart !== 'tracy-business/j6'
  )
    return { ok: true, skipped: true }
  const result = await runJob(site, { kind: 'site-demo-contact' })
  if (!result.ok) return { ok: false, reason: result.reason ?? 'CONTACT_PREVIEW_FAILED' }
  try {
    const answer = JSON.parse(result.output.trim().split('\n').at(-1))
    return answer.ok === true ? answer : { ok: false, reason: 'CONTACT_PREVIEW_FAILED' }
  } catch {
    return { ok: false, reason: 'CONTACT_PREVIEW_BAD_ANSWER' }
  }
}

/** The private host job; its installer requires a full backup and is idempotent under a per-site lock. */
export function createDemoContactPreview({
  config,
  host,
  fetchImpl = fetch,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  recordJob = async () => {},
  findJob = async () => null,
  recordResult = async () => {}
}) {
  return (input) =>
    prepareDemoContact({
      ...input,
      runJob: async (site, job) => {
        let jobId = (await findJob(site))?.id
        if (!jobId) {
          const started = await host.hostCall(
            config,
            site.host,
            '/site',
            { ...job, label: site.label },
            { fetchImpl, timeoutMs: 10_000 }
          )
          if (!started.ok || !started.body?.jobId) return { ok: false, reason: 'HOST_REFUSED' }
          jobId = started.body.jobId
          await recordJob(site, jobId)
        }
        const until = now() + 120_000
        while (now() < until) {
          const polled = await host.hostJob(config, site.host, jobId, {
            fetchImpl,
            timeoutMs: 10_000
          })
          if (!polled.ok) return { ok: false, reason: 'HOST_UNAVAILABLE' }
          await recordResult(jobId, polled.body)
          if (polled.body?.state === 'done') return { ok: true, output: polled.body.output ?? '' }
          if (polled.body?.state === 'failed') return { ok: false, reason: 'HOST_JOB_FAILED' }
          await delay(500)
        }
        return { ok: false, reason: 'HOST_JOB_TIMEOUT' }
      }
    })
}
