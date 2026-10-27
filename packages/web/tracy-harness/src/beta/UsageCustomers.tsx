import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import { ViewAsUserButton } from '../ViewAsUserButton'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { counted, exactText, relativeText } from './strings'
import type { Usage, UsageCustomer } from './usage-api'
import { cmsLabel, customerStatus, outOf } from './usage-data'

export function UsageCustomers({ body }: { body: Usage }) {
  const t = useT()
  const rows = body.customers || []
  const number = (key: keyof UsageCustomer, label: string, help: string): SignalColumn<UsageCustomer> => ({
    key,
    label,
    help,
    numeric: true,
    value: (row) => Number(row[key]),
    render: (row) => (
      <span title={help}>
        {Number(row[key]) === 0 ? outOf(t, 'beta.usage.rate.requests', 0, row.requests) : Number(row[key])}
      </span>
    )
  })
  const columns: SignalColumn<UsageCustomer>[] = [
    {
      key: 'email',
      label: t('beta.usage.column.customer'),
      help: t('beta.usage.customers.customerHelp'),
      value: (row) => row.email,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.usage.customers.usageFor', { email: row.email })}
          summary={
            <span className="signals-primary signals-customer-email">
              {row.email}
              <ViewAsUserButton email={row.email} />
            </span>
          }
        >
          <p>
            {t('beta.usage.customers.sitesUsed', counted(row.siteCount))} ·{' '}
            {row.platforms.map((key) => cmsLabel(t, key)).join(', ') || t('beta.usage.customers.noCms')}
          </p>
          <p>
            {t('beta.usage.customers.followUps', counted(row.followUps))} ·{' '}
            {t('beta.usage.customers.reworks', { n: row.reworks })}
          </p>
          <p>{t('beta.usage.customers.notAProblem')}</p>
        </SignalHoverCard>
      )
    },
    {
      key: 'status',
      label: t('beta.usage.customers.activity'),
      help: t('beta.usage.customers.activityHelp'),
      value: (row) => customerStatus(t, row).label,
      render: (row) => (
        <span className="signals-chip signals-status-pill" data-tone={customerStatus(t, row).tone}>
          <i className="signals-dot" aria-hidden="true" />
          {customerStatus(t, row).label}
        </span>
      )
    },
    number('requests', t('beta.usage.column.requests'), t('beta.usage.customers.requestsHelp')),
    number('changed', t('beta.usage.column.siteChanged'), t('beta.usage.customers.changedHelp')),
    number('good', t('beta.usage.column.good'), t('beta.usage.customers.goodHelp')),
    number('bad', t('beta.usage.column.bad'), t('beta.usage.customers.badHelp')),
    number('undone', t('beta.usage.column.undone'), t('beta.usage.customers.undoneHelp')),
    number('followUps', t('beta.usage.customers.quickFollowUps'), t('beta.usage.customers.followUpsHelp')),
    number('reworks', t('beta.usage.column.sameItem'), t('beta.usage.customers.reworksHelp')),
    {
      key: 'lastRequestAt',
      label: t('beta.usage.column.lastRequest'),
      help: t('beta.usage.customers.lastHelp'),
      value: (row) => row.lastRequestAt,
      render: (row) =>
        row.lastRequestAt ? (
          <time dateTime={row.lastRequestAt} title={exactText(t, row.lastRequestAt)}>
            {relativeText(t, row.lastRequestAt)}
          </time>
        ) : (
          t('beta.common.notRecorded')
        )
    }
  ]
  return (
    <Card className="signals-panel" data-usage-block="customers">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.customers.title')}</h2>
        <span>
          {rows.length
            ? t('beta.usage.customers.people', counted(rows.length))
            : t('beta.usage.selectedDates')}
        </span>
      </div>
      <p className="signals-panel-sub">{t('beta.usage.customers.sub')}</p>
      <SignalTable
        id="usage-customers"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.email}
        defaultSort="requests"
        needsAttention={(row) => customerStatus(t, row).tone === 'warning'}
        search={{
          label: t('beta.usage.customers.search'),
          match: (row) => [row.email, ...row.platforms].join(' ')
        }}
      />
    </Card>
  )
}
