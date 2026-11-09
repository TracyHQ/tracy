/**
 * Parts the Details page draws (Section, Facts, the Research rollup, Sources, the Demo site section). They were the
 * Inspector's, the side panel beside My opportunities, which spec #512 removed: a row now opens Details.
 * Nothing here fetches.
 */
import type { JSX, ReactNode } from 'react'
import { CircleCheck, CirclePause, CircleMinus, CircleX, Clock, ExternalLink } from 'lucide-react'
import { Badge, Button, Spinner } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { type DemoCellActions, DemoCell } from '@tracy/wo-views'

import { CMS_LABEL, sourceLabel } from './cms-label.ts'
import { type RollupTone, demoFacts, demoSite, researchRollup } from './inspector-model.ts'
import { type OpportunityListRow, stageOf } from './opportunity-row.ts'
import { type ShownSource, type SourceInput, type Tone, isShownSource, sourceRow } from './status.ts'
import { type SearchPage, searchPagesOf } from './research-again.ts'
import { pastedLinkOf, sourceGroups } from './source-groups.ts'
import type { Translate } from './strings.ts'

type Body = Record<string, unknown>

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
  // The links the owner pasted first; what research looked at by itself below, under its own heading.
  const { pasted, found } = sourceGroups(sources)
  return (
    <div className="tracy-wo-srcs">
      {pasted.map((s) => (
        <SourceItem key={s.source} t={t} s={s} retry={retry} />
      ))}
      {pasted.length > 0 && found.length > 0 ? (
        <p className="tracy-wo-src-group">{t('source.alsoLookedAt')}</p>
      ) : null}
      {found.map((s) => (
        <SourceItem key={s.source} t={t} s={s} retry={retry} />
      ))}
    </div>
  )
}

/** One source row: its name and status, then coverage, reason, the pages a search found and Retry. */
function SourceItem({ t, s, retry }: { t: Translate; s: SourceInput; retry?: SourceRetry }): JSX.Element {
  const row = sourceRow(s)
  const pastedLink = pastedLinkOf(s)
  const link = pastedLink ?? (s.ref && /^https?:\/\//.test(s.ref) ? s.ref : null)
  const search = searchStatusKey(s)
  const pages = searchPagesOf(s)
  const reasonKey = search === null ? row.reasonKey : s.status === 'failed' ? row.reasonKey : null
  const Icon = SOURCE_ICON[row.tone]
  const retrySource = retry !== undefined && row.retryable && isShownSource(row.source) ? row.source : null
  const coverage =
    row.total !== null
      ? t('source.coverage', { fetched: row.fetched, total: row.total })
      : row.fetched > 0
        ? t('source.coverageOpen', { fetched: row.fetched })
        : null
  return (
    <details
      className="tracy-wo-src"
      open={(row.tone !== 'ok' && row.tone !== 'waiting') || search === 'again.search.pending'}
    >
      <summary>
        <span className="tracy-wo-src-head">
          <span className="tracy-wo-src-name">
            <Icon aria-hidden="true" className={`tracy-wo-src-icon is-${row.tone}`} />
            {sourceLabel(t, row.source, pastedLink ?? s.ref)}
          </span>
          {pastedLink !== null ? (
            <span className="tracy-wo-src-pasted">{`${t('source.link')} · ${pastedLink}`}</span>
          ) : null}
        </span>
        <span className="tracy-wo-muted">{t(search ?? row.statusKey)}</span>
      </summary>
      <div className="tracy-wo-src-body">
        {coverage === null && reasonKey === null && search === null ? t('inspector.nothingYet') : null}
        {typeof s.queries === 'number' ? (
          <span className="tracy-wo-small">{t('again.search.queries', { count: s.queries })} </span>
        ) : null}
        {link !== null ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="tracy-wo-demo-url">
            {link}
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
