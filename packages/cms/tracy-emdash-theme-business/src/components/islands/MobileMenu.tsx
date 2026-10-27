import { MenuIcon } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { Attrs, IslandMarks } from '@/lib/stamps'

export interface MobileMenuItem {
  label: string
  url: string
  /** True on the page currently being read; drawn like the desktop nav's `.is-active`. */
  active?: boolean
}
export interface MobileMenuProps {
  /** Accessible name of the button and title of the drawer (`wordsOf(locale).menu`). */
  label: string
  /** Same list the desktop nav draws: `chrome.primary`. */
  items: MobileMenuItem[]
  /** The Resources group of the desktop mega panel, flattened: its label and its links. */
  resourcesLabel: string
  resources: MobileMenuItem[]
  /** "All news" — the mega panel's footer link. */
  allLabel: string
  allUrl: string
  /** The header's CTA, repeated at the foot of the drawer so it is reachable on a phone. */
  quoteLabel: string
  quoteUrl: string
  /**
   * Provenance stamps of the site chrome fields the drawer prints (`src/lib/stamps.ts`). Present
   * only on a stamped request. The menu items are menus, not Content API records: no stamps.
   */
  marks?: IslandMarks<'resourcesLabel' | 'allLabel' | 'quoteLabel'>
}

/**
 * The header's navigation on a phone. The desktop row is a wrapping flex list plus a mega
 * panel positioned against the header box; neither survives 390px, and up to tonight the
 * theme simply had no narrow form of the main menu at all.
 *
 * A sheet, not a disclosure list: the drawer renders in a portal above the page, so the
 * header's `position`/`overflow` cannot clip it, and Radix supplies Escape, the backdrop,
 * the focus trap and focus return. The items are the SAME data the desktop nav reads
 * (`chrome.primary` + `chrome.kit`) — passed in, never fetched again, so the two cannot drift.
 */
export default function MobileMenu(p: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const link = (i: MobileMenuItem, mark?: Attrs) => (
    <a
      key={i.url + i.label}
      href={i.url}
      aria-current={i.active ? 'page' : undefined}
      onClick={() => setOpen(false)}
      className="border-b border-line-soft py-3.5 text-[15px] font-semibold text-fg aria-[current=page]:text-signal-text hover:text-signal-text"
      {...mark}
    >
      {i.label}
    </a>
  )
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={p.label}
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center border border-line text-fg-2 outline-none hover:border-forest-text hover:text-forest-text focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
      >
        <MenuIcon className="size-[18px]" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(86vw,340px)] border-line bg-paper text-fg">
        <SheetHeader className="border-b border-line">
          <SheetTitle className="text-[13px] font-semibold uppercase tracking-[.13em] text-fg-meta">
            {p.label}
          </SheetTitle>
        </SheetHeader>
        <nav className="flex min-h-0 flex-col overflow-y-auto px-4 pb-4" aria-label={p.label}>
          {p.items.map((i) => link(i))}
          {p.resources.length > 0 && (
            <>
              <p
                className="mt-5 mb-1 text-[11px] font-semibold uppercase tracking-[.13em] text-fg-meta"
                {...p.marks?.resourcesLabel}
              >
                {p.resourcesLabel}
              </p>
              {p.resources.map((i) => link(i))}
            </>
          )}
          {p.allUrl && link({ label: p.allLabel, url: p.allUrl }, p.marks?.allLabel)}
          {p.quoteUrl && (
            <a
              href={p.quoteUrl}
              onClick={() => setOpen(false)}
              className="btn-forest tb-quote mt-5 text-center"
              {...p.marks?.quoteLabel}
            >
              {p.quoteLabel}
            </a>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
