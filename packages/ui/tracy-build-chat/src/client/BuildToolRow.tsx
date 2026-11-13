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

function titleOf(row: BuildToolRow, t: Translate): string {
  if (row.kind === 'research') {
    if (row.sources === 0) return t('tool.research.none')
    return t(row.sources === 1 ? 'tool.research.one' : 'tool.research.other', { count: row.sources })
  }
  return t(`tool.${row.kind}` as StringKey)
}

const ICONS = {
  research: IconSearchOutlineRegular,
  working: IconSparkleRegular,
  templates: IconChecklistOutlineRegular,
  plan: IconChecklistOutlineRegular,
  edit: IconChecklistOutlineRegular,
  stopped: IconWarningOutlineRegular
} as const

/** The row model of one call at its current stage; null draws nothing. */
export function toolRowOfView({ phase, block }: ToolViewProps): BuildToolRow | null {
  if (phase !== 'result') return { kind: 'working', step: 'status' }
  if (block.isError === true) return { kind: 'stopped' }
  const text = (block.content ?? []).find((b) => b?.type === 'text' && typeof b.text === 'string')?.text ?? ''
  return buildToolRowOf(block.call?.argsRaw ?? '{}', text)
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
        running={row.kind === 'working'}
        collapsedContent={
          row.kind === 'research' && row.business !== '' ? (
            <span className="tv-bc-toolrow-sum">{row.business}</span>
          ) : undefined
        }
      />
    </div>
  )
}
