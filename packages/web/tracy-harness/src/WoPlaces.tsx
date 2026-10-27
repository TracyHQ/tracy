import '@tracy/wo-views/styles.css'

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea
} from '@tracy/ui'
import { htmlLang } from '@tracy/core/interface-languages/resolve'
import { PlacesTable, createTranslate } from '@tracy/wo-views'
import type { ExtraColumn, PlaceRow } from '@tracy/wo-views'
import { Check, RefreshCw, Search, Settings2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { relativeTime } from './cms/relative-time'
import { formatFixed, formatNumber, Trans, useLanguage, useT } from './i18n/index.ts'
import { MENU_PARTS } from './wo-place-menu'
import { WoPlaceInspector } from './WoPlaceInspector'
import { WoResearchAgainDialog } from './WoResearchAgainDialog'
import type { WoPlacesAddress } from './wo-address.ts'
import {
  PLACE_FILTERS,
  decideMerge,
  fetchMergeQueue,
  fetchPlace,
  fetchPlaces,
  addSocialPage,
  judgeSocialPage,
  mergePlace,
  refreshPlace,
  researchAgainMany,
  saveResearchCaps,
  setMediaRevoked,
  splitPlace
} from './wo-places-api'
import {
  againTallyLine,
  centsOfDollars,
  committedCents,
  errorLine,
  failureText,
  formatCents,
  oldestCollection,
  placeRowOf
} from './wo-places-format'
import type {
  MergeCandidate,
  PlaceDetail,
  PlaceFilter,
  PlaceIdentity,
  PlaceMedia,
  PlaceSummary,
  PlacesPage
} from './wo-places-api'

/** `@tracy/wo-views`' own words for the table it draws (that package's dictionary, not /ops'). */
const woViewsT = createTranslate()
const NO_HIDDEN = new Set<never>()
const PAGE = 50

type Dialogs =
  | { kind: 'revoke'; media: PlaceMedia }
  | { kind: 'merge' }
  | { kind: 'split'; identity: PlaceIdentity }
  | { kind: 'caps' }
  | { kind: 'again'; parts?: readonly string[] }
  | null

function FreshnessCell({ place }: { place: PlaceSummary }) {
  const t = useT()
  const oldest = oldestCollection(place)
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant={place.freshness === 'fresh' ? 'secondary' : 'destructive'}>
        {place.freshness === 'fresh'
          ? t('wo-places.freshness.fresh')
          : place.freshness === 'stale'
            ? t('wo-places.freshness.stale')
            : t('wo-places.freshness.never')}
      </Badge>
      <span className="text-muted-foreground text-xs">
        {t('wo-places.freshness.sources', { count: place.sources.length })}
        {oldest ? ` · ${t('wo-places.freshness.oldest', { ago: relativeTime(oldest) ?? '' })}` : ''}
      </span>
    </div>
  )
}

