/**
 * One card of the Design system sheet's grid (`design-system-sheet.tsx`).
 */
import { Check, Eye } from 'lucide-react'
import type { JSX } from 'react'

import { type LibraryRow, pickOf, swatchesOf } from './design-system-pick.mjs'
import type { Translate } from './strings'

/**
 * One card of the grid, drawn exactly like a card of the Design templates gallery (Akemi, 12/10/2026; a port of
 * `tracy-design-inspiration` `Gallery.tsx` and `card-chrome.tsx`, same structure and classes, not an import): a
 * `Card`'s rounded-xl border and shadow with its hover stroke and lift, a 160 px picture, the name and one muted line
 * with the palette dots at the end of that row. A system's card dims its picture and shows the "Open preview" pill on
 * hover and keyboard focus, and always on a screen with no hover (touch). The picked card keeps its terracotta stroke
 * (a scoped rule on aria-pressed, `design-system-css.ts`) and a check badge top right, where the gallery puts its
 * Coming soon badge. `row` null is "Template default", drawn with the template's own picture; it is picked at once, so
 * it shows no pill.
 */
export function SystemCard({
  t,
  row,
  selected,
  templateImage,
  onPick
}: {
  t: Translate
  row: LibraryRow | null
  selected: boolean
  templateImage: string | null
  /** Pressed: the card itself, so the preview popup can give focus back to it. */
  onPick: (card: HTMLElement) => void
}): JSX.Element {
  // The library's own picture of the system (Refero's screenshot); a system with none (OpenDesign) draws its "Aa" in its
  // own font, never an invented picture. "Template default" keeps the template's own picture.
  const image = row ? row.image : templateImage
  const pick = row ? pickOf(row) : null
  const swatches = swatchesOf(row)
  return (
    <GalleryCard
      t={t}
      name={row ? row.name : t('ds_default')}
      description={row ? row.description : t('ds_default_desc')}
      image={image}
      font={pick?.font}
      swatches={swatches}
      selected={selected}
      marker={{ 'data-design-system': row ? row.id : 'default' }}
      onPick={onPick}
      previewOpensDialog={Boolean(row)}
    />
  )
}

/** Shared card chrome for the starting template and design system galleries. */
export function GalleryCard({
  t,
  name,
  description,
  image,
  font,
  swatches = [],
  selected,
  marker,
  onPick,
  onPreview,
  imageAspect = false,
  previewOpensDialog = false
}: {
  t: Translate
  name: string
  description: string
  image: string | null
  font?: string | null
  swatches?: string[]
  selected: boolean
  marker: Record<string, string>
  onPick: (card: HTMLElement) => void
  onPreview?: (button: HTMLElement) => void
  imageAspect?: boolean
  previewOpensDialog?: boolean
}): JSX.Element {
  const showPreview = Boolean(onPreview) || previewOpensDialog
  const placeholder = t('ds_swatch')
  const selectedLabel = t('ds_selected')
  const previewLabel = t('ds_open_preview')
  return (
    <div className="group relative isolate min-w-0">
      <button
        type="button"
        aria-pressed={selected}
        // A system's card opens its preview popup; the name says so, Template default is picked at once.
        aria-haspopup={previewOpensDialog ? 'dialog' : undefined}
        // Focus is the same 1px stroke turning --ring, never a halo (DESIGN.md section 5). `isolate` keeps the pill (z-10)
        // inside the card, so it never paints over anything stacked above the grid.
        className="tas-ds-card relative flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-card p-0 text-left text-card-foreground text-sm shadow-sm outline-none transition [font:inherit] hover:border-ring hover:shadow-md focus-visible:border-ring"
        {...marker}
        onClick={(event) => onPick(event.currentTarget)}
      >
        <span
          className={
            imageAspect
              ? 'relative block aspect-[16/10] w-full overflow-hidden bg-muted'
              : 'relative block h-40 overflow-hidden bg-muted'
          }
        >
          {image ? (
            <img
              src={image}
              alt=""
              loading="lazy"
              decoding="async"
              className="tas-ds-pic absolute inset-0 block h-full w-full object-cover object-top"
            />
          ) : (
            <span
              data-start-placeholder="1"
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center text-foreground"
            >
              <span
                className="tas-ds-aa text-3xl leading-none"
                style={font ? { fontFamily: `"${font}", var(--font-sans, sans-serif)` } : undefined}
              >
                {placeholder}
              </span>
            </span>
          )}
          {/* Hover: the gallery's dim of the picture. A scrim, not a theme colour: a translucent black darkens any picture
            in either theme, which no token does, so the literal is deliberate. Drawn before the check, which stays undimmed. */}
          {showPreview ? (
            <span className="pointer-events-none absolute inset-0 bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100" />
          ) : null}
          {selected ? (
            <span
              className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"
              aria-label={selectedLabel}
            >
              <Check size={13} strokeWidth={2.5} aria-hidden="true" />
            </span>
          ) : null}
        </span>
        <span className="flex w-full items-center gap-2 p-2.5">
          <span className="min-w-0 flex-1">
            {/* One line, cut with an ellipsis; the native tooltip gives the full name (Akemi, 12/10/2026). */}
            <span className="block truncate font-semibold text-sm leading-none" title={name}>
              {name}
            </span>
            <span className="mt-1 block truncate text-muted-foreground text-xs">{description}</span>
          </span>
          {/* The system's own palette, the gallery card's swatches at the end of the name row. */}
          {swatches.length > 0 ? (
            <span
              aria-hidden="true"
              className="flex shrink-0 gap-1"
              data-design-system-swatches={swatches.length}
            >
              {swatches.map((hex) => (
                <span
                  key={hex}
                  className="tas-ds-dot size-3 rounded-full border border-border"
                  style={{ background: hex }}
                />
              ))}
            </span>
          ) : null}
        </span>
      </button>
      {showPreview ? (
        <span className="tas-gallery-preview pointer-events-none absolute inset-0 z-10 grid place-items-center opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {previewOpensDialog ? (
            <span className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3.5 py-1.5 font-medium text-sm text-foreground shadow-md backdrop-blur">
              <Eye size={15} className="text-primary" aria-hidden="true" />
              {previewLabel}
            </span>
          ) : (
            <button
              type="button"
              className="pointer-events-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background/90 px-3.5 py-1.5 font-medium text-sm text-foreground shadow-md backdrop-blur"
              aria-haspopup="dialog"
              onClick={(event) => onPreview?.(event.currentTarget)}
            >
              <Eye size={15} className="text-primary" aria-hidden="true" />
              {previewLabel}
            </button>
          )}
        </span>
      ) : null}
    </div>
  )
}
