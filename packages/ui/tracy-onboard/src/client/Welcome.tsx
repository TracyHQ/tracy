/**
 * The first-run "Welcome to Tracy" popup: eight animated scenes with Back/Next, dots and close, and
 * on the last scene "Let's build your first site" once its replay has ended.
 *
 * A port of the approved prototype (bao-cao/onboarding-tracy/welcome-popup.html and
 * welcome-popup-assets/welcome-shell.js, desktop navigation layout "D", 25/10/2026): the same DOM
 * order, the same classes with a `tv-wl-` prefix (welcome.css), the same keyboard. The review bar of
 * the prototype is not here; the theme and reduced motion follow the app and the system instead.
 * The scenes play inside a frame from tracy-web (welcome-flow.ts `sceneAddress`); the frame reports its
 * replay clock with `welcome-playback-progress` messages, which drive the thin progress line and
 * the call to action.
 */
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react'
import { SCENES, sceneAddress } from './welcome-flow.ts'
import type { T } from './text.tsx'
import { newRunId, onboardEnd, onboardStep, type WELCOME_ENDS } from './usage.ts'

/** How the popup was closed: the ×, Escape, or the call to action. */
export type WelcomeExit = (typeof WELCOME_ENDS)[number]

/** The address the frame's fake browser bar shows: the Tracy address the person is on now. */
const demoAddress = (): string => window.location.host

/** dsh switches dark with `[data-ds-dark-theme]` (on <body>; <html> checked too). */
function isDark(): boolean {
  return (
    document.body?.hasAttribute('data-ds-dark-theme') === true ||
    document.documentElement.hasAttribute('data-ds-dark-theme')
  )
}

/** The app's theme as the scenes need it, following dsh as it switches. */
function useAppTheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDark()))
    for (const el of [document.documentElement, document.body])
      if (el) observer.observe(el, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return dark ? 'dark' : 'light'
}

/** The system's reduced motion setting, live. */
function useReducedMotion(): boolean {
  const query =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(query?.matches === true)
  useEffect(() => {
    if (!query) return
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener?.('change', listener)
    return () => query.removeEventListener?.('change', listener)
  }, [query])
  return reduced
}

