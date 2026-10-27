import { useRef, useState } from 'react'
import type { IslandMarks } from '@/lib/stamps'

export interface TabItem {
  label?: string
  title?: string
  body?: string
  /** Resolved image URL (the view runs mediaUrl); null renders the text-only panel. */
  image?: string | null
  imageAlt?: string
  /** Provenance stamps (`src/lib/stamps.ts`): the repeater row, and the subfields it prints. */
  marks?: IslandMarks<'row' | 'label' | 'title' | 'body' | 'image'>
}
export interface TabsProps {
  eyebrow?: string
  heading?: string
  tabs: TabItem[]
  /** Stable id base for the tab/panel ids; the same on the server and the client. */
  idBase?: string
  /**
   * Provenance stamps of the head's fields. Present only on a stamped request; the island spreads
   * them itself because hydration draws its DOM again.
   */
  marks?: IslandMarks<'eyebrow' | 'heading'>
}

/**
 * The ACM `tabs` block: an underlined tablist (`role="tablist"`, arrow/Home/End keys, roving
 * tabindex) over one panel at a time. A panel with an image splits into two columns.
 */
export default function Tabs(p: TabsProps) {
  // Not useId(): React's generated ids differ between the Astro SSR pass and the client render of
  // an island, and the mismatch (aria-controls / id) surfaces as a hydration warning on /product.
  const id = p.idBase ?? 'tabs'
  const [active, setActive] = useState(0)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const tabs = p.tabs.filter((t) => t.label)
  const move = (i: number) => {
    const next = (i + tabs.length) % tabs.length
    setActive(next)
    refs.current[next]?.focus()
  }
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(i - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(tabs.length - 1)
    else return
    e.preventDefault()
  }
  const headingId = `${id}-heading`
  return (
    <div data-block="tabs">
      {(p.eyebrow || p.heading) && (
        <div className="mb-8 max-w-[52ch]">
          {p.eyebrow && (
            <p className="eyebrow eyebrow--acm text-fg-meta" {...p.marks?.eyebrow}>
              {p.eyebrow}
            </p>
          )}
          {p.heading && (
            <h2 className="h-section" id={headingId} {...p.marks?.heading}>
              {p.heading}
            </h2>
          )}
        </div>
      )}
      <div
        role="tablist"
        aria-labelledby={p.heading ? headingId : undefined}
        className="mb-8 flex gap-6 overflow-x-auto border-b border-line-soft [scrollbar-width:none] lg:gap-8"
      >
        {tabs.map((t, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-controls={`${id}-panel-${i}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => onKey(e, i)}
            {...t.marks?.label}
            className="-mb-px shrink-0 border-b-2 border-transparent pb-4 text-[15px] font-medium leading-[1.05] text-fg-muted transition hover:text-fg aria-selected:border-fg aria-selected:text-fg focus-visible:rounded-[var(--ds-btn-radius,8px)] focus-visible:shadow-focus focus-visible:outline-none sm:text-[17px]"
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          tabIndex={0}
          hidden={i !== active}
          className="focus-visible:rounded-[var(--ds-card-radius,12px)] focus-visible:shadow-focus focus-visible:outline-none"
          {...t.marks?.row}
        >
          <div className={t.image ? 'grid items-center gap-6 lg:grid-cols-2 lg:gap-12' : ''}>
            <div className="max-w-[60ch]">
              {t.title && (
                <h3 className="h-card mb-4" {...t.marks?.title}>
                  {t.title}
                </h3>
              )}
              {t.body && (
                <p className="text-[17px] leading-[1.47] text-fg-2" {...t.marks?.body}>
                  {t.body}
                </p>
              )}
            </div>
            {t.image && (
              <div
                className="overflow-hidden rounded-[var(--ds-card-radius,18px)] bg-surface"
                {...t.marks?.image}
              >
                <img
                  src={t.image}
                  alt={t.imageAlt ?? ''}
                  className="block h-auto w-full"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
