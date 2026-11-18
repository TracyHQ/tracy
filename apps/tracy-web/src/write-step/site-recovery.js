// A chain write keeps the provisioner's full backup outside the agent. Content faults keep their
// written content; only a newly broken home (two explicit server failures) may restore that point.
// Network failures are unknown, never evidence that replacing the site's database would help.
export async function runWithSiteRecovery({ door, siteKey, runId, probe, run, sleep, signal }) {
  const stopped = (code, recovery, result = {}) => ({
    ...result,
    report: { ...result.report, status: 'stopped', cause: { code, reason: code }, recovery },
    recovery
  })
  let point
  try {
    point = await door.recoveryPoint(siteKey, { signal })
  } catch (error) {
    const pending = error?.code === 'SITE_RECOVERY_POINT_PENDING'
    return stopped(pending ? 'SITE_RECOVERY_POINT_PENDING' : 'SITE_RECOVERY_POINT_UNVERIFIED', {
      status: pending ? 'backup-read-pending' : 'backup-read-failed'
    })
  }
  if (!point) return stopped('SITE_RECOVERY_POINT_UNAVAILABLE', { status: 'no-full-backup' })
  const before = await probe()
  if (before.state !== 'healthy')
    return stopped('SITE_RECOVERY_BASE_UNHEALTHY', { status: 'base-unverified', before })
  // An exception with no complete repair ledger stays failed; it cannot safely authorize restore.
  const result = await run()
  const after = await probe()
  const recovery = { status: 'not-needed', point, before, after }
  if (after.state !== 'broken') return { ...result, recovery }
  await sleep(1000)
  const confirmed = await probe()
  if (confirmed.state !== 'broken') return { ...result, recovery: { ...recovery, confirmed } }
  if (
    result.writersSettled !== true ||
    (result.repair?.turns ?? []).some((t) => t.state === 'open' || t.leftOpen)
  )
    return stopped('SITE_RECOVERY_WRITER_OPEN', { ...recovery, status: 'writer-open', confirmed }, result)
  const restored = await door.restorePoint(siteKey, point, `chain-recovery-${runId}`).catch(() => ({
    ok: false,
    code: 'RESTORE_DOOR_UNAVAILABLE'
  }))
  if (!restored.ok)
    return stopped('SITE_RECOVERY_FAILED', { ...recovery, status: 'failed', confirmed, restored }, result)
  const readBack = await probe()
  return stopped(
    readBack.state === 'healthy' ? 'SITE_RECOVERED_FROM_BACKUP' : 'SITE_RECOVERY_UNVERIFIED',
    {
      ...recovery,
      status: readBack.state === 'healthy' ? 'restored' : 'unverified',
      confirmed,
      restored,
      readBack
    },
    result
  )
}

/** A visitor's home through the same site resolver as the write step's existing page reader. */
export async function probeSiteHome({ site, readers, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(readers.readOrigin(site), {
      headers: { accept: 'text/html' },
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000)
    })
    if (response.status >= 500) return { state: 'broken', status: response.status }
    if (!response.ok) return { state: 'unknown', status: response.status }
    let html = ''
    if (response.body?.getReader) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let bytes = 0
      try {
        while (bytes < 1_500_000) {
          const chunk = await reader.read()
          if (chunk.done) break
          const kept = chunk.value.subarray(0, 1_500_000 - bytes)
          bytes += kept.byteLength
          html += decoder.decode(kept, { stream: true })
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
    } else html = (await response.text()).slice(0, 1_500_000)
    if (
      /<b>\s*(?:Fatal error|Parse error)\s*<\/b>:\s*(?:Uncaught|syntax error|[A-Z][^<]*\bin\s)/i.test(html) ||
      (/class=["'][^"']*wp-die-message/.test(html) &&
        /There has been a critical error on this website/i.test(html))
    )
      return { state: 'broken', status: response.status, reason: 'cms-fatal-error' }
    return { state: /<html\b|<!doctype\s+html/i.test(html) ? 'healthy' : 'unknown', status: response.status }
  } catch {
    return { state: 'unknown' }
  }
}
