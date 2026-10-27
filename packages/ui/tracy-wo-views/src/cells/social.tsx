import { Button, Spinner, Tooltip, TooltipContent, TooltipTrigger } from '@tracy/ui'
import { RefreshCwIcon } from 'lucide-react'

import { SocialMark, SOCIAL_NAME } from '../brand-icons.tsx'
import {
  ageInDays,
  formatAgo,
  formatCompact,
  formatUntil,
  perMonthText,
  providerLabel,
  socialView
} from '../model.ts'
import type { SocialLine } from '../model.ts'
import type { PlaceRow, RowActions, Translate } from '../types.ts'

/** One page: mark, followers, last post, posts a month. Shared by the cell and the detail page. */
export function SocialStatLine({
  t,
  line,
  locale = 'en'
}: {
  t: Translate
  line: SocialLine
  locale?: string
}) {
  const perMonth = perMonthText(t, line, locale)
  return (
    <a
      className={line.stale ? 'tracy-wo-line tracy-wo-link tracy-wo-muted' : 'tracy-wo-line tracy-wo-link'}
      href={line.url}
      target="_blank"
      rel="noreferrer"
      aria-label={SOCIAL_NAME[line.network]}
    >
      <SocialMark network={line.network} />
      {line.followers !== null ? <span>{formatCompact(line.followers, locale)}</span> : null}
      {line.days !== null ? (
        <span className="tracy-wo-small tracy-wo-muted">
          {t('cell.social.lastPost', { ago: formatAgo(line.days, locale, 'narrow') })}
        </span>
      ) : null}
      {perMonth !== null ? <span className="tracy-wo-small tracy-wo-muted">{perMonth}</span> : null}
    </a>
  )
}

/**
 * Pages with numbers: one line each, and a tooltip naming where each number came from and when.
 * Pages without: their marks as links. Then a spinner while the server fetches, the verdict, or
 * `Get social stats` when the consumer has the door (`onGetSocial`) and something is missing or stale.
 */
export function SocialCell({
  t,
  row,
  actions,
  locale = 'en',
  now = Date.now()
}: {
  t: Translate
  row: PlaceRow
  actions: RowActions
  locale?: string
  /** ms; the age of the last post is read against it. */
  now?: number
}) {
  const view = socialView(row, now)
  if (!view.lines.length && !view.links.length && view.verdict === 'none')
    return <span className="tracy-wo-muted">{t('cell.social.none')}</span>
  const onGet = actions.onGetSocial
  return (
    <div className="tracy-wo-cell">
      {view.lines.length ? (
        <Tooltip>
          <TooltipTrigger render={<div className="tracy-wo-social" />}>
            {view.lines.map((line) => (
              <SocialStatLine key={line.network} t={t} line={line} locale={locale} />
            ))}
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="tracy-wo-tip flex-col items-stretch">
            <ul className="tracy-wo-tip-list">
              {view.lines.map((line) => {
                const days = ageInDays(line.fetchedAt, now)
                const source = [
                  line.provider ? providerLabel(line.provider) : null,
                  days !== null ? t('cell.social.checked', { ago: formatAgo(days, locale) }) : null
                ].filter(Boolean)
                return (
                  <li key={line.network}>
                    <span>{SOCIAL_NAME[line.network]}</span>
                    <span>{source.join(' · ')}</span>
                  </li>
                )
              })}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : null}
      {view.links.length ? (
        <span className="tracy-wo-line">
          {view.links.map(({ network, href }) => (
            <a
              key={network}
              className="tracy-wo-icon-link"
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label={SOCIAL_NAME[network]}
              title={SOCIAL_NAME[network]}
            >
              <SocialMark network={network} />
            </a>
          ))}
        </span>
      ) : null}
      {view.pending ? (
        <span className="tracy-wo-line tracy-wo-small tracy-wo-muted">
          <Spinner label={t('cell.website.checking')} className="size-3" />
          {t('cell.website.checking')}
        </span>
      ) : view.deferredUntil ? (
        <span className="tracy-wo-small tracy-wo-muted">
          {t('cell.social.deferred', { when: formatUntil(view.deferredUntil, now, locale) ?? '' })}
        </span>
      ) : view.verdict === 'none' ? (
        <span className="tracy-wo-small tracy-wo-muted">{t('cell.social.none')}</span>
      ) : view.verdict === 'notFound' ? (
        <span className="tracy-wo-small tracy-wo-muted">{t('cell.social.pagesNotFound')}</span>
      ) : view.verdict === 'failed' ? (
        <span className="tracy-wo-small tracy-wo-muted">{t('cell.website.blocked')}</span>
      ) : null}
      {onGet && view.canFetch ? (
        <Button type="button" variant="outline" size="xs" className="tracy-wo-fit" onClick={() => onGet(row)}>
          <RefreshCwIcon aria-hidden />
          {t('cell.social.get')}
        </Button>
      ) : null}
    </div>
  )
}
