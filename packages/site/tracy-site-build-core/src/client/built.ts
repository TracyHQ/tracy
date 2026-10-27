/**
 * The picture card's seam (todo-build-with-experience.md §0c/§D2): dsh folds a turn's settled tool
 * calls into "1 tool call", so the card that shows the built page cannot be the tool's own view. It
 * is the TURN TAIL instead — the same mechanism as design-inspiration's picks row and dsh's own
 * produced-files row: a Conversation Node Definition folds `tool/call` + `tool/result` of one turn
 * into a value published against that turn, and a `conversation.chat.turnTail` entry claims the
 * tail when the value is there. Nothing is imported from dsh at run time — duck-typed.
 */

/** What the tail knows about the build that settled in this turn. */
export interface Built {
  job: string
  status: 'done' | 'waiting' | 'failed'
  rerun: boolean
  /** Whether the shot stage produced a picture. */
  picture: boolean
}
export interface BuiltTurnData {
  built: Built
  seq: number
}

interface EventLike {
  type: string
  seq: number
  surfaceOp?: string
  data: Record<string, unknown>
}
interface MatchLike {
  event: EventLike
}
interface State {
  turn: number
  calls: Map<string, { rerun: boolean }>
  built: Built | null
  seq: number
}
interface ContextLike {
  state: State
}

/** The tool's own summary, read back out of its result text. */
function builtFromResult(text: string, rerun: boolean): Built | null {
  try {
    const parsed = JSON.parse(text) as {
      job?: unknown
      status?: unknown
      stages?: unknown
    }
    if (typeof parsed.job !== 'string' || typeof parsed.status !== 'string') return null
    if (parsed.status !== 'done' && parsed.status !== 'waiting' && parsed.status !== 'failed') return null
    const stages = Array.isArray(parsed.stages) ? parsed.stages.map(String) : []
    return {
      job: parsed.job,
      status: parsed.status,
      rerun,
      picture: stages.some((s) => s.startsWith('shot:done'))
    }
  } catch {
    return null
  }
}

/**
 * The definition, made for one plugin's tool: the events it folds are that tool's calls, and the
 * key it publishes under is that tool's, so two Build plugins on one page never claim each
 * other's turn tail.
 * @param tool - the plugin's tool name, `tracy_site_build_wordpress`.
 */
export function makeBuiltDefinition(tool: string) {
  const TOOL = tool
  const KEY = `${tool}:built`
  return {
    kind: KEY,
    match: (event: EventLike) => {
      if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' as const }
      if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' as const }
      // Only an APPENDED result is a settlement; a replacement rewrites history and is not one.
      if (event.type === 'tool/result' && event.surfaceOp === 'append') {
        return { id: String(event.data.turn), role: 'update' as const }
      }
      return null
    },
    start: (_context: unknown, match: MatchLike): State => ({
      turn: Number(match.event.data.turn),
      calls: new Map(),
      built: null,
      seq: 0
    }),
    update: (context: ContextLike, match: MatchLike): State => {
      const { event } = match
      if (event.type === 'tool/call') {
        if (event.data.name !== TOOL) return context.state
        const calls = new Map(context.state.calls)
        let rerun = false
        try {
          rerun = (JSON.parse(String(event.data.arguments ?? '{}')) as { action?: string }).action === 'rerun'
        } catch {
          // a truncated argument stream reads as a start
        }
        calls.set(String(event.data.callId), { rerun })
        return { ...context.state, calls }
      }
      if (event.type !== 'tool/result') return context.state
      // Session format V4 (dsh 0.1.7): a first-class tool-role message — the error flag on the
      // MESSAGE, the answer's blocks directly in `content` (`session-format-v3-to-v4`
      // `src/tool-role.ts:60-69`). A V3 log is migrated before a Session exposes it.
      const message = event.data.message as
        | { source?: { callId?: unknown }; isError?: boolean; content?: { text?: string; type?: string }[] }
        | undefined
      const call = context.state.calls.get(String(message?.source?.callId))
      if (!call || message?.isError === true) return context.state
      const first = message?.content?.find(
        (block) => block?.type === 'text' && typeof block.text === 'string'
      )
      if (!first || typeof first.text !== 'string') return context.state
      const built = builtFromResult(first.text, call.rerun)
      return built ? { ...context.state, built, seq: event.seq } : context.state
    },
    buildLocationData: (
      context: { state?: State },
      scope: string,
      previous: { kind: string; turn: number; key: string; value: BuiltTurnData } | undefined
    ) => {
      if (scope !== 'turn' || context.state === undefined || context.state.built === null) return null
      if (
        previous?.kind === 'turn' &&
        previous.turn === context.state.turn &&
        previous.key === KEY &&
        previous.value.built === context.state.built
      ) {
        return previous
      }
      return {
        kind: 'turn' as const,
        turn: context.state.turn,
        key: KEY,
        value: { built: context.state.built, seq: context.state.seq }
      }
    }
  }
}

/** The owner props the turn-tail chain hands each entry; only what this plugin reads. */
export interface TurnTailOwnerLike {
  turn: { data: { get: (key: string) => unknown } }
  seq: number
}

/** Claim the tail only when a build settled `done` in this turn, and only for the closing message. */
export function selectBuilt(owner: TurnTailOwnerLike, tool: string): Built | null {
  const data = owner.turn.data.get(`${tool}:built`) as BuiltTurnData | undefined
  if (!data || data.built.status !== 'done' || data.seq > owner.seq) return null
  return data.built
}
