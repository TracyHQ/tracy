import { useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { IslandMarks } from '@/lib/stamps'

export interface MegaLink {
  label: string
  url: string
}
export interface MegaColumn {
  title: string
  links: MegaLink[]
  /** Provenance stamp of the column title (`src/lib/stamps.ts`); menu links carry none. */
  marks?: IslandMarks<'title'>
}
export interface MegaFeature {
  eyebrow: string
  title: string
  text: string
  action: string
  url: string
  src: string | null
  alt: string
  /** Provenance stamps of the site chrome fields the feature card prints. */
  marks?: IslandMarks<'eyebrow' | 'title' | 'text' | 'action' | 'image'>
}
export interface MegaPanel {
  kind: 'service' | 'resources' | 'company'
  columns: MegaColumn[]
  feature?: MegaFeature
  latestTitle?: string
  /** `marks`: the post, and its title (`src/lib/stamps.ts`). */
  latest?: Array<{ title: string; date: string; url: string; marks?: IslandMarks<'item' | 'title'> }>
  searchLabel?: string
  searchUrl?: string
  teamTitle?: string
  /** `marks`: the person, and the fields its card prints. */
  team?: Array<{
    name: string
    role: string
    url: string
    src: string | null
    marks?: IslandMarks<'item' | 'name' | 'role' | 'image'>
  }>
  teamAllLabel?: string
  teamAllUrl?: string
  /**
   * Provenance stamps of the site chrome fields the panel prints. Present only on a stamped
   * request; the island spreads them itself because hydration draws its DOM again.
   */
  marks?: IslandMarks<'latestTitle' | 'searchLabel' | 'teamTitle' | 'teamAllLabel'>
}
export interface MegaMenuProps {
  label: string
  url: string
  active: boolean
  panel: MegaPanel
}

/**
 * One header item with a mega panel (the source's Service / Resources / Company). Opens on click
 * and on hover; shadcn Popover (Radix) supplies Escape, outside-click and focus return, and the
 * panel is not modal so the rest of the page stays usable. The panel is pinned to the header's
 * bottom edge and the site container, not to the trigger.
 */
export default function MegaMenu({ label, active, panel }: MegaMenuProps) {
  const [open, setOpen] = useState(false)
  const [top, setTop] = useState(0)
  const [left, setLeft] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | null>(null)
  const openTimer = useRef<number | null>(null)
  const byPointer = useRef(false)
  const place = () => {
    const header = triggerRef.current?.closest('header')
    const trigger = triggerRef.current?.getBoundingClientRect()
    if (header && trigger) {
      setTop(header.getBoundingClientRect().bottom - trigger.bottom)
      setLeft(-trigger.left)
    }
  }
  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (openTimer.current) window.clearTimeout(openTimer.current)
    place()
    setOpen(true)
  }
  // Hover intent: a pointer crossing a trigger on its way to another panel must not switch panels
  // (measured: Company's panel centre lies under the Resources trigger). Hover waits 160ms to open
  // and 260ms to close, so a pass-through does neither.
  const openSoon = () => {
    byPointer.current = true
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    if (openTimer.current) window.clearTimeout(openTimer.current)
    openTimer.current = window.setTimeout(openNow, 160)
  }
  const closeSoon = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 260)
  }
  const col = (c: MegaColumn) => (
    <div key={c.title}>
      <h3
        className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-meta"
        {...c.marks?.title}
      >
        {c.title}
      </h3>
      <ul className="flex flex-col">
        {c.links.map((l) => (
          <li key={l.url}>
            <a href={l.url} className="block py-[6px] text-[15px] text-fg hover:text-accent">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
  const feature = panel.feature ? (
    <a
      href={panel.feature.url}
      className="tracy-menu-feature flex flex-col overflow-hidden rounded-[var(--ds-card-radius,12px)] bg-surface text-fg hover:text-fg"
    >
      {panel.feature.src && (
        <img
          src={panel.feature.src}
          alt={panel.feature.alt}
          width={640}
          height={360}
          className="block aspect-[16/9] w-full object-cover"
          loading="lazy"
          {...panel.feature.marks?.image}
        />
      )}
      <span className="flex flex-col gap-2 p-[18px]">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-2"
          {...panel.feature.marks?.eyebrow}
        >
          {panel.feature.eyebrow}
        </span>
        <span
          className="text-[19px] font-semibold leading-[1.25] tracking-[-0.025em]"
          {...panel.feature.marks?.title}
        >
          {panel.feature.title}
        </span>
        <span className="text-[13px] leading-[1.5] text-fg-2" {...panel.feature.marks?.text}>
          {panel.feature.text}
        </span>
        <span className="pt-1 text-[13px] font-medium text-accent" {...panel.feature.marks?.action}>
          {panel.feature.action} <span aria-hidden="true">↗</span>
        </span>
      </span>
    </a>
  ) : null
  return (
    <Popover open={open} onOpenChange={(v) => (v ? openNow() : setOpen(false))} modal={false}>
      <PopoverTrigger
        ref={triggerRef}
        className={`nav-link inline-flex items-center gap-1.5 bg-transparent ${active ? 'is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M1 3l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={0}
        avoidCollisions={false}
        collisionPadding={0}
        // Hover keeps the focus where it is; a keyboard/click open lets Radix move focus into the
        // panel so Tab walks its links instead of the next header item.
        onOpenAutoFocus={(e) => {
          if (byPointer.current) e.preventDefault()
          byPointer.current = false
        }}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        /* ds-keep: full-bleed panel */
        className="w-screen max-w-none rounded-none border-x-0 border-t-0 border-b border-line-soft bg-bg p-0 text-fg shadow-raised"
        style={{ position: 'fixed', left, top, width: '100vw', transform: 'none' }}
      >
        <div className="wrap py-8">
          {panel.kind === 'service' && (
            <div className="grid grid-cols-[1fr_320px] gap-12">
              {panel.columns.map(col)}
              {feature}
            </div>
          )}
          {panel.kind === 'resources' && (
            <div className="grid grid-cols-[repeat(3,1fr)_320px] gap-10">
              {panel.columns.map(col)}
              <div className="flex flex-col gap-6">
                {feature}
                {panel.latest && panel.latest.length > 0 && (
                  <div>
                    <h3
                      className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-meta"
                      {...panel.marks?.latestTitle}
                    >
                      {panel.latestTitle}
                    </h3>
                    <ul className="flex flex-col">
                      {panel.latest.map((n) => (
                        <li key={n.url} {...n.marks?.item}>
                          <a
                            href={n.url}
                            className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-t border-line-soft py-2 text-[13.5px] text-fg hover:text-accent"
                          >
                            <span className="font-medium leading-snug" {...n.marks?.title}>
                              {n.title}
                            </span>
                            <span className="whitespace-nowrap text-[12px] text-fg-meta">{n.date}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <form action={panel.searchUrl} method="get" role="search" className="flex gap-2">
                  <input
                    type="search"
                    name="q"
                    aria-label={panel.searchLabel}
                    placeholder={panel.searchLabel}
                    className="h-10 min-w-0 flex-1 rounded-[var(--ds-input-radius,10px)] border border-line bg-bg px-3 text-[14px] text-fg"
                  />
                  <button type="submit" className="btn btn-primary btn-xs" {...panel.marks?.searchLabel}>
                    {panel.searchLabel}
                  </button>
                </form>
              </div>
            </div>
          )}
          {panel.kind === 'company' && (
            <div className="grid grid-cols-[220px_1fr] gap-12">
              {panel.columns.map(col)}
              <div>
                <p
                  className="mb-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-meta"
                  {...panel.marks?.teamTitle}
                >
                  {panel.teamTitle}
                </p>
                <ul className="grid grid-cols-4 gap-4">
                  {(panel.team ?? []).map((t) => (
                    <li key={t.url} {...t.marks?.item}>
                      <a href={t.url} className="group flex flex-col gap-2 text-fg hover:text-fg">
                        <span
                          className="photo-frame block aspect-square rounded-[var(--ds-card-radius,10px)]"
                          {...t.marks?.image}
                        >
                          {t.src && <img src={t.src} alt={t.name} width={200} height={200} loading="lazy" />}
                        </span>
                        <span
                          className="text-[15px] font-semibold group-hover:text-accent"
                          {...t.marks?.name}
                        >
                          {t.name}
                        </span>
                        <span className="-mt-2 text-[13px] text-fg-muted" {...t.marks?.role}>
                          {t.role}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <a
                  href={panel.teamAllUrl}
                  className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent"
                  {...panel.marks?.teamAllLabel}
                >
                  {panel.teamAllLabel} <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
