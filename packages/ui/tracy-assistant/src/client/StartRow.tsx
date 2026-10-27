/**
 * The creation workspace's three start doors, drawn as ONE row right above the Help composer once
 * the page holds a conversation (Akemi 23/10/2026). Same coloured pills as the first screen's cards
 * (chat-input's `.tv-start-card` rules, global CSS), so they read as the same doors. A press goes
 * through the same event as the first screen (`tracy:onboarding-start`, handled by chat-input),
 * carrying the question of the latest finished answer so Create still preselects a platform the
 * person named.
 */
import { uiSwitches } from '@tracy/core/ui-switches'
import { Box, Link, type LucideIcon, Palette } from 'lucide-react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { Translate } from './strings'

export type StartAction = 'create' | 'templates' | 'import'

const DOORS: readonly { action: StartAction; tab: string; tone: string; Icon: LucideIcon }[] = [
  { action: 'create', tab: 'tracy:add-site', tone: 'create', Icon: Box },
  { action: 'templates', tab: 'tracy:design-inspiration', tone: 'template', Icon: Palette },
  { action: 'import', tab: 'tracy:add-site', tone: 'import', Icon: Link }
]

export function StartRow({ t, onStart }: { t: Translate; onStart: (action: StartAction) => void }) {
  const ui = uiSwitches()
  // A tab an operator switched off has no door, as on the first screen.
  const allowed = useSyncExternalStore(ui.subscribe, () =>
    DOORS.map((door) => (ui.tabPolicy().isAllowed(door.tab) ? '1' : '0')).join('')
  )
  const box = useRef<HTMLDivElement>(null)
  // A soft fade marks the right edge only while more cards wait there, so the last card is fully
  // visible once scrolled to the end.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const mark = () => {
      const more = el.scrollWidth - el.scrollLeft - el.clientWidth > 1
      if (more) el.setAttribute('data-more-end', '')
      else el.removeAttribute('data-more-end')
    }
    mark()
    el.addEventListener('scroll', mark, { passive: true })
    const watch = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(mark)
    watch?.observe(el)
    return () => {
      el.removeEventListener('scroll', mark)
      watch?.disconnect()
    }
  }, [])
  return (
    <div ref={box} className="tv-onboarding-start">
      {DOORS.map((door, i) =>
        allowed[i] === '1' ? (
          <button
            key={door.action}
            type="button"
            className="tv-start-card"
            aria-label={t(`onboarding.action.${door.action}`)}
            title={t(`onboarding.action.${door.action}`)}
            onClick={() => onStart(door.action)}
          >
            <span className="tv-start-card-icon" data-tone={door.tone} aria-hidden="true">
              <door.Icon />
            </span>
            {/* Both names are drawn; the stylesheet shows the short one in a narrow column. */}
            <span className="tv-start-card-title" aria-hidden="true">
              <span className="tv-start-card-full">{t(`onboarding.action.${door.action}`)}</span>
              <span className="tv-start-card-short">{t(`onboarding.action.${door.action}.short`)}</span>
            </span>
          </button>
        ) : null
      )}
    </div>
  )
}
