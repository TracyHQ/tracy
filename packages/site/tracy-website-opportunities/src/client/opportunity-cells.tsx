/**
 * The My opportunities pieces still drawn on their own: the steps bar and the one next-action button.
 */
import type { JSX } from 'react'
import { ExternalLink, Hammer, Play, Search } from 'lucide-react'
import { Button, Spinner } from '@tracy/ui'

import { ACTION_VIEW, type NextAction, type OpportunityListRow, nextAction } from './opportunity-row.ts'
import type { Translate } from './strings.ts'

/** Five segments: done, the one running, the rest. */
export function StepsBar({ t, step, steps }: { t: Translate; step: number; steps: number }): JSX.Element {
  return (
    <span className="tracy-wo-steps" role="img" aria-label={t('research.step', { step, steps })}>
      {Array.from({ length: steps }, (_, i) => (
        <span key={i} data-state={i + 1 < step ? 'done' : i + 1 === step ? 'now' : undefined} />
      ))}
    </span>
  )
}

const ACTION_ICON: Readonly<Record<NextAction, typeof Play | null>> = {
  cancel: null,
  resume: Play,
  start: Search,
  build: Hammer,
  'open-site': ExternalLink,
  'open-demo-chat': ExternalLink,
  'retry-demo': Play,
  'send-demo': ExternalLink
}

/** The row's one next step; the consumer runs it (`onAction`). */
export function ActionButton({
  t,
  row,
  size = 'xs',
  busy = false,
  disabled = false,
  onAction
}: {
  t: Translate
  row: OpportunityListRow
  size?: 'xs' | 'sm'
  busy?: boolean
  disabled?: boolean
  onAction: (action: NextAction, row: OpportunityListRow) => void
}): JSX.Element {
  const action = nextAction(row)
  const view = ACTION_VIEW[action]
  const Icon = ACTION_ICON[action]
  return (
    <Button
      type="button"
      size={size}
      variant={view.variant}
      disabled={busy || disabled || (row.demoAction?.state === 'queued' && action !== 'open-demo-chat')}
      onClick={() => onAction(action, row)}
    >
      {busy ? <Spinner label={t(view.labelKey)} /> : Icon ? <Icon aria-hidden="true" /> : null}
      {t(row.demoAction?.state === 'queued' && action !== 'open-demo-chat' ? 'v3.building' : view.labelKey)}
    </Button>
  )
}
