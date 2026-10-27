import { useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { IslandMarks } from '@/lib/stamps'

export interface MegaLink {
  label: string
  url: string
  text?: string
}
export interface MegaProject {
  title: string
  meta: string
  url: string
  src: string | null
  /** Provenance stamps (`src/lib/stamps.ts`): the entry, its title and its card tag. */
  marks?: IslandMarks<'item' | 'title' | 'meta'>
}
export interface MegaNews {
  title: string
  date: string
  url: string
  /** Provenance stamps: the post, and the field its title was read from. */
  marks?: IslandMarks<'item' | 'title'>
}
export interface ResourcesMenuProps {
  label: string
  active: boolean
  kitTitle: string
  projectsTitle: string
  newsTitle: string
  allLabel: string
  allUrl: string
  kit: MegaLink[]
  projects: MegaProject[]
  news: MegaNews[]
  /**
   * Provenance stamps of the site chrome fields this panel prints (`src/lib/stamps.ts`). Present
   * only on a stamped request; the panel spreads them itself because hydration redraws its DOM.
   */
  marks?: IslandMarks<'label' | 'kitTitle' | 'projectsTitle' | 'newsTitle' | 'allLabel'>
}

/**
 * The header's "Resources" mega panel: three columns (marketing kit, recent projects, news)
 * dropped under the header on click. shadcn Popover (Radix) supplies Escape, outside-click and
 * focus return; the panel is not modal so the rest of the page stays usable.
 */
export default function ResourcesMenu(p: ResourcesMenuProps) {
  const [open, setOpen] = useState(false)
  const [panelTop, setPanelTop] = useState(0)
  const [panelLeft, setPanelLeft] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const setMenuOpen = (next: boolean) => {
    if (next) {
      const header = triggerRef.current?.closest('header')
      if (header) {
        const trigger = triggerRef.current?.getBoundingClientRect()
        const headerBottom = header.getBoundingClientRect().bottom
        // Radix's transformed wrapper is anchored at the trigger bottom.
        setPanelTop(headerBottom - (trigger?.bottom ?? headerBottom))
        setPanelLeft(-(trigger?.left ?? 0))
      }
    }
    setOpen(next)
  }
  return (
    <Popover open={open} onOpenChange={setMenuOpen} modal={false}>
      <PopoverTrigger
        ref={triggerRef}
        className={`nav-link inline-flex items-center gap-1.5 bg-transparent ${p.active ? 'is-active' : ''}`}
        aria-expanded={open}
        {...p.marks?.label}
      >
        {p.label}
        <span className="text-[10px] text-fg-meta" aria-hidden="true">
          ▼
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={0}
        avoidCollisions={false}
        collisionPadding={0}
        /* ds-keep: full-bleed panel */
        className="w-screen max-w-none rounded-none border-x-0 border-t border-b border-line-strong border-t-line bg-paper p-0 text-fg shadow-mega"
        style={{ position: 'fixed', left: panelLeft, top: panelTop, width: '100vw', transform: 'none' }}
      >
        <div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-10 px-8 pb-8 pt-9">
          {/* No kit link left (a personalised site hides the template's kit pages): no heading over nothing, as in MobileMenu. */}
          {p.kit.length > 0 && (
            <div>
              <div className="eyebrow-sm mb-4 border-b border-line pb-2.5" {...p.marks?.kitTitle}>
                {p.kitTitle}
              </div>
              <div className="flex flex-col">
                {p.kit.map((k) => (
                  <a
                    key={k.url}
                    href={k.url}
                    className="block border-b border-l-2 border-line-soft border-l-transparent p-2.5 hover:border-l-signal hover:bg-signal-tint"
                  >
                    <span className="block text-[15.5px] font-semibold text-fg">{k.label}</span>
                    {k.text && <span className="mt-0.5 block text-[13px] text-fg-meta">{k.text}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}
          {/* Projects or News unticked: the header passes no items for it (TCH #1013), and the column goes. */}
          {p.projects.length > 0 && (
            <div>
              <div className="eyebrow-sm mb-4 border-b border-line pb-2.5" {...p.marks?.projectsTitle}>
                {p.projectsTitle}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {p.projects.map((pr) => (
                  <a
                    key={pr.url}
                    href={pr.url}
                    className="group relative block h-[104px] overflow-hidden border border-line bg-paper-2"
                    {...pr.marks?.item}
                  >
                    {pr.src && (
                      <img
                        src={pr.src}
                        alt=""
                        className="ng-photo absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <span className="absolute inset-0 flex flex-col justify-end gap-0.5 bg-[linear-gradient(180deg,rgba(20,23,26,0)_30%,rgba(20,23,26,.86)_100%)] p-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <span
                        className="text-[13px] font-semibold leading-tight text-[color:var(--ds-c-on-ink,var(--color-white))]"
                        {...pr.marks?.title}
                      >
                        {pr.title}
                      </span>
                      <span
                        className="text-[11.5px] text-[color:var(--tb-ds-on-ink-muted,var(--ds-c-on-ink,#C9C6BE))]"
                        {...pr.marks?.meta}
                      >
                        {pr.meta}
                      </span>
                    </span>
                    <span className="sr-only" {...pr.marks?.title}>
                      {pr.title}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
          {p.news.length > 0 && (
            <div>
              <div className="eyebrow-sm mb-4 border-b border-line pb-2.5" {...p.marks?.newsTitle}>
                {p.newsTitle}
              </div>
              <div className="flex flex-col">
                {p.news.map((n) => (
                  <a
                    key={n.url}
                    href={n.url}
                    className="grid grid-cols-[1fr_auto] items-baseline gap-3.5 border-b border-line-soft py-2.5 text-fg hover:text-forest-text"
                    {...n.marks?.item}
                  >
                    <span className="text-[14.5px] font-medium leading-snug" {...n.marks?.title}>
                      {n.title}
                    </span>
                    <span className="whitespace-nowrap text-[12.5px] text-fg-faint">{n.date}</span>
                  </a>
                ))}
                {p.allUrl && (
                  <a href={p.allUrl} className="link-underline mt-3.5 self-start" {...p.marks?.allLabel}>
                    {p.allLabel}
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
