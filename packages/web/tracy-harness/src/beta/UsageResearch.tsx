import { Card } from '@tracy/ui'
import { formatFixed, type T, Trans, useT } from '../i18n'
import { type SignalColumn, SignalTable } from './SignalTable'
import { formatNumber } from './signals-data'
import type { ResearchFigures, ResearchPayer, ResearchPurpose, Usage } from './usage-api'
import { outOf } from './usage-data'

const PURPOSE_KEYS: Record<ResearchPurpose, string> = {
  'menu-photos': 'beta.usage.research.purpose.menuPhotos',
  logo: 'beta.usage.research.purpose.logo',
  'picture-labels': 'beta.usage.research.purpose.pictureLabels',
  'demo-look': 'beta.usage.research.purpose.demoLook',
  other: 'beta.usage.research.purpose.other'
}
const PAYER_KEYS: Record<ResearchPayer, string> = {
  account: 'beta.usage.research.payer.account',
  public: 'beta.usage.research.payer.public',
  operator: 'beta.usage.research.payer.operator',
  campaign: 'beta.usage.research.payer.campaign',
  none: 'beta.usage.research.payer.none',
  unrecorded: 'beta.usage.research.payer.unrecorded'
}

type Row = ResearchFigures & { key: string; label: string }

const cents = (value: number) => `$${formatFixed(value / 100, 2)}`
const tokens = (t: T, row: ResearchFigures) =>
  row.tokens?.total == null ? (
    <span className="signals-zero">{t('beta.common.notRecorded')}</span>
  ) : (
    formatNumber(row.tokens.total)
  )
const median = (t: T, row: ResearchFigures) =>
  !row.measuredRequests ? (
    <span className="signals-zero">{t('beta.common.notRecorded')}</span>
  ) : row.perRequest.median === null ? (
    <span className="signals-zero">{t('beta.usage.tokens.needs20')}</span>
  ) : (
    formatNumber(row.perRequest.median)
  )
const coverage = (t: T, row: ResearchFigures) => {
  const measured = outOf(t, 'beta.usage.tokens.measuredOn', row.measuredRequests, row.requests)
  return row.partialRequests
    ? t('beta.usage.tokens.withPartial', { measured, partial: formatNumber(row.partialRequests) })
    : measured
}

const columns = (t: T, first: string): SignalColumn<Row>[] => [
  {
    key: 'label',
    label: first,
    value: (row) => row.label,
    render: (row) => <span className="signals-primary">{row.label}</span>
  },
  { key: 'requests', label: t('beta.usage.column.requests'), numeric: true, value: (row) => row.requests },
  {
    key: 'tokens',
    label: t('beta.usage.column.tokens'),
    help: t('beta.usage.research.definition'),
    numeric: true,
    value: (row) => row.tokens?.total ?? null,
    render: (row) => (
      <span>
        {tokens(t, row)}
        <small>{coverage(t, row)}</small>
      </span>
    )
  },
  {
    key: 'reasoning',
    label: t('beta.usage.research.reasoning'),
    numeric: true,
    value: (row) => row.tokens?.reasoning ?? null,
    render: (row) =>
      row.tokens?.reasoning == null ? (
        <span className="signals-zero">{t('beta.usage.research.notReported')}</span>
      ) : (
        formatNumber(row.tokens.reasoning)
      )
  },
  {
    key: 'median',
    label: t('beta.usage.tokens.perRequest'),
    help: t('beta.usage.research.medianHelp'),
    numeric: true,
    value: (row) => row.perRequest.median,
    render: (row) => median(t, row)
  },
  {
    key: 'cents',
    label: t('beta.usage.research.cost'),
    numeric: true,
    value: (row) => row.cents,
    render: (row) => cents(row.cents)
  }
]

export function UsageResearch({ body }: { body: Usage }) {
  const t = useT()
  const research = body.research
  if (!research) return null
  const rowsOf = <K extends string>(groups: Partial<Record<K, ResearchFigures>>, keys: Record<K, string>) =>
    (Object.keys(keys) as K[])
      .filter((key) => groups[key])
      .map((key) => ({ ...(groups[key] as ResearchFigures), key, label: t(keys[key]) }))
  const purposes = rowsOf(research.byPurpose, PURPOSE_KEYS)
  const payers = rowsOf(research.byPayer, PAYER_KEYS)
  const accounts = research.accounts.map((a) => ({ ...a, key: a.email, label: a.email }))
  return (
    <Card className="signals-panel" data-usage-block="research">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.research.title')}</h2>
        <span>
          {outOf(t, 'beta.usage.research.measured', research.all.measuredRequests, research.all.requests)}
        </span>
      </div>
      <p className="signals-panel-sub" title={t('beta.usage.research.definition')}>
        <Trans
          i18nKey="beta.usage.research.sub"
          values={{ cost: cents(research.all.cents) }}
          components={{ tokens: <>{tokens(t, research.all)}</>, median: <>{median(t, research.all)}</> }}
        />
      </p>
      {research.all.requests === 0 ? (
        <p className="signals-empty">{t('beta.usage.research.empty')}</p>
      ) : (
        <>
          <SignalTable
            id="usage-research-purpose"
            columns={columns(t, t('beta.usage.research.whatFor'))}
            rows={purposes}
            rowKey={(r) => r.key}
            defaultSort="requests"
          />
          <SignalTable
            id="usage-research-payer"
            columns={columns(t, t('beta.usage.research.countedAgainst'))}
            rows={payers}
            rowKey={(r) => r.key}
            defaultSort="requests"
          />
          {accounts.length > 0 && (
            <SignalTable
              id="usage-research-accounts"
              columns={columns(t, t('beta.usage.research.account'))}
              rows={accounts}
              rowKey={(r) => r.key}
              defaultSort="tokens"
              search={{ label: t('beta.usage.research.searchAccount'), match: (row) => row.email }}
            />
          )}
        </>
      )}
    </Card>
  )
}
