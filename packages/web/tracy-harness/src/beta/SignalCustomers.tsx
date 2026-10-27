import { Card } from '@tracy/ui'
import { type T, Trans, useT } from '../i18n'
import { ViewAsUserButton } from '../ViewAsUserButton'
import type { Customer, CustomerSite, Customers } from './api'
import { SignalHoverCard } from './SignalHoverCard'
import { SignalSource, signalChannel } from './SignalPeople'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsNote } from './StatisticsNote'
import { formatNumber, shortDay } from './signals-data'
import { counted, exactText, relativeText } from './strings'

const stateTones: Record<CustomerSite['state'], string> = {
  built: 'positive',
  stuck: 'negative',
  deleted: 'neutral',
  pending: 'warning'
}
const STATE_KEYS: Record<CustomerSite['state'], string> = {
  built: 'beta.signals.state.built',
  stuck: 'beta.signals.state.stuck',
  deleted: 'beta.signals.state.deleted',
  pending: 'beta.signals.state.pending'
}
const WORST_KEYS: Record<CustomerSite['state'], string> = {
  stuck: 'beta.signals.customers.someFailing',
  pending: 'beta.signals.customers.someInProgress',
  deleted: 'beta.signals.customers.someDeleted',
  built: 'beta.signals.customers.someReady'
}
const KIND_KEYS: Record<string, string> = {
  created: 'beta.signals.customers.kindCreated',
  imported: 'beta.signals.customers.kindImported'
}
/** The agent's change codes (`site.edit` `action`); an unknown code shows as itself. */
const ACTION_KEYS: Record<string, string> = {
  'content.update': 'beta.signals.customers.actionContentUpdate',
  'content.delete': 'beta.signals.customers.actionContentDelete',
  'content.contract': 'beta.signals.customers.actionContentContract',
  'extension.enable': 'beta.signals.customers.actionExtensionEnable'
}

function SiteState({ state, live = false }: { state: CustomerSite['state']; live?: boolean }) {
  const t = useT()
  return (
    <span className="signals-chip signals-status-pill" data-tone={stateTones[state] || 'neutral'}>
      <i className="signals-dot" aria-hidden="true" />
      {t(STATE_KEYS[state])}
      {live && state === 'built' ? ` · ${t('beta.signals.customers.live')}` : ''}
    </span>
  )
}

function worstState(sites: CustomerSite[]): CustomerSite['state'] {
  const states: CustomerSite['state'][] = ['stuck', 'pending', 'deleted', 'built']
  return states.find((state) => sites.some((site) => site.state === state)) ?? 'built'
}

function Sites({ customer }: { customer: Customer }) {
  const t = useT()
  if (!customer.sites.length)
    return <span className="signals-zero">{t('beta.signals.customers.noSite')}</span>
  const state = worstState(customer.sites)
  return (
    <SignalHoverCard
      label={t('beta.signals.customers.sitesFor', { email: customer.email })}
      summary={
        customer.sites.length === 1 ? (
          <SiteState state={customer.sites[0].state} />
        ) : (
          <span className="signals-chip signals-status-pill" data-tone={stateTones[state]}>
            <i className="signals-dot" aria-hidden="true" />
            {t(WORST_KEYS[state], {
              n: customer.sites.filter((site) => site.state === state).length,
              total: customer.sites.length
            })}
          </span>
        )
      }
    >
      {customer.sites.map((site) => (
        <div className="signals-hover-item" key={`${site.siteKey}:${site.startedAt}`}>
          <strong>{site.siteKey}</strong>
          <p>
            {site.platform || t('beta.signals.customers.unknownCms')} ·{' '}
            {KIND_KEYS[site.kind] ? t(KIND_KEYS[site.kind]) : site.kind} ·{' '}
            <SiteState state={site.state} live={site.live} />
            {site.live && site.state !== 'built' ? ` · ${t('beta.signals.customers.live')}` : ''}
          </p>
          <p>
            <Trans
              i18nKey={
                site.kind === 'imported'
                  ? 'beta.signals.customers.importedAt'
                  : 'beta.signals.customers.createdAt'
              }
              values={{ time: relativeText(t, site.startedAt) }}
              components={{ time: <time dateTime={site.startedAt} title={exactText(t, site.startedAt)} /> }}
            />
            {' · '}
            {t('beta.signals.customers.failures', counted(site.failures))}
          </p>
        </div>
      ))}
    </SignalHoverCard>
  )
}

function Changes({ row }: { row: Customer }) {
  const t = useT()
  return (
    <SignalHoverCard
      label={t('beta.signals.customers.changesFor', { email: row.email })}
      summary={<span className="signals-primary signals-changes-count">{formatNumber(row.edits.done)}</span>}
    >
      <p>
        {t('beta.signals.customers.failedUndone', { failed: row.edits.failed, undone: row.edits.undone })}
      </p>
      {row.edits.editUnknown !== undefined && (
        <p>{t('beta.signals.customers.editUnknown', counted(row.edits.editUnknown))}</p>
      )}
      {row.edits.undoFailed !== undefined && row.edits.undoUnknown !== undefined && (
        <p>
          {t('beta.signals.customers.undoFailed', counted(row.edits.undoFailed))} ·{' '}
          {t('beta.signals.customers.undoUnknown', counted(row.edits.undoUnknown))}
        </p>
      )}
      {Object.entries(row.edits.actions).map(([key, value]) => (
        <p key={key}>
          {ACTION_KEYS[key] ? t(ACTION_KEYS[key]) : key}: {value}
        </p>
      ))}
    </SignalHoverCard>
  )
}

