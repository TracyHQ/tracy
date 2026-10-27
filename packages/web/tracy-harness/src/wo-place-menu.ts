/**
 * Pure helpers of the Menu block in the Places inspector (`WoPlaceMenu.tsx`): labels and lines drawn from the
 * place's `menu` field. Its only runtime import is pure, so `node --test` loads it directly; words come through the
 * screen's `t`, numbers through its `locale` (`en` when left out).
 */
import { formatNumber } from './i18n/format.ts'
import type { T } from './i18n/index.ts'
import { formatUsd } from './wo-places-format.ts'
import type { AgainPlan, MenuItem, MenuPhoto, PlaceMenu } from './wo-places-api.ts'

/** The research parts Read menu again is limited to: the menu file first, then the menu photos. */
export const MENU_PARTS = ['menu-file', 'menu-photos'] as const

/** Parts the plan would run outside `parts`; non-empty means the server did not limit the run. */
export const partsOutside = (plan: Pick<AgainPlan, 'run'>, parts: readonly string[]): string[] =>
  plan.run.map((r) => r.part).filter((part) => !parts.includes(part))

const dishes = (t: T, count: number) => t('wo-places.menu.dishes', { count })

/** "photo N": a photo's 1-based place in `menu.photos`, the order the card shows them in. */
export const photoNumber = (mediaId: string | null, photos: readonly Pick<MenuPhoto, 'mediaId'>[]) => {
  const i = mediaId ? photos.findIndex((p) => p.mediaId === mediaId) : -1
  return i < 0 ? null : i + 1
}

/** What reading one menu photo found, as the line under it reads. */
export function photoResultLabel(
  t: T,
  photo: MenuPhoto,
  photos: readonly MenuPhoto[],
  limit: number
): string {
  switch (photo.result) {
    case 'menu':
      return photo.items ? dishes(t, photo.items) : t('wo-places.menu.noDishesRead')
    case 'same-menu': {
      const n = photoNumber(photo.sameAs, photos)
      return n ? t('wo-places.menu.sameAsPhoto', { n }) : t('wo-places.menu.sameAsAnother')
    }
    case 'not-menu':
      return t('wo-places.menu.notMenu')
    case 'unreadable':
      return t('wo-places.menu.unreadable')
    case 'over-limit':
      return t('wo-places.menu.overLimit', { limit })
    case 'stopped-early':
      return t('wo-places.menu.stoppedEarly')
    default:
      return t('wo-places.menu.notReadYet')
  }
}

/** Dishes grouped under the section the menu printed, sections in the order they first appear. */
export function menuSections(items: readonly MenuItem[]): { section: string | null; items: MenuItem[] }[] {
  const groups = new Map<string | null, MenuItem[]>()
  for (const item of items) {
    const group = groups.get(item.section) ?? []
    group.push(item)
    groups.set(item.section, group)
  }
  return [...groups].map(([section, grouped]) => ({ section, items: grouped }))
}

