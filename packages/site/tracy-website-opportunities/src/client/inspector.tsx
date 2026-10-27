/**
 * The Inspector beside My opportunities (plan D6): the customer's cut of `/ops/wo`'s inspector, with
 * no operator parts. Header `[next action] [View details] [×]`, then Research (one row per source),
 * What happens next, Demo site, Current website (mobile), Google Place and Profile.
 *
 * It draws what it is given: the list row (kept fresh by the list's poll) and the detail answer
 * (`GET /opportunities/:id`) the consumer fetched. Nothing here fetches.
 */
import type { JSX, ReactNode } from 'react'
import {
  ChevronLeft,
  CircleCheck,
  CirclePause,
  CircleMinus,
  CircleX,
  Clock,
  ExternalLink,
  ImageIcon,
  Maximize2,
  X
} from 'lucide-react'
import { Badge, Button, Spinner } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { type DemoCellActions, DemoCell, formatDistance } from '@tracy/wo-views'

import { Steps, type DemoStepFacts } from './demo-progress.tsx'
import type { AgainControl } from './research-again-dialog.tsx'
import { SendDemo } from './send-demo.tsx'
import type { OutreachDraft } from './outreach-model.ts'
import { mediaUrl } from './api.ts'
import { CMS_LABEL, sourceLabel } from './cms-label.ts'
import { brandObservation, googlePlaceView, pageSpeedView } from './detail-model.ts'
import { MenuBlock } from './menu-block.tsx'
import { readMenu } from './menu-model.ts'
import { type RollupTone, demoFacts, demoSite, mediaPreview, researchRollup } from './inspector-model.ts'
import { ActionButton, StatusCell } from './opportunity-cells.tsx'
import {
  type NextAction,
  type OpportunityListRow,
  nextStepText,
  relativeTime,
  stageOf
} from './opportunity-row.ts'
import { type ShownSource, type SourceInput, type Tone, isShownSource, sourceRow } from './status.ts'
import { type SearchPage, searchPagesOf } from './research-again.ts'
import type { Translate } from './strings.ts'

type Body = Record<string, unknown>

export interface InspectorProps {
  send?: OutreachDraft | null
  onCloseSend?: () => void
  buildDisabled?: boolean
  t: Translate
  row: OpportunityListRow
  /** The detail answer; null while it loads. */
  detail: Body | null
  /** The detail answer failed; `onRetry` asks again. */
  failed?: boolean
  /** The next action is in flight. */
  busy?: boolean
  locale?: string
  now?: number
  onAction: (action: NextAction, row: OpportunityListRow) => void
  onDetails: () => void
  onClose: () => void
  onRetry?: () => void
  /** Retry on one source row (`useSourceRetry`); absent: no Retry is drawn. */
  retrySource?: SourceRetry
  /** Extend, Reopen, Rebuild or Retry of the row's demo (`pressDemo`). */
  demoActions?: DemoCellActions
  /** Research again on the Research step (`useResearchAgain`); absent: no button. */
  researchAgain?: AgainControl
  /** Read menu again in the Menu block (Research again over `MENU_PARTS`); absent: no button. */
  readMenuAgain?: AgainControl
}

