import { Badge, Button, Separator, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@tracy/ui'
import { useTranslation } from '@tracy/i18n'
import { BookmarkPlus, History, RotateCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  siteChanges,
  siteHistory,
  siteRecord,
  type SiteChangeFile,
  type SiteChanges,
  type SiteHistory as SiteHistoryData
} from './siteApi'

const STATUS_LETTER: Record<SiteChangeFile['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D'
}

const STATUS_CLASS: Record<SiteChangeFile['status'], string> = {
  added: 'text-success',
  modified: 'text-warning',
  deleted: 'text-destructive'
}

/**
 * The site-state drawer: the on-screen Site's Changes + History (Release) — the cloud version of
 * AgentRightPane in Tracy Desk. One Site, one drawer: whatever the drawer has no data for, it says
 * plainly is not there yet, never invents data.
 */
export function SiteDrawer({ siteKey, onClose }: { siteKey: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <aside className="absolute inset-y-0 top-11 right-0 z-10 flex w-full max-w-90 flex-col border-border border-l bg-background shadow-2xl">
      <div className="flex h-11 flex-none items-center gap-2 border-border border-b px-3">
        <History size={14} className="text-muted-foreground" />
        <span className="flex-1 truncate font-semibold tracking-tight">{t('site.drawer.title')}</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('site.drawer.close')}>
          <X />
        </Button>
      </div>
      <Tabs defaultValue="changes" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex-none border-border border-b px-2 pt-1.5">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="changes" className="flex-1">
              {t('site.tab.changes')}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              {t('site.tab.history')}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="changes" className="min-h-0 flex-1 data-[state=inactive]:hidden">
          <ChangesPanel siteKey={siteKey} />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 flex-1 data-[state=inactive]:hidden">
          <HistoryPanel siteKey={siteKey} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

type PanelState<T> = { kind: 'loading' } | { kind: 'ready'; data: T } | { kind: 'error'; reason: string }

function ChangesPanel({ siteKey }: { siteKey: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<PanelState<SiteChanges>>({ kind: 'loading' })
  const [sealing, setSealing] = useState(false)

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    siteChanges(siteKey)
      .then((data) => setState({ kind: 'ready', data }))
      .catch((err: unknown) =>
        setState({
          kind: 'error',
          reason: err instanceof Error ? err.message : t('site.fleetUnreachable')
        })
      )
  }, [siteKey])

  useEffect(load, [load])

  async function handleRecord() {
    setSealing(true)
    try {
      const result = await siteRecord(siteKey)
      load()
      // sealed:false means "nothing left unrecorded" — a success with a different sentence, not a refusal.
      window.alert(
        result.sealed
          ? t('site.changes.recorded', { count: result.files })
          : t('site.changes.recordedNothing')
      )
    } catch {
      window.alert(t('site.changes.recordFailed'))
    } finally {
      setSealing(false)
    }
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <span className="text-muted-foreground text-sm">{t('site.fleetSilent')}</span>
        <span className="text-muted-foreground/70 text-xs">{state.reason}</span>
        <Button variant="outline" size="sm" onClick={load}>
          <RotateCw /> {t('common.tryAgain')}
        </Button>
      </div>
    )
  }

  const { files, webroot, codeCopySyncedAt } = state.data

  if (webroot === 'unavailable') {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <span className="text-muted-foreground text-sm">{t('site.changes.unavailable')}</span>
        <Button variant="outline" size="sm" onClick={load}>
          <RotateCw /> {t('common.tryAgain')}
        </Button>
      </div>
    )
  }

  if (webroot === 'not-built') {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <span className="text-muted-foreground text-sm">{t('site.changes.noBaseline')}</span>
        <span className="text-muted-foreground/70 text-xs">{t('site.changes.noBaselineWhy')}</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-2 border-border border-b px-3 py-1.5">
        <span className="text-muted-foreground text-xs">
          {t('site.changes.count', { count: files.length })}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          disabled={sealing || files.length === 0}
          onClick={handleRecord}
        >
          <BookmarkPlus size={13} /> {sealing ? t('site.changes.recording') : t('site.record')}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={load} aria-label={t('site.changes.refresh')}>
          <RotateCw />
        </Button>
      </div>
      {files.length === 0 ? (
        <div className="p-4 text-muted-foreground text-sm">{t('site.changes.nothing')}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
              title={file.path}
            >
              <span className={`flex-none font-mono text-xs uppercase ${STATUS_CLASS[file.status]}`}>
                {STATUS_LETTER[file.status]}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs" dir="rtl">
                {file.path}
              </span>
              {file.additions !== null && (
                <span className="flex-none font-mono text-[11px] text-success">+{file.additions}</span>
              )}
              {file.deletions !== null && file.deletions > 0 && (
                <span className="flex-none font-mono text-[11px] text-destructive">−{file.deletions}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {codeCopySyncedAt !== null && (
        <div className="flex-none border-border border-t px-3 py-1 text-[11px] text-muted-foreground">
          {t('site.changes.copyFrom', { when: new Date(codeCopySyncedAt * 1000).toLocaleString() })}
        </div>
      )}
    </div>
  )
}

function relativeTime(at: number | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (at === null) return t('site.history.dateUnknown')
  const minutes = Math.round((Date.now() - at * 1000) / 60_000)
  if (minutes < 1) return t('site.history.justNow')
  if (minutes < 60) return t('site.history.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('site.history.hoursAgo', { count: hours })
  return new Date(at * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function HistoryPanel({ siteKey }: { siteKey: string }) {
  const { t } = useTranslation()
  const [state, setState] = useState<PanelState<SiteHistoryData>>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    siteHistory(siteKey)
      .then((data) => setState({ kind: 'ready', data }))
      .catch((err: unknown) =>
        setState({
          kind: 'error',
          reason: err instanceof Error ? err.message : t('site.fleetUnreachable')
        })
      )
  }, [siteKey])

  useEffect(load, [load])

  if (state.kind === 'loading') {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <span className="text-muted-foreground text-sm">{t('site.fleetSilent')}</span>
        <span className="text-muted-foreground/70 text-xs">{state.reason}</span>
        <Button variant="outline" size="sm" onClick={load}>
          <RotateCw /> {t('common.tryAgain')}
        </Button>
      </div>
    )
  }

  const { releases } = state.data

  if (releases.length === 0) {
    return <div className="p-4 text-muted-foreground text-sm">{t('site.history.none')}</div>
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      {releases.map((release, index) => (
        <div key={release.version} className="flex items-start gap-2.5 px-3 py-2">
          <Badge variant="outline" className="mt-0.5 flex-none">
            v{release.version}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{release.title}</div>
            <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
              <span>{relativeTime(release.at, t)}</span>
              <Separator orientation="vertical" className="h-3" />
              <span className="font-mono text-[11px]">{release.sha.slice(0, 8)}</span>
            </div>
          </div>
          {index === 0 && <Badge>{t('site.history.latest')}</Badge>}
        </div>
      ))}
    </div>
  )
}
