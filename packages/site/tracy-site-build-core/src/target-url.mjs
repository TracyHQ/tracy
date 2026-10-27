/** A build's address belongs to its target, never to the inspiration's source site.
 * @param {unknown} value @param {unknown} siteKey
 */
export function targetUrlOf(value, siteKey) {
  if (typeof value !== 'string' || typeof siteKey !== 'string' || !siteKey) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.hostname !== siteKey.toLowerCase()) return null
    const local =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname.endsWith('.test')
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
    url.hash = ''
    return url.href
  } catch {
    return null
  }
}

/** A preview revision is changed only after a complete write stage has settled.
 * @param {{job: string, runs: number, startedAt: string, contentRevision?: string, targetUrl?: string, targetSiteKey?: string,
 * stages: {status: string, endedAt?: string}[] } | null | undefined} job
 */
export function previewOf(job) {
  const url = targetUrlOf(job?.targetUrl, job?.targetSiteKey)
  if (!url || !job) return null
  const settled = (job.stages ?? []).filter((stage) => stage.status === 'done' && stage.endedAt)
  return {
    url,
    revision: job.contentRevision
      ? `${job.job}:${job.contentRevision}`
      : `${job.job}:${job.runs}:${settled.at(-1)?.endedAt ?? job.startedAt}`
  }
}
