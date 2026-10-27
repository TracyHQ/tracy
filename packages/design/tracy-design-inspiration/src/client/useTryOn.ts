/**
 * Try on, then keep or undo — the state and the door presses behind the Design system tab's try flow
 * (Akemi, 12/10/2026, U3 A; landing changed 13/10/2026, option A). Try on applies for real at once (the
 * apply door), the popups close, the customer is taken to their site, and the bar on the page
 * (`TryBar.tsx`) says what is on with Undo and Keep. Undo (the undo door) goes back to the look from
 * before the first try; Keep leaves the system on. A new try while one is up undoes the first
 * (`switchStepsOf`). The try-on popup (`TryOnDialog.tsx`) only stays up for a door's refusal.
 *
 * The try itself (`trial`) is NOT this hook's state: it is the plugin module's (`try-store.mjs`), so it
 * outlives the tab when the Browser tab takes its pane (13/10/2026) and the bar, in the plugin's own
 * root, keeps speaking for it. This hook reads and writes it there.
 *
 * It also listens for a design system put on or taken off at another door (the site browser's Undo, a
 * Site changes row) and drops the try then: what the popup speaks for is no longer what the site wears.
 * What this tab said itself (`tell`) is not heard again.
 */
import { announceDesignSystemChanged, onDesignSystemChanged, sameSiteKey } from '@tracy/core/turn-undo'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { applyDesignSystem, messageKeyOf, undoDesignSystem } from './design-system-door.mjs'
import { TEMPLATE_DEFAULT_ID } from './DesignSystemGrid'
import { type LibrarySystem, switchStepsOf, type Trial } from './design-system-library.mjs'
import type { Translate } from './strings'
import { onTry, setTry, tryState } from './try-store.mjs'

export type Notice = { tone: 'ok' | 'error'; text: string } | null
type DoorAnswer = Awaited<ReturnType<typeof applyDesignSystem>>

/** What a try needs of the tab's read of the site (`GET /api/sites/:key/design-system`). */
export interface TryOnRead {
  canApply: boolean
  supported: boolean
  template: string | null
  worn: { slotId: string; name: string } | null
}

/** The system the try-on popup is open for. */
export interface Trying {
  id: string
  name: string
  fonts: LibrarySystem['fonts']
}

