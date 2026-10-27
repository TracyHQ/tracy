/**
 * A public Find row's research: Research, its steps while it runs, then Build demo (through sign-in) and
 * Research again (Tracy pays; the same preview as the place card).
 */
import type { JSX } from 'react'
import { interfaceLocale } from '@tracy/core/interface-languages'
import { Button, Spinner } from '@tracy/ui'
import type { PlaceRow } from '@tracy/wo-views'

import { StepsBar } from './opportunity-cells.tsx'
import { researchStep } from './opportunity-row.ts'
import { type PublicResearch, publicResearchRefusalKey } from './public-research.ts'
import type { Translate } from './strings.ts'
import type { Answer } from './api.ts'
import { ResearchAgainButton, useResearchAgain } from './research-again-dialog.tsx'

export interface PublicResearchActions {
  states: Readonly<Record<string, PublicResearch>>
  onResearch(row: PlaceRow): void
  onBuild(row: PlaceRow): void
  /** Research again on a researched row; absent: no button. */
  again?: {
    preview(placeId: string): Promise<Answer<unknown>>
    start(placeId: string): Promise<{ ok: true } | { ok: false; code: string }>
  }
}

/** Research again on one researched row: the plan is asked on the first press, not for every row shown. */
function PublicAgain({
  t,
  row,
  again
}: {
  t: Translate
  row: PlaceRow
  again: NonNullable<PublicResearchActions['again']>
}): JSX.Element | null {
  const control = useResearchAgain({
    key: `${row.providerId}:${row.research?.researchedAt ?? ''}`,
    eager: false,
    load: () => again.preview(row.providerId),
    start: () => again.start(row.providerId)
  })
  return (
    <ResearchAgainButton t={t} locale={interfaceLocale() ?? undefined} name={row.name} control={control} />
  )
}

export function PublicResearchCell({
  t,
  row,
  actions
}: {
  t: Translate
  row: PlaceRow
  actions: PublicResearchActions
}): JSX.Element {
  const r = actions.states[row.providerId]
  const moving = r?.state === 'asking' || r?.state === 'queued' || r?.state === 'running'
  if (row.research && !moving) {
    const again = actions.again ? <PublicAgain t={t} row={row} again={actions.again} /> : null
    if (!row.research.canBuild)
      return (
        <div className="tracy-wo-research">
          <span className="tracy-wo-small tracy-wo-muted">{t('public.research.notEnough')}</span>
          {again}
        </div>
      )
    return (
      <div className="tracy-wo-research">
        <Button type="button" size="xs" variant="outline" onClick={() => actions.onBuild(row)}>
          {t('public.build')}
        </Button>
        {again}
      </div>
    )
  }
  if (r?.state === 'asking' || r?.state === 'queued')
    return (
      <span className="tracy-wo-row">
        <Spinner label={t('research.waiting')} />
        <span className="tracy-wo-small">{t('research.waiting')}</span>
      </span>
    )
  if (r?.state === 'running') {
    const step = researchStep(r.stage)
    return (
      <div className="tracy-wo-research">
        <span className="tracy-wo-row">
          <Spinner label={t(step.stageKey)} />
          <span className="tracy-wo-small">{t(step.stageKey)}</span>
        </span>
        <StepsBar t={t} step={step.step} steps={step.steps} />
        <span className="tracy-wo-muted tracy-wo-small">
          {t('research.step', { step: step.step, steps: step.steps })}
        </span>
      </div>
    )
  }
  if (r?.state === 'stopped')
    return <span className="tracy-wo-small tracy-wo-muted">{t('public.research.stopped')}</span>
  const refusal = r?.state === 'refused' ? publicResearchRefusalKey(r.code) : null
  // Limits and the budget send the visitor to sign in; anything else may be pressed again.
  if (refusal !== null && refusal !== 'public.research.failed')
    return <span className="tracy-wo-small tracy-wo-muted">{t(refusal)}</span>
  return (
    <div className="tracy-wo-research">
      <Button type="button" size="xs" variant="outline" onClick={() => actions.onResearch(row)}>
        {t('public.research')}
      </Button>
      {refusal !== null && <span className="tracy-wo-small tracy-wo-muted">{t(refusal)}</span>}
    </div>
  )
}