export function Welcome({
  t,
  onClose,
  base
}: {
  t: T
  onClose: (by: WelcomeExit) => void
  /** Where the scenes are served; tests and the review harness point elsewhere. */
  base?: string
}): JSX.Element {
  const [current, setCurrent] = useState(0)
  const [cta, setCta] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const theme = useAppTheme()
  const reduced = useReducedMotion()
  const dialog = useRef<HTMLElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const closed = useRef(false)
  // The keyboard listener is installed once; it reads the latest handler through this.
  const exit = useRef(onClose)
  exit.current = onClose
  const total = SCENES.length
  const scene = SCENES[current]
  const src = sceneAddress(scene, theme, reduced, base)
  const title = t(`welcome.${current + 1}.title`)

  // Usage: this showing's id, each scene it reached, and how it ended (`usage.ts`).
  // The scene shown, read by `close` through a ref: Escape's listener is installed once.
  const run = useRef('')
  if (run.current === '') run.current = newRunId()
  const shown = useRef(current)
  shown.current = current
  useEffect(() => {
    onboardStep(run.current, 'welcome', String(current + 1))
  }, [current])

  const close = (by: WelcomeExit) => {
    if (closed.current) return
    closed.current = true
    onboardEnd(run.current, 'welcome', String(shown.current + 1), by)
    exit.current(by)
  }
  const show = (index: number) => {
    setCurrent(Math.max(0, Math.min(total - 1, index)))
    dialog.current?.focus({ preventScroll: true })
  }

  // A new scene (or theme, or motion) starts from an empty clock and no call to action.
  useLayoutEffect(() => {
    setCta(false)
    setProgress(null)
  }, [src])

  // The replay owns the clock; the popup only shows its latest time (prototype scene-progress.js).
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const data = event.data as {
        type?: unknown
        source?: unknown
        time?: unknown
        total?: unknown
        motion?: unknown
      } | null
      const win = frame.current?.contentWindow
      if (!win || event.source !== win || data?.type !== 'welcome-playback-progress') return
      if (typeof data.source !== 'string' || data.source !== frame.current?.src) return
      const time = Number(data.time)
      const length = Number(data.total)
      if (!Number.isFinite(time) || !Number.isFinite(length) || length <= 0) return
      const ended = data.motion === 'reduced' || time >= length
      setProgress(data.motion === 'reduced' ? 1 : Math.max(0, Math.min(1, time / length)))
      if (scene.ready && ended) setCta(true)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [scene])

  // Focus the dialog on open and give focus back on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus({ preventScroll: true })
    return () => previous?.focus?.({ preventScroll: true })
  }, [])

  // Escape closes, the arrow keys move, Tab stays inside the popup. Captured so dsh's own shortcuts
  // under the popup do not act at the same time.
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target !== null && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close('escape')
      } else if (!typing && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault()
        event.stopPropagation()
        setCurrent((n) => Math.max(0, Math.min(total - 1, n + (event.key === 'ArrowRight' ? 1 : -1))))
        dialog.current?.focus({ preventScroll: true })
      } else if (event.key === 'Tab') {
        const all = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button') ?? []).filter(
          (el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0
        )
        if (all.length === 0) return
        const first = all[0]
        const last = all[all.length - 1]
        const active = document.activeElement
        if (
          event.shiftKey &&
          (active === first || active === dialog.current || !dialog.current?.contains(active))
        ) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (active === last || !dialog.current?.contains(active))) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', keys, true)
    return () => document.removeEventListener('keydown', keys, true)
  }, [])

  return (
    <div
      className="tv-welcome"
      data-welcome-scene={current + 1}
      data-theme={theme}
      data-reduced={reduced || undefined}
    >
      <div className="tv-wl-scrim" aria-hidden="true" />
      <div className="tv-wl-stage">
        <div className="tv-wl-wrap">
          <section
            ref={dialog}
            className="tv-wl-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tv-wl-title"
            aria-describedby="tv-wl-body"
            tabIndex={-1}
          >
            <button
              type="button"
              className="tv-wl-close"
              aria-label={t('welcome.close')}
              onClick={() => close('close')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
            <div className="tv-wl-demo-stage">
              <div className="tv-wl-browser">
                <div className="tv-wl-bar" aria-hidden="true">
                  <div className="tv-wl-lights">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="tv-wl-address">
                    <svg viewBox="0 0 16 16" focusable="false">
                      <rect x="3.5" y="7" width="9" height="7" rx="1.5" />
                      <path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" />
                    </svg>
                    <span>{demoAddress()}</span>
                  </div>
                </div>
                <div className="tv-wl-demo" role="img" aria-label={t('welcome.demo', { title })}>
                  <iframe
                    key={src}
                    ref={frame}
                    src={src}
                    title={t('welcome.frame')}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                  {progress !== null && (
                    <div className="tv-wl-progress" aria-hidden="true">
                      <span style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className={cta ? 'tv-wl-panel has-cta' : 'tv-wl-panel'}>
              <button
                type="button"
                className="tv-wl-arrow tv-wl-prev"
                aria-label={t('welcome.previous')}
                disabled={current === 0}
                onClick={() => show(current - 1)}
              >
                <svg viewBox="0 0 24 40" aria-hidden="true">
                  <path d="m16 6-10 14 10 14" />
                </svg>
              </button>
              <div className="tv-wl-copy">
                <h2 id="tv-wl-title">{title}</h2>
                <p id="tv-wl-body">{t(`welcome.${current + 1}.body`)}</p>
              </div>
              <button
                type="button"
                className="tv-wl-arrow tv-wl-next"
                aria-label={t('welcome.next')}
                disabled={current === total - 1}
                onClick={() => show(current + 1)}
              >
                <svg viewBox="0 0 24 40" aria-hidden="true">
                  <path d="m8 6 10 14-10 14" />
                </svg>
              </button>
              {cta && (
                <button type="button" className="tv-wl-primary tv-wl-cta" onClick={() => close('cta')}>
                  {t('welcome.cta')}
                </button>
              )}
            </div>
            <nav
              className="tv-wl-pagination"
              aria-label={t('welcome.position', { current: current + 1, total })}
            >
              <div className="tv-wl-dots">
                {SCENES.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={index === current ? 'tv-wl-dot is-current' : 'tv-wl-dot'}
                    aria-label={t('welcome.dot', {
                      current: index + 1,
                      total,
                      title: t(`welcome.${index + 1}.title`)
                    })}
                    aria-current={index === current ? 'step' : undefined}
                    onClick={() => show(index)}
                  />
                ))}
              </div>
            </nav>
          </section>
        </div>
      </div>
    </div>
  )
}
