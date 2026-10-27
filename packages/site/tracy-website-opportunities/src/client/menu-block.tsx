/**
 * The Menu block of a place card (panel and Details) and the line under each menu photo. Layout and wording:
 * the approved draft `2026-10-24-wo-menu-items`, sections 1 and 2. The customer reads dishes; editing them is a
 * later line. Prices are shown as printed, never guessed.
 */
import { type JSX, useState } from 'react'
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Badge, Button } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import { interfaceLocale } from '@tracy/core/interface-languages'
import { mediaUrl } from './api.ts'
import { Section } from './inspector.tsx'
import {
  type Menu,
  type MenuChip,
  type MenuStatus,
  collapseMenu,
  menuView,
  photoResult
} from './menu-model.ts'
import { type AgainControl, type AgainCopy, ResearchAgainDialog } from './research-again-dialog.tsx'
import type { Translate } from './strings.ts'

const MENU_COPY: AgainCopy = {
  titleKey: 'menu.again.title',
  leadKey: 'menu.again.lead',
  buttonKey: 'menu.again',
  pagesNote: false
}

const pluralKey = (base: string, count: number, locale?: string): string =>
  `${base}.${new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'}`

function day(iso: string, locale?: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at)
}

function Chip({ t, chip }: { t: Translate; chip: MenuChip }): JSX.Element {
  const label =
    chip.kind === 'photo'
      ? `${t('menu.chip.photo', chip.params)} · ${t('menu.notChecked')}`
      : String(chip.params.name ?? '')
  const href = chip.kind === 'photo' ? (chip.mediaId === null ? null : mediaUrl(chip.mediaId)) : chip.href
  const className = cn('tracy-wo-menu-chip', chip.kind === 'photo' ? 'is-photo' : 'is-file')
  return href === null ? (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className={className}
      render={<a href={href} target="_blank" rel="noopener noreferrer" />}
    >
      {label}
    </Badge>
  )
}

/** Read menu (again): the menu parts of Research again, with the same preview of what runs and what it costs. */
function MenuAgain({
  t,
  locale,
  name,
  control,
  first
}: {
  t: Translate
  locale?: string
  name: string
  control: AgainControl
  first: boolean
}): JSX.Element | null {
  const { phase, preview } = control
  if (phase === 'ready' && preview?.plan === null) return null
  const due = preview?.plan ? preview.plan.run.length : null
  const closed = phase === 'ready' && preview !== null && !preview.open
  const upToDate = due === 0
  return (
    <>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={upToDate || closed || phase === 'loading'}
        onClick={control.onOpen}
      >
        <RefreshCw aria-hidden="true" />
        {t(upToDate ? 'menu.upToDate' : first ? 'menu.read' : 'menu.again')}
      </Button>
      {closed ? (
        <span className="tracy-wo-muted tracy-wo-small">
          {t(preview.payer === 'tracy' ? 'again.closed.public' : 'again.closed.account')}
        </span>
      ) : null}
      <ResearchAgainDialog t={t} locale={locale} name={name} control={control} copy={MENU_COPY} />
    </>
  )
}

function StatusRow({
  t,
  locale,
  status,
  again
}: {
  t: Translate
  locale?: string
  status: MenuStatus
  again: JSX.Element | null
}): JSX.Element {
  const params =
    typeof status.params.date === 'string'
      ? { ...status.params, date: day(status.params.date, locale) }
      : status.params
  return (
    <div className="tracy-wo-menu-status">
      <span className="tracy-wo-row">
        <span className={cn('tracy-wo-menu-dot', status.tone === 'warn' && 'is-warn')} aria-hidden="true" />
        <span>{t(status.key)}</span>
      </span>
      <span className="tracy-wo-row tracy-wo-wrap tracy-wo-menu-status-act">
        {status.action !== null ? again : <Badge variant="outline">{t('menu.none')}</Badge>}
      </span>
      <span className="tracy-wo-muted tracy-wo-small tracy-wo-menu-status-why">
        {t(status.whyKey, params)}
      </span>
    </div>
  )
}

