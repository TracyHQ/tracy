import { type T, useT } from '../i18n'
import { formatNumber } from './signals-data'
import type { TokenCoverage } from './usage-api'
import { outOf } from './usage-data'

/** What a token count includes; read at render so it follows the language. */
export const tokenDefinition = (t: T) => t('beta.usage.tokens.definition')
export const tokenMissing = (t: T) => t('beta.usage.tokens.missing')
export const tokenMedianHelp = (t: T) => t('beta.usage.tokens.medianHelp')

export function tokenCoverageLabel(t: T, coverage: TokenCoverage) {
  const measured = outOf(t, 'beta.usage.tokens.measuredOn', coverage.measuredRequests, coverage.requests)
  return coverage.partialRequests
    ? t('beta.usage.tokens.withPartial', { measured, partial: formatNumber(coverage.partialRequests) })
    : measured
}

export function TokenValue({ value, requests }: { value: number | null; requests: number }) {
  const t = useT()
  if (!requests)
    return (
      <span className="signals-chip signals-status-pill" data-tone="neutral">
        {t('beta.usage.tokens.notUsed')}
      </span>
    )
  if (value === null)
    return (
      <span className="signals-zero" title={tokenMissing(t)}>
        {t('beta.common.notRecorded')}
      </span>
    )
  return <span>{formatNumber(value)}</span>
}

export function TokenMedian({ value, coverage }: { value: number | null; coverage: TokenCoverage }) {
  const t = useT()
  if (!coverage.requests || !coverage.measuredRequests)
    return <TokenValue value={null} requests={coverage.requests} />
  return value === null ? (
    <span className="signals-zero" title={tokenMedianHelp(t)}>
      {t('beta.usage.tokens.needs20')}
    </span>
  ) : (
    <span title={tokenMedianHelp(t)}>{formatNumber(value)}</span>
  )
}