/** A printed number as an amount: "65.000" and "1,250" group thousands, "1.2" and "12,5" are decimals. */
const printedAmount = (price: string): number => {
  const s = price.replace(/\s/g, '')
  return Number(/^\d{1,3}(?:[.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, '') : s.replace(',', '.'))
}

/** A printed price as shown: a shortened one (scale above 1) as the amount it means, short ("110K"); else as printed. */
function shownPrice(price: string, priceScale: number | null | undefined, locale: string): string {
  const amount = printedAmount(price)
  if (!priceScale || priceScale <= 1 || !Number.isFinite(amount)) return price
  return formatNumber(amount * priceScale, { notation: 'compact', maximumFractionDigits: 3 }, locale)
}

/** The price column: only a printed price, never a guess. */
export function itemPriceText(t: T, item: MenuItem, locale = 'en'): string {
  const price =
    item.price === null ? t('wo-places.menu.noPrice') : shownPrice(item.price, item.priceScale, locale)
  return item.size ? `${item.size} · ${price}` : price
}

/** Other prices photos printed for the same dish, shown rather than resolved; null when they all agree. */
export function otherPricesText(
  t: T,
  item: MenuItem,
  photos: readonly MenuPhoto[],
  locale = 'en'
): string | null {
  if (!item.otherPrices.length) return null
  const others = item.otherPrices.map((o) => {
    const n = photoNumber(o.mediaId, photos)
    const price = shownPrice(o.price, o.priceScale, locale)
    return n ? t('wo-places.menu.priceOnPhoto', { price, n }) : price
  })
  return t('wo-places.menu.pricesDiffer', { list: others.join(', ') })
}

/** Where a dish was read: the menu file by its name, a photo as "photo N". */
export function itemSourceLabel(
  t: T,
  item: MenuItem,
  files: PlaceMenu['files'],
  photos: readonly MenuPhoto[]
): string {
  if (item.source.kind === 'photo') {
    const n = photoNumber(item.source.mediaId, photos)
    return n ? t('wo-places.menu.photo', { n }) : t('wo-places.menu.aPhoto')
  }
  return files.find((f) => f.url === item.source.url)?.name || item.source.url.replace(/^https?:\/\//, '')
}

/** Cents to dollars, keeping a fraction of a cent (one vision call is ~1–2 cents); null/undefined → `—`. */
export function formatCallCents(cents: number | null | undefined, locale = 'en'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—'
  return formatUsd(cents / 100, locale, Number.isInteger(cents) ? [2, 2] : [0, 4])
}

const OFF_WHY: Record<string, string> = {
  'photo-reading-off': 'wo-places.menu.offPhotoReading',
  'vision-not-tested': 'wo-places.menu.offVision'
}

/** The status row above the dishes: null when the menu was read in full; otherwise what happened and why. */
export function menuStatus(t: T, menu: PlaceMenu): { title: string; why: string } | null {
  if (menu.reason === 'not-food')
    return { title: t('wo-places.menu.notFood'), why: t('wo-places.menu.notFoodWhy') }
  const fromFile = menu.counts.file ? t('wo-places.menu.fromFile', { count: menu.counts.file }) : ''
  const after = (why: string) => (fromFile ? `${fromFile} ${why}` : why)
  switch (menu.state) {
    case 'never':
      return {
        title: t('wo-places.menu.neverTitle'),
        why: t('wo-places.menu.neverWhy', {
          photos: t('wo-places.menu.menuPhotos', { count: menu.counts.photosTotal }),
          files: t('wo-places.menu.menuFiles', { count: menu.files.length })
        })
      }
    case 'none':
      return { title: t('wo-places.menu.noneTitle'), why: t('wo-places.menu.noneWhy') }
    case 'off':
      return {
        title: fromFile ? t('wo-places.menu.onlyFileTitle') : t('wo-places.menu.photosNotReadTitle'),
        why: after(t(OFF_WHY[menu.reason ?? ''] ?? OFF_WHY['photo-reading-off']))
      }
    case 'partial': {
      const why = menu.reason && OFF_WHY[menu.reason]
      return {
        title: t('wo-places.menu.partialTitle'),
        why: after(why ? t(why) : t('wo-places.menu.partialWhy'))
      }
    }
    default:
      return null
  }
}

/** The /ops summary after "Read <when>": models, photos read against the limit, money spent, dishes kept. */
export function menuSummaryParts(t: T, menu: PlaceMenu, locale = 'en'): string[] {
  const models = [...new Set(menu.photos.map((p) => p.model).filter(Boolean))]
  const costs = menu.photos.map((p) => p.costCents).filter((c): c is number => typeof c === 'number')
  const { photosRead: read, photosTotal: total, limit } = menu.counts
  return [
    models.length ? t('wo-places.menu.summaryModel', { models: models.join(', ') }) : null,
    t('wo-places.menu.summaryPhotos', { read, total, limit }),
    costs.length
      ? t('wo-places.menu.summarySpent', {
          amount: formatCallCents(
            costs.reduce((a, b) => a + b, 0),
            locale
          )
        })
      : null,
    t('wo-places.menu.summaryKept', { count: menu.items.length }),
    menu.currency ? t('wo-places.menu.summaryCurrency', { currency: menu.currency }) : null
  ].filter((part): part is string => part !== null)
}

/** The one source every dish of a section was read from, so the heading names it once; null when they differ. */
export function sectionSourceLabel(
  t: T,
  items: readonly MenuItem[],
  files: PlaceMenu['files'],
  photos: readonly MenuPhoto[]
): string | null {
  const labels = new Set(items.map((item) => itemSourceLabel(t, item, files, photos)))
  return labels.size === 1 ? [...labels][0] : null
}
