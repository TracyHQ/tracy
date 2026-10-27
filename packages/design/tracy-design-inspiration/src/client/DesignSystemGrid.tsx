/**
 * The cards of the running site's Design system tab, drawn exactly like the Design templates gallery's cards (Akemi,
 * 12/10/2026): the same grid (`CARD_GRID`), the same card (a `Card`'s rounded-xl border and shadow, the hover stroke and
 * lift), a 160 px picture, the name and one muted line under it with the palette dots at the end of that row, and the
 * gallery's hover: the picture dims and the "Open preview" pill shows in the middle of the card (`card-chrome.tsx`,
 * shared with `Gallery.tsx`). The gallery's card is a pointer-only `div`; this one is a button, so keyboard focus shows
 * the pill too and Enter / Space open the popup (`SystemPreviewDialog.tsx`). A screen with no hover (touch) shows the
 * pill all the time, so the card says it opens something.
 *
 * - `SystemCard`: the library picture (an "Aa" in the system's own font when the library has none). The system the
 *   site wears keeps its mark: the terracotta border and a "Wearing now" badge where the gallery puts its Coming soon
 *   badge. A `synthetic` row (a worn system the library does not list, `design-system-pinned.mjs`) is drawn without
 *   the pill and opens nothing: there is no preview for it.
 * - `TemplateDefaultCard`: the synthetic card for the template's own look (Akemi, 13/10/2026, D2), pinned beside the
 *   worn card. The template's own thumbnail (the card picture /ops Templates Management draws for the site's release,
 *   the read's `templateImage`), or a neutral picture naming the template when there is none; the badge "Template
 *   default" — or "Wearing now" when nothing is worn. Drawn exactly like the other cards (picture, name, one line), and
 *   a button like them (14/10/2026): it opens the same preview popup, which shows the site wearing no system and holds
 *   the way back (the last apply undone) where the others hold Try on (`DesignSystemTab.tsx`).
 * - `SystemDots`: the palette, the gallery card's swatches (12 px, round, one 1px border so a white one shows).
 * - `SystemLibraryList`: the grid of cards revealed so far with the pinned pair at its head, or what stands in its
 *   place (the library door's refusal with Try again, loading, nothing matching the toolbar).
 */
import { Button, cn } from '@tracy/ui'
import { Check } from 'lucide-react'
import { type JSX, useState } from 'react'

import { CARD_GRID, OpenPreviewPill, PictureDim } from './card-chrome'
import { fontOf, isWorn, swatchesOf } from './design-system-card-parts.mjs'
import type { LibrarySystem } from './design-system-library.mjs'
import type { pinnedGridOf } from './design-system-pinned.mjs'
import type { Translate } from './strings'
import { cardThumb } from './templates.mjs'

type WornRead = Parameters<typeof isWorn>[0]
type Grid = ReturnType<typeof pinnedGridOf>
type GridRow = NonNullable<Grid['rows']>[number]

/** The Template default card's id: its `data-system`, and the id its popup asks the preview door for. */
export const TEMPLATE_DEFAULT_ID = 'template-default'

/** The card's own classes: the gallery card (a `Card` with gap-0 p-0, its hover stroke and lift). */
const CARD =
  'group relative isolate flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-0 text-left text-card-foreground text-sm shadow-sm outline-none transition'

/**
 * The badge top right of a picture, where the gallery puts its Coming soon badge; drawn after the dim, so undimmed.
 * "Wearing now" is filled with the primary colour and carries the check; "Template default" is a quiet pill.
 */
function CardBadge({ kind, label }: { kind: 'wearing' | 'default'; label: string }): JSX.Element {
  return (
    <span
      className={cn(
        'absolute top-2 right-2 flex h-5 items-center gap-1 rounded-full pr-2 font-medium text-[11px] leading-none shadow-sm',
        kind === 'wearing'
          ? 'bg-primary pl-1 text-primary-foreground'
          : 'border border-border bg-background/90 pl-2 text-foreground backdrop-blur'
      )}
      data-card-badge={kind}
    >
      {kind === 'wearing' ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : null}
      {label}
    </span>
  )
}

