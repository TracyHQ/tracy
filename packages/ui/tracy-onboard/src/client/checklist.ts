/**
 * What the account menu's "Getting started" row shows: how many setup steps are done, out of how
 * many this surface has, and whether the person hid the row (Lee, 11/10/2026,
 * tasks/evidence/desktop-onboard/mock/onboard-checklist-menu.html, section B).
 *
 * The count follows the SAME rule as the screen's checklist (`flow.ts` `stepsDone`): sign-in and
 * appearance are always done, the AI account once any connection is connected (the page's status
 * copy, `@tracy/dsh-model-plan/connect` `pageAccountStatus`, which a connect publishes to), and
 * notifications (desktop only) when the app says they are on. So the web with no AI account reads
 * 2/3 and the desktop app with notifications off 2/4.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { NotifyStatus } from './bridge.ts'
import { stepsDone } from './flow.ts'
import { type OnboardStore, type OnboardSurface, stepsOf } from './surface.ts'

export interface Checklist {
  readonly done: number
  readonly total: number
  /**
   * "Hide from account menu" was pressed (and "Show in account menu" not since): the menu row stays
   * away; Settings › Help & about's row still opens the screen and says so.
   */
  readonly hidden: boolean
}

/** The slice of the page's status copy the row reads; undefined while nothing was read. */
export interface StatusCopy {
  current(): { readonly connections: readonly { readonly connected: boolean }[] } | undefined
  subscribe(listener: () => void): () => void
}

/** Any connection the status door lists as connected (a row kept after a disconnect does not count). */
export const anyConnected = (status: ReturnType<StatusCopy['current']>): boolean =>
  status !== undefined && status.connections.some((c) => c.connected)

/**
 * The row's numbers for one moment.
 * @param input.total - this surface's step count (`stepsOf`).
 * @param input.menuHiddenAt - the account's flag; null = not hidden.
 */
export function checklistOf(input: {
  readonly total: number
  readonly connected: boolean
  readonly notify: NotifyStatus | null
  readonly menuHiddenAt: number | null
}): Checklist {
  const done = stepsDone({ connected: input.connected, notify: input.notify })
    .slice(0, input.total)
    .filter(Boolean).length
  return { done, total: input.total, hidden: input.menuHiddenAt !== null }
}

/**
 * The row's live numbers: the status copy and the app's notifications are followed as they change;
 * the account's flags are read when the row mounts and again on every `watch` notice (the screen
 * opened or closed, or its header button hid or showed the menu row). null until the flags were asked once, so a row
 * about to be hidden never flashes; no answer at all (no door) shows the row.
 * @param watch - subscribe to "something may have changed the flags"; returns the unsubscribe.
 */
export function useChecklist(
  surface: OnboardSurface,
  store: OnboardStore,
  status: StatusCopy,
  watch: (listener: () => void) => () => void
): Checklist | null {
  const connected = useSyncExternalStore(
    status.subscribe,
    () => anyConnected(status.current()),
    () => anyConnected(status.current())
  )
  const [notify, setNotify] = useState<NotifyStatus | null>(null)
  useEffect(() => {
    const notifications = surface.notifications
    if (!notifications) return
    let live = true
    notifications.status().then(
      (answer) => live && setNotify(answer),
      () => {}
    )
    const unwatch = notifications.onChange?.((answer) => {
      if (live) setNotify(answer)
    })
    return () => {
      live = false
      unwatch?.()
    }
  }, [surface])
  /** undefined = not asked yet; null = no answer (show the row). */
  const [menuHiddenAt, setMenuHiddenAt] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const read = () =>
      store.get().then(
        (flags) => live && setMenuHiddenAt(flags.menuHiddenAt),
        () => live && setMenuHiddenAt(null)
      )
    void read()
    const unwatch = watch(() => void read())
    return () => {
      live = false
      unwatch()
    }
  }, [store, watch])
  if (menuHiddenAt === undefined) return null
  return checklistOf({ total: stepsOf(surface), connected, notify, menuHiddenAt })
}
