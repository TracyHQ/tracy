/** Create a backup for this export, waiting without reposting when this request owns the slow job. */
export async function createFreshExportBackup({
  siteKey,
  title,
  fetchImpl = fetch,
  sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 800,
  pollMs = 3000
}: {
  siteKey: string
  title: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<unknown>
  attempts?: number
  pollMs?: number
}): Promise<number> {
  const base = `/api/sites/${encodeURIComponent(siteKey)}`
  const readBackups = async (): Promise<{ ok: boolean; version: number }> => {
    const response = await fetchImpl(`${base}/backups`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' }
    })
    const body = await response.json().catch(() => ({}))
    return { ok: response.ok, version: Number(body?.latest?.version ?? 0) }
  }
  const before = await readBackups()
  if (!before.ok || !Number.isInteger(before.version) || before.version < 0)
    throw new Error('BACKUP_LIST_UNAVAILABLE')

  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetchImpl(`${base}/backup`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ title, includeLarge: true })
    })
    const body = await response.json().catch(() => ({}))
    if (response.status === 202 && body?.code === 'BACKUP_PENDING') {
      if (body.startedByRequest === true) {
        // This click's job already holds the large-file snapshot. Wait for its point to appear;
        // reposting after the 120-second door wait would make a second backup for one click.
        for (let poll = 0; poll < attempts; poll++) {
          await sleep(pollMs)
          const latest = await readBackups()
          if (!latest.ok) continue
          if (Number.isInteger(latest.version) && latest.version > before.version) return latest.version
        }
        throw new Error('BACKUP_PENDING')
      }
      if (body.startedByRequest !== false) {
        // An older server cannot identify who owns its pending job. Fail closed instead of risking
        // a duplicate backup by retrying an ambiguous 202.
        throw new Error('BACKUP_PENDING')
      }
      // Someone else's job is running. Retry only after waiting; the server will start this click's
      // backup once the foreign job has ended.
      await sleep(pollMs)
      continue
    }
    const version = Number(body?.version)
    if (response.ok && Number.isInteger(version) && version > 0) return version
    throw new Error(body?.code ?? 'BACKUP_FAILED')
  }
  throw new Error('BACKUP_PENDING')
}

/** Start packing exactly the version this click made. */
export async function startFreshSiteExport(input: Parameters<typeof createFreshExportBackup>[0]): Promise<{
  version: number
  exportId: string
}> {
  const version = await createFreshExportBackup(input)
  const response = await (input.fetchImpl ?? fetch)(
    `/api/sites/${encodeURIComponent(input.siteKey)}/backups/${version}/export`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ includeLarge: true })
    }
  )
  const body = await response.json().catch(() => ({}))
  if (response.status !== 202 || typeof body?.exportId !== 'string')
    throw new Error(body?.code ?? 'EXPORT_FAILED')
  return { version, exportId: body.exportId }
}