/** The "Aa" swatch drawn in the system's own font, or the host's sans when it names none. */
export function SystemSwatch({
  s,
  t,
  className
}: {
  s: LibrarySystem
  t: Translate
  className: string
}): JSX.Element {
  const font = fontOf(s)
  return (
    <span aria-hidden="true" className={cn('grid place-items-center text-foreground', className)}>
      <span
        className="text-3xl leading-none"
        style={font ? { fontFamily: `"${font}", var(--font-sans, sans-serif)` } : undefined}
      >
        {t('ds.swatch')}
      </span>
    </span>
  )
}

/** The system's palette: up to four dots, nothing when the library sends none. */
export function SystemDots({ s }: { s: LibrarySystem }): JSX.Element | null {
  const swatches = swatchesOf(s)
  if (swatches.length === 0) return null
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1" data-design-system-swatches={swatches.length}>
      {swatches.map((hex) => (
        <span key={hex} className="size-3 rounded-full border border-border" style={{ background: hex }} />
      ))}
    </span>
  )
}

export function SystemCard({
  s,
  worn,
  t,
  onOpen
}: {
  s: GridRow
  worn: boolean
  t: Translate
  /** Pressed: the card itself, so the popup can give focus back to it. */
  onOpen: (card: HTMLElement) => void
}): JSX.Element {
  const picture = (
    <span className="relative block h-40 overflow-hidden bg-muted">
      {s.image ? (
        <img
          src={s.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 block h-full w-full object-cover object-top"
        />
      ) : (
        <SystemSwatch s={s} t={t} className="absolute inset-0" />
      )}
      {s.synthetic ? null : <PictureDim className="group-focus-visible:opacity-100" />}
      {worn ? <CardBadge kind="wearing" label={t('ds.worn.label')} /> : null}
    </span>
  )
  const words = (
    <span className="flex w-full items-center gap-2 p-2.5">
      <span className="min-w-0 flex-1">
        {/* One line, cut with an ellipsis; the native tooltip gives the full name (Akemi, 12/10/2026). */}
        <span className="block truncate font-semibold text-sm leading-none" title={s.name}>
          {s.name}
        </span>
        {s.description ? (
          <span className="mt-1 block truncate text-muted-foreground text-xs">{s.description}</span>
        ) : null}
      </span>
      <SystemDots s={s} />
    </span>
  )
  // A worn system the library does not list: said, not opened — there is no preview for it.
  if (s.synthetic)
    return (
      <div className={CARD} data-system={s.id} data-worn-card={worn ? 'true' : 'false'} data-synthetic="">
        {picture}
        {words}
      </div>
    )
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-current={worn ? 'true' : undefined}
      // The gallery card's own classes, as a button. Focus is the same 1px stroke turning --ring, never a halo
      // (DESIGN.md section 5). The worn card's terracotta stroke is a scoped rule on data-worn-card
      // (design-inspiration.css), so no other plugin's utility sheet can win it back. `isolate` keeps the pill (z-10)
      // inside the card, so it never paints over the sticky toolbar while the grid scrolls.
      className={cn(CARD, 'cursor-pointer hover:border-ring hover:shadow-md focus-visible:border-ring')}
      data-pick={s.id}
      data-system={s.id}
      data-worn-card={worn ? 'true' : 'false'}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      {picture}
      {words}
      <OpenPreviewPill
        label={t('card.preview')}
        className="group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </button>
  )
}

/**
 * The template's own look as a card (Akemi, 13/10/2026, D2). Its picture is the template's thumbnail, the one /ops
 * Templates Management shows for the site's release (`image`, asked card-sized from the shots door, `cardThumb`); with
 * none, or one that does not load, a neutral picture naming the template (nothing is invented). `badge` says whether
 * it is what the site wears. The same shape as every other card (14/10/2026: its old full-width undo button made it
 * taller and broke the grid's rows); pressed, it opens the preview popup, where the way back lives.
 */
