/**
 * The two tabs (Lee, 06/09, spec-brand-engine §6 decision 2): the SAME machinery, two shapes.
 *
 *   Brand          the customer's own site — one address, locked; one card. The first step before a
 *                  redesign: press once, and the agent reads the result instead of taking screenshots.
 *   Brand builder  any other site — an address field, a list of reference cards, each removable.
 *
 * Both poll the host half while an extraction runs and hand the finished card the way into Design
 * inspirations, where the same brand is already the first card (`brand:<host>`).
 */
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Input, TabLoadingBar } from '@tracy/ui'

import {
  type BrandRow,
  fetchBrands,
  fetchJob,
  fetchJobs,
  type Job,
  type Kind,
  removeBrand,
  startExtract
} from './api'
import { BrandCard } from './BrandCard'
import { hostOfInput } from './failure'
import { JobProgress } from './JobProgress'
import type { Translate } from './strings'

const POLL_MS = 700

/**
 * The brands on disk plus the jobs in flight, kept in step: a job that ends refreshes the list.
 * One hook for both tabs; each filters by `kind`.
 */
function useBrands(
  kind: Kind,
  /** The tab's own site — the host a refused own-site extraction (`extract(null)`) is filed under. */
  ownSite: string | null = null
): {
  rows: BrandRow[] | null
  failed: boolean
  jobs: Job[]
  /** The host whose removal just failed, so the tab can say so; null when nothing failed. */
  removeFailed: string | null
  extract: (url: string | null) => Promise<void>
  /** Follow a job someone else started (the `?fork=` hook in index.tsx) until it ends. */
  adopt: (host: string) => void
  remove: (host: string) => Promise<void>
  retry: () => void
} {
  const [rows, setRows] = useState<BrandRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [jobs, setJobs] = useState<Job[]>([])
  const [attempt, setAttempt] = useState(0)
  const [removeFailed, setRemoveFailed] = useState<string | null>(null)
  const timers = useRef(new Map<string, number>())

  const reload = useCallback(() => {
    fetchBrands()
      .then((all) => {
        setRows(all.filter((r) => r.kind === kind))
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [kind])

  useEffect(() => {
    setRows(null)
    reload()
  }, [reload, attempt])

  // Poll one host until its job ends; a finished job leaves the list after the reload draws its card.
  const watch = useCallback(
    (host: string) => {
      const tick = (): void => {
        void fetchJob(host).then((job) => {
          if (job === null) {
            setJobs((js) => js.filter((j) => j.host !== host))
            return
          }
          setJobs((js) => [...js.filter((j) => j.host !== host), job])
          if (job.state === 'running') {
            timers.current.set(host, window.setTimeout(tick, POLL_MS))
          } else {
            reload()
            if (job.state === 'done') {
              timers.current.set(
                host,
                window.setTimeout(() => setJobs((js) => js.filter((j) => j.host !== host)), 1500)
              )
            }
          }
        })
      }
      window.clearTimeout(timers.current.get(host))
      tick()
    },
    [reload]
  )

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const id of map.values()) window.clearTimeout(id)
      map.clear()
    }
  }, [])

  const extract = useCallback(
    async (url: string | null) => {
      const started = await startExtract(url, kind)
      if ('refused' in started) {
        // Filed under the site it was for: `?` matched no host, so the Brand tab showed nothing.
        const host = hostOfInput(url, ownSite)
        const failed: Job = {
          host,
          kind,
          state: 'failed',
          startedAt: Date.now(),
          steps: [],
          error: { code: started.refused, error: started.refused }
        }
        setJobs((js) => [...js.filter((j) => j.host !== host), failed])
        return
      }
      setJobs((js) => [...js.filter((j) => j.host !== started.host), started])
      watch(started.host)
    },
    [kind, ownSite, watch]
  )

  const remove = useCallback(
    async (host: string) => {
      setRemoveFailed(null)
      if (await removeBrand(host)) {
        setJobs((js) => js.filter((j) => j.host !== host))
        reload()
      } else {
        setRemoveFailed(host)
      }
    },
    [reload]
  )

  return {
    rows,
    failed,
    jobs,
    removeFailed,
    extract,
    adopt: watch,
    remove,
    retry: () => setAttempt((n) => n + 1)
  }
}

function Failed({ t, onRetry }: { t: Translate; onRetry: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-start gap-2 text-muted-foreground text-sm">
      <p className="m-0">{t('state.failed')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('action.retry')}
      </Button>
    </div>
  )
}

