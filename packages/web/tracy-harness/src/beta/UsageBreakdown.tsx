import { Card } from '@tracy/ui'
import type { ReactNode } from 'react'
import { type T, useT } from '../i18n'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { counted } from './strings'
import type { Platform, Quantiles, Rate, TurnFigures, Usage } from './usage-api'
import { cmsLabel, duration, outOf, rateLabel, usagePlatforms } from './usage-data'

const unavailable = (t: T) => (
  <span className="signals-zero" title={t('beta.usage.breakdown.notRecordedHelp')}>
    {t('beta.usage.unavailable')}
  </span>
)
const share = (t: T, rate: Rate) => (
  <span
    title={
      rate.b
        ? outOf(t, 'beta.usage.breakdown.eligibleShare', rate.a, rate.b)
        : t('beta.usage.breakdown.noneEligible')
    }
  >
    {rateLabel(t, rate)}
  </span>
)
type CmsRow = { cms: Platform; figures: TurnFigures }
export function UsageCms({ body, cms }: { body: Usage; cms: Platform }) {
  const t = useT()
  const numeric = (
    key: string,
    label: string,
    help: string,
    value: (row: CmsRow) => number | null,
    render?: (row: CmsRow) => ReactNode
  ): SignalColumn<CmsRow> => ({ key, label, help, numeric: true, value, render })
  const zeroCount = (row: CmsRow, value: number, help: string) => (
    <span title={help}>
      {value === 0 ? outOf(t, 'beta.usage.rate.requests', 0, row.figures.turns) : value}
    </span>
  )
  const c = (key: string) => t(`beta.usage.cmsTable.${key}`)
  const columns: SignalColumn<CmsRow>[] = [
    {
      key: 'cms',
      label: t('beta.usage.column.cms'),
      help: c('cmsHelp'),
      value: (row) => cmsLabel(t, row.cms)
    },
    numeric('requests', t('beta.usage.column.requests'), c('requestsHelp'), (row) => row.figures.turns),
    numeric(
      'changed',
      t('beta.usage.column.siteChanged'),
      c('changedHelp'),
      (row) => row.figures.changes.changed,
      (row) => zeroCount(row, row.figures.changes.changed, c('changedCounted'))
    ),
    numeric(
      'good',
      t('beta.usage.column.good'),
      c('goodHelp'),
      (row) => row.figures.feedback.positive,
      (row) => zeroCount(row, row.figures.feedback.positive, c('goodCounted'))
    ),
    numeric(
      'bad',
      t('beta.usage.column.bad'),
      c('badHelp'),
      (row) => row.figures.feedback.negative,
      (row) => zeroCount(row, row.figures.feedback.negative, c('badCounted'))
    ),
    numeric(
      'unrated',
      t('beta.usage.sample.group.unrated'),
      c('unratedHelp'),
      (row) => row.figures.turns - row.figures.feedback.positive - row.figures.feedback.negative
    ),
    numeric(
      'undone',
      t('beta.usage.cmsTable.undone'),
      c('undoneHelp'),
      (row) => row.figures.undo.within24h.a,
      (row) => share(t, row.figures.undo.within24h)
    ),
    numeric(
      'followUp',
      c('followUp'),
      c('followUpHelp'),
      (row) => row.figures.followUp.a,
      (row) => share(t, row.figures.followUp)
    ),
    numeric(
      'rework',
      t('beta.usage.column.sameItem'),
      c('reworkHelp'),
      (row) => row.figures.rework.a,
      (row) => share(t, row.figures.rework)
    )
  ]
  return (
    <Card className="signals-panel" data-usage-block="cms">
      <div className="signals-panel-header">
        <h2>{c('title')}</h2>
        <span>{c('countedBy')}</span>
      </div>
      <p className="signals-panel-sub">{c('sub')}</p>
      <SignalTable
        id="usage-cms"
        columns={columns}
        rows={usagePlatforms(body, cms).map((key) => ({ cms: key, figures: body.turns[key] }))}
        rowKey={(row) => row.cms}
        defaultSort="requests"
        search={{ label: c('search'), match: (row) => cmsLabel(t, row.cms) }}
      />
    </Card>
  )
}
interface DetailRow {
  key: string
  label: string
  help: string
  value: (figures: TurnFigures) => number | null
  display?: (figures: TurnFigures) => ReactNode
}
const timing = (t: T, sample: Quantiles) => (
  <SignalHoverCard
    label={t('beta.usage.details.measuredTime')}
    summary={<span>{sample.p50 === null ? t('beta.usage.time.notEnough') : duration(t, sample.p50)}</span>}
  >
    <p>{t('beta.usage.details.measuredCount', counted(sample.n))}</p>
    {sample.p90 !== null && <p>{t('beta.usage.details.p90', { time: duration(t, sample.p90) })}</p>}
  </SignalHoverCard>
)
const DETAIL_KEYS = [
  'completed',
  'cut',
  'failed',
  'open',
  'unknownEnd',
  'uncertain',
  'finishedNoChange',
  'cutNoChange',
  'otherNoChange',
  'answerTime',
  'firstChange',
  'checked',
  'notSeen',
  'broken',
  'unconfirmed'
] as const
type DetailKey = (typeof DETAIL_KEYS)[number]
const DETAIL_VALUES: Record<DetailKey, (f: TurnFigures) => number | null> = {
  completed: (f) => f.endings.completed,
  cut: (f) => f.endings['max-tokens'],
  failed: (f) => f.endings.error + f.endings.aborted + f.endings.blocked + f.endings.interrupted,
  open: (f) => f.endings.running,
  unknownEnd: (f) => f.endings.stale + f.endings.unknown,
  uncertain: (f) => f.changes.outcomeUnknown,
  finishedNoChange: (f) => f.changes.unchangedCompleted,
  cutNoChange: (f) => f.changes.unchangedCut,
  otherNoChange: (f) => f.changes.unchangedNotCompleted,
  answerTime: (f) => f.time.turn.p50,
  firstChange: (f) => f.time.firstWrite.p50,
  checked: (f) => f.visual.shown,
  notSeen: (f) => f.visual.not_shown,
  broken: (f) => f.visual.broken,
  unconfirmed: (f) => f.visual.skipped + f.visual.cannot_tell + f.visual.unknown
}
const CHECK_ROWS = new Set<string>(['checked', 'notSeen', 'broken', 'unconfirmed'])

