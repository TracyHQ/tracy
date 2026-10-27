import { mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'

import { writeAtomic } from './json-book.mjs'

import type { Diagnostic } from './joomla.js'

interface ImportNotice {
  origin: string
  cookie: string
  siteKey: string
  result: {
    run_id: string
    state: string
    step: string
    reason: string | null
    seconds: number
    platform: string
    /** How the run came by Claude Cowork's code (`DIAGNOSTIC_SIGN_INS`), on every result. */
    sign_in: 'password' | 'code' | 'saved'
    /**
     * Where a sign-in or install stopped (`joomla.Diagnostic`); no query values, cookies, tokens or
     * passwords, and of the username only whether it had an email address's shape.
     */
    detail?: Diagnostic
  }
}

const directory = () =>
  path.join(process.env.DSH_HOME ?? process.cwd(), 'tracy-add-site', 'operation-results')
let draining: Promise<void> | null = null

/** Private, persisted delivery queue: a web restart must not lose an import's terminal result. */
export async function reportImportResult(notice: ImportNotice): Promise<void> {
  try {
    const dir = directory()
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const file = path.join(dir, `${notice.result.run_id}.json`)
    // A temp name of its own: a second report of the same run at once must not rename it away.
    await writeAtomic(file, JSON.stringify(notice), 0o600)
    await flushImportResults()
  } catch {
    console.warn('[tracy-add-site] could not queue import operation result')
  }
}

export function flushImportResults(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (draining) return draining
  draining = (async () => {
    const dir = directory()
    const files = await readdir(dir).catch(() => [])
    for (const name of files.filter((f) => /^(?:[a-f0-9-]{36}|[a-z0-9]{10,32})\.json$/.test(f))) {
      const file = path.join(dir, name)
      try {
        const notice = JSON.parse(await readFile(file, 'utf8')) as ImportNotice
        const url = new URL(`/api/sites/${encodeURIComponent(notice.siteKey)}/import-result`, notice.origin)
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: notice.cookie },
          body: JSON.stringify(notice.result),
          signal: AbortSignal.timeout(5000),
          redirect: 'error'
        })
        // A duplicate is an acknowledged result too; the web owns deduplication.
        if (response.ok) await unlink(file)
      } catch {
        console.warn('[tracy-add-site] import operation result will be retried')
      }
    }
  })().finally(() => {
    draining = null
  })
  return draining
}
