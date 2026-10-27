/**
 * The three picks as TURN DATA: which inspirations the agent proposed in this turn, read off the
 * `tracy_design_propose` tool call the host half registers — never off the closing prose.
 *
 * Same mechanism as dsh's own `ui-deliverables` (its produced-files row): a Conversation Node
 * Definition folds `tool/call` + `tool/result` of one Turn into a value published against that
 * Turn, and a `conversation.chat.turnTail` entry claims the tail of the turn only when the value
 * is there. Nothing is imported from dsh at run time — the definition is duck-typed, and the one
 * helper it would import (`isAppendSurfaceEvent`) is a single field check, spelled out below.
 */

export const TOOL = 'tracy_design_propose'

export interface Pick {
  id: string
  why: string
}

/** Immutable picks published against one Turn. */
export interface PicksTurnData {
  readonly picks: readonly Pick[]
  readonly seq: number
}

interface PicksState extends PicksTurnData {
  readonly turn: number
  /** callId → picks parsed from the call's arguments, or null when not our tool / malformed. */
  readonly calls: ReadonlyMap<string, readonly Pick[] | null>
}

/** The minimal event shape this definition reads. */
interface EventLike {
  type: string
  seq: number
  surfaceOp?: string
  data: Record<string, unknown>
}

interface MatchLike {
  event: EventLike
}

interface ContextLike {
  state: PicksState
}

/** Three `{ id, why }` entries out of the tool's raw arguments, or null. */
export function picksFromArgs(raw: unknown): readonly Pick[] | null {
  let args: unknown = raw
  if (typeof raw === 'string') {
    try {
      args = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (!args || typeof args !== 'object') return null
  const list = (args as { picks?: unknown }).picks
  if (!Array.isArray(list)) return null
  const picks: Pick[] = []
  for (const p of list) {
    if (!p || typeof p !== 'object') return null
    const { id, why } = p as { id?: unknown; why?: unknown }
    if (typeof id !== 'string' || id === '') return null
    picks.push({ id, why: typeof why === 'string' ? why : '' })
  }
  return picks.length > 0 ? picks.slice(0, 3) : null
}

/**
 * The definition `ctx.uiConversation.events.register` takes. Publishes `{ picks, seq }` against
 * the turn; the last successful call of the turn wins.
 */
export const picksDefinition = {
  kind: 'tracy-design-picks',
  match: (event: EventLike) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' as const }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' as const }
    // Only an APPENDED result is a settlement; a replacement rewrites history and is not one.
    if (event.type === 'tool/result' && event.surfaceOp === 'append') {
      return { id: String(event.data.turn), role: 'update' as const }
    }
    return null
  },
  start: (_context: unknown, match: MatchLike): PicksState => ({
    turn: Number(match.event.data.turn),
    calls: new Map(),
    picks: [],
    seq: 0
  }),
  update: (context: ContextLike, match: MatchLike): PicksState => {
    const { event } = match
    if (event.type === 'tool/call') {
      const calls = new Map(context.state.calls)
      calls.set(
        String(event.data.callId),
        event.data.name === TOOL ? picksFromArgs(event.data.arguments) : null
      )
      return { ...context.state, calls }
    }
    if (event.type !== 'tool/result') return context.state
    // Session format V4 (dsh 0.1.7): a first-class tool-role message with the error flag on the
    // MESSAGE, not on a `tool-result` block (`session-format-v3-to-v4` `src/tool-role.ts:60-69`).
    // A V3 log is migrated before a Session exposes it, so the old block is never seen here.
    const message = event.data.message as { source?: { callId?: unknown }; isError?: boolean } | undefined
    if (message?.isError === true) return context.state
    const picks = context.state.calls.get(String(message?.source?.callId))
    return picks ? { ...context.state, picks, seq: event.seq } : context.state
  },
  buildLocationData: (
    context: { state?: PicksState },
    scope: string,
    previous: { kind: string; turn: number; key: string; value: PicksTurnData } | undefined
  ) => {
    if (scope !== 'turn' || context.state === undefined || context.state.picks.length === 0) return null
    if (
      previous?.kind === 'turn' &&
      previous.turn === context.state.turn &&
      previous.key === 'tracy-design-picks' &&
      previous.value.picks === context.state.picks
    ) {
      return previous
    }
    return {
      kind: 'turn' as const,
      turn: context.state.turn,
      key: 'tracy-design-picks' as const,
      value: { picks: context.state.picks, seq: context.state.seq }
    }
  }
}

/** The owner props the turn-tail chain hands each entry; only what this plugin reads. */
export interface TurnTailOwnerLike {
  turn: { data: { get: (key: string) => unknown } }
  seq: number
}

/**
 * Claim the tail of a turn only when this turn proposed inspirations, and only for the closing
 * message after the proposal (a later assistant seq would otherwise show the row twice).
 */
export function selectPicks(owner: TurnTailOwnerLike): readonly Pick[] | null {
  const data = owner.turn.data.get('tracy-design-picks') as PicksTurnData | undefined
  if (!data || data.picks.length === 0 || data.seq > owner.seq) return null
  return data.picks
}
