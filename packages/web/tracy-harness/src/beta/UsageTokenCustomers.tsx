import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import { ViewAsUserButton } from '../ViewAsUserButton'
import { type SignalColumn, SignalTable } from './SignalTable'
import { counted, exactText, relativeText } from './strings'
import type { Usage, UsageCustomer } from './usage-api'
import { cmsLabel } from './usage-data'
import { TokenMedian, TokenValue, tokenCoverageLabel, tokenDefinition, tokenMedianHelp } from './usage-tokens'

export function UsageTokenCustomers({ body }: { body: Usage }) {
  const t = useT()
  const rows = body.tokenCustomers || []
  const coverage = (row: UsageCustomer) =>
    row.tokenCoverage ?? { requests: row.requests, measuredRequests: 0, partialRequests: 0 }
  const columns: SignalColumn<UsageCustomer>[] = [
    {
      key: 'email',
      label: t('beta.usage.column.customer'),
      help: t('beta.usage.tokenCustomers.customerHelp'),
      value: (row) => row.email,
      render: (row) => (
        <span className="signals-primary signals-customer-email" title={row.email}>
          {row.email}
          <ViewAsUserButton email={row.email} />
        </span>
      )
    },
    {
      key: 'requests',
      label: t('beta.usage.column.requests'),
      help: t('beta.usage.tokenCustomers.requestsHelp'),
      numeric: true,
      value: (row) => row.requests
    },
    {
      key: 'sitesChanged',
      label: t('beta.usage.tokenCustomers.sitesChanged'),
      help: t('beta.usage.tokenCustomers.sitesChangedHelp'),
      numeric: true,
      value: (row) => row.sitesChanged ?? 0
    },
    {
      key: 'tokens',
      label: t('beta.usage.column.tokens'),
      help: tokenDefinition(t),
      numeric: true,
      value: (row) => row.tokens ?? null,
      render: (row) => (
        <span title={tokenDefinition(t)}>
          <TokenValue value={row.tokens ?? null} requests={row.requests} />
          <small>{tokenCoverageLabel(t, coverage(row))}</small>
        </span>
      )
    },
    {
      key: 'tokensPerRequest',
      label: t('beta.usage.tokens.perRequest'),
      help: tokenMedianHelp(t),
      numeric: true,
      value: (row) => row.tokensPerRequest?.median ?? null,
      render: (row) => <TokenMedian value={row.tokensPerRequest?.median ?? null} coverage={coverage(row)} />
    },
    {
      key: 'lastRequestAt',
      label: t('beta.usage.column.lastRequest'),
      help: t('beta.usage.tokenCustomers.lastHelp'),
      value: (row) => row.lastRequestAt,
      render: (row) =>
        row.lastRequestAt ? (
          <time dateTime={row.lastRequestAt} title={exactText(t, row.lastRequestAt)}>
            {relativeText(t, row.lastRequestAt)}
          </time>
        ) : (
          <span className="signals-zero">{t('beta.common.notRecorded')}</span>
        )
    }
  ]
  return (
    <Card className="signals-panel" data-usage-block="token-customers">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.tokenCustomers.title')}</h2>
        <span>{t('beta.usage.tokenCustomers.count', counted(rows.length))}</span>
      </div>
      <p className="signals-panel-sub">{t('beta.usage.tokenCustomers.sub')}</p>
      <SignalTable
        id="usage-token-customers"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.email}
        defaultSort="tokens"
        search={{
          label: t('beta.usage.tokenCustomers.search'),
          match: (row) => [row.email, ...row.platforms.map((key) => cmsLabel(t, key))].join(' ')
        }}
      />
    </Card>
  )
}