function LastRunCell({ place }: { place: PlaceSummary }) {
  const t = useT()
  const job = place.lastJob
  if (!job) return <span className="text-muted-foreground text-xs">{t('wo-places.lastRun.none')}</span>
  const error = errorLine(job.lastError)
  return (
    <div className="flex max-w-56 flex-col gap-0.5 text-xs">
      <span>
        {job.state}
        {place.nextRunQueued && job.state !== 'queued' ? ` · ${t('wo-places.lastRun.nextQueued')}` : ''}
        <span className="text-muted-foreground"> · {relativeTime(job.updatedAt) ?? '—'}</span>
      </span>
      {error ? (
        <span className="truncate text-destructive" title={error}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

function MergePair({ c, onOpen }: { c: MergeCandidate; onOpen(placeId: string): void }) {
  return (
    <>
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(c.urlPlace.id)}>
        {c.urlPlace.name ?? c.urlPlace.identities[0] ?? c.urlPlace.id}
      </button>
      <span className="text-muted-foreground"> → </span>
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(c.googlePlace.id)}>
        {c.googlePlace.name ?? c.googlePlace.id}
      </button>
    </>
  )
}

/** Approved merges the sweep has not applied yet: waiting for both places to be idle, or failed. */
function WaitingMerges({
  candidates,
  onOpen
}: {
  candidates: MergeCandidate[]
  onOpen(placeId: string): void
}) {
  const t = useT()
  if (!candidates.length) return null
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-muted-foreground text-xs">{t('wo-places.merge.waitingTitle')}</p>
      <ul className="space-y-1.5">
        {candidates.map((c) => (
          <li key={c.id} className="rounded-md border border-border bg-card p-2 text-xs">
            <MergePair c={c} onOpen={onOpen} />
            <span className="text-muted-foreground">
              {' '}
              · {t('wo-places.merge.approvedBy', { who: c.decidedBy ?? t('wo-places.merge.unknown') })}
              {c.applyError ? null : ` · ${t('wo-places.merge.waitsIdle')}`}
            </span>
            {c.applyError ? (
              <p className="text-destructive">{t('wo-places.merge.failed', { error: c.applyError })}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MergeQueue({
  candidates,
  waiting,
  writable,
  busy,
  onDecide,
  onOpen
}: {
  candidates: MergeCandidate[]
  waiting: MergeCandidate[]
  writable: boolean
  busy: string | null
  onDecide(c: MergeCandidate, decision: 'approve' | 'reject'): void
  onOpen(placeId: string): void
}) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const score = (n: number) =>
    formatNumber(n, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }, locale)
  return (
    <div className="space-y-3">
      {candidates.length ? (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-xs"
            >
              <div className="min-w-0">
                <MergePair c={c} onOpen={onOpen} />
                <span className="text-muted-foreground">
                  {' '}
                  · {t('wo-places.merge.score', { score: score(c.score) })} ·{' '}
                  {t('wo-places.merge.matched', {
                    fields: Object.keys(c.evidence).join(', ') || t('wo-places.merge.matchedNothing')
                  })}
                </span>
              </div>
              {writable ? (
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onDecide(c, 'approve')}
                  >
                    <Check className="size-3" aria-hidden />
                    {t('wo-places.merge.approve')}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => onDecide(c, 'reject')}
                  >
                    <X className="size-3" aria-hidden />
                    {t('wo-places.merge.reject')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">{t('wo-places.merge.empty')}</p>
      )}
      <WaitingMerges candidates={waiting} onOpen={onOpen} />
    </div>
  )
}

/** `/ops/wo` › Places: the shared place store across accounts (tasks/todo-wo-shared-research.md P4). */
export function WoPlaces({
  address,
  onAddress
}: {
  /** Tab, search, opened place and the caps dialog live in the page address (`wo-address.ts`). */
  address: WoPlacesAddress
  onAddress: (change: Partial<WoPlacesAddress>, asEntry: boolean) => void
}) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const money = (cents: number | null | undefined) => formatCents(cents, locale)
  const { tab: filter, search, place: selectedId } = address
  const setFilter = (tab: PlaceFilter) => onAddress({ tab }, true)
  const setSelectedId = (place: string | null) => onAddress({ place }, true)
  const [query, setQuery] = useState(search)
  useEffect(() => setQuery(search), [search])
  const [page, setPage] = useState<PlacesPage | null>(null)
  const [extra, setExtra] = useState<PlaceSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  /** Kept as thrown, worded at render so a language change re-words it. */
  const [error, setError] = useState<{ failure: unknown } | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<PlaceDetail | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<MergeCandidate[]>([])
  const [waiting, setWaiting] = useState<MergeCandidate[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [localDialog, setLocalDialog] = useState<Dialogs>(null)
  const dialog: Dialogs = address.dialog === 'caps' ? { kind: 'caps' } : localDialog
  const setDialog = (next: Dialogs) => {
    if (next?.kind === 'caps') return onAddress({ dialog: 'caps' }, true)
    if (address.dialog) onAddress({ dialog: null }, true)
    setLocalDialog(next)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchPlaces({ q: search, state: filter, limit: PAGE })
      setPage(next)
      setExtra([])
      setCursor(next.nextCursor)
      setError(null)
      if (filter === 'merge') {
        const [pending, approved] = await Promise.all([
          fetchMergeQueue('pending'),
          fetchMergeQueue('waiting')
        ])
        setQueue(pending)
        setWaiting(approved)
      }
    } catch (e) {
      setError({ failure: e })
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    void load()
  }, [load])

  const loadDetail = useCallback(async (id: string) => {
    setDetail(null)
    try {
      setDetail(await fetchPlace(id))
    } catch (e) {
      setError({ failure: e })
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const places = useMemo(() => [...(page?.places ?? []), ...extra], [page, extra])
  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places])
  const rows = useMemo(() => places.map((place) => placeRowOf(t, place)), [places, t])
  const writable = page?.writable ?? false

  const run = async (label: string, action: () => Promise<string | null>) => {
    setBusy(label)
    setNotice(null)
    try {
      const message = await action()
      setNotice(message)
      setError(null)
      await load()
      if (selectedId) await loadDetail(selectedId)
    } catch (e) {
      setError({ failure: e })
    } finally {
      setBusy(null)
    }
  }

  const refresh = (ids: string[]) =>
    run('refresh', async () => {
      for (const id of ids) await refreshPlace(id)
      return t('wo-places.notice.refreshQueued', { count: ids.length })
    })

  const researchAgainSelected = (ids: string[]) =>
    run('research-again', async () =>
      t('wo-places.notice.researchAgain', { tally: againTallyLine(t, await researchAgainMany(ids)) })
    )

  const columns: ExtraColumn[] = [
    {
      id: 'freshness',
      header: t('wo-places.column.freshness'),
      cell: (r: PlaceRow) => {
        const p = byId.get(r.key)
        return p ? <FreshnessCell place={p} /> : null
      }
    },
    {
      id: 'accounts',
      header: t('wo-places.column.accounts'),
      cell: (r: PlaceRow) => {
        const p = byId.get(r.key)
        return p ? (
          <span className="text-xs tabular-nums">
            <Trans
              i18nKey="wo-places.accounts.cell"
              values={{ accounts: p.accounts, opportunities: p.opportunities }}
              components={{ muted: <span className="text-muted-foreground" /> }}
            />
          </span>
        ) : null
      }
    },
    {
      id: 'cost',
      header: t('wo-places.column.cost'),
      cell: (r: PlaceRow) => {
        const p = byId.get(r.key)
        if (!p) return null
        const { today, last30 } = p.cost
        return (
          <div className="flex flex-col text-xs tabular-nums">
            <span>{money(today.spentCents)}</span>
            {today.reservedCents || today.unreconciledCents ? (
              <span className="text-muted-foreground">
                {t('wo-places.cost.heldLine', {
                  held: money(today.reservedCents),
                  unreconciled: money(today.unreconciledCents)
                })}
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {t('wo-places.cost.last30', { amount: money(committedCents(last30)) })}
            </span>
          </div>
        )
      }
    },
    {
      id: 'last-run',
      header: t('wo-places.column.lastRun'),
      cell: (r: PlaceRow) => {
        const p = byId.get(r.key)
        return p ? <LastRunCell place={p} /> : null
      }
    },
    {
      id: 'media',
      header: t('wo-places.column.media'),
      cell: (r: PlaceRow) => {
        const p = byId.get(r.key)
        if (!p) return null
        return (
          <span className="text-xs tabular-nums">
            {p.media.total}
            {p.media.revoked ? (
              <span className="text-destructive">
                {' '}
                · {t('wo-places.media.revokedCount', { count: p.media.revoked })}
              </span>
            ) : null}
          </span>
        )
      }
    },
    {
      id: 'actions',
      header: t('wo-places.column.actions'),
      inCard: false,
      cell: (r: PlaceRow) =>
        writable ? (
          <Button
            size="xs"
            variant="outline"
            disabled={busy !== null}
            onClick={(e) => {
              e.stopPropagation()
              refresh([r.key])
            }}
          >
            <RefreshCw className="size-3" aria-hidden />
            {t('wo-places.refresh')}
          </Button>
        ) : null
    }
  ]

  const caps = page?.caps
  const today = page?.today

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as PlaceFilter)}>
          <TabsList variant="line" aria-label={t('wo-places.filter.aria')}>
            {PLACE_FILTERS.map((f) => (
              <TabsTrigger key={f} value={f} className="gap-1.5">
                {t(`wo-places.filter.${f}`)}
                <span className="text-muted-foreground text-xs">{page?.counts[f] ?? '—'}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            onAddress({ search: query.trim() }, false)
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('wo-places.search.placeholder')}
            aria-label={t('wo-places.search.aria')}
            className="h-8 w-64 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8"
            aria-label={t('wo-places.search.button')}
          >
            <Search className="size-3.5" />
          </Button>
          {writable && checked.size ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null}
              onClick={() => refresh([...checked])}
            >
              {t('wo-places.refreshSelected', { count: checked.size })}
            </Button>
          ) : null}
          {writable && checked.size ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={busy !== null}
              onClick={() => researchAgainSelected([...checked])}
            >
              {t('wo-places.researchAgainSelected', { count: checked.size })}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setDialog({ kind: 'caps' })}
          >
            <Settings2 className="size-3.5" />
            {t('wo-places.caps.title')}
          </Button>
        </form>
      </div>

      {today ? (
        <p className="text-muted-foreground text-xs">
          {t('wo-places.today.label')}{' '}
          <Trans
            i18nKey="wo-places.cost.line"
            values={{
              spent: money(today.spentCents),
              held: money(today.reservedCents),
              unreconciled: money(today.unreconciledCents)
            }}
            components={{ b: <span className="text-foreground" /> }}
          />
          {caps?.dailyCapCents !== null && caps?.dailyCapCents !== undefined
            ? ` · ${t('wo-places.today.cap', {
                cap: money(caps.dailyCapCents),
                left: money(Math.max(0, caps.dailyCapCents - committedCents(today)))
              })}`
            : ''}
        </p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{failureText(t, error.failure)}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? <p className="text-xs">{notice}</p> : null}

      {filter === 'merge' ? (
        <MergeQueue
          candidates={queue}
          waiting={waiting}
          writable={writable}
          busy={busy}
          onOpen={setSelectedId}
          onDecide={(c, decision) =>
            void run('decide', async () => {
              const { candidate } = await decideMerge(c.id, decision)
              if (decision === 'reject') return t('wo-places.notice.keptApart')
              return candidate.applied ? t('wo-places.notice.merged') : t('wo-places.notice.mergeApproved')
            })
          }
        />
      ) : null}

      <div className={selectedId ? 'grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]' : undefined}>
        <div className="tracy-wo min-w-0">
          {loading && !page ? (
            <p className="text-muted-foreground text-xs">{t('wo-places.loading')}</p>
          ) : (
            <PlacesTable
              t={woViewsT}
              rows={rows}
              selected={checked}
              hidden={NO_HIDDEN}
              columns={[]}
              sortable={false}
              sort="score"
              dir={-1}
              onSort={() => {}}
              rowClick="open"
              activeKey={selectedId}
              card={{ score: false, facts: false }}
              extraColumns={columns}
              actions={{
                onToggle: (key) =>
                  setChecked((prev) => {
                    const next = new Set(prev)
                    if (!next.delete(key)) next.add(key)
                    return next
                  }),
                onOpen: (row) => setSelectedId(row.key)
              }}
            />
          )}
          {cursor ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={loading}
              onClick={async () => {
                try {
                  const more = await fetchPlaces({ q: search, state: filter, cursor, limit: PAGE })
                  setExtra((prev) => [...prev, ...more.places])
                  setCursor(more.nextCursor)
                } catch (e) {
                  setError({ failure: e })
                }
              }}
            >
              {t('wo-places.loadMore')}
            </Button>
          ) : null}
        </div>
        {selectedId ? (
          <WoPlaceInspector
            detail={detail}
            loading={!detail}
            writable={writable}
            busy={busy}
            onClose={() => setSelectedId(null)}
            onRefresh={() => refresh([selectedId])}
            onResearchAgain={() => setDialog({ kind: 'again' })}
            onReadMenuAgain={() => setDialog({ kind: 'again', parts: MENU_PARTS })}
            onJudgePage={(searched, verdict) =>
              void run('social-page', async () => {
                await judgeSocialPage(selectedId, searched.url, verdict)
                return verdict === 'confirm'
                  ? t('wo-places.notice.pageAdded')
                  : t('wo-places.notice.pageRejected')
              })
            }
            onAddPage={async (url) => {
              let added = false
              await run('social-page', async () => {
                const out = await addSocialPage(selectedId, url)
                added = true
                return out.added ? t('wo-places.notice.pageAddedLater') : t('wo-places.notice.pageKnown')
              })
              return added
            }}
            onMerge={() => setDialog({ kind: 'merge' })}
            onSplit={(identity) => setDialog({ kind: 'split', identity })}
            onRevoke={(media) => setDialog({ kind: 'revoke', media })}
            onUnrevoke={(media) =>
              void run('unrevoke', async () => {
                await setMediaRevoked(selectedId, media.id, false)
                return t('wo-places.notice.mediaRestored')
              })
            }
          />
        ) : null}
      </div>

      <WoResearchAgainDialog
        open={dialog?.kind === 'again'}
        placeId={selectedId}
        placeName={detail?.place.name ?? null}
        busy={busy}
        parts={dialog?.kind === 'again' ? dialog.parts : undefined}
        onClose={() => setDialog(null)}
        run={(label, action) => {
          setDialog(null)
          void run(label, action)
        }}
      />
      <PlaceDialogs
        dialog={dialog}
        placeId={selectedId}
        caps={caps ?? null}
        writable={writable}
        busy={busy}
        onClose={() => setDialog(null)}
        run={(label, action) => {
          setDialog(null)
          void run(label, action)
        }}
      />
    </div>
  )
}

function PlaceDialogs({
  dialog,
  placeId,
  caps,
  writable,
  busy,
  onClose,
  run
}: {
  dialog: Dialogs
  placeId: string | null
  caps: PlacesPage['caps'] | null
  writable: boolean
  busy: string | null
  onClose(): void
  run(label: string, action: () => Promise<string | null>): void
}) {
  const t = useT()
  const [reason, setReason] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [targets, setTargets] = useState<PlaceSummary[]>([])
  const [daily, setDaily] = useState('')
  const [perJob, setPerJob] = useState('')
  const [newPlaces, setNewPlaces] = useState('')

  useEffect(() => {
    setReason('')
    setTargetQuery('')
    setTargets([])
    if (dialog?.kind === 'caps') {
      setDaily(
        caps?.dailyCapCents === null || caps?.dailyCapCents === undefined
          ? ''
          : formatFixed(caps.dailyCapCents / 100, 2)
      )
      setPerJob(
        caps?.jobCapCents === null || caps?.jobCapCents === undefined
          ? ''
          : formatFixed(caps.jobCapCents / 100, 2)
      )
      setNewPlaces(
        caps?.newPlacesPerAccountPerDay === null || caps?.newPlacesPerAccountPerDay === undefined
          ? ''
          : String(caps.newPlacesPerAccountPerDay)
      )
    }
  }, [dialog, caps])

  const capsKnown = caps !== null && caps.dailyCapCents !== null
  const dailyCents = centsOfDollars(daily)
  const jobCents = centsOfDollars(perJob)
  const perAccount = /^\d{1,5}$/.test(newPlaces.trim()) ? Number(newPlaces.trim()) : null

  return (
    <>
      <Dialog open={dialog?.kind === 'revoke'} onOpenChange={(open) => (open ? null : onClose())}>
        <DialogContent closeLabel={t('wo-places.dialog.close')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('wo-places.revoke.title')}</DialogTitle>
            <DialogDescription>{t('wo-places.revoke.description')}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="wo-revoke-reason">{t('wo-places.revoke.reason')}</FieldLabel>
            <Textarea
              id="wo-revoke-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
            <FieldDescription>{t('wo-places.revoke.reasonHint')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('wo-places.dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || busy !== null || dialog?.kind !== 'revoke' || !placeId}
              onClick={() => {
                if (dialog?.kind !== 'revoke' || !placeId) return
                const media = dialog.media
                run('revoke', async () => {
                  await setMediaRevoked(placeId, media.id, true, reason.trim())
                  return t('wo-places.notice.mediaRevoked')
                })
              }}
            >
              {t('wo-places.revoke.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === 'merge'} onOpenChange={(open) => (open ? null : onClose())}>
        <DialogContent closeLabel={t('wo-places.dialog.close')} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('wo-places.mergeInto.title')}</DialogTitle>
            <DialogDescription>{t('wo-places.mergeInto.description')}</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault()
              const found = await fetchPlaces({ q: targetQuery.trim(), limit: 10 })
              setTargets(found.places.filter((p) => p.id !== placeId))
            }}
          >
            <Input
              value={targetQuery}
              onChange={(e) => setTargetQuery(e.target.value)}
              placeholder={t('wo-places.search.placeholder')}
              aria-label={t('wo-places.mergeInto.findAria')}
            />
            <Button type="submit" variant="outline" aria-label={t('wo-places.mergeInto.find')}>
              <Search className="size-3.5" />
            </Button>
          </form>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {targets.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
              >
                <span className="min-w-0 truncate">
                  {p.name ?? p.id}
                  <span className="text-muted-foreground">
                    {' '}
                    · {t('wo-places.mergeInto.accounts', { count: p.accounts })}
                  </span>
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!writable || busy !== null || !placeId}
                  onClick={() => {
                    if (!placeId) return
                    run('merge', async () => {
                      const out = await mergePlace(placeId, p.id)
                      return t('wo-places.notice.mergedMoved', { count: out.opportunities })
                    })
                  }}
                >
                  {t('wo-places.mergeInto.button')}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === 'split'} onOpenChange={(open) => (open ? null : onClose())}>
        <DialogContent closeLabel={t('wo-places.dialog.close')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('wo-places.split.title')}</DialogTitle>
            <DialogDescription>
              {t('wo-places.split.description', {
                identity:
                  dialog?.kind === 'split'
                    ? `${dialog.identity.namespace}: ${dialog.identity.externalId}`
                    : ''
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('wo-places.dialog.cancel')}
            </Button>
            <Button
              disabled={!writable || busy !== null || !placeId}
              onClick={() => {
                if (dialog?.kind !== 'split' || !placeId) return
                const identity = dialog.identity
                run('split', async () => {
                  const out = await splitPlace(placeId, identity)
                  return t('wo-places.notice.splitMoved', { count: out.opportunities })
                })
              }}
            >
              {t('wo-places.split.button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === 'caps'} onOpenChange={(open) => (open ? null : onClose())}>
        <DialogContent closeLabel={t('wo-places.dialog.close')} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('wo-places.caps.title')}</DialogTitle>
            <DialogDescription>{t('wo-places.caps.description')}</DialogDescription>
          </DialogHeader>
          {capsKnown ? null : <p className="text-muted-foreground text-xs">{t('wo-places.caps.unknown')}</p>}
          <Field>
            <FieldLabel htmlFor="wo-cap-daily">{t('wo-places.caps.daily')}</FieldLabel>
            <Input
              id="wo-cap-daily"
              value={daily}
              disabled={!capsKnown || !writable}
              onChange={(e) => setDaily(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="wo-cap-job">{t('wo-places.caps.perRun')}</FieldLabel>
            <Input
              id="wo-cap-job"
              value={perJob}
              disabled={!capsKnown || !writable}
              onChange={(e) => setPerJob(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="wo-cap-new">{t('wo-places.caps.newPlaces')}</FieldLabel>
            <Input
              id="wo-cap-new"
              value={newPlaces}
              disabled={!capsKnown || !writable}
              onChange={(e) => setNewPlaces(e.target.value)}
            />
            <FieldDescription>{t('wo-places.caps.newPlacesHint')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('wo-places.dialog.cancel')}
            </Button>
            <Button
              disabled={
                !capsKnown ||
                !writable ||
                busy !== null ||
                dailyCents === null ||
                jobCents === null ||
                perAccount === null
              }
              onClick={() => {
                if (dailyCents === null || jobCents === null || perAccount === null) return
                run('caps', async () => {
                  await saveResearchCaps({
                    researchDailyCapCents: dailyCents,
                    researchJobCapCents: jobCents,
                    newPlacesPerAccountPerDay: perAccount
                  })
                  return t('wo-places.notice.capsSaved')
                })
              }}
            >
              {t('wo-places.dialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