export function useTryOn({
  siteKey,
  read,
  t,
  say,
  reload,
  settle,
  onChanged,
  onApplied
}: {
  siteKey: string | null
  read: TryOnRead | null
  t: Translate
  /** A key computed from a door's answer: always one of `ds.*`. */
  say: (key: string, params?: Record<string, string | number>) => string
  /** Read the site again. */
  reload: () => Promise<void>
  /** Show the read a door's answer carries, else read again. */
  settle: (r: DoorAnswer) => Promise<void>
  /** Called after the site's look changed (apply or undo). */
  onChanged?: () => void
  /**
   * Called once a try is on the site: the popups are closed and the customer is taken to their site
   * (Akemi, 13/10/2026: "after Try, dismiss the popup and open the site panel"); the bar follows them.
   */
  onApplied?: () => void
}) {
  const [busy, setBusy] = useState<'apply' | 'undo' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  /** The system on the site from the current try (null before the apply door answered yes): the store's, for this site. */
  const held = useSyncExternalStore(onTry, tryState, tryState)
  const trial: Trial | null = held && siteKey && sameSiteKey(held.siteKey, siteKey) ? held.trial : null
  const canUndo = read?.canApply === true
  const setTrial = useCallback(
    (next: Trial | null): void => {
      if (next && siteKey) setTry({ siteKey, trial: next, canUndo, undoing: false })
      else if (!next) setTry(null)
    },
    [siteKey, canUndo]
  )
  /** The system the try-on popup is open for (open from the press, before the door answers). */
  const [trying, setTrying] = useState<Trying | null>(null)
  /** A door's refusal while the popup is open, said in its footer. */
  const [tryError, setTryError] = useState<string | null>(null)
  /** Counts the site's changes, so the live frame loads the site afresh after each. */
  const [round, setRound] = useState(0)

  /**
   * Close the try-on popup when the tab mounts or reads afresh. The try itself is left where it is: it is
   * the store's, and the bar on the page still speaks for it after this tab went away and came back.
   */
  const reset = useCallback((): void => {
    setTrying(null)
  }, [])

  // A design system put on or taken off at another door: read again. What this tab said itself is
  // already shown (`settle`).
  const said = useRef<string | null>(null)
  useEffect(
    () =>
      onDesignSystemChanged((d) => {
        if (!siteKey || !sameSiteKey(d.siteKey, siteKey)) return
        if (d.applyId !== null && said.current === `${d.applyId}:${d.undone}`) return
        // Someone else changed the look: the try the popup speaks for is no longer what the site wears.
        setTrial(null)
        setTrying(null)
        void reload()
      }),
    [siteKey, reload, setTrial]
  )
  /**
   * Say a change this tab made on the page (`tracy:design-system-changed`): the start screen's Design system
   * card and the Browser toolbar read the site again. What is said here is not heard again above.
   */
  const tell = (applyId: string | null, undone: boolean): void => {
    if (!siteKey) return
    said.current = `${applyId}:${undone}`
    announceDesignSystemChanged({ siteKey, applyId, undone })
  }

  /**
   * Try `id` on: apply it for real. While a try is up, that try is undone first, so the newest apply
   * always remembers the look from before the first try and Undo returns there.
   */
  const tryOn = async (id: string, name: string, fonts: Trying['fonts']): Promise<void> => {
    // The template's own look needs no contract, and the customer lock never closes the way back to it.
    if (!siteKey || !read || !read.canApply || busy !== null) return
    if (!read.supported && id !== TEMPLATE_DEFAULT_ID) return
    const steps = switchStepsOf(trial, id)
    if (steps.length === 0) return
    setBusy('apply')
    setNotice(null)
    setTryError(null)
    setTrying({ id, name, fonts })
    const before = trial ? trial.before : read.worn ? { id: read.worn.slotId, name: read.worn.name } : null
    if (steps[0] === 'undo' && trial?.applyId) {
      const u = await undoDesignSystem(siteKey, trial.applyId)
      if (!u.ok) {
        setBusy(null)
        const text = say(messageKeyOf(u.code), { code: u.code })
        setNotice({ tone: 'error', text })
        setTryError(text)
        await settle(u)
        return
      }
      tell(trial.applyId, true)
    }
    // The template the panel read: the door writes for it without reading the site first.
    const r = await applyDesignSystem(siteKey, id, read.template ?? null)
    setBusy(null)
    if (r.ok) {
      const worn = r.body.worn?.name ?? name
      const applyId =
        typeof r.body.applyId === 'string'
          ? r.body.applyId
          : typeof r.body.read?.last?.applyId === 'string'
            ? r.body.read.last.applyId
            : null
      setTrial({ before, current: { id, name: worn }, applyId })
      // The popups close on their own: the site itself, in its panel, is what shows the new look, and
      // the bar on the page says it (`TryBar.tsx`). The tab only speaks when the page does not show it yet.
      setTrying(null)
      setTryError(null)
      setNotice(r.body.seen === false ? { tone: 'ok', text: t('ds.applied.notSeen', { name: worn }) } : null)
      onApplied?.()
      setRound((n) => n + 1)
      onChanged?.()
      tell(applyId, false)
    } else {
      // An undo that went through but an apply that did not: the site is back where it was.
      if (steps[0] === 'undo') setTrial(null)
      const text = say(messageKeyOf(r.code), { code: r.code })
      setNotice({ tone: 'error', text })
      setTryError(text)
    }
    await settle(r)
  }

  /** Undo the try: the site goes back to the look from before the first try. */
  const undoTrial = async (): Promise<void> => {
    if (!siteKey || !trial?.applyId) return
    setBusy('undo')
    setNotice(null)
    const r = await undoDesignSystem(siteKey, trial.applyId)
    setBusy(null)
    if (r.ok) {
      setNotice({
        tone: 'ok',
        text: r.body.worn ? t('ds.undone', { name: r.body.worn.name }) : t('ds.undone.none')
      })
      setTrial(null)
      setTrying(null)
      setRound((n) => n + 1)
      onChanged?.()
      tell(trial.applyId, true)
    } else setTryError(say(messageKeyOf(r.code), { code: r.code }))
    await settle(r)
  }

  /** Keep (the bar's Keep; also X, Escape, the backdrop of the popup): the bar goes and the system stays. */
  const keep = (): void => {
    setTrying(null)
    setTryError(null)
    setTrial(null)
  }

  return { busy, notice, trial, trying, tryError, round, reset, tryOn, undoTrial, keep, tell }
}