function Requests({ row }: { row: Customer }) {
  const t = useT()
  return (
    <span className="signals-request-cell">
      <span className="signals-request-value">{formatNumber(row.requests)}</span>
      {row.requests > 0 && row.lastRequestAt && (
        <small>
          <Trans
            i18nKey="beta.signals.customers.lastRequest"
            values={{ time: relativeText(t, row.lastRequestAt) }}
            components={{
              time: <time dateTime={row.lastRequestAt} title={exactText(t, row.lastRequestAt)} />
            }}
          />
        </small>
      )}
    </span>
  )
}

function Tokens({ row }: { row: Customer }) {
  const t = useT()
  return (
    <span title={t('beta.signals.customers.tokensHelp')}>
      {row.requests === 0 ? (
        <span className="signals-chip signals-status-pill" data-tone="neutral">
          {t('beta.signals.customers.notUsed')}
        </span>
      ) : row.tokens === null ? (
        <span className="signals-zero" title={t('beta.signals.customers.tokensMissing')}>
          {t('beta.common.notRecorded')}
        </span>
      ) : (
        <>
          {formatNumber(row.tokens)}
          {row.tokenCoverage && (
            <small>
              {' '}
              {t('beta.signals.customers.tokenCoverage', {
                ...counted(row.requests),
                measured: formatNumber(row.tokenCoverage.measuredTurns)
              })}
              {row.tokenCoverage.partialTurns
                ? ` · ${t('beta.signals.customers.tokenPartial', { n: row.tokenCoverage.partialTurns })}`
                : ''}
            </small>
          )}
        </>
      )}
    </span>
  )
}

function ActiveDays({ row }: { row: Customer }) {
  const t = useT()
  return (
    <SignalHoverCard
      label={t('beta.signals.customers.activeFor', { email: row.email })}
      summary={<span className="signals-primary signals-active-count">{row.activeDays.length}</span>}
    >
      <div>{row.activeDays.map((day) => shortDay(day)).join(', ')}</div>
    </SignalHoverCard>
  )
}

function FirstSignIn({ row }: { row: Customer }) {
  const t = useT()
  return (
    <time dateTime={row.firstSignInAt} title={exactText(t, row.firstSignInAt)}>
      {relativeText(t, row.firstSignInAt)}
    </time>
  )
}

/** The customers table's columns, worded in the language on screen. */
export const customerColumns = (t: T): SignalColumn<Customer>[] => [
  {
    key: 'email',
    label: t('beta.signals.customers.customer'),
    value: (row) => row.email,
    render: (row) => (
      <span className="signals-primary signals-customer-email" title={row.email}>
        {row.email}
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
    key: 'firstSignInAt',
    label: t('beta.signals.customers.firstSignIn'),
    value: (row) => row.firstSignInAt,
    render: (row) => <FirstSignIn row={row} />
  },
  {
    key: 'sites',
    label: t('beta.signals.customers.sites'),
    numeric: true,
    accent: 'var(--signals-sites)',
    value: (row) => row.sites.length,
    render: (row) => <Sites customer={row} />
  },
  {
    key: 'changes',
    label: t('beta.signals.customers.changes'),
    help: t('beta.signals.customers.changesHelp'),
    numeric: true,
    value: (row) => row.edits.done,
    render: (row) => <Changes row={row} />
  },
  {
    key: 'days',
    label: t('beta.signals.customers.daysActive'),
    help: t('beta.signals.customers.daysActiveHelp'),
    numeric: true,
    value: (row) => row.activeDays.length,
    render: (row) => (row.activeDays.length > 0 ? <ActiveDays row={row} /> : 0)
  },
  {
    key: 'requests',
    label: t('beta.signals.customers.requests'),
    help: t('beta.signals.customers.requestsHelp'),
    numeric: true,
    value: (row) => row.requests,
    render: (row) => <Requests row={row} />
  },
  {
    key: 'tokens',
    label: t('beta.signals.customers.tokens'),
    help: t('beta.signals.customers.tokensHelp'),
    numeric: true,
    value: (row) => row.tokens,
    sortLast: (row) => row.requests === 0,
    render: (row) => <Tokens row={row} />
  }
]
export function SignalCustomers({
  customers,
  error,
  loading
}: {
  customers: Customers | null
  error: string | null
  loading: boolean
}) {
  const t = useT()
  const rows = customers?.rows || []
  return (
    <Card className="signals-panel">
      <div className="signals-panel-header">
        <h2>{t('beta.signals.customers.title')}</h2>
        <span>
          {customers
            ? t('beta.signals.customers.shownOf', {
                ...counted(customers.total),
                shown: formatNumber(rows.length)
              })
            : t('beta.signals.customers.reading')}
        </span>
      </div>
      <p className="signals-panel-sub">{t('beta.signals.customers.sub')}</p>
      <SignalTable
        id="customers"
        columns={customerColumns(t)}
        rows={rows}
        total={customers?.total}
        rowKey={(row) => row.email}
        needsAttention={(row) => row.sites.some((site) => site.state === 'stuck')}
        defaultSort="firstSignInAt"
        search={{
          label: t('beta.signals.customers.search'),
          match: (row) => [row.email, ...row.sites.map((site) => site.siteKey)].join(' ')
        }}
        loading={loading || !customers}
        error={error}
      />
      <StatisticsNote>{t('beta.signals.customers.note')}</StatisticsNote>
    </Card>
  )
}
