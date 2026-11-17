/**
 * The row that stands for one `tracy_build` call in the conversation (#609), in place of dsh's generic tool card,
 * which would show the owner the call's JSON. One quiet line in dsh's own process row (`DisclosureRow`): what the
 * step does or did, in plain words. An answer meant only for the model (refused, stale, idle) draws nothing. The
 * cards themselves are drawn at the turn's tail (`tails.tsx`).
 *
 * One progress block per working step (#575, the build chat mock, screen 2): the row of the call that waits is the
 * block, its title the step the engine really runs and one line per link under it, updated in place. A call that a
 * later call carried on draws nothing (`call-supersede.ts`), and a finished research settles into one done line,
 * "Read 3 sources" with the business, that opens to show what each link gave.
 */
import {
  DisclosureRow,
  IconChecklistOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  IconWarningOutlineRegular
} from '@deepseek-ai/dsh-client-ui-primitives'
import { type BuildToolRow, buildToolRowOf } from '@tracy/core/build-chat'
import { useSyncExternalStore } from 'react'
import { rowAfterSupersede, type SupersededCalls } from './call-supersede'
import { type EngineFeed, type EngineSeen, rowOfRunning } from './engine-feed'
import { LinkReadLines } from './LinkReadLines'
import { ResearchDone } from './ResearchDone'
import type { StringKey, Translate } from './strings'

/** The call as dsh's tool tree hands it to a keyed tool view (`tool.call.toolview`). */
export interface ToolViewProps {
  /** The call's id, the same at every stage (dsh's owner props). */
  callId?: string
  phase: 'preparing' | 'start' | 'result'
  block: {
    argsRaw?: string
    call?: { argsRaw: string } | null
    content?: readonly { type?: string; text?: string }[]
    isError?: boolean
  }
}

const noop = () => {}

/** What a call that still works is doing, by its step; a step with no title of its own works on the plan. */
const WORKING_TITLES: Readonly<Record<string, StringKey>> = {
  // The engine's own steps (`engine-feed.ts`): the brand step, compose and a change request all work on the plan.
  brand: 'tool.working',
  compose: 'tool.working',
  revise: 'tool.working',
  templates: 'tool.working.templates',
  build: 'tool.working.build',
  'start-over': 'tool.working.startOver'
}

export function titleOf(row: BuildToolRow, t: Translate): string {
  if (row.kind === 'research') {
    // A research finished on a later status call names its links in the answer, not in that call's arguments.
    const sources = Math.max(row.sources, row.links.length)
    if (sources === 0) return t('tool.research.none')
    return t(sources === 1 ? 'tool.research.one' : 'tool.research.other', { count: sources })
  }
  if (row.kind === 'waiting') return t('tool.waiting.place')
  if (row.kind === 'working') {
    // Research reads the owner's links (a `status` call waiting on it carries the same lines), or their words alone.
    if (row.step === 'research' || row.links.length > 0)
      return t(row.links.length > 0 ? 'tool.working.research' : 'tool.working.about')
    return t(WORKING_TITLES[row.step] ?? 'tool.working')
  }
  return t(`tool.${row.kind}` as StringKey)
}

const ICONS = {
  research: IconSearchOutlineRegular,
  waiting: IconSearchOutlineRegular,
  working: IconSparkleRegular,
  templates: IconChecklistOutlineRegular,
  plan: IconChecklistOutlineRegular,
  edit: IconChecklistOutlineRegular,
  stopped: IconWarningOutlineRegular
} as const

/** The row model of one call at its current stage; null draws nothing. */
export function toolRowOfView({ phase, block }: ToolViewProps): BuildToolRow | null {
  // While the call runs its own arguments say which links research reads (one `reading` line each).
  if (phase !== 'result') {
    const row = buildToolRowOf(block.call?.argsRaw ?? block.argsRaw ?? '{}', null)
    return row?.kind === 'working' ? row : { kind: 'working', step: 'status', links: [] }
  }
  if (block.isError === true) return { kind: 'stopped' }
  const text = (block.content ?? []).find((b) => b?.type === 'text' && typeof b.text === 'string')?.text ?? ''
  return buildToolRowOf(block.call?.argsRaw ?? '{}', text)
}

