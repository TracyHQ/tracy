/**
 * The section rail of the Business facts sub-page (#537, layout B): a line saying how many sections are left to check,
 * then every band in page order with its state mark (a tick, Check this, or Off the site) and its item count, the band
 * most in view highlighted. Pressing a row scrolls its band to just under the sticky header. Every band reports
 * itself through `RailReport` (`business-facts-band.tsx`); the rows are `railView`. On a page under 1100px the rail is
 * a row of chips above the bands (`facts-rail-css.ts`).
 */
import { createContext, type JSX, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Check, TriangleAlert } from 'lucide-react'

import { useFactsLocked } from './facts-lock.tsx'
import { type BandSummary, currentBand, railView, sameSummary } from './facts-rail-model.ts'
import type { Translate } from './strings.ts'

/** How a band tells the rail what it holds; null outside a page with a rail. */
export const RailReport = createContext<((s: BandSummary) => void) | null>(null)

/** A band reports its name, count, check flag and switch to the rail whenever one of them changes. */
export function useBandReport(s: BandSummary): void {
  const report = useContext(RailReport)
  const { id, name, count, check, on } = s
  useEffect(() => {
    report?.({ id, name, count, check, on })
  }, [report, id, name, count, check, on])
}

/** The rail's store: the latest report of every band, and the reporter the bands call. */
export function useRailStore(): [BandSummary[], (s: BandSummary) => void] {
  const [bands, setBands] = useState<Record<string, BandSummary>>({})
  const report = useCallback(
    (s: BandSummary) => setBands((all) => (sameSummary(all[s.id], s) ? all : { ...all, [s.id]: s })),
    []
  )
  return [Object.values(bands), report]
}

/** The nearest ancestor that scrolls, or null. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  // A page without layout (a test's document) has nothing that scrolls.
  if (typeof getComputedStyle !== 'function') return null
  for (let s = el?.parentElement ?? null; s !== null; s = s.parentElement)
    if (/(auto|scroll)/.test(getComputedStyle(s).overflowY)) return s
  return null
}

/** The height the sticky rows above the bands take: the tab row and the sub-page header. */
function stickyHeight(page: HTMLElement): number {
  const sub = page.querySelector<HTMLElement>(':scope > .tracy-wo-subhead')
  const top = Number.parseFloat(getComputedStyle(page).getPropertyValue('--wo-stick-top')) || 0
  return top + (sub?.offsetHeight ?? 0)
}

const MARKS = {
  ok: <Check aria-hidden="true" />,
  check: <TriangleAlert aria-hidden="true" />,
  off: null
} as const

export function FactsRail({
  t,
  locale,
  bands,
  order
}: {
  t: Translate
  locale: string
  bands: readonly BandSummary[]
  /** The bands' ids in page order. */
  order: readonly string[]
}): JSX.Element {
  const locked = useFactsLocked()
  const nav = useRef<HTMLElement | null>(null)
  const [current, setCurrent] = useState<string | null>(null)
  // A pressed row stays current while its smooth scroll runs, even where the scroll cannot bring its band to the top.
  const pressed = useRef<{ id: string; until: number } | null>(null)
  const view = railView(bands, order)

  // Keeps the sticky offsets in CSS variables on the sub-page, and follows the band most in view.
  useEffect(() => {
    const el = nav.current
    const page = el?.closest<HTMLElement>('.tracy-wo-subpage') ?? null
    const scroller = scrollerOf(el)
    if (el === null || page === null || scroller === null || typeof ResizeObserver === 'undefined') return
    const tabs = scroller.querySelector<HTMLElement>(':scope > .tracy-wo-sub')
    const measure = (): void => {
      page.style.setProperty('--wo-stick-top', `${tabs?.offsetHeight ?? 0}px`)
      const head = page.querySelector<HTMLElement>(':scope > .tracy-wo-subhead')
      page.style.setProperty('--wo-head-h', `${head?.offsetHeight ?? 0}px`)
    }
    let frame = 0
    const follow = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = scroller.getBoundingClientRect()
        const boxes = [...page.querySelectorAll<HTMLElement>('.tracy-wo-facts-band[data-card]')].map((b) => {
          const r = b.getBoundingClientRect()
          return { id: b.dataset.card as string, top: r.top, bottom: r.bottom }
        })
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
        if (pressed.current !== null && performance.now() < pressed.current.until) return
        pressed.current = null
        setCurrent(currentBand(boxes, box.top + stickyHeight(page), box.bottom, atEnd))
      })
    }
    const resize = new ResizeObserver(() => {
      measure()
      follow()
    })
    resize.observe(page)
    measure()
    follow()
    scroller.addEventListener('scroll', follow, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      scroller.removeEventListener('scroll', follow)
    }
  }, [])

  const go = (id: string): void => {
    const page = nav.current?.closest<HTMLElement>('.tracy-wo-subpage') ?? null
    const scroller = scrollerOf(nav.current)
    const band = page?.querySelector<HTMLElement>(`.tracy-wo-facts-band[data-card='${id}']`) ?? null
    if (page === null || scroller === null || band === null) return
    const top =
      scroller.scrollTop +
      band.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      stickyHeight(page) -
      12
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    scroller.scrollTo({ top: Math.max(0, top), behavior: still ? 'auto' : 'smooth' })
    band.focus({ preventScroll: true })
    pressed.current = { id, until: performance.now() + 1200 }
    setCurrent(id)
  }

  // Approved facts are final: nothing is left to check on them.
  const head =
    view.toCheck === 0 || locked
      ? t('facts.rail.none')
      : t(
          new Intl.PluralRules(locale).select(view.toCheck) === 'one'
            ? 'facts.rail.toCheck.one'
            : 'facts.rail.toCheck.other',
          { count: view.toCheck }
        )
  return (
    <nav ref={nav} className="tracy-wo-facts-rail" aria-label={t('facts.rail.label')}>
      <p className="tracy-wo-facts-rail-h" data-check={view.toCheck > 0 && !locked ? '' : undefined}>
        {head}
      </p>
      <ol>
        {view.items.map((item) => {
          const word =
            item.state === 'check' ? t('name.chip.check') : item.state === 'off' ? t('facts.off') : null
          return (
            <li key={item.id}>
              <button
                type="button"
                className="tracy-wo-facts-ri"
                data-state={item.state}
                aria-current={current === item.id ? 'location' : undefined}
                title={word === null ? item.name : `${item.name}: ${word}`}
                onClick={() => go(item.id)}
              >
                <span className="tracy-wo-facts-mk" data-state={item.state}>
                  {MARKS[item.state]}
                </span>
                <span className="tracy-wo-facts-ri-n">{item.name}</span>
                {item.count === null ? null : <span className="tracy-wo-facts-ri-c">{item.count}</span>}
                {word === null ? null : <span className="tracy-wo-facts-ri-s">{word}</span>}
              </button>
            </li>
          )
        })}
      </ol>
      {locked ? null : <p className="tracy-wo-facts-rail-f">{t('facts.rail.foot')}</p>}
    </nav>
  )
}
