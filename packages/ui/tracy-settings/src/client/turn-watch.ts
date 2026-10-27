/**
 * The page's half of "notify me when the agent finishes" (tasks/todo-desktop-onboard-agent.md §4):
 * each turn that ends LIVE in a conversation this page follows is reported to the desktop app with
 * its outcome. Started once from `apply()`, never from a component, so it runs whether or not
 * Settings is open.
 *
 * 🔒 THE PAGE REPORTS, THE APP DECIDES. Whether a banner shows — the switch, a Tracy window in
 * front, the same turn seen by another window, the 3 s pause — is the main process's call
 * (packages/desktop/tracy-desktop/src/notify-bridge.js). Nothing here looks at focus.
 *
 * 🔒 WHAT A FINISHED TURN IS. Not a busy→idle flip (council 10/10: a disconnect, a reload and a
 * history load all look idle). It is the durable `turn/end` event, `{ turn, reason: { kind } }`
 * (vendor/tracy/deepseek-harness/packages/core/session/src/types.ts `TurnEndReasonMap`), arriving
 * in an APPEND change of the conversation's event window — the same signal `tracy-site-tabs`
 * reloads the preview on (`site-reload.mjs` `turnEndedIn`, measured 23/09: the event stream is the
 * one live feed a seat receives; no `running` flag reaches it). A `replace` (history loaded on
 * arrival or after a reconnect) and a `prepend` (older history scrolled in) are never reported, and
 * neither is an appended event at or below the last seq the window held when it was first followed.
 *
 * A turn that stops to ask the person is not a `turn/end`: the turn stays open. It is the live
 * `approval/asked` event (a tool waits for permission) or a live `tool/call` of
 * `ask_user_question`; both are reported as `needs-input`.
 *
 * Every conversation the sessions list holds a binding for is followed, except a subagent's (its
 * turns end while the parent's turn still runs).
 */

/** The four outcomes the bridge accepts. */
export type TurnOutcome = 'completed' | 'error' | 'cancelled' | 'needs-input'

/** `window.tracyDesktop.app.notifications`, the part this reads (protocol 2). */
export interface TurnNotifications {
  turnFinished(input: {
    sessionId: string
    turnId: string
    outcome: TurnOutcome
    title: string
    body: string
  }): Promise<{ decision: string }>
}

interface EventLike {
  readonly type?: string
  readonly seq?: number
  readonly data?: unknown
}

type EntryLike = { readonly type?: string; readonly event?: EventLike } | undefined

interface EventSourceLike {
  getSnapshot(): {
    readonly revision?: number
    readonly entries?: readonly EntryLike[]
    readonly change?: { readonly kind?: string; readonly entries?: readonly EntryLike[] }
  }
  subscribe(listener: () => void): () => void
}

/** The slice of dsh's `ctx.sessions` this reads. */
export interface SessionsLike {
  readonly list: {
    getSnapshot(): { readonly byId: Readonly<Record<string, unknown>> }
    subscribe(listener: () => void): () => void
  }
  binding?(id: string):
    | {
        readonly eventSource?: EventSourceLike
        readonly session?: { getSnapshot?: () => { readonly subagent?: unknown } | undefined }
      }
    | undefined
}

/** The tool that stops a turn to ask the person a question (`dsh-tool-ask-user`). */
const ASK_TOOL = 'ask_user_question'

/** What a product title falls back to when the page is on no site. */
export const FALLBACK_TITLE = 'Tracy Cowork'

/** The words key for each outcome's body. */
const BODY_KEY: Record<TurnOutcome, string> = {
  completed: 'turnWatch.body.completed',
  error: 'turnWatch.body.error',
  cancelled: 'turnWatch.body.cancelled',
  'needs-input': 'turnWatch.body.needsInput'
}

/**
 * The outcome of a `turn/end` reason, or null for one that is never live (`interrupted` closes a
 * crash-orphaned turn on resume, `forked` a fork seed) or that this page does not know.
 * `max-tokens` ended with an answer (cut at the ceiling), so it counts as done; `blocked` is a
 * step a hook refused, so the person must look.
 */
export function outcomeOf(reason: unknown): TurnOutcome | null {
  const kind = (reason as { kind?: unknown } | null)?.kind
  switch (kind) {
    case 'completed':
    case 'max-tokens':
      return 'completed'
    case 'error':
    case 'blocked':
      return 'error'
    case 'aborted':
      return 'cancelled'
    default:
      return null
  }
}

