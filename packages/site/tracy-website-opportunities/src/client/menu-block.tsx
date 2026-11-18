/**
 * The line under each menu photo of a place card: its number and what reading it gave. Layout and wording: the
 * approved draft `2026-10-24-wo-menu-items`, section 2. Prices are shown as printed, never guessed.
 */
import type { JSX } from 'react'
import { cn } from '@tracy/ui/cn'

import { type Menu, photoResult } from './menu-model.ts'
import type { Translate } from './strings.ts'

const pluralKey = (base: string, count: number, locale?: string): string =>
  `${base}.${new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other'}`

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