export function TemplateDefaultCard({
  template,
  image,
  badge,
  t,
  onOpen
}: {
  template: string | null
  /** The template's thumbnail address (the read's `templateImage`), or null. */
  image?: string | null
  badge: 'wearing' | 'default'
  t: Translate
  /** Pressed: the card itself, so the popup can give focus back to it. */
  onOpen: (card: HTMLElement) => void
}): JSX.Element {
  const wearing = badge === 'wearing'
  // A picture that fails to load falls back to the template's name, never a broken image.
  const [failed, setFailed] = useState<string | null>(null)
  const src = image ? cardThumb(image) : null
  const shown = src !== null && failed !== src
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-current={wearing ? 'true' : undefined}
      className={cn(CARD, 'cursor-pointer hover:border-ring hover:shadow-md focus-visible:border-ring')}
      data-pick={TEMPLATE_DEFAULT_ID}
      data-system={TEMPLATE_DEFAULT_ID}
      data-worn-card={wearing ? 'true' : 'false'}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span className="relative grid h-40 place-items-center overflow-hidden bg-muted px-4">
        {shown ? (
          <img
            src={src}
            alt={template ?? ''}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 block h-full w-full object-cover object-top"
            data-template-image=""
            onError={() => setFailed(src)}
          />
        ) : template ? (
          <span
            className="max-w-full truncate font-medium text-muted-foreground text-sm"
            data-template-name=""
          >
            {template}
          </span>
        ) : null}
        <PictureDim className="group-focus-visible:opacity-100" />
        <CardBadge kind={badge} label={wearing ? t('ds.worn.label') : t('ds.default.title')} />
      </span>
      <span className="flex w-full items-center gap-2 p-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-sm leading-none">{t('ds.default.title')}</span>
          <span className="mt-1 block truncate text-muted-foreground text-xs">{t('ds.default.line')}</span>
        </span>
      </span>
      <OpenPreviewPill
        label={t('card.preview')}
        className="group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </button>
  )
}

/**
 * The library's cards as far as `reveal` has gone (`useReveal`), with the pinned pair at the head (`grid`,
 * `design-system-pinned.mjs`) and the sentinel below the last one; or the library door's refusal with Try again,
 * loading, or nothing matching the toolbar.
 */
export function SystemLibraryList({
  grid,
  error,
  onRetry,
  reveal,
  worn,
  template,
  templateImage = null,
  t,
  onOpen
}: {
  /** The cards in their final order and where the Template default card goes; `rows` null while asked. */
  grid: Grid
  /** The library door's refusal code, when it did not answer with a library. */
  error: string | null
  onRetry: () => void
  reveal: { count: number; endRef: React.RefObject<HTMLDivElement | null> }
  /** What the site wears (the read's `worn`), to mark its card. */
  worn: WornRead
  /** The template the site runs, named on the Template default card. */
  template: string | null
  /** The template's thumbnail (the read's `templateImage`), the Template default card's picture; null for none. */
  templateImage?: string | null
  t: Translate
  onOpen: (id: string, card: HTMLElement) => void
}): JSX.Element {
  const { rows, defaultCard } = grid
  const cards =
    rows === null
      ? []
      : rows
          .slice(0, reveal.count)
          .map((r) => (
            <SystemCard
              key={r.id}
              s={r}
              worn={isWorn(worn, r.id)}
              t={t}
              onOpen={(card) => onOpen(r.id, card)}
            />
          ))
  if (defaultCard)
    cards.splice(
      defaultCard.at,
      0,
      <TemplateDefaultCard
        key="template-default"
        template={template}
        image={templateImage}
        badge={defaultCard.badge}
        t={t}
        onOpen={(card) => onOpen(TEMPLATE_DEFAULT_ID, card)}
      />
    )
  return (
    <>
      {error ? (
        // The Add site card's own words (Akemi, 12/10/2026), centred where the grid would be. The door's code
        // stays in the data attribute for support; the customer never reads it.
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center text-sm"
          role="alert"
          data-library-error={error}
        >
          <p className="m-0 text-muted-foreground">{t('ds.library.failed')}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('ds.retry')}
          </Button>
        </div>
      ) : rows === null ? (
        <p className="m-0 text-muted-foreground text-sm">{t('ds.loading')}</p>
      ) : cards.length === 0 ? (
        <p className="m-0 py-6 text-center text-muted-foreground text-xs" data-library-empty="">
          {t('ds.filter.empty')}
        </p>
      ) : (
        <div className={CARD_GRID}>{cards}</div>
      )}
      {/* A hairline below the last card revealed, gone once every card is out. */}
      {rows && reveal.count < rows.length ? (
        <div ref={reveal.endRef} aria-hidden className="h-px shrink-0" />
      ) : null}
    </>
  )
}
