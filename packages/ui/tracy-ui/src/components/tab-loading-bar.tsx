/**
 * The one loading state every Tracy tab in the right panel shares (Akemi, 30/09, option D): a
 * 2px indeterminate bar in brand terracotta across the top of the tab body, right under dsh's tab
 * strip, while the tab reads its first data. No sentence ("Reading your seats…", "Reading…"): the
 * body stays empty until the data arrives.
 *
 * Anti-flash rule, the same numbers as the options page Akemi chose from:
 * - the bar appears only once loading has lasted `TAB_LOADING_DELAY_MS` (a fast answer never shows it);
 * - once shown it stays at least `TAB_LOADING_MIN_SHOWN_MS`, so it never blinks;
 * - then it fades out over `TAB_LOADING_FADE_MS`.
 *
 * 🔒 NO TAILWIND CLASS HERE, ON PURPOSE. Each plugin runs Tailwind over its own list of `@source`
 * folders, and not every plugin that shows a tab scans this package; a keyframe is not a utility
 * either. So the bar carries its own few rules, injected once into the page under one id, and the
 * colour is the Tracy token `--primary` (terracotta since 14/09) with the brand literal as fallback.
 *
 * 🔒 POSITIONED BY THE TAB BODY, NOT BY THE PLUGIN. The bar is `position: absolute; top: 0` and
 * adds no wrapper: dsh's tab body (`.tabHostBody` in ui-dockkit) is `position: relative`, so the
 * bar sits under the strip whatever root the plugin renders — and it must not become the first
 * child of a root whose first child is a sticky header (site tabs), so it renders last.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode
} from 'react'

export const TAB_LOADING_DELAY_MS = 250
export const TAB_LOADING_MIN_SHOWN_MS = 400
export const TAB_LOADING_FADE_MS = 150

/** Where the bar is in its life: not drawn, drawn, or fading out. */
export type TabLoadingPhase = 'hidden' | 'shown' | 'leaving'

export interface DelayedLoadingTimings {
  delayMs?: number
  minShownMs?: number
  fadeMs?: number
}

/**
 * The anti-flash rule as a phase: `loading` is the raw fact, the phase is what to draw.
 * Loading again while the bar fades brings it straight back (it was on screen long enough).
 */
export function useDelayedLoading(
  loading: boolean,
  {
    delayMs = TAB_LOADING_DELAY_MS,
    minShownMs = TAB_LOADING_MIN_SHOWN_MS,
    fadeMs = TAB_LOADING_FADE_MS
  }: DelayedLoadingTimings = {}
): TabLoadingPhase {
  const [phase, setPhase] = useState<TabLoadingPhase>('hidden')
  const shownAt = useRef(0)
  useEffect(() => {
    let wait: number | null = null
    let next: TabLoadingPhase | null = null
    if (loading && phase === 'hidden') {
      wait = delayMs
      next = 'shown'
    } else if (loading && phase === 'leaving') {
      wait = 0
      next = 'shown'
    } else if (!loading && phase === 'shown') {
      wait = Math.max(0, minShownMs - (performance.now() - shownAt.current))
      next = 'leaving'
    } else if (!loading && phase === 'leaving') {
      wait = fadeMs
      next = 'hidden'
    }
    if (wait === null || next === null) return
    const to = next
    const timer = window.setTimeout(() => {
      if (to === 'shown' && phase === 'hidden') shownAt.current = performance.now()
      setPhase(to)
    }, wait)
    return () => window.clearTimeout(timer)
  }, [loading, phase, delayMs, minShownMs, fadeMs])
  return phase
}

const STYLE_ID = 'tracy-tab-loading-bar'
const STYLE = `
.tv-tab-loading-bar{position:absolute;top:0;left:0;right:0;height:2px;overflow:hidden;z-index:20;pointer-events:none;opacity:1;transition:opacity ${TAB_LOADING_FADE_MS}ms ease-out;animation:tv-tab-loading-in ${TAB_LOADING_FADE_MS}ms ease-out}
.tv-tab-loading-bar[data-phase="leaving"]{opacity:0}
.tv-tab-loading-bar::before{content:"";position:absolute;top:0;height:100%;background:var(--primary,#bf5b3d);border-radius:2px;animation:tv-tab-loading-slide 1.1s ease-in-out infinite}
@keyframes tv-tab-loading-in{from{opacity:0}to{opacity:1}}
@keyframes tv-tab-loading-slide{0%{left:-40%;width:40%}60%{left:100%;width:60%}100%{left:100%;width:60%}}
@keyframes tv-tab-loading-pulse{0%,100%{opacity:.35}50%{opacity:.75}}
@media (prefers-reduced-motion: reduce){.tv-tab-loading-bar::before{left:0;width:100%;animation:tv-tab-loading-pulse 2s ease-in-out infinite}}
`

/** Put the bar's rules in the page once, whichever plugin draws a bar first. */
function ensureStyle(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = STYLE
  document.head.appendChild(el)
}

/**
 * The bar itself. Render it at a stable place in the tab (not inside a branch that unmounts when
 * the data arrives), so it can keep its minimum time and fade.
 * @param loading - whether the tab is reading its data right now.
 * @param label - the accessible name, in the plugin's own words ("Loading").
 */
export function TabLoadingBar({
  loading,
  label,
  timings
}: {
  loading: boolean
  label: string
  timings?: DelayedLoadingTimings
}): JSX.Element | null {
  const phase = useDelayedLoading(loading, timings)
  useInsertionEffect(ensureStyle, [])
  if (phase === 'hidden') return null
  return (
    <div
      className="tv-tab-loading-bar"
      data-tab-loading-bar=""
      data-phase={phase}
      role={phase === 'shown' ? 'progressbar' : undefined}
      aria-label={phase === 'shown' ? label : undefined}
      aria-hidden={phase === 'leaving' ? true : undefined}
    />
  )
}

/** How a view deep in a tab tells the tab it is loading: +1 when it starts, -1 when it stops. */
const ReportContext = createContext<((delta: number) => void) | null>(null)

/**
 * One bar for a tab whose loading state lives in its children (the site tabs' views, History's two
 * sections): each child reports through `useTabLoading`, and the bar runs while any of them loads.
 * Adds no element around the children; the bar renders after them.
 */
export function TabLoadingScope({
  label,
  timings,
  children
}: {
  label: string
  timings?: DelayedLoadingTimings
  children: ReactNode
}): JSX.Element {
  const [count, setCount] = useState(0)
  const report = useCallback((delta: number) => setCount((n) => Math.max(0, n + delta)), [])
  return (
    <ReportContext.Provider value={report}>
      {children}
      <TabLoadingBar loading={count > 0} label={label} timings={timings} />
    </ReportContext.Provider>
  )
}

/**
 * Tell the enclosing `TabLoadingScope` this view is loading. Outside a scope (a design-bench story)
 * it does nothing, and the view simply stays empty while it loads.
 */
export function useTabLoading(loading: boolean): void {
  const report = useContext(ReportContext)
  useEffect(() => {
    if (!loading || report === null) return
    report(1)
    return () => report(-1)
  }, [loading, report])
}