export function UsageDetails({ body, cms }: { body: Usage; cms: Platform }) {
  const t = useT()
  const rows: DetailRow[] = DETAIL_KEYS.map((key) => ({
    key,
    label: t(`beta.usage.details.${key}`),
    help: t(`beta.usage.details.${key}Help`),
    value: DETAIL_VALUES[key],
    display:
      key === 'answerTime'
        ? (f) => timing(t, f.time.turn)
        : key === 'firstChange'
          ? (f) => timing(t, f.time.firstWrite)
          : undefined
  }))
  const columns: SignalColumn<DetailRow>[] = [
    {
      key: 'label',
      label: t('beta.usage.details.measure'),
      help: t('beta.usage.details.measureHelp'),
      value: (row) => row.label,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.usage.details.definitionOf', { measure: row.label })}
          summary={<span>{row.label}</span>}
        >
          <p>{row.help}</p>
        </SignalHoverCard>
      )
    },
    ...[...usagePlatforms(body, cms), 'all' as const]
      .filter((key, index, array) => array.indexOf(key) === index)
      .map(
        (key): SignalColumn<DetailRow> => ({
          key,
          label: key === 'all' ? t('beta.usage.total') : cmsLabel(t, key),
          help:
            key === 'all'
              ? t('beta.usage.details.columnHelpAll')
              : t('beta.usage.details.columnHelp', { cms: cmsLabel(t, key) }),
          numeric: true,
          value: (row) => row.value(body.turns[key]),
          render: (row) =>
            row.display ? (
              row.display(body.turns[key])
            ) : row.value(body.turns[key]) === null ? (
              unavailable(t)
            ) : (
              <span title={row.help}>
                {row.value(body.turns[key]) === 0
                  ? outOf(
                      t,
                      'beta.usage.rate.requests',
                      0,
                      CHECK_ROWS.has(row.key) ? body.turns[key].changes.changed : body.turns[key].turns
                    )
                  : row.value(body.turns[key])}
              </span>
            )
        })
      )
  ]
  return (
    <Card className="signals-panel" data-usage-block="outcomes">
      <div className="signals-panel-header">
        <h2>{t('beta.usage.details.title')}</h2>
        <span>{t('beta.usage.details.hover')}</span>
      </div>
      <SignalTable
        id="usage-outcomes"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        defaultSort="label"
        search={{ label: t('beta.usage.details.search'), match: (row) => row.label }}
      />
    </Card>
  )
}
