/**
 * The row that stands for one `tracy_build` call in the conversation (#609), in place of dsh's generic tool card,
 * which would show the owner the call's JSON. One quiet line in dsh's own process row (`DisclosureRow`): what the
 * step did, in plain words, and nothing to open. An answer meant only for the model (refused, stale, idle) draws
 * nothing. The cards themselves are drawn at the turn's tail (`tails.tsx`).
 */
import {
  DisclosureRow,
  IconChecklistOutlineRegular,
  IconSearchOutlineRegular,
  IconSparkleRegular,
  IconWarningOutlineRegular
} from '@deepseek-ai/dsh-client-ui-primitives'
import { buildToolRowOf, type BuildToolRow } from '@tracy/core/build-chat'
import { LinkReadLines } from './LinkReadLines'
import type { StringKey, Translate } from './strings'

/** The call as dsh's tool tree hands it to a keyed tool view (`tool.call.toolview`). */
export interface ToolViewProps {
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
  templates: 'tool.working.templates',
  build: 'tool.working.build',
  'start-over': 'tool.working.startOver'
}

function titleOf(row: BuildToolRow, t: Translate): string {
  if (row.kind === 'research') {
    if (row.sources === 0) return t('tool.research.none')
    return t(row.sources === 1 ? 'tool.research.one' : 'tool.research.other', { count: row.sources })
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

export function BuildToolRow({ view, t }: { view: ToolViewProps; t: Translate }) {
  const row = toolRowOfView(view)
  if (row === null) return null
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