const isRecord = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function hostOf(url: string | null): string | null {
  if (url === null) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function Section({
  title,
  aside,
  tint = false,
  children
}: {
  title: string
  aside?: ReactNode
  tint?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <section className={cn('tracy-wo-insp-sec', tint && 'is-tint')} aria-label={title}>
      <div className="tracy-wo-insp-sec-head">
        <h3 className="tracy-wo-h3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** "Label value" pairs, two or four across. */
export function Facts({
  items,
  wide = false
}: {
  items: Array<[string, ReactNode]>
  wide?: boolean
}): JSX.Element {
  return (
    <dl className={cn('tracy-wo-kv', wide && 'is-wide')}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const ROLLUP_ICON: Readonly<Record<RollupTone, typeof CircleCheck | null>> = {
  ok: CircleCheck,
  bad: CircleX,
  paused: CirclePause,
  run: null,
  idle: null
}

export function Rollup({ t, job }: { t: Translate; job: OpportunityListRow['job'] }): JSX.Element {
  const view = researchRollup(job)
  const Icon = ROLLUP_ICON[view.tone]
  return (
    <span className={`tracy-wo-roll is-${view.tone}`}>
      {view.tone === 'run' ? <Spinner label={t(view.key)} /> : Icon ? <Icon aria-hidden="true" /> : null}
      {t(view.key)}
    </span>
  )
}

const SOURCE_ICON: Readonly<Record<Tone, typeof CircleCheck>> = {
  ok: CircleCheck,
  partial: CirclePause,
  blocked: CircleX,
  failed: CircleX,
  skipped: CircleMinus,
  waiting: Clock
}

/** Retry on one source row: `busy` is being asked for, `failed` did not start. */
export interface SourceRetry {
  busy: ShownSource | null
  failed: ShownSource | null
  onPress: (source: ShownSource) => void
}

export function Sources({
  t,
  sources,
  retry
}: {
  t: Translate
  sources: SourceInput[]
  /** Absent where the page cannot start a research: no Retry is drawn. */
  retry?: SourceRetry
}): JSX.Element {
  if (sources.length === 0) return <p className="tracy-wo-muted">{t('inspector.noSources')}</p>
  return (
    <div className="tracy-wo-srcs">
      {sources.map((s) => {
        const row = sourceRow(s)
        const search = searchStatusKey(s)
        const pages = searchPagesOf(s)
        const reasonKey = search === null ? row.reasonKey : s.status === 'failed' ? row.reasonKey : null
        const Icon = SOURCE_ICON[row.tone]
        const retrySource =
          retry !== undefined && row.retryable && isShownSource(row.source) ? row.source : null
        const coverage =
          row.total !== null
            ? t('source.coverage', { fetched: row.fetched, total: row.total })
            : row.fetched > 0
              ? t('source.coverageOpen', { fetched: row.fetched })
              : null
        return (
          <details
            key={row.source}
            className="tracy-wo-src"
            open={(row.tone !== 'ok' && row.tone !== 'waiting') || search === 'again.search.pending'}
          >
            <summary>
              <span className="tracy-wo-src-name">
                <Icon aria-hidden="true" className={`tracy-wo-src-icon is-${row.tone}`} />
                {sourceLabel(t, row.source)}
              </span>
              <span className="tracy-wo-muted">{t(search ?? row.statusKey)}</span>
            </summary>
            <div className="tracy-wo-src-body">
              {coverage === null && reasonKey === null && search === null ? t('inspector.nothingYet') : null}
              {typeof s.queries === 'number' ? (
                <span className="tracy-wo-small">{t('again.search.queries', { count: s.queries })} </span>
              ) : null}
              {s.ref && /^https?:\/\//.test(s.ref) ? (
                <a href={s.ref} target="_blank" rel="noopener noreferrer" className="tracy-wo-demo-url">
                  {s.ref}
                </a>
              ) : null}
              {coverage}
              {coverage !== null && reasonKey !== null ? ' · ' : null}
              {reasonKey !== null ? t(reasonKey) : null}
              {pages.length > 0 ? <SearchPages t={t} pages={pages} /> : null}
              {retry !== undefined && retrySource !== null ? (
                <span className="tracy-wo-row tracy-wo-wrap tracy-wo-src-retry">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={retry.busy === row.source}
                    onClick={() => retry.onPress(retrySource)}
                  >
                    {t('action.retry')}
                  </Button>
                  {retry.failed === row.source ? (
                    <span className="tracy-wo-error" role="alert">
                      {t('source.retryFailed')}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </details>
        )
      })}
    </div>
  )
}

/** A search row's own words: a page added, a page waiting for a person, or none found; null for other rows. */
function searchStatusKey(s: SourceInput): string | null {
  if (s.source !== 'facebook-search' && s.source !== 'instagram-search') return null
  if (s.status === 'complete') return s.reason === 'pending' ? 'again.search.pending' : 'again.search.added'
  if (s.status === 'skipped' && s.reason === 'not_found') return 'again.search.none'
  return null
}

const VERDICT_BADGE = { confirmed: 'secondary', pending: 'outline', rejected: 'ghost' } as const

/** The pages a search found: Added, Needs a check (only Tracy's team decides) or Not used, with short evidence. */
function SearchPages({ t, pages }: { t: Translate; pages: SearchPage[] }): JSX.Element {
  return (
    <ul className="tracy-wo-search-pages">
      {pages.map((p) => (
        <li key={p.url} className="tracy-wo-search-page">
          <span className="tracy-wo-row tracy-wo-wrap">
            <Badge variant={VERDICT_BADGE[p.verdict]}>{t(p.verdictKey)}</Badge>
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="tracy-wo-demo-url">
              {p.label}
            </a>
          </span>
          {p.title !== null ? <span className="tracy-wo-small">{p.title}</span> : null}
          {p.proofKeys.length > 0 ? (
            <span className="tracy-wo-small">
              {t('again.proofs', { list: p.proofKeys.map((k) => t(k)).join(', ') })}
            </span>
          ) : null}
          {p.reasonKeys.length > 0 ? (
            <span className="tracy-wo-small">{p.reasonKeys.map((k) => t(k)).join(' · ')}</span>
          ) : null}
          {p.verdict === 'pending' ? (
            <span className="tracy-wo-small">{t('again.page.pendingNote')}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Demo site: the ready site's address, the build in progress or why it stopped; the Details page draws it too. */
export function DemoSection({
  t,
  row,
  detail,
  locale = interfaceLocale() ?? 'en',
  now = Date.now(),
  actions
}: {
  t: Translate
  row: OpportunityListRow
  detail: Body | null
  locale?: string
  now?: number
  /** The demo's countdown and its one press (tasks/todo-wo-demo-retention.md). */
  actions?: DemoCellActions
}): JSX.Element {
  const stage = stageOf(row)
  const demo = demoSite(detail)
  const facts = demoFacts(row, detail)
  const demoLink = demo?.links ? (demo.links.live ?? demo.links.workspace) : null
  return (
    <Section
      title={t('inspector.demo')}
      aside={demo?.cms ? <Badge variant="outline">{CMS_LABEL[demo.cms] ?? demo.cms}</Badge> : undefined}
    >
      {facts?.url ? (
        <a className="tracy-wo-demo-url" href={facts.url} target="_blank" rel="noopener noreferrer">
          {facts.url}
        </a>
      ) : demo?.phase === 'done' && demoLink !== null ? (
        <a
          className="tracy-wo-action-link"
          href={demoLink}
          {...(demo.links?.live ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {hostOf(demo.links?.live ?? null) ?? t('build.openSite')}
          <ExternalLink aria-hidden="true" className="tracy-wo-icon" />
        </a>
      ) : demo?.phase === 'running' ? (
        <p className="tracy-wo-note" role="status">
          <Spinner label={t('build.running')} />
          {t('build.running')}
        </p>
      ) : demo?.phase === 'failed' ? (
        <p className="tracy-wo-error">{t('build.failed', { reason: t(demo.reasonKey ?? 'reason.other') })}</p>
      ) : facts?.deletedAt ? null : (
        <p className="tracy-wo-muted">
          {stage === 'demo'
            ? t('inspector.briefNoDemo', { n: row.latestRevision?.n ?? 1 })
            : t('inspector.noDemo')}
        </p>
      )}
      {facts && (facts.frozenAt || facts.deletedAt || (demo?.phase === 'done' && facts.expiresAt)) ? (
        <DemoCell t={t} locale={locale} demo={facts} now={now} actions={actions} showSite={false} />
      ) : null}
    </Section>
  )
}

export function Inspector({
  t,
  row,
  detail,
  failed = false,
  busy = false,
  locale = interfaceLocale() ?? 'en',
  now = Date.now(),
  onAction,
  onDetails,
  onClose,
  demoActions,
  retrySource,
  researchAgain,
  readMenuAgain,
  send,
  onCloseSend,
  buildDisabled
}: InspectorProps): JSX.Element {
  const ago = (at: unknown) => relativeTime(typeof at === 'string' ? at : null, now, locale)
  const candidate = isRecord(row.candidate) ? row.candidate : {}
  const profile = isRecord(detail?.profile) ? detail.profile : null
  const next = nextStepText(row)
  const added = ago(row.createdAt)

  const distance = num(candidate.distanceM)
  const price = num(candidate.priceLevel)
  const meta = [
    str(candidate.category),
    distance === null ? null : formatDistance(distance, locale),
    price !== null && price > 0 ? '$'.repeat(price) : null
  ].filter(Boolean)

  const header = (
    <div className="tracy-wo-insp-head">
      <div className="tracy-wo-insp-title-block">
        <Button type="button" size="xs" variant="ghost" className="tracy-wo-insp-back" onClick={onClose}>
          <ChevronLeft aria-hidden="true" />
          {t('list.title')}
        </Button>
        <div className="tracy-wo-row tracy-wo-wrap">
          <StatusCell t={t} row={row} />
          {added ? (
            <span className="tracy-wo-muted tracy-wo-small">{t('research.added', { ago: added })}</span>
          ) : null}
        </div>
        <h2 className="tracy-wo-insp-title">
          {row.name ?? ''}
          {row.branch ? <span className="tracy-wo-muted">{` · ${row.branch}`}</span> : null}
        </h2>
        {meta.length ? <p className="tracy-wo-muted tracy-wo-small">{meta.join(' · ')}</p> : null}
      </div>
      <div className="tracy-wo-row tracy-wo-insp-acts">
        <ActionButton t={t} row={row} busy={busy} disabled={buildDisabled} onAction={onAction} />
        <Button type="button" size="xs" variant="outline" onClick={onDetails}>
          <Maximize2 aria-hidden="true" />
          {t('inspector.details')}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('results.map.close')}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  )

  const sources =
    detail === null ? (
      <p className={failed ? 'tracy-wo-error' : 'tracy-wo-muted'}>
        {t(failed ? 'detail.failed' : 'loading.label')}
      </p>
    ) : (
      <Sources
        t={t}
        sources={(Array.isArray(detail.sources) ? detail.sources : []) as SourceInput[]}
        retry={retrySource}
      />
    )

  const whatNext = (
    <Section title={t('inspector.next')}>
      <p className="tracy-wo-muted">
        {next.reasonKey ? `${t(next.reasonKey)} ` : null}
        {t(next.key, next.params)}
      </p>
    </Section>
  )

  const demoSection = (
    <DemoSection t={t} row={row} detail={detail} locale={locale} now={now} actions={demoActions} />
  )

  const website = str(candidate.website)
  const speed = pageSpeedView(profile?.pageSpeed)
  const score = (v: number | null) => (v === null ? t('answer.unknown') : String(v))
  const lcp =
    speed?.lcpSeconds == null
      ? t('answer.unknown')
      : new Intl.NumberFormat(locale, {
          style: 'unit',
          unit: 'second',
          unitDisplay: 'short',
          maximumFractionDigits: 1
        }).format(speed.lcpSeconds)
  const currentSite =
    website !== null || speed !== null ? (
      <Section title={t('detail.site')}>
        {website !== null ? <p className="tracy-wo-muted">{hostOf(website) ?? website}</p> : null}
        {speed !== null ? (
          <>
            <Facts
              wide
              items={[
                [t('detail.site.performance'), score(speed.performance)],
                [t('detail.site.seo'), score(speed.seo)],
                [t('detail.site.lcp'), lcp],
                [
                  t('detail.site.https'),
                  t(
                    speed.https === true
                      ? 'answer.yes'
                      : speed.https === false
                        ? 'answer.no'
                        : 'answer.unknown'
                  )
                ]
              ]}
            />
            <p className="tracy-wo-muted">
              {t('detail.site.checked', { date: ago(speed.checkedAt) ?? speed.checkedAt })}
            </p>
          </>
        ) : (
          <p className="tracy-wo-muted">{t('inspector.notMeasured')}</p>
        )}
      </Section>
    ) : null

  const rating = num(candidate.rating)
  const reviews = num(candidate.reviews)
  const place = googlePlaceView(profile?.googlePlace)
  const reviewSummary = place?.summaries.find((s) => s.kind === 'reviews') ?? null
  const placeFacts: Array<[string, ReactNode]> = []
  if (rating !== null)
    placeFacts.push([t('inspector.rating'), `★ ${new Intl.NumberFormat(locale).format(rating)}`])
  if (reviews !== null)
    placeFacts.push([t('detail.google.reviews'), new Intl.NumberFormat(locale).format(reviews)])
  if (place?.price)
    placeFacts.push([
      t('detail.google.price'),
      place.price === 'free' ? t('detail.google.price.free') : place.price
    ])
  if (place && place.reservable !== null)
    placeFacts.push([
      t(profile?.trade === 'food' ? 'detail.google.reservable' : 'detail.google.reservable.any'),
      t(place.reservable ? 'answer.yes' : 'answer.no')
    ])
  const google =
    placeFacts.length > 0 || reviewSummary !== null ? (
      <Section title={t('detail.google')}>
        {placeFacts.length > 0 ? <Facts items={placeFacts} /> : null}
        {reviewSummary !== null ? (
          <>
            <span className="tracy-wo-label">{t('detail.google.summary.reviews')}</span>
            <p className="tracy-wo-quote">{reviewSummary.text}</p>
          </>
        ) : null}
      </Section>
    ) : null

  const brand = brandObservation(isRecord(profile?.brand) ? profile.brand : null)
  const media = mediaPreview(detail?.media)
  const profileSection =
    brand !== null || media.total > 0 ? (
      <Section title={t('detail.profile')}>
        {brand !== null ? (
          <>
            <span className="tracy-wo-label">{t('detail.colors')}</span>
            <ul className="tracy-wo-swatches">
              {brand.colors.map((c, i) => (
                <li
                  key={`${c.hex}-${i}`}
                  className="tracy-wo-chip"
                  style={{ backgroundColor: c.hex }}
                  title={c.hex}
                />
              ))}
            </ul>
            {brand.observedOnly ? (
              <p className="tracy-wo-muted tracy-wo-small">
                {t(
                  brand.origin === 'website'
                    ? 'detail.colorsObserved.website'
                    : 'detail.colorsObserved.social'
                )}
              </p>
            ) : null}
          </>
        ) : null}
        {media.total > 0 ? (
          <>
            <span className="tracy-wo-label">{t('inspector.media', { count: media.total })}</span>
            <ul className="tracy-wo-thumbs">
              {media.tiles.map((m) => (
                <li key={m.id}>
                  <img
                    src={mediaUrl(m.id)}
                    alt={t(`media.category.${m.category}`)}
                    loading="lazy"
                    decoding="async"
                  />
                </li>
              ))}
              {media.tiles.length === 0 ? (
                <li>
                  <ImageIcon aria-hidden="true" className="tracy-wo-icon" />
                </li>
              ) : null}
            </ul>
          </>
        ) : null}
      </Section>
    ) : null

  return (
    <aside className="tracy-wo-insp" aria-label={t('inspector.label')}>
      {header}
      {send ? (
        <SendDemo key={row.id} t={t} draft={send} locale={locale} onClose={onCloseSend ?? onClose} />
      ) : null}
      <Steps
        t={t}
        row={row}
        facts={detail?.progress as DemoStepFacts | undefined}
        locale={locale}
        now={now}
        onBrief={row.latestRevision ? onDetails : undefined}
        again={researchAgain}
      >
        {sources}
      </Steps>
      {whatNext}
      {demoSection}
      <MenuBlock
        t={t}
        locale={locale}
        menu={readMenu(detail?.menu)}
        name={row.name ?? ''}
        again={readMenuAgain}
      />
      {currentSite}
      {google}
      {profileSection}
    </aside>
  )
}
