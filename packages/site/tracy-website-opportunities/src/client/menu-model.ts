/**
 * The Menu block of a place card (tasks/todo-wo-menu-items.md, "`menu` data contract"): the detail answer's
 * `menu` read safely, dishes grouped by section as printed with one source chip per group, prices exactly as
 * printed, and the result line under each menu photo. Nothing here decides what was read: the server did.
 */
export type MenuState = 'never' | 'read' | 'partial' | 'none' | 'off'
export type MenuReason = 'photo-reading-off' | 'vision-not-tested' | 'no-menu-found' | 'not-food'
export type PhotoOutcome =
  | 'menu'
  | 'not-menu'
  | 'unreadable'
  | 'same-menu'
  | 'over-limit'
  | 'stopped-early'
  | 'unread'

export interface MenuItem {
  name: string
  price: string | null
  currency: string | null
  section: string | null
  size: string | null
  source: { kind: 'file' | 'photo'; url: string | null; mediaId: string | null }
  /** What the menu says its numbers mean: 1 full amounts; 1000, 10000, 1000000 shortened ("110" = 110,000); null unknown. */
  priceScale: number | null
  otherPrices: { price: string; mediaId: string | null; priceScale: number | null }[]
}

export interface Menu {
  state: MenuState
  reason: MenuReason | null
  readAt: string | null
  currency: string | null
  limit: number | null
  photosTotal: number
  items: MenuItem[]
  files: { url: string; name: string | null; items: number }[]
  photos: { mediaId: string; result: PhotoOutcome; items: number; sameAs: string | null }[]
}

const STATES = new Set<string>(['never', 'read', 'partial', 'none', 'off'])
const REASONS = new Set<string>(['photo-reading-off', 'vision-not-tested', 'no-menu-found', 'not-food'])
const OUTCOMES = new Set<string>([
  'menu',
  'not-menu',
  'unreadable',
  'same-menu',
  'over-limit',
  'stopped-early',
  'unread'
])

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const SCALES = new Set([1, 1000, 10_000, 1_000_000])
const scale = (v: unknown): number | null => (typeof v === 'number' && SCALES.has(v) ? v : null)
/** A printed number as an amount: "65.000" and "1,250" group thousands, "1.2" and "12,5" are decimals. */
const printedAmount = (price: string): number => {
  const s = price.replace(/\s/g, '')
  return Number(/^\d{1,3}(?:[.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, '') : s.replace(',', '.'))
}
/** The price as shown: a shortened one (scale above 1) as the amount it means, short ("110K"); else exactly as printed. */
function shown(price: string, priceScale: number | null, locale: string): string {
  const amount = printedAmount(price)
  if (priceScale === null || priceScale <= 1 || !Number.isFinite(amount)) return price
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 3 }).format(
    amount * priceScale
  )
}

function readItem(raw: unknown): MenuItem | null {
  if (!record(raw)) return null
  const name = text(raw.name)
  if (name === null) return null
  const src = record(raw.source) ? raw.source : {}
  return {
    name,
    price: text(raw.price),
    currency: text(raw.currency),
    section: text(raw.section),
    size: text(raw.size),
    source: { kind: src.kind === 'photo' ? 'photo' : 'file', url: text(src.url), mediaId: text(src.mediaId) },
    priceScale: scale(raw.priceScale),
    otherPrices: list(raw.otherPrices).flatMap((o) => {
      const price = record(o) ? text(o.price) : null
      return price !== null && record(o)
        ? [{ price, mediaId: text(o.mediaId), priceScale: scale(o.priceScale) }]
        : []
    })
  }
}

