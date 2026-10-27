import { htmlLang } from '@tracy/core/interface-languages/resolve'
import { Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@tracy/ui'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { relativeTime } from './cms/relative-time'
import { type T, useLanguage, useT } from './i18n/index.ts'
import {
  formatCallCents,
  itemPriceText,
  itemSourceLabel,
  menuSections,
  menuStatus,
  menuSummaryParts,
  otherPricesText,
  photoResultLabel,
  sectionSourceLabel
} from './wo-place-menu'
import type { MenuItem, PlaceMedia, PlaceMenu } from './wo-places-api'

/** Dishes shown before "Show all": enough for the first sections, short enough to keep the inspector scannable. */
const FIRST_DISHES = 12

const PHOTO_RESULT_SHORT: Record<string, string> = {
  menu: 'wo-places.menu.short.menu',
  'not-menu': 'wo-places.menu.notMenu',
  unreadable: 'wo-places.menu.short.unreadable',
  'same-menu': 'wo-places.menu.short.sameMenu',
  'over-limit': 'wo-places.menu.short.overLimit',
  unread: 'wo-places.menu.notReadYet'
}
/** A photo's result in the table; an unknown result shows its own code. */
const photoResultShort = (t: T, result: string) =>
  PHOTO_RESULT_SHORT[result] ? t(PHOTO_RESULT_SHORT[result]) : result

function SourceLink({ href, label, title }: { href: string | null; label: string; title?: string }) {
  if (!href) return <span>{label}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
      title={title ?? href}
    >
      <span className="truncate">{label}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  )
}

/** Where dishes were read, as a chip that opens the file or photo; a photo is flagged as not checked by a person. */
function SourceChip({ label, url, fromPhoto }: { label: string; url: string; fromPhoto: boolean }) {
  const t = useT()
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="shrink-0 normal-case tracking-normal"
    >
      <Badge variant={fromPhoto ? 'outline' : 'secondary'}>
        {label}
        {fromPhoto ? ` · ${t('wo-places.menu.notChecked')}` : ''}
      </Badge>
    </a>
  )
}

function Dish({ item, menu, chip }: { item: MenuItem; menu: PlaceMenu; chip: boolean }) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const others = otherPricesText(t, item, menu.photos, locale)
  return (
    <li className="border-border border-b border-dashed py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate">{item.name}</span>
          {chip ? (
            <SourceChip
              label={itemSourceLabel(t, item, menu.files, menu.photos)}
              url={item.source.url}
              fromPhoto={item.source.kind === 'photo'}
            />
          ) : null}
        </span>
        <span
          className={item.price === null ? 'shrink-0 text-muted-foreground italic' : 'shrink-0 tabular-nums'}
        >
          {itemPriceText(t, item, locale)}
          {item.price !== null && item.currencyAssumed ? ` ${t('wo-places.menu.currencyAssumed')}` : ''}
        </span>
      </div>
      {others ? <p className="text-destructive">{others}</p> : null}
    </li>
  )
}

/**
 * The Menu block of the Places inspector: the same dish list the customer card shows, plus what an operator needs
 * to judge the reading (each photo's result and cost; the model is in the summary and each cost's tooltip).
 */
export function WoPlaceMenu({ menu, media }: { menu: PlaceMenu; media: readonly PlaceMedia[] }) {
  const t = useT()
  const locale = htmlLang(useLanguage().lang)
  const [showAll, setShowAll] = useState(false)
  const status = menuStatus(t, menu)
  const mediaById = new Map(media.map((m) => [m.id, m]))
  const photosWithDishes = menu.photos.filter((p) => p.result === 'menu' && p.items > 0).length
  const shown = showAll ? menu.items : menu.items.slice(0, FIRST_DISHES)
  const readAt = relativeTime(menu.readAt)

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        {[
          readAt ? t('wo-places.menu.readAgo', { ago: readAt }) : t('wo-places.menu.notReadYet'),
          ...menuSummaryParts(t, menu, locale)
        ].join(' · ')}
      </p>
      {menu.items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {menu.counts.file ? (
            <Badge variant="secondary">{t('wo-places.menu.fromMenuFile', { count: menu.counts.file })}</Badge>
          ) : null}
          {menu.counts.photo ? (
            <Badge variant="outline">
              {t('wo-places.menu.fromPhotos', { dishes: menu.counts.photo, count: photosWithDishes })}
            </Badge>
          ) : null}
        </div>
      ) : null}
      {status ? (
        <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2">
          <p className="font-medium">{status.title}</p>
          <p className="text-muted-foreground">{status.why}</p>
        </div>
      ) : null}

      {menu.items.length ? (
        <div className="space-y-2">
          {menuSections(shown).map((s) => {
            const shared = sectionSourceLabel(t, s.items, menu.files, menu.photos)
            return (
              <div key={s.section ?? '—'}>
                <p className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground uppercase tracking-wide">
                  {s.section ?? t('wo-places.menu.noSection')}
                  {shared ? (
                    <SourceChip
                      label={shared}
                      url={s.items[0].source.url}
                      fromPhoto={s.items[0].source.kind === 'photo'}
                    />
                  ) : null}
                </p>
                <ul>
                  {s.items.map((item, i) => (
                    <Dish
                      key={`${item.name}-${item.size ?? ''}-${i}`}
                      item={item}
                      menu={menu}
                      chip={!shared}
                    />
                  ))}
                </ul>
              </div>
            )
          })}
          {menu.items.length > FIRST_DISHES ? (
            <Button size="xs" variant="ghost" onClick={() => setShowAll((v) => !v)}>
              {showAll
                ? t('wo-places.menu.showFewer')
                : t('wo-places.menu.showAll', { count: menu.items.length })}
            </Button>
          ) : null}
        </div>
      ) : null}

      {menu.files.length || menu.photos.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('wo-places.menu.colSource')}</TableHead>
              <TableHead>{t('wo-places.menu.colResult')}</TableHead>
              <TableHead className="text-right">{t('wo-places.menu.colDishes')}</TableHead>
              <TableHead className="text-right">{t('wo-places.menu.colCost')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {menu.files.map((f) => (
              <TableRow key={f.url}>
                <TableCell className="max-w-40">
                  <SourceLink href={f.url} label={f.name || f.url} />
                </TableCell>
                <TableCell>
                  {f.readAt ? t('wo-places.menu.fileRead') : t('wo-places.menu.notReadYet')}
                </TableCell>
                <TableCell className="text-right tabular-nums">{f.items}</TableCell>
                <TableCell className="text-right text-muted-foreground">—</TableCell>
              </TableRow>
            ))}
            {menu.photos.map((p, i) => {
              const m = mediaById.get(p.mediaId)
              return (
                <TableRow key={p.mediaId}>
                  <TableCell className="max-w-40">
                    <SourceLink
                      href={m?.sourceUrl ?? null}
                      label={t('wo-places.menu.photo', { n: i + 1 })}
                      title={m ? `${m.provider ?? m.source} · ${m.sourceUrl}` : undefined}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {p.result === 'same-menu' || p.result === 'over-limit'
                      ? photoResultLabel(t, p, menu.photos, menu.counts.limit)
                      : photoResultShort(t, p.result)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.items}</TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    title={p.model ? t('wo-places.menu.model', { model: p.model }) : undefined}
                  >
                    {formatCallCents(p.costCents, locale)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  )
}
