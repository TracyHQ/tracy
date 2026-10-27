import { CakeIcon, CoffeeIcon, MusicIcon, SandwichIcon, UtensilsIcon, WineIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cuisineLabel } from '../model.ts'
import type { Kind, PlaceRow, Translate } from '../types.ts'

export const KIND_ICON: Record<Kind, LucideIcon> = {
  restaurants: UtensilsIcon,
  cafes: CoffeeIcon,
  'fast-food': SandwichIcon,
  bakeries: CakeIcon,
  bars: WineIcon,
  nightlife: MusicIcon
}

/** The short type of a place: its cuisine, else Google's category, else its kind. */
export function typeLabel(t: Translate, row: PlaceRow): string {
  if (row.cuisine) return cuisineLabel(t, row.cuisine)
  return row.category || (row.kind ? t(`kind.${row.kind}`) : '')
}

export function TypeCell({ t, row }: { t: Translate; row: PlaceRow }) {
  const Icon = KIND_ICON[row.kind ?? 'restaurants']
  return (
    <span className="tracy-wo-type" title={row.category ?? undefined}>
      <Icon className="size-3" aria-hidden />
      {typeLabel(t, row)}
    </span>
  )
}
