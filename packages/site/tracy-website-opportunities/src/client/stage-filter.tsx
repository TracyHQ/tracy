/**
 * The stage bar over My opportunities, the same look as `/ops/ci`'s PR filters: All · 1. New ·
 * 2. Researching · 3. Researched · 4. Brief ready · 5. Demo built · Cancelled, and Attention (runs
 * that stopped and wait for the customer) pushed to the right. Counts come from the server.
 */
import type { JSX } from 'react'
import { CircleAlert } from 'lucide-react'
import { Button } from '@tracy/ui'
import { cn } from '@tracy/ui/cn'

import type { Stage } from './opportunity-row.ts'
import type { Translate } from './strings.ts'

export type StageFilterValue = 'all' | Stage | 'attention'
export type StageCounts = Partial<Record<StageFilterValue, number>>

/** Button order, with the step number each of the five stages shows. */
const FILTERS: ReadonlyArray<{ value: Exclude<StageFilterValue, 'attention'>; key: string; step?: number }> =
  [
    { value: 'all', key: 'kind.all' },
    { value: 'research', key: 'v3.research', step: 1 },
    { value: 'demo', key: 'columns.demo', step: 2 },
    { value: 'outreach', key: 'v3.outreach', step: 3 },
    { value: 'cancelled', key: 'status.cancelled' }
  ]

export function StageFilter({
  t,
  value,
  counts,
  onChange
}: {
  t: Translate
  value: StageFilterValue
  /** null while the first answer is on its way: counts read "—". */
  counts: StageCounts | null
  onChange: (value: StageFilterValue) => void
}): JSX.Element {
  const count = (v: StageFilterValue): number | null => (counts === null ? null : (counts[v] ?? 0))
  const attention = count('attention')
  const attentionOn = value === 'attention'
  return (
    <div className="tracy-wo-stages" role="group" aria-label={t('filter.label')}>
      {FILTERS.filter((f) => f.value !== 'cancelled').map((f) => {
        const on = value === f.value
        const n = count(f.value)
        return (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={on ? 'secondary' : 'ghost'}
            aria-pressed={on}
            className={cn('tracy-wo-stage', on && 'is-on', n === 0 && !on && 'is-zero')}
            onClick={() => onChange(f.value)}
          >
            {f.step ? <span className="tracy-wo-muted">{`${f.step}.`}</span> : null}
            {t(f.key)}
            <span className="tracy-wo-muted">{n ?? '—'}</span>
          </Button>
        )
      })}
      <span className="tracy-wo-stages-grow" aria-hidden="true" />
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-pressed={attentionOn}
        className={cn(
          'tracy-wo-stage tracy-wo-attn',
          attentionOn && 'is-on',
          attention === 0 && !attentionOn && 'is-zero'
        )}
        onClick={() => onChange('attention')}
      >
        <CircleAlert aria-hidden="true" />
        {t('filter.attention')}
        <span className={attention ? 'tracy-wo-attn-pill' : 'tracy-wo-muted'}>{attention ?? '—'}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="tracy-wo-stage"
        aria-pressed={value === 'cancelled'}
        onClick={() => onChange('cancelled')}
      >
        {t('status.cancelled')} <span className="tracy-wo-muted">{count('cancelled') ?? '—'}</span>
      </Button>
    </div>
  )
}