export function BrandTab({
  siteKey,
  openInspiration,
  t
}: {
  siteKey: string | null
  /** Opens Design inspirations on this brand's card; null when the sidebar cannot open tabs. */
  openInspiration: ((id: string) => void) | null
  t: Translate
}): JSX.Element {
  const { rows, failed, jobs, extract, retry } = useBrands('own', siteKey)
  const own =
    rows?.find((r) => siteKey === null || r.host === siteKey.toLowerCase().replace(/^www\./, '')) ?? null
  const job =
    jobs.find((j) => siteKey === null || j.host === siteKey.toLowerCase().replace(/^www\./, '')) ?? null
  const running = job?.state === 'running'

  return (
    <div className="tracy-brand-engine flex flex-col gap-3 p-3 text-foreground text-sm">
      {own === null && rows !== null ? (
        <p className="m-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-snug">
          {t('brand.intro')}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <label className="shrink-0 text-muted-foreground text-xs" htmlFor="tracy-brand-site">
          {t('brand.site')}
        </label>
        <Input
          id="tracy-brand-site"
          readOnly
          value={siteKey ? `https://${siteKey}` : ''}
          className="h-8 flex-1 text-xs"
        />
        <Button size="sm" disabled={running || siteKey === null} onClick={() => void extract(null)}>
          {own ? t('brand.extractAgain') : t('brand.extract')}
        </Button>
      </div>
      {job ? <JobProgress job={job} t={t} /> : null}
      {failed ? <Failed t={t} onRetry={retry} /> : null}
      {/* The tab's shared loading bar, under the tab strip, while the brands are read (Akemi, 30/09).
          Always rendered here so it keeps its minimum time and fades; absolute, so no flex gap. */}
      <TabLoadingBar loading={rows === null && !failed} label={t('loading.label')} />
      {own ? (
        <BrandCard
          row={own}
          onOpen={openInspiration ? () => openInspiration(own.id) : null}
          onExtractAgain={() => void extract(null)}
          onRemove={null}
          t={t}
        />
      ) : null}
    </div>
  )
}

export function BuilderTab({
  openInspiration,
  forkHost,
  t
}: {
  openInspiration: ((id: string) => void) | null
  /** The site a `?fork=` link named: its job is already running on the host half — follow it. */
  forkHost?: string
  t: Translate
}): JSX.Element {
  const { rows, failed, jobs, removeFailed, extract, adopt, remove, retry } = useBrands('reference')
  // Jobs this tab did not start — the `?fork=` hook (index.tsx) or the agent's `tracy_brand extract`
  // — are adopted on mount: a running fork shows its progress, a failed one shows why. Measured 06/09
  // on tchclaude-ai-clone: a fork of claude.ai failed behind an anti-bot wall and the customer saw nothing.
  useEffect(() => {
    if (forkHost) adopt(forkHost)
    void fetchJobs().then((all) => {
      for (const j of all) if (j.kind === 'reference' && j.host !== forkHost) adopt(j.host)
    })
  }, [forkHost, adopt])
  const [url, setUrl] = useState('')
  const [bad, setBad] = useState(false)

  const add = (): void => {
    const raw = url.trim()
    // The host half validates for real; this only keeps an obvious non-address from becoming a job.
    if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(raw)) {
      setBad(true)
      return
    }
    setBad(false)
    setUrl('')
    void extract(raw)
  }

  return (
    <div className="tracy-brand-engine flex flex-col gap-3 p-3 text-foreground text-sm">
      <p className="m-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-snug">
        {t('builder.intro')}
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('builder.placeholder')}
          aria-invalid={bad || undefined}
          className="h-8 flex-1 text-xs"
          inputMode="url"
        />
        <Button size="sm" type="submit" disabled={url.trim() === ''}>
          {t('builder.add')}
        </Button>
      </form>
      {bad ? <p className="m-0 -mt-2 text-destructive text-xs">{t('builder.badUrl')}</p> : null}
      {jobs.map((j) => (
        <JobProgress key={j.host} job={j} t={t} />
      ))}
      {removeFailed ? (
        <p className="m-0 text-destructive text-xs" role="alert">
          {t('builder.removeFailed', { host: removeFailed })}
        </p>
      ) : null}
      {failed ? <Failed t={t} onRetry={retry} /> : null}
      {/* The tab's shared loading bar, under the tab strip, while the brands are read (Akemi, 30/09).
          Always rendered here so it keeps its minimum time and fades; absolute, so no flex gap. */}
      <TabLoadingBar loading={rows === null && !failed} label={t('loading.label')} />
      {rows !== null && rows.length === 0 && jobs.length === 0 ? (
        <p className="m-0 text-muted-foreground text-xs">{t('builder.empty')}</p>
      ) : null}
      {rows?.map((r) => (
        <BrandCard
          key={r.id}
          row={r}
          onOpen={openInspiration ? () => openInspiration(r.id) : null}
          onExtractAgain={() => void extract(r.source.url)}
          onRemove={() => {
            if (window.confirm(t('builder.removeConfirm', { host: r.host }))) void remove(r.host)
          }}
          t={t}
        />
      ))}
    </div>
  )
}
