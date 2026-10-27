import { Button } from '@tracy/ui'
import type { ReactNode } from 'react'
import { useT } from '../i18n/index.ts'
import { StatisticsNote } from './StatisticsNote'

/** Failed reads retain an explicit retry action. Empty table results are handled by each page. */
export function StatisticsReportStatus({ children, onRetry }: { children?: ReactNode; onRetry: () => void }) {
  const t = useT()
  return (
    <div className="signals-error" role="alert" data-report-error>
      {children}
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('appstat.retry')}
      </Button>
    </div>
  )
}

/** `activity` is a noun phrase already in the language on screen; the sentence around it is ours. */
export function StatisticsEmptyActivity({ days, activity }: { days: string | number; activity?: string }) {
  const t = useT()
  const period = days === '24h' ? '24h' : days === 'all' ? 'all' : 'period'
  return (
    <StatisticsNote standalone data-report-empty>
      {t(`appstat.empty.${period}`, { activity: activity ?? t('appstat.empty.activity') })}
    </StatisticsNote>
  )
}