/** The detail answer's `menu`; null hides the whole block (no menu sent, or not a food place). */
export function readMenu(raw: unknown): Menu | null {
  if (!record(raw) || raw.applicable === false) return null
  const counts = record(raw.counts) ? raw.counts : {}
  const reason = text(raw.reason)
  return {
    state: typeof raw.state === 'string' && STATES.has(raw.state) ? (raw.state as MenuState) : 'never',
    reason: reason !== null && REASONS.has(reason) ? (reason as MenuReason) : null,
    readAt: text(raw.readAt),
    currency: text(raw.currency),
    limit: typeof counts.limit === 'number' && Number.isFinite(counts.limit) ? counts.limit : null,
    photosTotal: count(counts.photosTotal),
    items: list(raw.items).flatMap((i) => {
      const read = readItem(i)
      return read === null ? [] : [read]
    }),
    files: list(raw.files).flatMap((f) => {
      const url = record(f) ? text(f.url) : null
      return url !== null && record(f) ? [{ url, name: text(f.name), items: count(f.items) }] : []
    }),
    photos: list(raw.photos).flatMap((p) => {
      const mediaId = record(p) ? text(p.mediaId) : null
      if (mediaId === null || !record(p)) return []
      const result =
        typeof p.result === 'string' && OUTCOMES.has(p.result) ? (p.result as PhotoOutcome) : 'unread'
      return [{ mediaId, result, items: count(p.items), sameAs: text(p.sameAs) }]
    })
  }
}

/**
 * The opportunity whose Read menu again is previewed: only one whose detail answer carries a Menu. A place that is not
 * a food or drink business (the answer's `menu` is null) and an answer not loaded yet ask nothing (#1780 acceptance:
 * every Details load of a coaching club asked for the menu parts).
 */
export function menuAgainTarget(opportunityId: string | null, rawMenu: unknown): string | null {
  return opportunityId !== null && readMenu(rawMenu) !== null ? opportunityId : null
}

/** A source chip: `key` with `params` is its label (a file's own name has no key); a file opens `href`, a photo its picture. */
export interface MenuChip {
  kind: 'file' | 'photo'
  key: string | null
  params: Record<string, string | number>
  href: string | null
  mediaId: string | null
}

export interface MenuDish {
  name: string
  size: string | null
  /** As printed (a shortened one as the amount it means, "110K"), with its currency only when it differs from the menu's; null = no price printed. */
  price: string | null
  otherPrices: { price: string; photo: number | null; mediaId: string | null }[]
}

export interface MenuSection {
  title: string | null
  chip: MenuChip
  items: MenuDish[]
}

export interface MenuStatus {
  tone: 'warn' | 'none'
  key: string
  whyKey: string
  params: Record<string, string | number>
  /** `read`: the first read; `again`: read again; null: nothing to press. */
  action: 'read' | 'again' | null
}

export interface MenuView {
  summary: { total: number; file: number; photo: number; photos: number }
  currency: string | null
  readAt: string | null
  sections: MenuSection[]
  /** Null when the menu was read in full. */
  status: MenuStatus | null
}

/** A photo's number on the card: its place in the server's list of menu photos, from 1. */
const photoNumber = (menu: Menu, mediaId: string | null): number | null => {
  const at = mediaId === null ? -1 : menu.photos.findIndex((p) => p.mediaId === mediaId)
  return at < 0 ? null : at + 1
}

function fileName(menu: Menu, url: string | null): string {
  const known = url === null ? undefined : menu.files.find((f) => f.url === url)
  if (known?.name) return known.name
  if (url === null) return ''
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '') || url
  } catch {
    return url
  }
}

function chipOf(menu: Menu, source: MenuItem['source']): MenuChip {
  if (source.kind === 'photo')
    return {
      kind: 'photo',
      key: 'menu.chip.photo',
      params: { n: photoNumber(menu, source.mediaId) ?? '' },
      href: null,
      mediaId: source.mediaId
    }
  return {
    kind: 'file',
    key: null,
    params: { name: fileName(menu, source.url) },
    href: source.url,
    mediaId: null
  }
}

function statusOf(menu: Menu): MenuStatus | null {
  if (menu.state === 'never')
    return {
      tone: 'warn',
      key: 'menu.state.never',
      whyKey: 'menu.why.never',
      params: { photos: menu.photosTotal, files: menu.files.length },
      action: 'read'
    }
  if (menu.state === 'none')
    return menu.readAt === null
      ? { tone: 'none', key: 'menu.state.none', whyKey: 'menu.why.noneUndated', params: {}, action: null }
      : {
          tone: 'none',
          key: 'menu.state.none',
          whyKey: 'menu.why.none',
          params: { date: menu.readAt },
          action: null
        }
  if (menu.state === 'off')
    return { tone: 'none', key: 'menu.state.off', whyKey: 'menu.why.off', params: {}, action: null }
  if (menu.state === 'partial') {
    // Photo reading off or not ready on this server: the customer gets the neutral sentence, /ops the real reason.
    const off = menu.reason === 'photo-reading-off' || menu.reason === 'vision-not-tested'
    return {
      tone: 'warn',
      key: off ? 'menu.state.fileOnly' : 'menu.state.partly',
      whyKey: off ? 'menu.why.photosOff' : 'menu.why.partly',
      params: {},
      action: 'again'
    }
  }
  return null
}

