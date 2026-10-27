import { Badge, Spinner, Tooltip, TooltipContent, TooltipTrigger } from '@tracy/ui'

import { reasonLabel, reasonPoints, reasonShownAsWhy } from '../model.ts'
import type { Grade, PlaceRow, Translate } from '../types.ts'

const GRADE_VARIANT: Record<Grade, 'default' | 'secondary' | 'outline'> = {
  A: 'default',
  B: 'secondary',
  C: 'outline'
}

/** The reason worth most points, as the short "why" under the grade; none rather than a count Google never gave. */
function mainReason(row: PlaceRow) {
  const shown = row.score.reasons.filter(reasonShownAsWhy)
  let best = shown[0]
  for (const r of shown) if ((r[1] ?? 0) > (best?.[1] ?? 0)) best = r
  return best
}

/** Grade + score; hover or focus lists every reason with its points. */
export function ScoreCell({
  t,
  row,
  locale = 'en',
  hideWhy = false
}: {
  t: Translate
  row: PlaceRow
  locale?: string
  hideWhy?: boolean
}) {
  const { score, grade, pending, reasons } = row.score
  const why = mainReason(row)
  return (
    <div className="tracy-wo-cell">
      <Tooltip>
        <TooltipTrigger
          render={
            <span tabIndex={0} className="tracy-wo-score" aria-label={t('score.aria', { grade, score })} />
          }
        >
          <Badge variant={GRADE_VARIANT[grade]} className="tracy-wo-grade">
            {grade}
          </Badge>
          {score}
          {pending ? <Spinner label={t('score.stillChecking')} className="size-3" /> : null}
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="tracy-wo-tip flex-col items-stretch">
          <ul className="tracy-wo-tip-list">
            {reasons.map((r) => (
              <li key={r[0]}>
                <span>{reasonLabel(t, r, locale)}</span>
                <span>{reasonPoints(t, r, locale)}</span>
              </li>
            ))}
          </ul>
          <ul className="tracy-wo-tip-list tracy-wo-tip-total">
            <li>
              <span>{t(pending ? 'score.soFar' : 'score.total')}</span>
              <span>{t('score.outOf', { score })}</span>
            </li>
          </ul>
          {pending ? <p className="tracy-wo-tip-note">{t('score.pendingNote')}</p> : null}
        </TooltipContent>
      </Tooltip>
      {why && !hideWhy ? <span className="tracy-wo-why">{reasonLabel(t, why, locale)}</span> : null}
    </div>
  )
}
