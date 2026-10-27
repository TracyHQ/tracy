/**
 * Export site as ZIP as state: a fresh backup, packed on the host, handed over behind a six-digit
 * code sent by email. The logic of the Export dialog of `@tracy/dsh-my-sites`, moved here unchanged
 * when the ZIP became a flow of the Publish tab (23/10/2026): the same doors, asked at the same
 * moments, with the same answers followed. `ZipStep` draws what this returns.
 *
 *   GET  /api/sites/:key/export/latest                              (once, when the flow is opened)
 *   POST /api/sites/:key/backup, POST …/backups/:version/export      (`startFreshSiteExport`)
 *   GET  …/backups/:version/export/:id                               (every 3 s while packing)
 *   POST …/export/:id/code, POST …/export/:id/download
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { startFreshSiteExport } from './export-backup'

const POLL_MS = 3000

export type ZipStage = 'confirm' | 'backup' | 'packing' | 'ready' | 'code' | 'downloaded' | 'failed'

export type ExportState = {
  exportId: string
  version: number
  state: string
  bytes?: number | null
  error?: string
  downloaded?: boolean
  /** WordPress and Joomla: the six digits the package's installer asks for when the database is elsewhere. */
  installCode?: string
}

/** Everything the ZIP step draws, and the presses it can make. */
export interface SiteExport {
  stage: ZipStage
  /** The code the last failure was named by, or ''. */
  error: string
  /** A refusal of the typed code (`DOWNLOAD_CODE_*`), or ''. */
  codeError: string
  /** When the emailed code stops working, or null. */
  codeExpiresAt: number | null
  current: ExportState | null
  /** The install code to show, and the backup it belongs to when it is an earlier package's. */
  shownCode: { code: string; earlier: number | null } | null
  code: string
  setCode: (code: string) => void
  /** A request is on its way: the presses wait for it. */
  busy: boolean
  /** Prepare ZIP. */
  run: () => void
  /** Send code, and Resend code. */
  requestCode: () => void
  /** Download, once six digits are typed. */
  verify: () => void
  /** Try again after a failure: the step that failed is asked again. */
  retry: () => void
}

async function json(path: string, init?: RequestInit): Promise<{ response: Response; body: any }> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', ...init?.headers },
    ...init
  })
  return { response, body: await response.json().catch(() => ({})) }
}

/**
 * `syncs`: this site syncs from its original (Sync from live): a package found on opening that was
 * made before the latest sync goes back to being the earlier one, so it is never handed over.
 * `backupTitle`: the title the fresh backup is made with.
 */
