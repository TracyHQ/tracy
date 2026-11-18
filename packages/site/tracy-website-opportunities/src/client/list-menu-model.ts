/**
 * What the "..." menu of My opportunities holds (#537, header C), as plain data the toolbar draws: Select (enters
 * selection mode), the view switch (Cards, Rows, and Map where the deployment has a browser map key), Show cancelled
 * (the Cancelled filter, off the main surface), and the builds used today as a read-only line.
 * Pure: the toolbar turns each entry into a menu item.
 */
import type { MyView } from './column-prefs.ts'
import { type DemoUsage, usageFull } from './outreach-model.ts'
import type { Translate } from './strings.ts'

export type ListMenuEntry =
  | { kind: 'select'; label: string }
  | { kind: 'views'; label: string; value: MyView; options: Array<{ value: MyView; label: string }> }
  | { kind: 'cancelled'; label: string; checked: boolean; count: number | null }
  | { kind: 'quota'; label: string }

export interface ListMenuInput {
  view: MyView
  views: readonly MyView[]
  cancelledOn: boolean
  /** Cancelled places on the account; null until the counts arrive. */
  cancelledCount: number | null
  usage: DemoUsage | null
  locale: string
}

/** "4 of 20 builds used today", and when the limit is reached, when it resets. */
export function quotaLine(t: Translate, usage: DemoUsage, locale: string): string {
  const used = t(usage.limit === 0 ? 'my.menu.quotaUnlimited' : 'my.menu.quota', {
    used: usage.used,
    limit: usage.limit
  })
  if (!usageFull(usage)) return used
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' }).format(
    new Date(usage.resetsAt)
  )
  return `${used}. ${t('v3.limitResets', { time })}`
}

export function listMenu(t: Translate, input: ListMenuInput): ListMenuEntry[] {
  const entries: ListMenuEntry[] = [
    { kind: 'select', label: t('my.menu.select') },
    {
      kind: 'views',
      label: t('my.menu.view'),
      value: input.view,
      options: input.views.map((value) => ({ value, label: t(`my.view.${value}`) }))
    },
    {
      kind: 'cancelled',
      label: t('my.menu.showCancelled'),
      checked: input.cancelledOn,
      count: input.cancelledCount
    }
  ]
  if (input.usage) entries.push({ kind: 'quota', label: quotaLine(t, input.usage, input.locale) })
  return entries
}