/** The Menu block; draws nothing when the place has no menu field (not a food place). */
export function MenuBlock({
  t,
  locale,
  menu,
  name,
  again
}: {
  t: Translate
  locale?: string
  menu: Menu | null
  /** The place's name, for the dialog's question. */
  name: string
  /** Read menu again (`useCardResearchAgain` with `MENU_PARTS`); absent: no button. */
  again?: AgainControl
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  if (menu === null) return null
  const view = menuView(menu, interfaceLocale() ?? 'en')
  const { summary } = view
  const shown = collapseMenu(view, expanded)
  const againButton =
    again === undefined ? null : (
      <MenuAgain t={t} locale={locale} name={name} control={again} first={menu.state === 'never'} />
    )
  const meta = [
    view.readAt === null ? null : t('menu.readOn', { date: day(view.readAt, locale) }),
    view.currency === null ? null : t('menu.pricesIn', { currency: view.currency })
  ].filter((x): x is string => x !== null)
  return (
    <Section
      title={t('menu.title')}
      aside={
        summary.total > 0 ? (
          <span className="tracy-wo-muted tracy-wo-small">
            {t(pluralKey('menu.dishes', summary.total, locale), { count: summary.total })}
          </span>
        ) : undefined
      }
    >
      {view.status !== null ? (
        <StatusRow t={t} locale={locale} status={view.status} again={againButton} />
      ) : null}
      {summary.total > 0 ? (
        <>
          <div className="tracy-wo-row tracy-wo-wrap">
            {summary.file > 0 ? (
              <Badge variant="outline" className="tracy-wo-menu-chip is-file">
                {t('menu.fromFile', { count: summary.file })}
              </Badge>
            ) : null}
            {summary.photo > 0 ? (
              <Badge variant="outline" className="tracy-wo-menu-chip is-photo">
                {t(pluralKey('menu.fromPhotos', summary.photos, locale), {
                  count: summary.photo,
                  photos: summary.photos
                })}
              </Badge>
            ) : null}
            {meta.length > 0 ? (
              <span className="tracy-wo-muted tracy-wo-small">{meta.join(' · ')}</span>
            ) : null}
          </div>
          {view.status === null && againButton !== null ? (
            <div className="tracy-wo-row tracy-wo-wrap">
              {againButton}
              <span className="tracy-wo-muted tracy-wo-small">{t('menu.againNote')}</span>
            </div>
          ) : null}
          {shown.sections.map((section, i) => (
            <div key={`${section.title ?? ''}-${i}`} className="tracy-wo-menu-sec">
              <p className="tracy-wo-menu-sec-head">
                <span className="tracy-wo-menu-sec-title">{section.title ?? t('menu.section.none')}</span>
                <Chip t={t} chip={section.chip} />
              </p>
              <ul className="tracy-wo-menu-items">
                {section.items.map((dish, j) => (
                  <li key={`${dish.name}-${j}`} className="tracy-wo-menu-item">
                    <span>{dish.size === null ? dish.name : `${dish.name} · ${dish.size}`}</span>
                    <span className={cn('tracy-wo-menu-price', dish.price === null && 'is-none')}>
                      {dish.price ?? t('menu.noPrice')}
                    </span>
                    {dish.otherPrices.length > 0 ? (
                      <span className="tracy-wo-warn tracy-wo-small tracy-wo-menu-other">
                        {t('menu.pricesDiffer', {
                          list: dish.otherPrices
                            .map((o) =>
                              o.photo === null
                                ? o.price
                                : t('menu.otherPrice', { price: o.price, n: o.photo })
                            )
                            .join(', ')
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {section.more > 0 ? (
                <span className="tracy-wo-muted tracy-wo-small">
                  {section.title === null
                    ? t('menu.moreUntitled', { count: section.more })
                    : t('menu.more', { count: section.more, section: section.title })}
                </span>
              ) : null}
            </div>
          ))}
          {shown.hidden > 0 || expanded ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="tracy-wo-back"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              {expanded ? t('menu.showLess') : t('menu.showAll', { count: summary.total })}
            </Button>
          ) : null}
        </>
      ) : null}
    </Section>
  )
}

/** The line under one picture of Menu photos: its number and what reading it gave; null for other pictures. */
export function MenuPhotoLine({
  t,
  locale,
  menu,
  mediaId
}: {
  t: Translate
  locale?: string
  menu: Menu | null
  mediaId: string
}): JSX.Element | null {
  const result = photoResult(menu, mediaId)
  if (result === null) return null
  const key =
    result.key === 'menu.photo.dishes' ? pluralKey(result.key, result.params.count ?? 0, locale) : result.key
  return (
    <span className="tracy-wo-small tracy-wo-menu-photo">
      <span className="tracy-wo-muted">{t('menu.photo.label', { n: result.n })}</span>
      {' · '}
      <span
        className={cn(
          result.tone === 'ok' ? 'is-ok' : result.tone === 'warn' ? 'tracy-wo-warn' : 'tracy-wo-muted'
        )}
      >
        {t(key, result.params)}
      </span>
    </span>
  )
}
