import { Card } from '@tracy/ui'
import { type T, useT } from '../i18n'
import { ViewAsUserButton } from '../ViewAsUserButton'
import type { SignIn } from './api'
import { SignalSource, signalChannel } from './SignalPeople'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsNote } from './StatisticsNote'
import { formatNumber, type SignalReport } from './signals-data'
import { counted, exactText, relativeText } from './strings'

const columns = (t: T): SignalColumn<SignIn>[] => [
  {
    key: 'at',
    label: t('beta.signals.latest.when'),
    value: (row) => row.at,
    render: (row) => (
      <time dateTime={row.at} title={exactText(t, row.at)}>
        {relativeText(t, row.at)}
      </time>
    )
  },
  {
    key: 'email',
    label: t('beta.signals.customers.customer'),
    value: (row) => row.email,
    render: (row) => (
      <span className="signals-primary signals-customer-email" title={row.email || t('beta.common.unknown')}>
        {row.email || t('beta.common.unknown')}
        <ViewAsUserButton email={row.email} />
      </span>
    )
  },
  {
    key: 'channel',
    label: t('beta.filters.channel'),
    value: (row) => signalChannel(t, row.source),
    render: (row) => <SignalSource source={row.source} />
  },
  {
    key: 'badge',
    label: t('beta.signals.latest.access'),
    help: t('beta.signals.latest.accessHelp'),
    value: (row) => row.badge,
    render: (row) => (
      <span
        className="signals-chip signals-status-pill"
        data-tone="neutral"
        title={row.badge === 'gate off' ? t('beta.signals.latest.gateOffHelp') : undefined}
      >
        {row.badge === 'gate off'
          ? t('beta.signals.latest.openAccess')
          : row.badge || t('beta.common.unknown')}
      </span>
    )
  },
  {
    key: 'plans',
    label: t('beta.signals.latest.plans'),
    value: (row) => row.plans.map((plan) => plan.name || plan.id).join(', '),
    render: (row) =>
      row.plans.length ? (
        row.plans.map((plan, index) => (
          <div key={`${plan.id}-${index}`}>
            {plan.name || plan.id}
            {plan.until && <small>{t('beta.signals.latest.until', { date: plan.until })}</small>}
          </div>
        ))
      ) : (
        <span className="signals-zero">{t('beta.signals.latest.noPlan')}</span>
      )
  },
  {
    key: 'via',
    label: t('beta.signals.latest.via'),
    value: (row) => row.via,
    render: (row) =>
      row.via === 'email_code' || row.via === 'email code'
        ? t('beta.signals.latest.emailCode')
        : row.via || <span className="signals-zero">{t('beta.common.unknown')}</span>
  }
]
export function SignalLatest({ report, loading }: { report: SignalReport; loading: boolean }) {
  const t = useT()
  return (
    <Card className="signals-panel">
      <div className="signals-panel-header">
        <h2>{t('beta.signals.latest.title')}</h2>
        <span>
          {t('beta.signals.latest.shownOf', {
            ...counted(report.latestTotal),
            shown: formatNumber(report.latest.length)
          })}
        </span>
      </div>
      <p className="signals-panel-sub">{t('beta.signals.latest.sub', counted(report.latestLimit))}</p>
      <SignalTable
        id="latest"
        columns={columns(t)}
        rows={report.latest}
        total={report.latestTotal}
        rowKey={(row) => `${row.at}-${row.email}`}
        defaultSort="at"
        search={{
          label: t('beta.signals.latest.search'),
          match: (row) => [row.email, ...Object.values(row.source || {})].join(' ')
        }}
        loading={loading}
      />
      <StatisticsNote>{t('beta.signals.latest.note')}</StatisticsNote>
    </Card>
  )
}
