/**
 * Parts of the Details page (#517) that used to live in the Inspector: a titled section card and the Sources list
 * (the links the owner pasted first, then what research found, each with its status, reason and Try again). Details
 * owns its copy so the page does not depend on the side panel, which goes away. The Sources card of Details draws the
 * compact list (name, one line, chip); its sub-page draws every row with its details and the two groups.
 */
import { interfaceLocale } from '@tracy/core/interface-languages'
import { collectedLine } from './research-gate-model.ts'
import { Fragment, type JSX, type ReactNode } from 'react'
import { Badge, Button } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import { sourceLabel } from './cms-label.ts'
import { type SearchPage, searchPagesOf } from './research-again.ts'
import { pastedLinkOf, sourceGroups } from './source-groups.ts'
import { safeHttpUrl, shortUrl } from './source-links-model.ts'
import { SourceLogo } from './source-logo.tsx'
import { type ShownSource, type SourceInput, type Tone, isShownSource, sourceRow } from './status.ts'
import type { Translate } from './strings.ts'
export function Section({
  title,
  aside,
  tint = false,
  bare = false,
  children
}: {
  title: string
  aside?: ReactNode
  tint?: boolean
  /** Drawn inside a page section that already carries the title: the content alone, no card. */
  bare?: boolean
  children: ReactNode
}): JSX.Element {
  if (bare) return <>{children}</>
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

/** Retry on one source row: `busy` is being asked for, `failed` did not start. */
export interface SourceRetry {
  busy: ShownSource | null
  failed: ShownSource | null
  onPress: (source: ShownSource) => void
}

export function Sources({
  t,
  sources,
  retry,
  collected = true,
  compact = false
}: {
  t: Translate
  sources: SourceInput[]
  /** Absent where the page cannot start a research: no Retry is drawn. */
  retry?: SourceRetry
  /** False before this card's research: a row with nothing yet reads Not collected yet. */
  collected?: boolean
  /** The Sources card of Details: one line per source, no details, no group headings. */
  compact?: boolean
}): JSX.Element {
  if (sources.length === 0) return <p className="tracy-wo-muted">{t('inspector.noSources')}</p>
  // The links the owner pasted first; what research looked at by itself below, under its own heading.
  const { pasted, found } = sourceGroups(sources)
  const both = !compact && pasted.length > 0 && found.length > 0
  const item = (s: SourceInput): JSX.Element => (
    <SourceItem
      key={`${s.source}:${s.pastedLink ?? ''}`}
      t={t}
      s={s}
      retry={retry}
      collected={collected}
      compact={compact}
    />
  )
  return (
    <div className="tracy-wo-srcs" data-compact={compact ? '' : undefined}>
      {both ? <p className="tracy-wo-src-group">{t('source.usedHere')}</p> : null}
      {pasted.map(item)}
      {both ? <p className="tracy-wo-src-group">{t('source.alsoLookedAt')}</p> : null}
      {found.map(item)}
    </div>
  )
}

/** One source row: its name and status, then coverage, reason, the pages a search found and Retry. */
/** The chip of a source row (mock r5): Complete, Not available, or the row's own state while it is not final. */
const CHIP_CLASS: Readonly<Record<Tone, string>> = {
  ok: 'tracy-wo-chip-ok',
  partial: 'tracy-wo-chip-brand',
  blocked: 'tracy-wo-chip-mute',
  failed: 'tracy-wo-chip-mute',
  skipped: 'tracy-wo-chip-mute',
  waiting: 'tracy-wo-chip-mute'
}

function SourceItem({
  t,
  s,
  retry,
  collected: researched,
  compact
}: {
  t: Translate
  s: SourceInput
  retry?: SourceRetry
  collected: boolean
  compact: boolean
}): JSX.Element {
  const row = sourceRow(s)
  const pastedLink = pastedLinkOf(s)
  const link = safeHttpUrl(pastedLink) ?? safeHttpUrl(s.ref)
  const search = searchStatusKey(s)
  const pages = searchPagesOf(s)
  // A source that gave nothing reads Not available with one plain line; a server's own key error is never named.
  const unavailable = search === null && ['failed', 'skipped', 'blocked'].includes(row.tone)
  const plainReason = unavailable
    ? s.reason === 'not_found'
      ? 'source.notFoundHere'
      : s.reason === 'not_collected'
        ? 'reason.not_collected'
        : 'source.couldNotRead'
    : null
  const chipKey =
    search ??
    (unavailable
      ? 'source.chip.notAvailable'
      : row.tone === 'waiting' && !researched
        ? 'reason.not_collected'
        : row.statusKey)
  const reasonKey = unavailable ? null : search === null ? row.reasonKey : null
  // When its data was collected, the shared research's own date (#524), never when this card's job ended.
  const collected = collectedLine(t, s, interfaceLocale() ?? 'en')
  const retrySource = retry !== undefined && row.retryable && isShownSource(row.source) ? row.source : null
  const coverage =
    row.total !== null
      ? t('source.coverage', { fetched: row.fetched, total: row.total })
      : row.fetched > 0
        ? t('source.coverageOpen', { fetched: row.fetched })
        : null
  const head = (
    <>
      <span className="tracy-wo-src-main">
        <SourceLogo source={row.source} href={link ?? s.ref} />
        <span className="tracy-wo-src-head">
          <span className="tracy-wo-src-name">{sourceLabel(t, row.source, pastedLink ?? s.ref)}</span>
          {link !== null || s.fromSearch || collected !== null || plainReason !== null ? (
            <span className="tracy-wo-src-sub">
              {[
                link !== null ? (
                  <a
                    key="link"
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link}
                    className="tracy-wo-src-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {shortUrl(link)}
                  </a>
                ) : null,
                s.fromSearch ? t('source.fromSearch') : null,
                collected,
                plainReason ? t(plainReason) : null
              ]
                .filter(Boolean)
                .map((part, i) => (
                  <Fragment key={i}>
                    {i > 0 ? ' · ' : null}
                    {part}
                  </Fragment>
                ))}
            </span>
          ) : null}
        </span>
      </span>
      <Badge
        variant="outline"
        className={cn('tracy-wo-src-chip', CHIP_CLASS[unavailable ? 'failed' : row.tone])}
      >
        {t(chipKey)}
      </Badge>
    </>
  )
  if (compact) return <div className="tracy-wo-src tracy-wo-src-line">{head}</div>
  return (
    <details
      className="tracy-wo-src"
      // Closed by default: the chip and the line under the name say it all; a page waiting for a check opens.
      open={search === 'again.search.pending' || row.tone === 'partial'}
    >
      <summary>{head}</summary>
      <div className="tracy-wo-src-body">
        {coverage === null && reasonKey === null && search === null && link === null && !unavailable
          ? t('inspector.nothingYet')
          : null}
        {typeof s.queries === 'number' ? (
          <span className="tracy-wo-small">{t('again.search.queries', { count: s.queries })} </span>
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
