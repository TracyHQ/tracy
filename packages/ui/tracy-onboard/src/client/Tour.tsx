/** First-run welcome and two tours, anchored to controls on the actual dsh page. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EDIT_WAIT_STEPS, watchTourEdit } from './tour-edit.ts'
import { sendTourPrompt } from './tour-composer.tsx'
import { coachPosition, SITE_STEPS, START_STEPS, visibleTarget, targetBox } from './tour-targets.ts'
import type { T } from './text.tsx'
import { newRunId, type OnboardEnd, onboardEnd, onboardStep } from './usage.ts'

type Stage = 'idle' | 'start' | 'site' | 'done'

function remembered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'seen'
  } catch {
    return false
  }
}
function forget(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* Storage may be disabled. Keep this page usable. */
  }
}

/** Best effort: finishing a tour must never wait for a successful account write. */
async function recordSiteTour(): Promise<boolean> {
  try {
    const response = await fetch('/api/seen-hints', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hint: 'site-tour' })
    })
    return response.ok
  } catch {
    return false
  }
}

export function Tour({
  t,
  first,
  enabled,
  account,
  complete
}: {
  t: T
  first: boolean
  enabled: boolean
  account: string | null
  complete: () => Promise<void>
}) {
  const [stage, setStage] = useState<Stage>('idle')
  const [index, setIndex] = useState(0)
  const [available, setAvailable] = useState<string[]>([])
  const [box, setBox] = useState<DOMRect | null>(null)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const card = useRef<HTMLDivElement>(null)
  const finishing = useRef(false)
  const started = useRef(false)
  const completedActions = useRef(new Set<string>())
  const seenKey = `tracy.tour.site.${account ?? ''}`
  const steps = stage === 'site' ? SITE_STEPS : START_STEPS
  const key = steps[index]
  const yourTurn = stage === 'start' && key === 'createsite'
  const waiting = stage === 'site' && EDIT_WAIT_STEPS.includes(key)
  const active = enabled && (stage === 'start' || stage === 'site')

  useEffect(() => {
    if (first) setStage('start')
  }, [first])
  useEffect(() => {
    if (!enabled || first || stage !== 'idle' || account === null) return
    let live = true
    let timer: number | undefined
    const ready = () => {
      // These are real site controls. Creation/build workspaces cannot start the site tour.
      const mount = new URL(document.baseURI).pathname
      if (mount === '/new/' || mount === '/new' || document.querySelector('meta[name="tracy-widget-native"]'))
        return
      if (!visibleTarget('composer') || !visibleTarget('preview')) return
      setIndex(0)
      setStage('site')
    }
    const read = async () => {
      try {
        const response = await fetch('/api/seen-hints', { credentials: 'same-origin', cache: 'no-store' })
        if (!response.ok) return
        const body = (await response.json()) as { hints?: unknown } | null
        if (!Array.isArray(body?.hints) || !body.hints.every((hint) => typeof hint === 'string') || !live)
          return
        if (body.hints.includes('site-tour')) {
          forget(seenKey)
          return
        }
        // Carry over this account's old browser flag once, without showing an already-seen tour.
        if (remembered(seenKey)) {
          if (await recordSiteTour()) forget(seenKey)
          return
        }
        ready()
        timer = window.setInterval(ready, 500)
      } catch {
        // An unavailable account answer must not nag the person with a repeat tour.
      }
    }
    void read()
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [enabled, first, stage, account, seenKey])

  // Usage: each showing of a stage draws its own id; every step it reaches and how it ends are told
  // (`usage.ts`). `end` names the way out: the last step or an action that completes it, Skip, Escape,
  // or the tour's controls leaving the page.
  // A step counts when its coach card is placed on its control (`place` below), once per showing: the
  // tour starts at step 0 and skips controls this screen lacks, and a skipped step was never shown.
  const run = useRef({ stage: '', id: '', told: new Set<string>() })
  const flow = stage === 'site' ? 'tour-site' : 'tour-start'
  if (active && run.current.stage !== stage) run.current = { stage, id: newRunId(), told: new Set() }

  async function finish(end: OnboardEnd = 'done') {
    if (finishing.current) return
    if (run.current.id && key) onboardEnd(run.current.id, flow, key, end)
    finishing.current = true
    setBusy(true)
    setError('')
    try {
      if (stage === 'site') void recordSiteTour()
      else await complete()
      setStage('done')
    } catch {
      setError(t('tour.saveError'))
    } finally {
      finishing.current = false
      setBusy(false)
    }
  }

  // The real start button keeps its own navigation handler.
  useEffect(() => {
    if (!enabled || !yourTurn) return
    const button = visibleTarget('createsite')
    const submit = () => void finish()
    button?.addEventListener('click', submit)
    return () => button?.removeEventListener('click', submit)
  }, [enabled, yourTurn])

  useEffect(() => {
    if (!active || !waiting) return
    return watchTourEdit(key, () => {
      completedActions.current.add(key)
      setIndex((current) => current + 1)
    })
  }, [active, waiting, key])

  // Re-read boxes, including after a missing target disappears, on layout and page changes.
  useLayoutEffect(() => {
    if (!active) return
    let pending = 0
    const waitUntil = Date.now() + 4000
    const place = () => {
      const screenSteps = stage === 'site' ? SITE_STEPS : START_STEPS
      const present = screenSteps.filter((item) => visibleTarget(item) !== null)
      const el = visibleTarget(key)
      // Acknowledged sends can precede the new conversation composer mounting.
      if (stage === 'site' && key === 'composer' && el === null && Date.now() < waitUntil) {
        setBox(null)
        return
      }
      // Count controls that are present, retaining steps already shown when chat replaces the cards.
      setAvailable((previous) => {
        const counted = screenSteps.filter(
          (item, n) => present.includes(item) || (n < index && previous.includes(item))
        )
        return previous.length === counted.length && previous.every((item, n) => item === counted[n])
          ? previous
          : counted
      })
      // The overlay can mount before the screen's controls. Do not complete a loading tour.
      if (present.length === 0 && !started.current) return
      if (present.length > 0) started.current = true
      if (el === null) {
        const next = screenSteps.findIndex((item, n) => n > index && visibleTarget(item) !== null)
        if (next >= 0) setIndex(next)
        else void finish('gone')
        return
      }
      if (!run.current.told.has(key)) {
        run.current.told.add(key)
        onboardStep(run.current.id, flow, key)
      }
      const rect = targetBox(key, el)
      setBox(rect)
      const coach = card.current
      if (coach)
        setPosition(
          coachPosition(rect, coach.offsetWidth, coach.offsetHeight, window.innerWidth, window.innerHeight)
        )
    }
    const update = () => {
      window.cancelAnimationFrame(pending)
      pending = window.requestAnimationFrame(place)
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    if (card.current) observer?.observe(card.current)
    const target = visibleTarget(key)
    if (target) observer?.observe(target)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const timer = window.setInterval(update, 350)
    return () => {
      observer?.disconnect()
      window.cancelAnimationFrame(pending)
      window.clearInterval(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [active, stage, key, index])

  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    const initial =
      (key === 'change'
        ? document.querySelector<HTMLElement>('[data-comment-box][data-foot="new"] textarea')
        : null) ??
      card.current?.querySelector<HTMLElement>('.tv-tour-primary') ??
      card.current
    initial?.focus({ preventScroll: true })
    const trap = (event: KeyboardEvent) => {
      if (waiting && !card.current?.contains(event.target as Node)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        void finish('escape')
        return
      }
      if (event.key !== 'Tab' || yourTurn || waiting) return
      const buttons = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])
      if (buttons.length === 0) return
      const current = buttons.indexOf(document.activeElement as HTMLElement)
      event.preventDefault()
      buttons[(current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
    }
    document.addEventListener('keydown', trap, true)
    return () => {
      document.removeEventListener('keydown', trap, true)
      previous?.focus?.({ preventScroll: true })
    }
  }, [active, stage, key, waiting])

  if (!active) return null
  const current = available.indexOf(key) + 1
  const total = available.length
  const last = !available.some((item) => steps.indexOf(item) > index)
  const back = () => {
    for (let n = index - 1; n >= 0; n--)
      if (visibleTarget(steps[n]) && !completedActions.current.has(steps[n])) {
        setIndex(n)
        return
      }
  }
  const next = () => {
    const following = steps.findIndex((item, n) => n > index && visibleTarget(item) !== null)
    if (following < 0) void finish()
    else setIndex(following)
  }
  const r = box
  const left = Math.max(0, (r?.left ?? 0) - 4),
    top = Math.max(0, (r?.top ?? 0) - 4)
  const right = Math.min(window.innerWidth, (r?.right ?? 0) + 4),
    bottom = Math.min(window.innerHeight, (r?.bottom ?? 0) + 4)
  return (
    <div
      className="tv-tour"
      data-tour-stage={stage}
      data-tour-step={key}
      data-tour-interactive={waiting || undefined}
    >
      {r === null ? (
        <div className="tv-tour-mask" style={{ inset: 0 }} />
      ) : (
        <>
          <div className="tv-tour-mask" style={{ left: 0, right: 0, top: 0, height: top }} />
          <div className="tv-tour-mask" style={{ left: 0, top, width: left, height: bottom - top }} />
          <div className="tv-tour-mask" style={{ left: right, right: 0, top, height: bottom - top }} />
          <div className="tv-tour-mask" style={{ left: 0, right: 0, top: bottom, bottom: 0 }} />
          <div className="tv-tour-hole" style={{ left, top, width: right - left, height: bottom - top }} />
        </>
      )}
      <div
        ref={card}
        className="tv-tour-card"
        tabIndex={-1}
        style={position}
        role="dialog"
        aria-modal={!yourTurn && !waiting}
        aria-labelledby="tv-tour-heading"
        aria-describedby="tv-tour-body"
      >
        {total > 0 && (
          <>
            <span className="tv-tour-step">{t('tour.step', { current, total })}</span>
            <div
              className="tv-tour-progress"
              role="progressbar"
              aria-label={t('tour.progress')}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={current}
            >
              <span style={{ width: `${(current / total) * 100}%` }} />
            </div>
          </>
        )}
        <h2 id="tv-tour-heading">{t(`tour.${key}.heading`)}</h2>
        <p id="tv-tour-body">{t(`tour.${key}.body`)}</p>
        {key === 'composer' && (
          <div className="tv-tour-chips">
            {[0, 1, 2].map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (sendTourPrompt(t(`tour.chip.${n}`))) void finish()
                  else setError(t('tour.sendError'))
                }}
              >
                {t(`tour.chip.${n}`)}
              </button>
            ))}
          </div>
        )}
        {error && (
          <span className="tv-tour-error" role="alert">
            {error}
          </span>
        )}
        <div className="tv-tour-actions">
          <div>
            <button
              type="button"
              className="tv-tour-link"
              disabled={busy}
              onClick={() => void finish('skip')}
            >
              {t('tour.skip')}
            </button>
          </div>
          <div>
            {current > 1 && (
              <button type="button" disabled={busy} onClick={back}>
                {t('tour.back')}
              </button>
            )}
            {!yourTurn && !waiting && (
              <button type="button" className="tv-tour-primary" disabled={busy} onClick={next}>
                {t(last ? 'tour.done' : 'tour.next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Parked for a later welcome with video.
export function Welcome({ t, later, begin }: { t: T; later: () => void; begin: () => void }) {
  return (
    <div className="tv-tour" data-tour-step="welcome">
      <div className="tv-tour-mask" style={{ inset: 0 }} />
      <div
        className="tv-tour-card tv-tour-welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tv-tour-heading"
        aria-describedby="tv-tour-body"
      >
        <h2 id="tv-tour-heading">{t('tour.welcome.title')}</h2>
        <p id="tv-tour-body">{t('tour.welcome.body')}</p>
        <div className="tv-tour-loop">
          {['ask', 'review', 'publish'].map((item, n) => (
            <div key={item}>
              <i>{n + 1}</i>
              <b>{t(`tour.welcome.${item}`)}</b>
              <span>{t(`tour.welcome.${item}Body`)}</span>
            </div>
          ))}
        </div>
        <div className="tv-tour-actions">
          <button type="button" className="tv-tour-link" onClick={later}>
            {t('tour.later')}
          </button>
          <button type="button" className="tv-tour-primary" onClick={begin}>
            {t('tour.begin')}
          </button>
        </div>
      </div>
    </div>
  )
}