/** The language an answered call names for its cards (`chatLanguage`), or null. */
export function languageOfView({ phase, block }: ToolViewProps): string | null {
  if (phase !== 'result') return null
  const text = (block.content ?? []).find((b) => b?.type === 'text' && typeof b.text === 'string')?.text ?? ''
  try {
    const language = JSON.parse(text)?.chatLanguage
    return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : null
  } catch {
    return null
  }
}

export function BuildToolRow({
  view,
  t,
  engine,
  superseded
}: {
  view: ToolViewProps
  t: Translate
  /** The engine's running step, read while this call waits (`engine-feed.ts`); none reads only the call itself. */
  engine?: EngineFeed | undefined
  /** The calls a later build call carried on (`call-supersede.ts`); none keeps every row. */
  superseded?: SupersededCalls | undefined
}) {
  // A call that still waits reads the engine; a settled one asks whether a later call carried it on.
  if (view.phase !== 'result')
    return engine ? (
      <LiveBuildToolRow view={view} t={t} engine={engine} />
    ) : (
      <RowOf view={view} t={t} live={null} />
    )
  if (superseded && view.callId)
    return <SettledBuildToolRow view={view} t={t} superseded={superseded} callId={view.callId} />
  return <RowOf view={view} t={t} live={null} />
}

/** The row of a waiting call, redrawn each time the engine's running step changes. */
function LiveBuildToolRow({ view, t, engine }: { view: ToolViewProps; t: Translate; engine: EngineFeed }) {
  const live = useSyncExternalStore(engine.subscribe, engine.read, () => null)
  return <RowOf view={view} t={t} live={live} />
}

/** The row of an answered call, gone once a later call carried its step on. */
function SettledBuildToolRow({
  view,
  t,
  superseded,
  callId
}: {
  view: ToolViewProps
  t: Translate
  superseded: SupersededCalls
  callId: string
}) {
  const gone = useSyncExternalStore(
    superseded.subscribe,
    () => superseded.has(callId),
    () => false
  )
  return <RowOf view={view} t={t} live={null} gone={gone} />
}

function RowOf({
  view,
  t,
  live,
  gone = false
}: {
  view: ToolViewProps
  t: Translate
  live: EngineSeen | null
  gone?: boolean
}) {
  const own = toolRowOfView(view)
  const row = rowAfterSupersede(own === null ? null : rowOfRunning(own, live), gone)
  if (row === null) return null
  // A finished research is one done line that opens to its links (`ResearchDone`).
  if (row.kind === 'research' && row.links.length > 0)
    return (
      <div className="tv-bc-toolrow" data-build-tool={row.kind}>
        <ResearchDone title={titleOf(row, t)} business={row.business} links={row.links} t={t} />
      </div>
    )
  const Icon = ICONS[row.kind]
  return (
    <div className="tv-bc-toolrow" data-build-tool={row.kind}>
      <DisclosureRow
        icon={<Icon size={14} />}
        title={titleOf(row, t)}
        open={false}
        expandable={false}
        onToggle={noop}
        // A call answered `running` is settled in the history: a later `status` call carries the wait on.
        running={row.kind === 'working' && view.phase !== 'result'}
        collapsedContent={
          row.kind === 'research' && row.business !== '' ? (
            <span className="tv-bc-toolrow-sum">{row.business}</span>
          ) : undefined
        }
      />
      {row.kind === 'research' || row.kind === 'working' || row.kind === 'waiting' ? (
        <LinkReadLines links={row.links} t={t} />
      ) : null}
    </div>
  )
}
