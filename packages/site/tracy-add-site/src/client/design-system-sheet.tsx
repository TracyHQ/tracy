/**
 * The page the Design system card opens (`design-system-card.tsx`), built like the Customize your site page (the same
 * `AddSitePage`: Back to Add site above a centred card, Akemi 14/10/2026, option C; until then a sheet over the form).
 * Its card is wider than the form's (960px, not 618px) so the grid holds three columns. It is the Design templates
 * gallery's grid of cards (`design-system-grid-card.tsx`):
 * "Template default" first, then every system of the library that passed the quality gate, each with its library
 * picture (Refero's screenshot; an "Aa" in its own font when the library has none, as for OpenDesign) and its own palette
 * as a row of dots (Akemi, 12/10/2026). Pressing a system opens its preview popup (`design-system-preview.tsx`): the
 * picked template wearing it, rendered only then; Use <name> there picks it, the page closes and the card says
 * "<name> selected". "Template default" is picked at once.
 *
 * The library is Refero's whole set (about a thousand systems, 12/10/2026), so the grid is revealed in pages of thirty
 * as the page scrolls (`useReveal`, the Design inspiration gallery's own way) and every picture loads lazily: a
 * thousand cards are never in the page at once. The count the card and the page say is the whole library's.
 *
 * Above the grid sits the Design inspiration gallery's toolbar (`design-system-filter.tsx`, Akemi 12/10/2026): search
 * by name and a Categories menu over the library's industries, with the gallery's count line under it. A new search or
 * tick starts the grid again at its first thirty. While anything narrows the list, "Template default" (not a system of
 * the library) steps aside, so the grid shows only what matches; Clear brings it back.
 */
import { type JSX, type RefObject, useEffect, useMemo, useRef, useState } from 'react'

import { AddSitePage } from './add-site-page'
import { filterSystems, isFiltered, NO_FILTER, type SystemFilter } from './design-system-filter.mjs'
import { DesignSystemFilter } from './design-system-filter'
import { SystemCard } from './design-system-grid-card'
import { type DesignSystemPick, type LibraryRow, pickOf } from './design-system-pick.mjs'
import { DesignSystemPreview } from './design-system-preview'
import type { Translate } from './strings'

/** Cards added per reveal, and the first screenful: the Design inspiration gallery's step (`Gallery.tsx`). */
export const REVEAL_STEP = 30

/**
 * How many of `total` cards to render: `REVEAL_STEP` at first, thirty more each time the sentinel below the last one
 * comes within a screen of view. The sentinel is observed afresh on every count, so a tall page keeps growing until
 * the sentinel is pushed out of view (the gallery's way, `Gallery.tsx`). Back to the first step when `reset` changes
 * (a new search or tick).
 */
function useReveal(
  total: number,
  reset: unknown
): { count: number; endRef: RefObject<HTMLDivElement | null> } {
  const [count, setCount] = useState(REVEAL_STEP)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => setCount(REVEAL_STEP), [reset])
  useEffect(() => {
    const el = endRef.current
    if (!el || count >= total) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + REVEAL_STEP, total))
      },
      { rootMargin: '100% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [count, total])
  return { count, endRef }
}
/** The Design templates gallery's grid: as many 260 px-or-wider columns as the page holds, 12 px apart. */
const GRID = 'tas-ds-grid grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3'
export interface DesignSystemPageProps {
  t: Translate
  rows: LibraryRow[]
  template: string
  templateImage: string | null
  /** The platform as the form names it ("Joomla"), and the build the preview renders (tag, platform value). */
  platformLabel: string
  quickstart: string | undefined
  platform: string | undefined
  picked: DesignSystemPick | null
  onPick: (pick: DesignSystemPick | null) => void
  onClose: () => void
  /** Render gallery controls inside the stepped wizard. */
  inline?: boolean
}

