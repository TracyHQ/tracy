import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import { type SignalColumn, SignalTable } from './SignalTable'
import type { Platform, TokenFigures, Usage } from './usage-api'
import { cmsLabel, usagePlatforms } from './usage-data'
import { TokenMedian, TokenValue, tokenCoverageLabel, tokenDefinition, tokenMedianHelp } from './usage-tokens'

type CmsTokens = { cms: Platform; tokens: TokenFigures }
export function UsageTokenCms({ body, cms }: { body: Usage; cms: Platform }) {
  const t = useT()
  const rows: CmsTokens[] = usagePlatforms(body, cms).map((platform) => ({
    cms: platform,
    tokens: body.turns[platform].tokens ?? {
      total: null,
      requests: body.turns[platform].turns,
      measuredRequests: 0,
      partialRequests: 0,
      perRequest: { n: 0, median: null, p90: null }
    }
  }))
  const columns: SignalColumn<CmsTokens>[] = [
    {
      key: 'cms',
      label: t('beta.usage.column.cms'),
      help: t('beta.usage.tokens.cmsHelp'),
      value: (row) => cmsLabel(t, row.cms)
    },
    {
      key: 'requests',
      label: t('beta.usage.column.requests'),
      help: t('beta.usage.tokens.cmsRequestsHelp'),
      numeric: true,
      value: (row) => row.tokens.requests
    },
    {
      key: 'tokens',
      label: t('beta.usage.column.tokens'),
      help: tokenDefinition(t),
      numeric: true,
      value: (row) => row.tokens.total,
      render: (row) => <TokenValue value={row.tokens.total} requests={row.tokens.requests} />
    },
    {
      key: 'median',
      label: t('beta.usage.tokens.perRequest'),
      help: tokenMedianHelp(t),
      numeric: true,
      value: (row) => row.tokens.perRequest.median,
      render: (row) => <TokenMedian value={row.tokens.perRequest.median} coverage={row.tokens} />
    },
    {
      key: 'coverage',
      label: t('beta.usage.column.coverage'),
      help: t('beta.usage.tokens.cmsCoverageHelp'),
      numeric: true,
      value: (row) => row.tokens.measuredRequests,
      render: (row) => tokenCoverageLabel(t, row.tokens)
    }
  ]
  return (
    <Card className="signals-panel" data-usage-block="tokens-cms">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.tokens.byCms')}</h2>
        <span>{cms === 'all' ? t('beta.usage.allPlatforms') : cmsLabel(t, cms)}</span>
      </div>
      <p className="signals-panel-sub" title={tokenDefinition(t)}>
        {t('beta.usage.tokens.byCmsSub')}
      </p>
      <SignalTable
        id="usage-tokens-cms"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.cms}
        defaultSort="tokens"
      />
    </Card>
  )
}
