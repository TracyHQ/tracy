import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { IslandMarks } from '@/lib/stamps'

export interface MobileNavProps {
  label: string
  primary: Array<{ label: string; url?: string }>
  /** `marks`: the provenance stamp of a group's title (`src/lib/stamps.ts`); menu links carry none. */
  groups: Array<{ title: string; links: Array<{ label: string; url: string }>; marks?: IslandMarks<'title'> }>
  contactLabel: string
  contactUrl: string
  /** Provenance stamps of the site chrome fields the drawer prints; present only on a stamped request. */
  marks?: IslandMarks<'label' | 'contactLabel'>
  /** Accessible name of the close buttons, in the site's language (server-side `src/lib/ui.ts`). */
  closeLabel?: string
}

/** The source's off-canvas menu under the `lg` breakpoint: every menu group, one drawer, Escape closes. */
export default function MobileNav(p: MobileNavProps) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])
  return (
    <>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full text-fg hover:bg-surface lg:hidden"
        aria-label={p.label}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={p.label}
            id="mobile-nav"
          >
            {/* ds-keep: full-bleed backdrop, not a button face */}
            <button
              type="button"
              className="absolute inset-0 bg-fg/40"
              aria-label={p.closeLabel ?? 'Close'}
              onClick={() => setOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 flex w-[min(360px,92vw)] flex-col overflow-y-auto bg-bg p-6 shadow-raised">
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="text-[14px] font-semibold uppercase tracking-[0.06em] text-fg-meta"
                  {...p.marks?.label}
                >
                  {p.label}
                </span>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface"
                  aria-label={p.closeLabel ?? 'Close'}
                  onClick={() => setOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M3 3l10 10M13 3L3 13"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <ul className="mb-4 flex flex-col border-b border-line-soft pb-4">
                {p.primary
                  .filter((i) => i.url)
                  .map((i) => (
                    <li key={i.url}>
                      <a href={i.url} className="block py-2 text-[19px] font-semibold text-fg">
                        {i.label}
                      </a>
                    </li>
                  ))}
              </ul>
              {p.groups.map((g) => (
                <div key={g.title} className="mb-4">
                  <div
                    className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-meta"
                    {...g.marks?.title}
                  >
                    {g.title}
                  </div>
                  <ul>
                    {g.links.map((l) => (
                      <li key={l.url}>
                        <a href={l.url} className="block py-1.5 text-[15px] text-fg">
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {p.contactUrl && (
                <a href={p.contactUrl} className="btn btn-primary mt-auto" {...p.marks?.contactLabel}>
                  {p.contactLabel}
                </a>
              )}
            </div>
          </div>,
          // Portalled to <body>: the header's backdrop-filter would otherwise become the containing
          // block of this fixed drawer and clip it to the header's 80px.
          document.body
        )}
    </>
  )
}
