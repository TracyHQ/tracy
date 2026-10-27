import { useCallback, useEffect, useRef, useState } from 'react'
import type { IslandMarks } from '@/lib/stamps'

export interface CarouselSlide {
  kicker?: string
  title?: string
  text?: string
  /** Resolved image URL (the view runs mediaUrl); null shows no media box. */
  image?: string | null
  imageAlt?: string
  link_label?: string
  link_url?: string
  /** Provenance stamps (`src/lib/stamps.ts`): the repeater row, and the subfields it prints. */
  marks?: IslandMarks<'row' | 'kicker' | 'title' | 'text' | 'image' | 'link_label'>
}
export interface CarouselProps {
  eyebrow?: string
  heading?: string
  intro?: string
  slides: CarouselSlide[]
  prevLabel: string
  nextLabel: string
  /**
   * Provenance stamps of the head's fields. Present only on a stamped request; the island spreads
   * them itself because hydration draws its DOM again.
   */
  marks?: IslandMarks<'eyebrow' | 'heading' | 'intro'>
}

/**
 * The ACM `carousel` block: a scroll-snap track (three slides per view on desktop, two on a
 * tablet, one on a phone) stepped by two round buttons. The buttons only appear once the track
 * actually overflows, and each one disables at its end — the source's script, as an island.
 */
export default function Carousel(p: CarouselProps) {
  const track = useRef<HTMLUListElement>(null)
  const [nav, setNav] = useState({ show: false, atStart: true, atEnd: false })
  const sync = useCallback(() => {
    const el = track.current
    if (!el) return
    const overflows = el.scrollWidth - el.clientWidth > 4
    setNav({
      show: overflows,
      atStart: el.scrollLeft <= 2,
      atEnd: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
    })
  }, [])
  useEffect(() => {
    sync()
    const el = track.current
    el?.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => {
      el?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [sync])
  const step = (dir: 1 | -1) => {
    const el = track.current
    if (!el) return
    const slide = el.querySelector<HTMLElement>('li')
    const by = slide ? slide.getBoundingClientRect().width + 24 : el.clientWidth * 0.8
    el.scrollBy({ left: by * dir, behavior: 'smooth' })
  }
  const btn =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-fg transition hover:enabled:border-fg hover:enabled:bg-surface disabled:cursor-default disabled:border-line-soft disabled:text-fg-meta'
  const hasHead = p.eyebrow || p.heading || p.intro
  return (
    <div data-block="carousel">
      {hasHead && (
        <div className="mb-8 flex flex-col items-start gap-6 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div className="max-w-[52ch]">
            {p.eyebrow && (
              <p className="eyebrow eyebrow--acm text-fg-meta" {...p.marks?.eyebrow}>
                {p.eyebrow}
              </p>
            )}
            {p.heading && (
              <h2 className="h-section" {...p.marks?.heading}>
                {p.heading}
              </h2>
            )}
            {p.intro && (
              <p className="lead mt-4" {...p.marks?.intro}>
                {p.intro}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2" hidden={!nav.show}>
            <button
              type="button"
              className={btn}
              onClick={() => step(-1)}
              disabled={nav.atStart}
              aria-label={p.prevLabel}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  d="M10 3 5 8l5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => step(1)}
              disabled={nav.atEnd}
              aria-label={p.nextLabel}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path
                  d="M6 3l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
      {/* A scroll container is only keyboard-scrollable once it can hold focus. */}
      <ul
        ref={track}
        tabIndex={0}
        role="group"
        aria-label={p.heading || undefined}
        className="flex snap-x snap-mandatory items-start gap-6 overflow-x-auto scroll-smooth pb-4 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] focus-visible:rounded-[var(--ds-card-radius,12px)] focus-visible:shadow-focus focus-visible:outline-none"
      >
        {p.slides.map((s, i) => (
          <li
            key={i}
            className="flex w-full shrink-0 snap-start flex-col gap-4 sm:w-[calc((100%-24px)/2)] lg:w-[calc((100%-48px)/3)]"
            {...s.marks?.row}
          >
            {s.image && (
              <div
                className="aspect-[4/3] overflow-hidden rounded-[var(--ds-card-radius,18px)] bg-surface"
                {...s.marks?.image}
              >
                <img
                  src={s.image}
                  alt={s.imageAlt ?? ''}
                  className="block h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              {s.kicker && (
                <p
                  className="text-[12px] font-medium uppercase tracking-[0.04em] text-fg-meta"
                  {...s.marks?.kicker}
                >
                  {s.kicker}
                </p>
              )}
              {s.title && (
                <h3
                  className="text-[21px] font-semibold leading-[1.05] tracking-[-0.015em]"
                  {...s.marks?.title}
                >
                  {s.title}
                </h3>
              )}
              {s.text && (
                <p className="text-[17px] leading-[1.47] text-fg-2" {...s.marks?.text}>
                  {s.text}
                </p>
              )}
              {s.link_label && s.link_url && (
                <a
                  href={s.link_url}
                  className="mt-1 self-start text-[14px] font-medium text-accent hover:text-accent-hover"
                  {...s.marks?.link_label}
                >
                  {s.link_label}
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
