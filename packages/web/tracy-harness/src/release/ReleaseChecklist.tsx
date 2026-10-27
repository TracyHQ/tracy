/**
 * `/ops/release` — the release checklist: everything to check before and after a new version.
 *
 * The list and the automatic verdicts come from `GET /api/ops/release-checklist`
 * (`apps/tracy-web/src/ops/release-checklist.js`); this screen draws them and keeps the manual
 * ticks. 🔒 TICKS LIVE IN THIS BROWSER ONLY (Vincent, 08/10/2026), keyed by deployment and by the
 * release the server reports, so a new image starts with a clean list. They are a person's notes,
 * not shared state: a teammate on another machine sees their own ticks.
 *
 * An automatic verdict is the server's measurement on this request; a tick never overrides it.
 * A line counts as done when its verdict passes or it is ticked.
 */
import { Badge, Button, Card, Checkbox, cn, Skeleton } from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { formatDateTime, useT } from '../i18n'

type AutoState = 'pass' | 'fail' | 'warn' | 'info'
interface Item {
  id: string
  group: string
  title: string
  how: string
  auto: { state: AutoState; detail: string } | null
}
interface Checklist {
  environment: string
  origin: string
  release: string
  groups: { id: string; title: string }[]
  items: Item[]
  checkedAt: string
}

const stateLabelKey = (state: AutoState) => `release.state.${state}`
const STATE_CLASS: Record<AutoState, string> = {
  pass: 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400',
  fail: 'border-red-600/50 text-red-700 dark:text-red-400',
  warn: 'border-amber-600/50 text-amber-700 dark:text-amber-400',
  info: 'border-border text-muted-foreground'
}

const storageKey = (c: Checklist) => `tracy.ops.releaseChecklist:${c.environment}:${c.release}`

function readTicks(key: string): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeTicks(key: string, ticks: Record<string, boolean>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ticks))
  } catch {
    // A browser that refuses storage keeps the ticks for this page view only.
  }
}

export function ReleaseChecklist() {
  const t = useT()
  const [data, setData] = useState<Checklist | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [ticks, setTicks] = useState<Record<string, boolean>>({})
  const [onlyOpen, setOnlyOpen] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch('/api/ops/release-checklist', {
        signal,
        headers: { accept: 'application/json' }
      })
      const body = response.ok ? ((await response.json()) as Checklist) : null
      if (signal?.aborted) return
      setData(body)
      setFailed(body === null)
      if (body) setTicks(readTicks(storageKey(body)))
    } catch {
      if (!signal?.aborted) setFailed(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
  }, [load])

  const toggle = (id: string, on: boolean) => {
    if (!data) return
    const next = { ...ticks, [id]: on }
    setTicks(next)
    writeTicks(storageKey(data), next)
  }

  const done = (i: Item) => i.auto?.state === 'pass' || ticks[i.id] === true
  const stats = useMemo(() => {
    const items = data?.items ?? []
    return {
      total: items.length,
      done: items.filter(done).length,
      fail: items.filter((i) => i.auto?.state === 'fail').length,
      warn: items.filter((i) => i.auto?.state === 'warn').length
    }
  }, [data, ticks])

  return (
    <div className="mx-auto min-w-0 max-w-5xl px-8 py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">{t('release.title')}</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('release.blurb', {
              ok: t(stateLabelKey('pass')),
              fix: t(stateLabelKey('fail')),
              check: t(stateLabelKey('warn')),
              note: t(stateLabelKey('info'))
            })}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          {t('release.checkAgain')}
        </Button>
      </div>

      {failed ? (
        <p className="mt-6 text-muted-foreground text-sm">{t('release.readFailed')}</p>
      ) : !data ? (
        <Skeleton className="mt-6 h-64 w-full" />
      ) : (
        <>
          {data.environment === 'local' ? (
            <p className="mt-5 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
              {t('release.local')}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{data.environment}</Badge>
            <span className="font-mono text-[13px]">{data.release}</span>
            <span className="text-muted-foreground">·</span>
            <span>{t('release.done', { done: stats.done, total: stats.total })}</span>
            {stats.fail ? (
              <Badge variant="outline" className={STATE_CLASS.fail}>
                {t('release.toFix', { count: stats.fail })}
              </Badge>
            ) : null}
            {stats.warn ? (
              <Badge variant="outline" className={STATE_CLASS.warn}>
                {t('release.toCheck', { count: stats.warn })}
              </Badge>
            ) : null}
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-muted-foreground">
              <Checkbox checked={onlyOpen} onCheckedChange={(v) => setOnlyOpen(v === true)} />
              {t('release.onlyOpen')}
            </label>
          </div>

          {data.groups.map((group) => {
            const rows = data.items.filter((i) => i.group === group.id && (!onlyOpen || !done(i)))
            if (rows.length === 0) return null
            const all = data.items.filter((i) => i.group === group.id)
            return (
              <section key={group.id} className="mt-6">
                <h2 className="flex items-baseline gap-2 font-medium text-sm">
                  {group.title}
                  <span className="font-normal text-muted-foreground text-xs">
                    {all.filter(done).length} / {all.length}
                  </span>
                </h2>
                <Card className="mt-2 gap-0 p-0">
                  {rows.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 border-border border-b px-4 py-3 last:border-0"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={done(item)}
                        disabled={item.auto?.state === 'pass'}
                        onCheckedChange={(v) => toggle(item.id, v === true)}
                        aria-label={item.title}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', done(item) && 'text-muted-foreground')}>{item.title}</p>
                        <p className="mt-0.5 break-words font-mono text-muted-foreground text-xs">
                          {item.how}
                        </p>
                        {item.auto ? <p className="mt-1 break-words text-xs">{item.auto.detail}</p> : null}
                      </div>
                      {item.auto ? (
                        <Badge
                          variant="outline"
                          className={cn('shrink-0 text-[11px]', STATE_CLASS[item.auto.state])}
                        >
                          {t(stateLabelKey(item.auto.state))}
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </Card>
              </section>
            )
          })}
          <p className="mt-6 text-muted-foreground text-xs">
            {t('release.footer', { when: formatDateTime(data.checkedAt), origin: data.origin })}
          </p>
        </>
      )}
    </div>
  )
}
