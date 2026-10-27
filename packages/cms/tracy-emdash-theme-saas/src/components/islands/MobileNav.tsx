import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IslandMarks } from '@/lib/stamps'
import { hasDestination, isCurrent, isHeading, isItemActive, type NavLink } from './nav'

export interface MobileNavProps {
  items: NavLink[]
  currentPath: string
  siteTitle: string
  homeUrl: string
  /** Sign-in link; null when hidden. */
  signin: { label: string; url: string } | null
  /** Primary call to action; `url` may be `#` (no destination yet). */
  cta: { label: string; url: string } | null
  /** Provenance stamps of the two button labels (`src/lib/stamps.ts`); absent on an ordinary request. */
  marks?: IslandMarks<'signin' | 'cta'>
  /** The drawer's own words, in the site's language (server-side `src/lib/ui.ts`); English when absent. */
  labels?: { openMenu: string; closeMenu: string; menu: string; backTo: string }
}

const ENGLISH_LABELS = { openMenu: 'Open menu', closeMenu: 'Close menu', menu: 'Menu', backTo: 'Back to' }

// The breakpoint where the source swaps the inline menu for the drawer (Bootstrap lg).
const DESKTOP = '(min-width: 992px)'

/**
 * Mobile menu: hamburger opens a right-hand drawer. Groups slide in as a sub-panel with a back
 * row (not an accordion). Escape or a click on the overlay closes; focus returns to the hamburger.
 */
export default function MobileNav({
  items,
  currentPath,
  siteTitle,
  homeUrl,
  signin,
  cta,
  marks,
  labels = ENGLISH_LABELS
}: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState<number | null>(null)
  const burger = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const backBtn = useRef<HTMLButtonElement>(null)
  const groupRows = useRef<(HTMLButtonElement | null)[]>([])
  const lastGroup = useRef<number | null>(null)

  const close = () => {
    lastGroup.current = null
    setOpen(false)
    setGroup(null)
    burger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !drawer.current) return
      // Keep Tab inside the dialog, skipping the panel that is slid out of view.
      const focusable = [
        ...drawer.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      ].filter((el) => !el.closest('[inert]'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const mq = window.matchMedia(DESKTOP)
    const onResize = () => mq.matches && close()
    document.addEventListener('keydown', onKey)
    mq.addEventListener('change', onResize)
    return () => {
      document.documentElement.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onResize)
    }
  }, [open])

  // Move focus with the slide: into the sub-panel on drill-in, back to its row on return.
  useEffect(() => {
    if (!open) return
    if (group !== null) {
      lastGroup.current = group
      backBtn.current?.focus()
    } else if (lastGroup.current !== null) {
      groupRows.current[lastGroup.current]?.focus()
      lastGroup.current = null
    }
  }, [group, open])

  const sub = group !== null ? items[group] : null

  const linkRow = (link: NavLink, key: string | number) =>
    hasDestination(link.url) ? (
      <li key={key}>
        <a
          href={link.url}
          target={link.target || undefined}
          className={cn('k-drawer-row', isCurrent(link.url, currentPath) && 'is-active')}
          aria-current={isCurrent(link.url, currentPath) ? 'page' : undefined}
        >
          {link.label}
        </a>
      </li>
    ) : null

  return (
    <>
      <button
        ref={burger}
        type="button"
        className="k-icon-btn"
        aria-label={labels.openMenu}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} strokeWidth={2} aria-hidden="true" />
      </button>

      <div className={cn('k-drawer-root', open && 'is-open')} hidden={!open}>
        <div className="k-drawer-overlay" onClick={close} aria-hidden="true" />
        <div
          ref={drawer}
          className="k-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={siteTitle || labels.menu}
        >
          <div className="k-drawer-top">
            <a href={homeUrl} className="k-drawer-brand">
              <svg className="k-mark" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <use href="#k-mark" />
              </svg>
              {siteTitle && <span>{siteTitle}</span>}
            </a>
            <button
              ref={closeBtn}
              type="button"
              className="k-drawer-close"
              aria-label={labels.closeMenu}
              onClick={close}
            >
              <X size={20} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          <div className="k-drawer-body">
            <div className="k-drawer-track">
              <ul
                className={cn('k-drawer-list k-drawer-main', sub && 'is-away')}
                inert={sub ? true : undefined}
              >
                {items.map((item, i) =>
                  item.children.length ? (
                    <li key={i}>
                      <button
                        ref={(el) => {
                          groupRows.current[i] = el
                        }}
                        type="button"
                        className={cn('k-drawer-row', isItemActive(item, currentPath) && 'is-active')}
                        onClick={() => setGroup(i)}
                      >
                        {item.label}
                        <ChevronRight
                          size={16}
                          strokeWidth={2}
                          aria-hidden="true"
                          className="k-drawer-chev"
                        />
                      </button>
                    </li>
                  ) : (
                    linkRow(item, i)
                  )
                )}
              </ul>

              <div className={cn('k-drawer-sub', sub && 'is-in')} inert={sub ? undefined : true}>
                {sub && (
                  <>
                    <button
                      ref={backBtn}
                      type="button"
                      className="k-drawer-back"
                      onClick={() => setGroup(null)}
                    >
                      <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
                      <span className="sr-only">{labels.backTo} </span>
                      {sub.label}
                    </button>
                    <ul className="k-drawer-list">
                      {/* Column headings become sub-labels over their links; plain links follow. */}
                      {sub.children.filter(isHeading).flatMap((col, j) => [
                        <li key={`h${j}`} className="k-drawer-label">
                          {col.label}
                        </li>,
                        ...col.children.map((l, k) => linkRow(l, `${j}-${k}`))
                      ])}
                      {sub.children.filter((c) => !isHeading(c)).map((l, k) => linkRow(l, `p${k}`))}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {(signin || cta) && (
              <div className="k-drawer-actions">
                {signin && (
                  <a href={signin.url} className="k-drawer-signin" {...marks?.signin}>
                    {signin.label}
                  </a>
                )}
                {cta &&
                  (hasDestination(cta.url) ? (
                    <a href={cta.url} className="k-btn k-btn-primary w-full" {...marks?.cta}>
                      {cta.label}
                      <ArrowRight aria-hidden="true" />
                    </a>
                  ) : (
                    <button type="button" className="k-btn k-btn-primary w-full" {...marks?.cta}>
                      {cta.label}
                      <ArrowRight aria-hidden="true" />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
