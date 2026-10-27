import { htmlLang } from '@tracy/core/interface-languages/resolve'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import {
  Check,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Split,
  Undo2,
  UtensilsCrossed,
  Video,
  X
} from 'lucide-react'
import { useState } from 'react'

import { relativeTime } from './cms/relative-time'
import { Trans, useLanguage, useT } from './i18n/index.ts'
import { ViewAsUserButton } from './ViewAsUserButton'
import { WoPlaceMenu } from './WoPlaceMenu'
import { errorLine, formatCents, pagesToJudge, partLabel } from './wo-places-format'
import type { PlaceDetail, PlaceIdentity, PlaceMedia, PlaceSource, SearchedPage } from './wo-places-api'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-semibold text-foreground text-xs">{title}</h3>
      {children}
    </section>
  )
}

const ago = (iso: string | null | undefined) => relativeTime(iso) ?? '—'

function MediaTile({
  media,
  writable,
  busy,
  onRevoke,
  onUnrevoke
}: {
  media: PlaceMedia
  writable: boolean
  busy: boolean
  onRevoke(): void
  onUnrevoke(): void
}) {
  const t = useT()
  const Icon = media.kind === 'video' ? Video : ImageIcon
  return (
    <li
      className="flex flex-col gap-1 rounded-md border border-border bg-card p-2"
      data-revoked={Boolean(media.revokedAt)}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{media.provider ?? media.source}</span>
        </span>
        {media.revokedAt ? (
          <Badge variant="destructive">{t('wo-places.inspector.revoked')}</Badge>
        ) : media.inCurrentSnapshot ? (
          <Badge variant="secondary">{t('wo-places.inspector.inUse')}</Badge>
        ) : null}
      </div>
      <a
        href={media.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
        title={media.sourceUrl}
      >
        <span className="truncate">{media.sourceUrl.replace(/^https?:\/\//, '')}</span>
        <ExternalLink className="size-3 shrink-0" aria-hidden />
      </a>
      <span className="text-muted-foreground">
        {media.width && media.height ? `${media.width}×${media.height} · ` : ''}
        {t('wo-places.inspector.collectedAgo', { ago: ago(media.collectedAt) })}
      </span>
      {media.revokedAt ? (
        <span className="text-destructive">
          {t('wo-places.inspector.revokeReason', { reason: media.revokeReason ?? '' })}
        </span>
      ) : null}
      {writable ? (
        media.revokedAt ? (
          <Button size="xs" variant="outline" disabled={busy} onClick={onUnrevoke}>
            <Undo2 className="size-3" aria-hidden />
            {t('wo-places.inspector.restore')}
          </Button>
        ) : (
          <Button size="xs" variant="outline" disabled={busy} onClick={onRevoke}>
            {t('wo-places.inspector.revoke')}
          </Button>
        )
      ) : null}
    </li>
  )
}

const SEARCH_VERDICTS = new Set(['confirmed', 'pending', 'rejected'])

/** The pages one social search found; the ones it left pending wait for an operator's verdict. */
function SearchedPages({
  source,
  writable,
  busy,
  onJudge
}: {
  source: PlaceSource
  writable: boolean
  busy: boolean
  onJudge(page: SearchedPage, verdict: 'confirm' | 'reject'): void
}) {
  const t = useT()
  const pages = source.pages ?? []
  if (!pages.length) return null
  const toJudge = new Set(pagesToJudge(source))
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground">
        {t('wo-places.pages.found', { part: partLabel(t, source.source) })}
      </p>
      <ul className="space-y-1.5">
        {pages.map((p) => (
          <li key={p.url} className="space-y-1 rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
                title={p.url}
              >
                <span className="truncate">{p.evidence?.title || p.url.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
              <Badge
                variant={
                  p.verdict === 'pending'
                    ? 'destructive'
                    : p.verdict === 'confirmed'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {SEARCH_VERDICTS.has(p.verdict) ? t(`wo-places.pages.verdict.${p.verdict}`) : p.verdict}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {[
                p.provider,
                p.evidence?.query ? t('wo-places.pages.query', { query: p.evidence.query }) : null,
                p.evidence?.proofs?.length
                  ? t('wo-places.pages.matches', { list: p.evidence.proofs.join(', ') })
                  : null,
                p.evidence?.reasons?.length
                  ? t('wo-places.pages.unsure', { list: p.evidence.reasons.join(', ') })
                  : null,
                p.judgedBy ? t('wo-places.pages.judgedBy', { who: p.judgedBy }) : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {writable && toJudge.has(p) ? (
              <div className="flex gap-1.5">
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onJudge(p, 'confirm')}>
                  <Check className="size-3" aria-hidden />
                  {t('wo-places.pages.confirm')}
                </Button>
                <Button size="xs" variant="outline" disabled={busy} onClick={() => onJudge(p, 'reject')}>
                  <X className="size-3" aria-hidden />
                  {t('wo-places.pages.reject')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A social page no search found (pilot 24/10/2026: a restaurant's Facebook page); the server checks the address. */
/** The example in the address field: a URL, the same in every language. */
const EXAMPLE_URL = 'https://example.com/…'

function AddSocialPage({ busy, onAdd }: { busy: boolean; onAdd(url: string): Promise<boolean> }) {
  const t = useT()
  const [url, setUrl] = useState('')
  return (
    <form
      className="space-y-1"
      onSubmit={async (e) => {
        e.preventDefault()
        if (url.trim() && (await onAdd(url.trim()))) setUrl('')
      }}
    >
      <p className="text-muted-foreground">{t('wo-places.pages.addTitle')}</p>
      <div className="flex items-center gap-1.5">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={EXAMPLE_URL}
          aria-label={t('wo-places.pages.addAria')}
          className="h-7 text-xs"
        />
        <Button type="submit" size="xs" variant="outline" disabled={busy || !url.trim()}>
          <Plus className="size-3" aria-hidden />
          {t('wo-places.pages.add')}
        </Button>
      </div>
    </form>
  )
}

/** The right-hand panel of the Places tab: everything `GET /api/ops/wo/places/:id` answers. */
export function WoPlaceInspector({
  detail,
  loading,
  writable,
  busy,
  onClose,
  onRefresh,
  onResearchAgain,
  onReadMenuAgain,
  onJudgePage,
  onAddPage,
  onMerge,
  onSplit,
  onRevoke,
  onUnrevoke
}: {
  detail: PlaceDetail | null
  loading: boolean
  writable: boolean
  busy: string | null
  onClose(): void
  onRefresh(): void
  onResearchAgain(): void
  onReadMenuAgain(): void
  onJudgePage(page: SearchedPage, verdict: 'confirm' | 'reject'): void
  onAddPage(url: string): Promise<boolean>
  onMerge(): void
  onSplit(identity: PlaceIdentity): void
  onRevoke(media: PlaceMedia): void
  onUnrevoke(media: PlaceMedia): void
}) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  if (!detail)
    return (
      <Card className="sticky top-4 py-3">
        <CardContent className="flex items-center gap-2 px-4 text-muted-foreground text-xs">
          {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {t('wo-places.inspector.loading')}
        </CardContent>
      </Card>
    )
  const { place, menu } = detail
  const identities = [
    ...place.identities.map((i) => ({ ...i, merged: false })),
    ...detail.mergedPlaces.flatMap((p) => p.identities.map((i) => ({ ...i, merged: true })))
  ]
  return (
    <Card className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto py-3">
      <CardHeader className="px-4 py-0 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{place.name ?? t('wo-places.unnamed')}</CardTitle>
            <CardDescription className="font-mono text-[11px]">{place.id}</CardDescription>
          </div>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            aria-label={t('wo-places.inspector.close')}
          >
            <X className="size-4" />
          </Button>
        </div>
        {writable ? (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {menu?.applicable ? (
              <Button
                size="xs"
                variant="outline"
                disabled={busy !== null || Boolean(place.mergedInto)}
                onClick={onReadMenuAgain}
              >
                <UtensilsCrossed className="size-3" aria-hidden />
                {t('wo-places.inspector.readMenuAgain')}
              </Button>
            ) : null}
            <Button size="xs" disabled={busy !== null || Boolean(place.mergedInto)} onClick={onResearchAgain}>
              <RotateCcw className="size-3" aria-hidden />
              {t('wo-places.inspector.researchAgain')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy !== null || Boolean(place.mergedInto)}
              onClick={onRefresh}
            >
              <RefreshCw className="size-3" aria-hidden />
              {t('wo-places.inspector.forceRefresh')}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={busy !== null || Boolean(place.mergedInto)}
              onClick={onMerge}
            >
              {t('wo-places.inspector.mergeInto')}
            </Button>
          </div>
        ) : null}
        {place.mergedInto ? (
          <p className="pt-2 text-muted-foreground text-xs">
            {t('wo-places.inspector.mergedInto', { id: place.mergedInto })}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4 px-4 py-0 text-xs">
        <Section title={t('wo-places.inspector.sources')}>
          {place.sources.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('wo-places.inspector.source')}</TableHead>
                  <TableHead>{t('wo-places.inspector.status')}</TableHead>
                  <TableHead>{t('wo-places.inspector.collected')}</TableHead>
                  <TableHead>{t('wo-places.inspector.lastError')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {place.sources.map((s) => (
                  <TableRow key={s.source}>
                    <TableCell className="font-medium" title={s.source}>
                      {partLabel(t, s.source)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{s.status}</TableCell>
                    <TableCell>
                      <span className={s.stale ? 'text-destructive' : undefined}>{ago(s.collectedAt)}</span>
                    </TableCell>
                    <TableCell
                      className="max-w-40 truncate text-muted-foreground"
                      title={errorLine(s.lastError) ?? undefined}
                    >
                      {errorLine(s.lastError) ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">{t('wo-places.inspector.nothingCollected')}</p>
          )}
          {place.sources.map((s) => (
            <SearchedPages
              key={`pages-${s.source}`}
              source={s}
              writable={writable}
              busy={busy !== null}
              onJudge={onJudgePage}
            />
          ))}
          {writable && !place.mergedInto ? <AddSocialPage busy={busy !== null} onAdd={onAddPage} /> : null}
        </Section>

        {menu ? (
          <Section title={t('wo-places.inspector.menu', { count: menu.items.length })}>
            <WoPlaceMenu menu={menu} media={detail.media} />
          </Section>
        ) : null}

        <Section title={t('wo-places.inspector.identities', { count: identities.length })}>
          <ul className="space-y-1">
            {identities.map((i) => (
              <li key={`${i.namespace}:${i.externalId}`} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-[11px]">
                  {i.namespace}: {i.externalId}
                  {i.merged ? (
                    <span className="text-muted-foreground"> {t('wo-places.inspector.merged')}</span>
                  ) : null}
                </span>
                {writable && (i.merged || place.identities.length > 1) ? (
                  <Button size="xs" variant="ghost" disabled={busy !== null} onClick={() => onSplit(i)}>
                    <Split className="size-3" aria-hidden />
                    {t('wo-places.split.button')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title={t('wo-places.inspector.media', { total: place.media.total, revoked: place.media.revoked })}
        >
          {detail.media.length ? (
            <ul className="grid grid-cols-2 gap-1.5">
              {detail.media.map((m) => (
                <MediaTile
                  key={m.id}
                  media={m}
                  writable={writable}
                  busy={busy !== null}
                  onRevoke={() => onRevoke(m)}
                  onUnrevoke={() => onUnrevoke(m)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('wo-places.inspector.noMedia')}</p>
          )}
        </Section>

        <Section title={t('wo-places.inspector.accounts', { count: detail.accounts.length })}>
          <ul className="space-y-0.5">
            {detail.accounts.map((a) => (
              <li key={a.accountId} className="flex justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {a.email}
                  <ViewAsUserButton email={a.email} />
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {t('wo-places.inspector.opportunities', { count: a.opportunities })}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('wo-places.inspector.cost')}>
          {detail.costByOperation.length ? (
            <ul className="space-y-1">
              {detail.costByOperation.map((c) => (
                <li key={`${c.provider}/${c.operation}`} className="flex flex-col">
                  <span>
                    {c.provider} · {c.operation}
                    <span className="text-muted-foreground">
                      {' '}
                      · {t('wo-places.inspector.calls', { count: c.calls })}
                    </span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    <Trans
                      i18nKey="wo-places.cost.line"
                      values={{
                        spent: formatCents(c.spentCents, locale),
                        held: formatCents(c.reservedCents, locale),
                        unreconciled: formatCents(c.unreconciledCents, locale)
                      }}
                      components={{ b: <span className="text-foreground" /> }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('wo-places.inspector.noPaidCalls')}</p>
          )}
        </Section>

        <Section title={t('wo-places.inspector.snapshots')}>
          <ul className="space-y-0.5">
            {detail.snapshots.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  <Badge variant={s.id === place.snapshot?.id ? 'default' : 'outline'}>{s.state}</Badge>{' '}
                  {t('wo-places.inspector.snapshotCounts', { sources: s.sources, media: s.media })}
                </span>
                <span className="text-muted-foreground">{ago(s.publishedAt ?? s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('wo-places.inspector.recentRuns')}>
          <ul className="space-y-0.5">
            {detail.jobs.map((j) => (
              <li key={j.id} className="flex flex-col">
                <span className="flex justify-between gap-2">
                  <span>
                    {j.state} · {j.stage}
                    {j.force ? ` · ${t('wo-places.inspector.forced')}` : ''}
                  </span>
                  <span className="text-muted-foreground">{ago(j.updatedAt)}</span>
                </span>
                {errorLine(j.lastError) ? (
                  <span className="text-destructive">{errorLine(j.lastError)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('wo-places.inspector.history')}>
          {detail.history.length ? (
            <ul className="space-y-0.5">
              {detail.history.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    <Trans
                      i18nKey="wo-places.inspector.historyBy"
                      values={{ action: e.action, actor: e.actor }}
                      components={{ muted: <span className="text-muted-foreground" /> }}
                    />
                  </span>
                  <span className="text-muted-foreground">{ago(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t('wo-places.inspector.noHistory')}</p>
          )}
        </Section>
      </CardContent>
    </Card>
  )
}
