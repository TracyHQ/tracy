/**
 * A page of its own inside the Add site tab (option C, Akemi 14/10/2026): "Customize your site" and "Pick a design
 * system" no longer slide a sheet over the form, they take the tab's place. A "Back to Add site" link sits above a
 * centred card shaped like the form's card (the same ground, border and corner), whose head is the page's title, a muted
 * line and a hairline. What the page asks is the caller's (`questions-sheet.tsx`, `design-system-sheet.tsx`).
 *
 * The page is the tab's scroller while it is up, and the form under it is hidden (`wizard.tsx`), so whatever the page
 * holds scrolls with the panel and nothing scrolls inside a box. Back and Escape return to the form; a control that used
 * Escape for itself (the language list, a preview popup) has already said so and keeps it. Focus moves to the page when
 * it opens, so a screen reader starts at its title, and back to the form's row when it closes (the wizard's part).
 *
 * Geometry: `.tas-page*` in `styles.ts`. `wide` widens the card from the form's 618px to 960px for the design-system
 * grid. `preview` is the /ops preview of a release's questions: the page fills the frame it is given, with no Back
 * link, no focus grab and no Escape.
 */
import { ChevronLeft } from 'lucide-react'
import { type JSX, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useId, useRef } from 'react'

import type { Translate } from './strings'

export interface AddSitePageProps {
  t: Translate
  title: string
  /** The muted line under the title. */
  desc: string
  /** Under the muted line: a status the page must say once (answers a change of template kept). */
  note?: ReactNode
  onBack: () => void
  /** True while Escape belongs to something drawn over the page (a popup it opened). */
  escapeHeld?: boolean
  wide?: boolean
  preview?: boolean
  /** The page's scroller, for a caller that moves its scroll. */
  scrollRef?: RefObject<HTMLElement | null>
  /** The data attribute naming the page for tests and the wizard: `data-<marker>="1"`. */
  marker: string
  children: ReactNode
}

export function AddSitePage({
  t,
  title,
  desc,
  note,
  onBack,
  escapeHeld = false,
  wide = false,
  preview = false,
  scrollRef,
  marker,
  children
}: AddSitePageProps): JSX.Element {
  const titleId = useId()
  const own = useRef<HTMLElement>(null)
  const page = scrollRef ?? own
  useEffect(() => {
    if (!preview) page.current?.focus({ preventScroll: true })
  }, [preview, page])
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (preview || escapeHeld || event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onBack()
  }
  return (
    <section
      ref={page}
      aria-labelledby={titleId}
      tabIndex={-1}
      className="tas-page text-foreground text-sm"
      data-page-wide={wide ? '1' : undefined}
      data-page-preview={preview ? '1' : undefined}
      {...{ [`data-${marker}`]: '1' }}
      onKeyDown={onKeyDown}
    >
      <div className="tas-page-col">
        {preview ? null : (
          <button type="button" className="tas-back" data-page-back="1" onClick={onBack}>
            <ChevronLeft size={15} aria-hidden="true" />
            {t('page_back')}
          </button>
        )}
        <div className="tas-page-card">
          <div className="tas-page-head" data-page-head="1">
            <h2 id={titleId} className="tas-page-title">
              {title}
            </h2>
            <p className="tas-page-desc">{desc}</p>
            {note}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}