export function useSiteExport({
  siteKey,
  backupTitle,
  syncs
}: {
  siteKey: string
  backupTitle: string
  syncs: boolean
}): SiteExport {
  const [stage, setStage] = useState<ZipStage>('confirm')
  const [error, setError] = useState('')
  const [codeError, setCodeError] = useState('')
  const [retryCode, setRetryCode] = useState(false)
  const [retryDownload, setRetryDownload] = useState(false)
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null)
  const [current, setCurrent] = useState<ExportState | null>(null)
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  /** An export downloaded earlier whose package has expired: its install code is still shown. */
  const [earlier, setEarlier] = useState<ExportState | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Opening finds the last package and its install code where the customer left them.
  const foundReady = useRef(false)
  // A fresh export pressed (or started after a sync) before this answer landed wins over it.
  const fresh = useRef(false)
  useEffect(() => {
    let stop = false
    void (async () => {
      try {
        const { response, body } = await json(`/api/sites/${encodeURIComponent(siteKey)}/export/latest`)
        const found = response.ok ? (body?.export as ExportState | null) : null
        if (stop || !found || fresh.current) return
        if (found.state === 'ready') {
          foundReady.current = true
          setCurrent((now) => now ?? found)
          setStage((now) => (now === 'confirm' ? 'ready' : now))
        } else if (found.installCode) setEarlier(found)
      } catch {
        /* the flow works without it: a fresh export */
      }
    })()
    return () => {
      stop = true
    }
  }, [siteKey])

  // A site that syncs from live is never handed a package made before its latest sync: a package
  // found on opening goes back to being the earlier one (its install code still shown).
  useEffect(() => {
    if (!syncs || !foundReady.current || stage !== 'ready') return
    foundReady.current = false
    setEarlier(current)
    setCurrent(null)
    setStage('confirm')
  }, [syncs, stage, current])

  const run = useCallback(async (): Promise<void> => {
    fresh.current = true
    setBusy(true)
    setError('')
    setRetryCode(false)
    setRetryDownload(false)
    setCurrent(null)
    setStage('backup')
    try {
      const started = await startFreshSiteExport({
        siteKey,
        title: backupTitle,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      })
      setCurrent({ exportId: started.exportId, version: started.version, state: 'queued' })
      setStage('packing')
    } catch (e) {
      if (alive.current) {
        setError(e instanceof Error ? e.message : 'EXPORT_FAILED')
        setStage('failed')
      }
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [siteKey, backupTitle])

  useEffect(() => {
    if (!current || !['packing', 'backup'].includes(stage)) return
    let stop = false
    const poll = async (): Promise<void> => {
      try {
        const { response, body } = await json(
          `/api/sites/${encodeURIComponent(siteKey)}/backups/${current.version}/export/${current.exportId}`
        )
        if (!response.ok) throw new Error(body?.code ?? 'EXPORT_FAILED')
        if (stop) return
        setCurrent({ ...current, ...body })
        if (body.state === 'ready') setStage('ready')
        else if (body.state === 'failed' || body.state === 'expired') {
          setError(body.error ?? body.state)
          setStage('failed')
        }
      } catch {
        /* retry on the next poll */
      }
    }
    const timer = setInterval(() => void poll(), POLL_MS)
    void poll()
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [current?.exportId, current?.version, current?.state, siteKey, stage])

  const requestCode = async (): Promise<void> => {
    if (!current) return
    setBusy(true)
    setError('')
    setCodeError('')
    try {
      const { response, body } = await json(
        `/api/sites/${encodeURIComponent(siteKey)}/backups/${current.version}/export/${current.exportId}/code`,
        { method: 'POST' }
      )
      if (!response.ok || typeof body.challengeId !== 'string') throw new Error(body.code ?? 'CODE_FAILED')
      setChallenge(body.challengeId)
      setCodeExpiresAt(typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : null)
      setCode('')
      setStage('code')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CODE_FAILED')
      setRetryCode(true)
      setStage('failed')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const verify = async (): Promise<void> => {
    if (!current || !challenge || !/^\d{6}$/.test(code)) return
    setBusy(true)
    setCodeError('')
    try {
      const { response, body } = await json(
        `/api/sites/${encodeURIComponent(siteKey)}/backups/${current.version}/export/${current.exportId}/download`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeId: challenge, code })
        }
      )
      if (!response.ok || typeof body.url !== 'string') {
        const refusal = typeof body.code === 'string' ? body.code : 'DOWNLOAD_FAILED'
        if (
          ['DOWNLOAD_CODE_INVALID', 'DOWNLOAD_CODE_EXPIRED', 'DOWNLOAD_CODE_TOO_MANY_ATTEMPTS'].includes(
            refusal
          )
        ) {
          setCodeError(refusal)
          return
        }
        setError(refusal)
        setRetryCode(false)
        setRetryDownload(true)
        setStage('failed')
        return
      }
      const a = document.createElement('a')
      a.href = body.url
      a.rel = 'noopener'
      document.body.append(a)
      a.click()
      a.remove()
      setStage('downloaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DOWNLOAD_FAILED')
      setRetryCode(false)
      setRetryDownload(true)
      setStage('failed')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const retryDownloadRequest = async (): Promise<void> => {
    if (!current) return run()
    setBusy(true)
    setError('')
    setChallenge(null)
    setCode('')
    setCodeError('')
    try {
      const { response, body } = await json(
        `/api/sites/${encodeURIComponent(siteKey)}/backups/${current.version}/export/${current.exportId}`
      )
      if (response.ok && body.state === 'ready') {
        setCurrent({ ...current, ...body })
        setRetryDownload(false)
        setStage('ready')
        return
      }
      if (
        (response.ok && body.state !== 'ready') ||
        ['EXPORT_EXPIRED', 'EXPORT_NOT_READY', 'NOT_FOUND'].includes(body.code) ||
        response.status === 404 ||
        response.status === 410
      ) {
        await run()
        return
      }
      setError(typeof body.code === 'string' ? body.code : 'EXPORT_FAILED')
      setRetryDownload(true)
      setStage('failed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'EXPORT_FAILED')
      setRetryDownload(true)
      setStage('failed')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const shownCode =
    ['ready', 'code', 'downloaded'].includes(stage) && current?.installCode
      ? { code: current.installCode, earlier: null }
      : stage === 'confirm' && earlier?.installCode
        ? { code: earlier.installCode, earlier: earlier.version }
        : null

  return {
    stage,
    error,
    codeError:
      codeError &&
      (codeError === 'DOWNLOAD_CODE_EXPIRED' || (codeExpiresAt !== null && Date.now() >= codeExpiresAt))
        ? 'DOWNLOAD_CODE_EXPIRED'
        : codeError,
    codeExpiresAt,
    current,
    shownCode,
    code,
    setCode,
    busy,
    run: () => void run(),
    requestCode: () => void requestCode(),
    verify: () => void verify(),
    retry: () => void (retryCode ? requestCode() : retryDownload ? retryDownloadRequest() : run())
  }
}