/** The page; mounted only while open, so it starts at its top each time. Rows keep the library's order. */
export function DesignSystemPage({
  t,
  rows,
  template,
  templateImage,
  platformLabel,
  quickstart,
  platform,
  picked,
  onPick,
  onClose,
  inline = false
}: DesignSystemPageProps): JSX.Element {
  const page = useRef<HTMLElement>(null)
  const head = useRef<HTMLDivElement>(null)
  // The system whose preview popup is open, and the card that opened it (focus goes back there when it closes).
  const [previewing, setPreviewing] = useState<LibraryRow | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  /** The toolbar's search and ticked categories; the count the head says stays the whole library's. */
  const [filter, setFilter] = useState<SystemFilter>(NO_FILTER)
  const shown = useMemo(() => filterSystems(rows, filter), [rows, filter])
  const filtered = isFiltered(filter)
  const reveal = useReveal(shown.length, filter)
  const previewIndex = previewing ? shown.findIndex((row) => row.id === previewing.id) : -1
  // A new search or tick shows its matches from the top: the page scrolls back to where the toolbar sticks. Left
  // scrolled to the bottom of a longer list, the sentinel would sit in view and the reveal would grow past its first
  // thirty at once (measured with the gallery's taller cards).
  const onFilter = (next: SystemFilter): void => {
    setFilter(next)
    // Inline galleries share their wizard's scroller rather than mounting an AddSitePage.
    let scroller = page.current
    if (inline && head.current) {
      let ancestor = head.current.parentElement
      while (ancestor) {
        if (
          /auto|scroll/.test(getComputedStyle(ancestor).overflowY) &&
          ancestor.scrollHeight > ancestor.clientHeight
        ) {
          scroller = ancestor
          break
        }
        ancestor = ancestor.parentElement
      }
    }
    const below =
      head.current && scroller
        ? head.current.getBoundingClientRect().bottom -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop
        : 0
    if (scroller && scroller.scrollTop > below) scroller.scrollTop = below
  }
  const gallery = (
    <>
      <div ref={head} aria-hidden="true" />
      <div className="tas-ds-tools">
        <DesignSystemFilter rows={rows} value={filter} onChange={onFilter} shown={shown.length} t={t} />
      </div>
      <div className="tas-ds-body">
        {shown.length === 0 ? (
          <p className="m-0 py-6 text-center text-muted-foreground text-xs" data-design-system-empty="1">
            {t('ds_filter_empty')}
          </p>
        ) : null}
        <div className={GRID}>
          {filtered ? null : (
            <SystemCard
              t={t}
              row={null}
              selected={picked === null}
              templateImage={templateImage}
              onPick={() => onPick(null)}
            />
          )}
          {shown.slice(0, reveal.count).map((row) => (
            <SystemCard
              key={row.id}
              t={t}
              row={row}
              selected={picked?.id === row.id}
              templateImage={null}
              onPick={(card) => {
                opener.current = card
                setPreviewing(row)
              }}
            />
          ))}
        </div>
        {/* A hairline below the last card revealed, gone once every card is out. */}
        {reveal.count < shown.length ? (
          <div ref={reveal.endRef} aria-hidden="true" className="h-px" data-design-system-more="1" />
        ) : null}
      </div>
    </>
  )
  return (
    <>
      {inline ? (
        <div data-design-system-page="1">{gallery}</div>
      ) : (
        <AddSitePage
          t={t}
          title={t('ds_sheet_title')}
          desc={t('ds_sheet_count', { count: rows.length, template })}
          onBack={onClose}
          // While the popup is up, Escape is the popup's: it closes the popup, never the page under it.
          escapeHeld={previewing !== null}
          wide
          scrollRef={page}
          marker="design-system-page"
        >
          {gallery}
        </AddSitePage>
      )}
      {previewing ? (
        <DesignSystemPreview
          t={t}
          row={previewing}
          template={template}
          platformLabel={platformLabel}
          quickstart={quickstart}
          platform={platform}
          returnTo={opener}
          position={previewIndex >= 0 ? { index: previewIndex, total: shown.length } : null}
          onStep={
            previewIndex >= 0
              ? (dir) => {
                  // Walk the filtered cards and wrap at both ends, as the Design templates gallery's pager does.
                  const next = shown[(previewIndex + dir + shown.length) % shown.length]
                  if (next) setPreviewing(next)
                }
              : null
          }
          onBack={() => setPreviewing(null)}
          onUse={() => {
            setPreviewing(null)
            onPick(pickOf(previewing))
          }}
        />
      ) : null}
    </>
  )
}