/** `locale`: the viewer's interface language, for the amount a shortened price means. */
export function menuView(menu: Menu, locale = 'en'): MenuView {
  const sections: MenuSection[] = []
  for (const item of menu.items) {
    const chip = chipOf(menu, item.source)
    const sameSource = (s: MenuSection) =>
      s.title === item.section &&
      s.chip.kind === chip.kind &&
      s.chip.href === chip.href &&
      s.chip.mediaId === chip.mediaId
    let section = sections.find(sameSource)
    if (section === undefined) {
      section = { title: item.section, chip, items: [] }
      sections.push(section)
    }
    const foreign =
      item.price !== null &&
      item.currency !== null &&
      menu.currency !== null &&
      item.currency !== menu.currency
    section.items.push({
      name: item.name,
      size: item.size,
      price:
        item.price === null
          ? null
          : foreign
            ? `${shown(item.price, item.priceScale, locale)} ${item.currency}`
            : shown(item.price, item.priceScale, locale),
      otherPrices: item.otherPrices.map((o) => ({
        price: shown(o.price, o.priceScale, locale),
        photo: photoNumber(menu, o.mediaId),
        mediaId: o.mediaId
      }))
    })
  }
  const fromPhotos = menu.items.filter((i) => i.source.kind === 'photo')
  return {
    summary: {
      total: menu.items.length,
      file: menu.items.length - fromPhotos.length,
      photo: fromPhotos.length,
      photos: new Set(fromPhotos.map((i) => i.source.mediaId ?? i.source.url)).size
    },
    currency: menu.currency,
    readAt: menu.readAt,
    sections,
    status: statusOf(menu)
  }
}

const SHORT_SECTIONS = 4
const SHORT_ITEMS = 3

/** The block as drawn before "Show all": a few dishes per section, `more` and `hidden` count the rest. */
export function collapseMenu(
  view: MenuView,
  expanded: boolean
): { sections: (MenuSection & { more: number })[]; hidden: number } {
  if (expanded) return { sections: view.sections.map((s) => ({ ...s, more: 0 })), hidden: 0 }
  const shown = view.sections.slice(0, SHORT_SECTIONS).map((s) => ({
    ...s,
    items: s.items.slice(0, SHORT_ITEMS),
    more: Math.max(0, s.items.length - SHORT_ITEMS)
  }))
  const shownCount = shown.reduce((sum, s) => sum + s.items.length, 0)
  return { sections: shown, hidden: view.summary.total - shownCount }
}

export interface PhotoResult {
  n: number
  key: string
  params: Record<string, number>
  tone: 'ok' | 'warn' | 'none'
}

/** The line under one picture of "Menu photos"; null for a picture that is not one of the menu photos. */
export function photoResult(menu: Menu | null, mediaId: string): PhotoResult | null {
  if (menu === null) return null
  const n = photoNumber(menu, mediaId)
  if (n === null) return null
  const photo = menu.photos[n - 1]
  switch (photo.result) {
    case 'menu':
      return { n, key: 'menu.photo.dishes', params: { count: photo.items }, tone: 'ok' }
    case 'not-menu':
      return { n, key: 'menu.photo.notMenu', params: {}, tone: 'none' }
    case 'unreadable':
      return { n, key: 'menu.photo.unreadable', params: {}, tone: 'warn' }
    case 'same-menu': {
      const same = photoNumber(menu, photo.sameAs)
      return same === null
        ? { n, key: 'menu.photo.sameOther', params: {}, tone: 'none' }
        : { n, key: 'menu.photo.sameAs', params: { n: same }, tone: 'none' }
    }
    case 'over-limit':
      return { n, key: 'menu.photo.overLimit', params: { limit: menu.limit ?? 0 }, tone: 'none' }
    case 'stopped-early':
      return { n, key: 'menu.photo.stoppedEarly', params: {}, tone: 'none' }
    default:
      return { n, key: 'menu.photo.unread', params: {}, tone: 'none' }
  }
}
