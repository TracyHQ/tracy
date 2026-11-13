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
import { BUILD_TOOL, type BuildToolFold, buildToolFoldOf } from '@tracy/core/build-chat'

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
