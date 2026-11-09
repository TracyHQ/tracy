/**
 * Layout B of Details (spec #512): every section stacked on one page, and a slim sticky "On this page" rail that lists
 * them with one status line each (`rail-model.ts`) and scrolls to a section on a press. In a narrow panel the rail is a
 * row of chips above the sections that scrolls sideways. The rail follows the section in view as the page scrolls.
 */
import { type JSX, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'

import { type RailEntry, type SectionId, activeSection } from './rail-model.ts'
import type { Translate } from './strings.ts'

/** The page's scroller: the tab's own scrolling box, else the document. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>('.tracy-wo-tab') ?? null
}

/**
 * Where a section counts as being read: just under the sticky header once it is stuck to the top of the scroller, and
 * under the chip row when the rail is one. Measured from the stuck position, so it holds before the page has scrolled.
 */
function readingLine(root: HTMLElement): number {
  const scroller = scrollerOf(root)
  const head = root.querySelector<HTMLElement>('.tracy-wo-details-head')
  const rail = root.querySelector<HTMLElement>('.tracy-wo-rail')
  let line = (scroller ? scroller.getBoundingClientRect().top : 0) + (head?.offsetHeight ?? 0)
  if (rail && rail.getBoundingClientRect().width > root.getBoundingClientRect().width / 2)
    line += rail.offsetHeight
  return line + 12
}

/**
 * The section in view and a way to go to one. Also writes the sticky header's height on the page as
 * `--tracy-wo-head-h`, so the rail sticks just under it.
 */
export function useSections(
  root: RefObject<HTMLElement | null>,
  ready: boolean
): { active: SectionId; go: (id: SectionId) => void } {
  const [active, setActive] = useState<SectionId>('profile')
  // A pressed section stays lit while the page scrolls to it, even when the page ends before it reaches the top; the
  // person's own wheel, touch or key lets the scroll position decide again.
  const pressed = useRef(false)
  useEffect(() => {
    const el = root.current
    if (!ready || el === null || typeof window === 'undefined') return
    const scroller = scrollerOf(el)
    const head = el.querySelector<HTMLElement>('.tracy-wo-details-head')
    const measure = (): void => {
      if (head) el.style.setProperty('--tracy-wo-head-h', `${head.offsetHeight}px`)
    }
    const read = (): void => {
      if (pressed.current) return
      const line = readingLine(el)
      const tops = [...el.querySelectorAll<HTMLElement>('[data-section]')].map((s) => ({
        id: s.dataset.section as SectionId,
        top: s.getBoundingClientRect().top - line
      }))
      const box = scroller ?? document.documentElement
      setActive(
        activeSection(tops, box.scrollTop > 0 && box.scrollTop + box.clientHeight >= box.scrollHeight - 2)
      )
    }
    measure()
    read()
    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', read, { passive: true })
    const release = (): void => {
      pressed.current = false
    }
    const inputs = ['wheel', 'touchstart', 'keydown'] as const
    for (const name of inputs) target.addEventListener(name, release, { passive: true })
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => (measure(), read()))
    if (head && resize) resize.observe(head)
    return () => {
      target.removeEventListener('scroll', read)
      for (const name of inputs) target.removeEventListener(name, release)
      resize?.disconnect()
    }
  }, [root, ready])
  const go = useCallback(
    (id: SectionId) => {
      const el = root.current
      const section = el?.querySelector<HTMLElement>(`[data-section="${id}"]`)
      if (!el || !section) return
      const scroller = scrollerOf(el)
      const delta = section.getBoundingClientRect().top - readingLine(el) + 4
      if (scroller) scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'smooth' })
      else window.scrollBy({ top: delta, behavior: 'smooth' })
      pressed.current = true
      setActive(id)
    },
    [root]
  )
  return { active, go }
}

export function DetailsRail({
  t,
  entries,
  active,
  onGo
}: {
  t: Translate
  entries: RailEntry[]
  active: SectionId
  onGo: (id: SectionId) => void
}): JSX.Element {
  const [list, setList] = useState<HTMLElement | null>(null)
  // As a chip row, keep the chip of the section in view in sight.
  useEffect(() => {
    if (list === null) return
    const chip = list.querySelector<HTMLElement>(`[data-rail="${active}"]`)
    if (chip === null || list.scrollWidth <= list.clientWidth) return
    list.scrollTo({ left: Math.max(0, chip.offsetLeft - 16), behavior: 'smooth' })
  }, [active, list])
  return (
    <nav className="tracy-wo-rail" aria-label={t('details.sections')} ref={setList}>
      <p className="tracy-wo-rail-head">{t('rail.title')}</p>
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-rail={entry.id}
          className="tracy-wo-rail-item"
          data-on={entry.id === active ? '' : undefined}
          data-locked={entry.locked ? '' : undefined}
          aria-current={entry.id === active ? 'location' : undefined}
          onClick={() => onGo(entry.id)}
        >
          <span className="tracy-wo-rail-name">{t(entry.titleKey)}</span>
          <span className="tracy-wo-rail-status" data-tone={entry.tone}>
            {entry.status.map((s) => t(s.key, s.params)).join(', ')}
          </span>
        </button>
      ))}
    </nav>
  )
}

/** The Show all / Show less bar at the foot of a heavy section. */
export interface SectionToggle {
  open: boolean
  /** What the closed bar reads (Show all 12 fields). */
  label: string
  onToggle: () => void
}

/** One section of the page: its title with the rail's status beside it, then its content, or a lock line. */
export function PageSection({
  t,
  id,
  entry,
  aside,
  lockKey,
  toggle,
  children
}: {
  t: Translate
  id: SectionId
  entry: RailEntry | undefined
  aside?: ReactNode
  /** What the lock line says while the section waits for an earlier step. */
  lockKey?: string
  toggle?: SectionToggle | null
  children?: ReactNode
}): JSX.Element {
  const title = t(`details.section.${id}`)
  const locked = entry?.locked === true && lockKey !== undefined
  return (
    <section
      className="tracy-wo-psec"
      data-section={id}
      data-locked={locked ? '' : undefined}
      data-open={toggle?.open ? '' : undefined}
      aria-label={title}
    >
      <div className="tracy-wo-psec-head">
        <h3 className="tracy-wo-psec-title">
          {title}
          {entry ? (
            <span className="tracy-wo-psec-meta">
              {entry.status.map((s) => t(s.key, s.params)).join(', ')}
            </span>
          ) : null}
        </h3>
        {locked ? null : aside}
      </div>
      {locked ? (
        <p className="tracy-wo-psec-lock">
          <Lock aria-hidden="true" className="tracy-wo-icon" />
          {t(lockKey)}
        </p>
      ) : (
        children
      )}
      {!locked && toggle ? (
        <button
          type="button"
          className="tracy-wo-psec-toggle"
          aria-expanded={toggle.open}
          onClick={toggle.onToggle}
        >
          {toggle.open ? t('section.showLess') : toggle.label}
        </button>
      ) : null}
    </section>
  )
}