/** The report one live event makes, or null when it is not the end of a turn or a question. */
export function reportOf(event: EventLike | undefined): { turnId: string; outcome: TurnOutcome } | null {
  if (event === undefined || typeof event.seq !== 'number') return null
  const data = (event.data ?? {}) as Record<string, unknown>
  if (event.type === 'turn/end') {
    const outcome = outcomeOf(data.reason)
    // The seq makes the id unique in the conversation's log, and the same in every window.
    return outcome === null ? null : { turnId: `${String(data.turn)}@${event.seq}`, outcome }
  }
  if (event.type === 'approval/asked' && typeof data.id === 'string')
    return { turnId: `approval:${data.id}`, outcome: 'needs-input' }
  if (event.type === 'tool/call' && data.name === ASK_TOOL && typeof data.callId === 'string')
    return { turnId: `ask:${data.callId}`, outcome: 'needs-input' }
  return null
}

/** The bridge's notifications, when this page runs in an app at protocol 2 or later. */
export function turnNotifications(app: unknown): TurnNotifications | null {
  const a = app as
    | { protocolVersion?: unknown; notifications?: { turnFinished?: unknown } }
    | null
    | undefined
  if (a === null || typeof a !== 'object') return null
  if (typeof a.protocolVersion !== 'number' || a.protocolVersion < 2) return null
  if (typeof a.notifications?.turnFinished !== 'function') return null
  return a.notifications as TurnNotifications
}

const lastSeqOf = (entries: readonly EntryLike[] | undefined): number => {
  let last = Number.NEGATIVE_INFINITY
  for (const entry of entries ?? []) {
    const seq = entry?.event?.seq
    if (typeof seq === 'number' && seq > last) last = seq
  }
  return last
}

/**
 * Follow the bound conversations and report each live turn end to the app.
 * @param deps.app - `window.tracyDesktop?.app`; below protocol 2 nothing is followed at all.
 * @param deps.sessions - `ctx.sessions`.
 * @param deps.title - the notification's title, read when a turn ends (the site the page is on).
 * @param deps.words - the namespace's translate function, read when a turn ends.
 * @returns stop following.
 */
export function startTurnWatch(deps: {
  app: unknown
  sessions: SessionsLike
  title: () => string | null
  words: (key: string) => string
}): () => void {
  const notifications = turnNotifications(deps.app)
  if (notifications === null) return () => {}
  const { sessions } = deps

  const followed = new Map<string, () => void>()
  /** Turns already reported from this page; the app dedupes across windows. */
  const reported = new Set<string>()

  const report = (sessionId: string, event: EventLike | undefined): void => {
    const found = reportOf(event)
    if (found === null) return
    const key = `${sessionId}\n${found.turnId}`
    if (reported.has(key)) return
    reported.add(key)
    const title = deps.title()?.trim() || FALLBACK_TITLE
    notifications
      .turnFinished({ sessionId, ...found, title, body: deps.words(BODY_KEY[found.outcome]) })
      .catch(() => {
        // An app that refuses (a window it does not trust, a closed bridge) shows nothing; the
        // page has nothing better to do with the turn.
      })
  }

  const follow = (id: string): void => {
    const binding = sessions.binding?.(id)
    const source = binding?.eventSource
    if (source === undefined) return
    if (binding?.session?.getSnapshot?.()?.subagent) return
    const first = source.getSnapshot()
    // Everything the window holds now is history, whatever change brought it.
    let floor = lastSeqOf(first.entries ?? first.change?.entries)
    let seen = first.revision
    const stop = source.subscribe(() => {
      const snapshot = source.getSnapshot()
      if (snapshot.revision !== undefined && snapshot.revision === seen) return
      seen = snapshot.revision
      const change = snapshot.change
      if (change?.kind !== 'append' || !Array.isArray(change.entries)) {
        // A reloaded or extended history: whatever it holds is not live.
        floor = Math.max(floor, lastSeqOf(change?.entries))
        return
      }
      for (const entry of change.entries) {
        const event = entry?.type === 'event' ? entry.event : undefined
        if (event === undefined || typeof event.seq !== 'number' || event.seq <= floor) continue
        report(id, event)
      }
    })
    followed.set(id, stop)
  }

  const sync = (): void => {
    const ids = new Set(Object.keys(sessions.list.getSnapshot().byId))
    for (const [id, stop] of followed) {
      if (ids.has(id)) continue
      stop()
      followed.delete(id)
    }
    // A conversation whose binding is not there yet is tried again on the next list change.
    for (const id of ids) if (!followed.has(id)) follow(id)
  }

  sync()
  const stopList = sessions.list.subscribe(sync)
  return () => {
    stopList()
    for (const stop of followed.values()) stop()
    followed.clear()
  }
}
