/**
 * The seam between the session log and the cards (#609). dsh folds a turn's settled tool calls into one disclosure,
 * so a card cannot be the tool's own row; it is the tail of a turn, as in design inspiration's picks row and the
 * Build plugins' picture card. Three conversation node definitions fold every `tracy_build` call and result of the
 * session (`buildToolFoldOf`) in ONE context each, and publish against the turn of the latest answer only:
 *
 * - `tracy_build:templates`: the templates the tool offered last, for the template card;
 * - `tracy_build:plan`: the latest plan id and revision, for the one living plan card. An older turn that carried a
 *   plan loses its value when a newer one arrives, so the history keeps one plan card, never a list of versions;
 * - `tracy_build:working`: the latest call while it waits (unanswered, or answered `running`), for the line that
 *   says work is going on above the chat input (`WorkingDock.tsx`).
 *
 * Duck-typed: nothing is imported from dsh at run time.
 */
import {
  BUILD_TOOL,
  type BuildToolFold,
  buildHistoryFoldOf,
  buildToolFoldOf,
  type Handoff,
  handoffFoldOf,
  type HandoffMessage
} from '@tracy/core/build-chat'

export const TEMPLATES_KEY = `${BUILD_TOOL}:templates`
export const PLAN_KEY = `${BUILD_TOOL}:plan`
export const WORKING_KEY = `${BUILD_TOOL}:working`

export type TemplatesValue = NonNullable<BuildToolFold['templates']>
export type PlanValue = NonNullable<BuildToolFold['plan']>
export type WorkingValue = NonNullable<BuildToolFold['working']>

interface EventLike {
  type: string
  seq: number
  surfaceOp?: string
  data?: Record<string, unknown>
}
interface LocationData<V> {
  kind: string
  turn: number
  key: string
  value: V
}

/** One context for the whole session: every tool call and every appended result goes to it, in order. */
const SESSION = 'session'
const match = (event: EventLike) => {
  if (event.type === 'tool/call' && event.data?.name === BUILD_TOOL)
    return { id: SESSION, role: 'start' as const }
  if (event.type === 'tool/result' && event.surfaceOp === 'append')
    return { id: SESSION, role: 'update' as const }
  return null
}

function definitionOf<V extends { turn: number }>(kind: string, pick: (fold: BuildToolFold) => V | null) {
  return {
    kind,
    match,
    start: (_context: unknown, m: { event: EventLike }): BuildToolFold => buildToolFoldOf(undefined, m.event),
    update: (context: { state: BuildToolFold }, m: { event: EventLike }): BuildToolFold =>
      buildToolFoldOf(context.state, m.event),
    buildLocationData: (
      context: { state?: BuildToolFold },
      scope: string,
      previous: LocationData<V> | null
    ): LocationData<V> | null => {
      const value = scope === 'turn' && context.state ? pick(context.state) : null
      if (value === null) return null
      if (previous?.value === value) return previous
      return { kind: 'turn', turn: value.turn, key: kind, value }
    }
  }
}

export const templatesDefinition = definitionOf<TemplatesValue>(TEMPLATES_KEY, (fold) => fold.templates)
export const planDefinition = definitionOf<PlanValue>(PLAN_KEY, (fold) => fold.plan)
export const workingDefinition = definitionOf<WorkingValue>(WORKING_KEY, (fold) => fold.working)

/** The owner props dsh hands a turn tail entry; only what the cards read. */
export interface TurnTailOwnerLike {
  turn: { turn: number; data: { get: (key: string) => unknown } }
  seq: number
}

/** The value a definition published against this turn, or null. */
export function turnValueOf<V>(owner: TurnTailOwnerLike, key: string): V | null {
  return (owner?.turn?.data?.get?.(key) as V | undefined) ?? null
}

/**
 * The hand off of a done build (#611), two more definitions in the same shape:
 *
 * - `tracy_build:history`: the build session's own conversation (`buildHistoryFoldOf`), published on the turn of its
 *   latest message, which is the session's last turn: what the build chat sends when the build is done;
 * - `tracy_build:handoff`: in the site session, the turn whose first message carries the hand off block
 *   (`handoffFoldOf`), for the earlier conversation drawn in that turn.
 */
export const HISTORY_KEY = `${BUILD_TOOL}:history`
export const HANDOFF_KEY = `${BUILD_TOOL}:handoff`

export interface HistoryValue {
  turn: number
  messages: HandoffMessage[]
}
export type HandoffValue = Handoff & { turn: number }

// Every match says 'start': dsh starts the context on the first one and reads every later one as an update, and an
// update that came before any start would throw (ui-conversation assembler).
const historyMatch = (event: EventLike) =>
  event.type === 'turn/start' ||
  (event.surfaceOp === 'append' && (event.type === 'user/message' || event.type === 'assistant/message'))
    ? { id: SESSION, role: 'start' as const }
    : null

interface HistoryState {
  openTurn: number | null
  value: HistoryValue | null
}
const historyStep = (state: HistoryState, event: EventLike): HistoryState => {
  if (event.type === 'turn/start') {
    const turn = Number(event.data?.turn)
    return Number.isSafeInteger(turn) && turn >= 0 ? { ...state, openTurn: turn } : state
  }
  const before = state.value?.messages ?? []
  const messages = buildHistoryFoldOf(before, event)
  if (messages === before) return state
  const said = Number((event.data as { turn?: unknown } | undefined)?.turn)
  const turn = Number.isSafeInteger(said) && said >= 0 ? said : state.openTurn
  return turn === null ? state : { ...state, value: { turn, messages } }
}

function publishOn<V extends { turn: number }>(
  key: string,
  value: V | null,
  previous: LocationData<V> | null
) {
  if (value === null) return null
  if (previous?.value === value) return previous
  return { kind: 'turn', turn: value.turn, key, value }
}

export const historyDefinition = {
  kind: HISTORY_KEY,
  match: historyMatch,
  start: (_context: unknown, m: { event: EventLike }): HistoryState =>
    historyStep({ openTurn: null, value: null }, m.event),
  update: (context: { state: HistoryState }, m: { event: EventLike }): HistoryState =>
    historyStep(context.state, m.event),
  buildLocationData: (
    context: { state?: HistoryState },
    scope: string,
    previous: LocationData<HistoryValue> | null
  ) => publishOn(HISTORY_KEY, scope === 'turn' ? (context.state?.value ?? null) : null, previous)
}

const handoffMatch = (event: EventLike) =>
  event.type === 'turn/start' || event.type === 'user/message'
    ? { id: SESSION, role: 'start' as const }
    : null

type HandoffState = ReturnType<typeof handoffFoldOf>
/** The published value, made once per found hand off so a later event keeps the same object. */
const handoffValues = new WeakMap<object, HandoffValue>()
const handoffValueOf = (state: HandoffState | undefined): HandoffValue | null => {
  const found = state?.found
  if (!found) return null
  let value = handoffValues.get(found)
  if (!value) {
    value = { ...found.handoff, turn: found.turn }
    handoffValues.set(found, value)
  }
  return value
}

export const handoffDefinition = {
  kind: HANDOFF_KEY,
  match: handoffMatch,
  start: (_context: unknown, m: { event: EventLike }): HandoffState => handoffFoldOf(undefined, m.event),
  update: (context: { state: HandoffState }, m: { event: EventLike }): HandoffState =>
    handoffFoldOf(context.state, m.event),
  buildLocationData: (
    context: { state?: HandoffState },
    scope: string,
    previous: LocationData<HandoffValue> | null
  ) => publishOn(HANDOFF_KEY, scope === 'turn' ? handoffValueOf(context.state) : null, previous)
}
