/** A pressed chat action prepares the latest saved request before opening setup. */
import type { HelpData, StartPress } from './help'

export function draftProblem(
  code: unknown
): 'draft.changed' | 'draft.long' | 'draft.ambiguous' | 'draft.failed' {
  return code === 'DRAFT_CHANGED'
    ? 'draft.changed'
    : code === 'DRAFT_TOO_LONG'
      ? 'draft.long'
      : code === 'DRAFT_AMBIGUOUS'
        ? 'draft.ambiguous'
        : 'draft.failed'
}

/** An older answer can still start the latest request after a purely advisory follow-up. */
export function latestDraftTurn(
  rows: readonly { kind: string; data: unknown }[],
  sessionId: string
): HelpData | undefined {
  return rows
    .map((r) => r.data as HelpData)
    .filter((d) => d?.variant === 'turn' && d.sessionId === sessionId)
    .at(-1)
}

/** Queued corrections count too, even before the server has assigned their turn ID. */
export function draftIsCurrent(rows: readonly { kind: string; data: unknown }[], turn: HelpData): boolean {
  const turns = rows
    .map((r) => r.data as HelpData)
    .filter((d) => d?.variant === 'turn' && d.sessionId === turn.sessionId)
  return (
    turns.at(-1)?.userTurnId === turn.userTurnId &&
    Boolean(turn.userTurnId) &&
    !turns.some((d) => d.status === 'queued' || d.status === 'streaming')
  )
}

export async function prepareDraft(
  turn: HelpData,
  press: StartPress,
  current: () => boolean,
  fetchImpl: (path: string, init?: RequestInit) => Promise<Response>
): Promise<Record<string, unknown>> {
  if (!current()) throw new Error('DRAFT_CHANGED')
  const res = await fetchImpl('/api/assistant/onboarding-draft', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      intent: press.action,
      platform: press.platform,
      session: turn.sessionId,
      sourceRevision: turn.userTurnId
    }),
    signal: AbortSignal.timeout(65_000)
  })
  const body = await res.json().catch(() => null)
  if (!current()) throw new Error('DRAFT_CHANGED')
  if (!res.ok) throw new Error(typeof body?.code === 'string' ? body.code : 'DRAFT_FAILED')
  if (
    body?.draft?.version !== 1 ||
    body.draft.sourceRevision !== turn.userTurnId ||
    body.draft.intent !== press.action
  )
    throw new Error('DRAFT_FAILED')
  return body.draft
}

/** Different answer rows share one preparation sequence: only the latest click may open setup. */
export function draftActions(fetchImpl: (path: string, init?: RequestInit) => Promise<Response>) {
  let sequence = 0
  return (turn: HelpData, press: StartPress, current: () => boolean) => {
    const mine = ++sequence
    return prepareDraft(turn, press, () => mine === sequence && current(), fetchImpl)
  }
}

/**
 * Create or Import pressed in the row above the composer (`StartRow`): the same draft as the answer's
 * own action (`prepared`), so what the customer said in the chat reaches Add site through either door
 * — the row once opened Add site bare (#203). With no request in the conversation yet, or when
 * preparing fails, the plain start (`plain`), as before; Templates opens its own tab, as on the first
 * screen. One press at a time: a second press while the draft is prepared is ignored.
 */
export function rowStarts(deps: {
  rows: (sessionId: string) => readonly { kind: string; data: unknown }[]
  prepared: (sessionId: string, press: StartPress) => Promise<void>
  plain: (action: 'create' | 'templates' | 'import', answered: string) => void
}) {
  let pending: Promise<void> | undefined
  return (sessionId: string | undefined, action: 'create' | 'templates' | 'import', answered: string) => {
    if (!sessionId || action === 'templates' || !latestDraftTurn(deps.rows(sessionId), sessionId)) {
      deps.plain(action, answered)
      return undefined
    }
    if (pending) return pending
    pending = deps
      .prepared(sessionId, { action })
      .catch(() => deps.plain(action, answered))
      .finally(() => {
        pending = undefined
      })
    return pending
  }
}
