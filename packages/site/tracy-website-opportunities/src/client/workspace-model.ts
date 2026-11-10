/**
 * The Workspace card of Details (#537, option D): one card under the Progress band with four sections in a fixed
 * order (Sources, Business facts, Site content brief, Your site). The section of the current step is open, finished
 * sections fold to a one line summary, sections waiting for the seller's review are open with a Needs your review chip,
 * and sections that cannot hold anything yet are one muted row with the line of what they wait for.
 * A step that runs shows its progress in the Progress band only: its section is the muted row while it runs.
 * Reads the stepper (`stepper-model.ts`) plus a few counts, and the seller's own open/closed choice per section.
 * Pure: no DOM, no fetch, no clock read. Dates are formatted with the locale it is given.
 */
import type { DemoState } from '@tracy/wo-views/demo-state'

import { type SourceState, sourcesSummary } from './source-table-model.ts'
import type { StepperView } from './stepper-model.ts'

export type WorkspaceId = 'sources' | 'profile' | 'brief' | 'demo'
export const WORKSPACE_IDS: readonly WorkspaceId[] = Object.freeze(['sources', 'profile', 'brief', 'demo'])

/**
 * open: the section of the current step · done: finished, folds to its summary · review: waits for the seller's
 * review · locked: nothing to show (not made yet, or reset by an earlier step: nothing old is shown).
 */
export type WorkspaceState = 'open' | 'done' | 'review' | 'locked'

/** One piece of a summary line: a string key, or text drawn as is (a site address). Pieces join with a middle dot. */
export type WorkspaceText = { key: string; params?: Record<string, string | number> } | { text: string }

export interface WorkspaceSection {
  id: WorkspaceId
  state: WorkspaceState
  /** Drawn open now: the seller's own choice, else open for the current section and a review. */
  expanded: boolean
  /** A locked row never opens. */
  expandable: boolean
  /**
   * The one line beside the title while the section is folded (Sources keeps it while open too); for a locked row,
   * the line of what it waits for.
   */
  summary: WorkspaceText[]
  /** The chip text of a review row (Needs your review), or null. The card draws the Review pill instead. */
  chipKey: string | null
  /** The words of the status pill that opens the section's sub-page, or null when it has none. */
  linkKey: string | null
}

export interface WorkspaceInput {
  stepper: StepperView
  /** The card's own research has finished once (`researchOf().done`). */
  researchDone: boolean
  /** Research runs now, first time or again (`researchMovingOf`). */
  researchMoving: boolean
  researchedAt: string | null
  /** The state of each source row Sources lists, in its order (`source-table-model.ts`). */
  sources: readonly SourceState[]
  /** Business facts rows that hold a value. */
  fields: number
  /** The latest brief, or null before the first one. */
  brief: { n: number } | null
  /** A brief run is under way or failed with no current brief: the brief is reset on screen. */
  briefEmpty: 'running' | 'failed' | null
  demo: DemoState
  /** The address of the ready demo, when known. */
  demoHost: string | null
  /** The seller's own open/closed choice per section (session storage). */
  opened: Partial<Record<WorkspaceId, boolean>>
  locale?: string
}

function shortDate(iso: string | null | undefined, locale: string): string | null {
  if (typeof iso !== 'string' || iso === '') return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at)
  } catch {
    return null
  }
}

const counted = (base: string, count: number): WorkspaceText => ({
  key: `${base}.${count === 1 ? 'one' : 'other'}`,
  params: { count }
})
const dated = (key: string, date: string | null): WorkspaceText[] =>
  date === null ? [] : [{ key, params: { date } }]

/** The section the seller should look at for the current step; open unless the seller folded it. */
export function focusOf(
  input: Pick<WorkspaceInput, 'stepper' | 'brief' | 'briefEmpty' | 'demo' | 'researchMoving'>
): WorkspaceId {
  const { stepper } = input
  // Research running (again) resets what it made: the links it reads are what there is to see.
  if (input.researchMoving) return 'sources'
  if (stepper.current === 'research') return stepper.review ? 'profile' : 'sources'
  if (stepper.current === 'brief')
    return stepper.review || (input.brief !== null && input.briefEmpty === null) ? 'brief' : 'profile'
  if (stepper.current === 'build')
    return input.demo === 'failed' || input.demo === 'expired' ? 'demo' : 'brief'
  return 'demo'
}

export function workspaceSections(input: WorkspaceInput): WorkspaceSection[] {
  const locale = input.locale ?? 'en'
  const { stepper } = input
  const step = (id: string) => stepper.steps.find((s) => s.id === id)
  const research = step('research')
  const briefStep = step('brief')
  const buildStep = step('build')
  const researchAgain =
    stepper.current === 'research' &&
    (research?.status.key === 'stepper.sourcesChanged' || stepper.action?.kind === 'research-again')
  const focus = focusOf(input)

  const section = (
    id: WorkspaceId,
    state: WorkspaceState,
    summary: WorkspaceText[],
    extra: Partial<Pick<WorkspaceSection, 'chipKey' | 'linkKey'>> = {}
  ): WorkspaceSection => {
    const expandable = state !== 'locked'
    const byDefault = state === 'open' || state === 'review'
    const expanded = expandable && (input.opened[id] ?? byDefault)
    // The pill is the row's one action: Review when it waits for the seller, Open when it is complete. A locked row
    // shows a lock instead, the demo row has no sub-page, and a current Sources row only has Add source inside.
    const linkKey =
      extra.linkKey !== undefined
        ? extra.linkKey
        : id === 'demo' || !expandable || (id === 'sources' && state === 'open')
          ? null
          : state === 'review'
            ? 'section.review'
            : 'section.open'
    return { id, state, expanded, expandable, summary, chipKey: extra.chipKey ?? null, linkKey }
  }
  const locked = (id: WorkspaceId, waitKey: string): WorkspaceSection =>
    section(id, 'locked', [{ key: waitKey }])
  const done = (id: WorkspaceId): WorkspaceState => (focus === id ? 'open' : 'done')

  // Sources: the links the seller pasted, read or not yet; never reviewed (#537). Its summary is counted from the
  // same row states its table draws.
  const sources = section(
    'sources',
    done('sources'),
    sourcesSummary({
      states: input.sources,
      researchDone: input.researchDone,
      researchMoving: input.researchMoving,
      researchedAt: input.researchedAt,
      locale
    })
  )

  // Business facts: the output of research. While research runs, and before it, it waits as a locked row.
  const fieldsLine = counted('section.meta.profile.fields', input.fields)
  const profile = input.researchMoving
    ? locked('profile', 'workspace.wait.research')
    : !input.researchDone
      ? locked('profile', 'section.meta.profile.waiting')
      : stepper.current === 'research' && stepper.review
        ? section('profile', 'review', [fieldsLine], { chipKey: 'stepper.needsReview' })
        : researchAgain
          ? locked('profile', 'stepper.lock.researchAgain')
          : section('profile', done('profile'), [
              fieldsLine,
              ...dated('workspace.sum.approved', shortDate(research?.approvedAt ?? research?.doneAt, locale))
            ])

  // Site content brief: the output of the second step.
  const briefLine: WorkspaceText = { key: 'section.meta.brief.number', params: { n: input.brief?.n ?? 1 } }
  const brief =
    input.researchMoving || !input.researchDone
      ? locked('brief', 'section.meta.profile.waiting')
      : researchAgain
        ? locked('brief', 'stepper.lock.researchAgain')
        : stepper.current === 'research'
          ? locked('brief', 'stepper.lock.profile')
          : input.briefEmpty === 'running'
            ? locked('brief', 'brief.beingWritten')
            : input.briefEmpty === 'failed'
              ? locked('brief', 'section.meta.brief.none')
              : input.brief === null
                ? locked('brief', 'workspace.wait.brief')
                : stepper.current === 'brief' && stepper.review
                  ? section('brief', 'review', [briefLine], { chipKey: 'stepper.needsReview' })
                  : section('brief', done('brief'), [
                      briefLine,
                      ...(stepper.current === 'brief'
                        ? []
                        : dated(
                            'workspace.sum.approved',
                            shortDate(briefStep?.approvedAt ?? briefStep?.doneAt, locale)
                          ))
                    ])

  // Your site: the outcome, with its actions once built.
  const demo =
    input.demo === 'ready'
      ? section('demo', done('demo'), [
          input.demoHost === null ? { key: 'section.meta.demo.ready' } : { text: input.demoHost },
          ...dated('workspace.sum.built', shortDate(buildStep?.doneAt, locale))
        ])
      : input.demo === 'failed' || input.demo === 'expired'
        ? section('demo', 'open', [])
        : input.demo === 'queued' || input.demo === 'building'
          ? locked('demo', 'site.notYet.building')
          : stepper.current === 'build'
            ? locked('demo', 'workspace.wait.build')
            : locked('demo', buildStep?.lockKey ?? 'workspace.wait.site')

  return [sources, profile, brief, demo]
}

/** The session storage key of the seller's open/closed choices for one opportunity. */
export const workspaceStoreKey = (opportunityId: string): string => `tracy-wo-workspace:${opportunityId}`

/** The stored choices, or none when the stored text is missing or not ours. */
export function readOpened(raw: string | null): Partial<Record<WorkspaceId, boolean>> {
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: Partial<Record<WorkspaceId, boolean>> = {}
    for (const id of WORKSPACE_IDS) {
      const v = (parsed as Record<string, unknown>)[id]
      if (typeof v === 'boolean') out[id] = v
    }
    return out
  } catch {
    return {}
  }
}
