import { Card } from '@tracy/ui'
import { useState } from 'react'
import { exactTime } from '../ci-api'
import { formatFixed, type T, useT } from '../i18n'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsNote } from './StatisticsNote'
import type { SignalGrowth as Growth, GrowthChannel, GrowthFunnelStep } from './signal-growth-api'
import { formatNumber } from './signals-data'
import { counted } from './strings'
import './signal-growth.css'

const percent = (t: T, value: number | null) =>
  value === null ? t('beta.signals.growth.notAvailable') : `${formatFixed(value, 1)}%`
const STAGE_KEYS: Record<GrowthFunnelStep['key'], string> = {
  signedIn: 'beta.signals.growth.stageSignedIn',
  started: 'beta.signals.growth.stageStarted',
  ready: 'beta.signals.growth.stageReady',
  requested: 'beta.signals.growth.stageRequested',
  changed: 'beta.signals.growth.stageChanged'
}
const channelColumns = (t: T): SignalColumn<GrowthChannel>[] => [
  {
    key: 'channel',
    label: t('beta.filters.channel'),
    help: t('beta.signals.growth.channelHelp'),
    value: (row) => row.channel,
    render: (row) => (row.channel === 'none' ? t('beta.common.unknown') : row.channel)
  },
  {
    key: 'source',
    label: t('beta.filters.source'),
    value: (row) => row.source,
    render: (row) => (row.source === 'none' ? t('beta.common.notRecorded') : row.source)
  },
  {
    key: 'campaign',
    label: t('beta.filters.campaign'),
    value: (row) => row.campaign,
    render: (row) => (row.campaign === 'none' ? t('beta.common.notRecorded') : row.campaign)
  },
  {
    key: 'signIns',
    label: t('beta.signals.growth.signIns'),
    help: t('beta.signals.growth.signInsHelp'),
    numeric: true,
    value: (row) => row.signIns
  },
  {
    key: 'sites',
    label: t('beta.signals.growth.sitesStarted'),
    help: t('beta.signals.growth.sitesStartedHelp'),
    numeric: true,
    value: (row) => row.sites
  },
  { key: 'ready', label: t('beta.signals.growth.peopleReady'), numeric: true, value: (row) => row.ready },
  {
    key: 'requested',
    label: t('beta.signals.growth.peopleRequested'),
    numeric: true,
    value: (row) => row.requested
  },
  {
    key: 'requestPercent',
    label: t('beta.signals.growth.requestRate'),
    help: t('beta.signals.growth.requestRateHelp'),
    numeric: true,
    value: (row) => row.requestPercent,
    render: (row) => percent(t, row.requestPercent)
  },
  {
    key: 'changed',
    label: t('beta.signals.growth.peopleChanged'),
    numeric: true,
    value: (row) => row.changed
  },
  {
    key: 'activationPercent',
    label: t('beta.signals.growth.activationRate'),
    help: t('beta.signals.growth.activationRateHelp'),
    numeric: true,
    value: (row) => row.activationPercent,
    render: (row) => percent(t, row.activationPercent)
  }
]
const duration = (t: T, seconds: number) =>
  seconds < 60
    ? t('beta.signals.growth.seconds', { n: formatFixed(seconds, 1) })
    : seconds < 3600
      ? t('beta.signals.growth.minutes', { n: formatFixed(seconds / 60, 1) })
      : t('beta.signals.growth.hours', { n: formatFixed(seconds / 3600, 1) })
export function SignalGrowth({ growth, readAt }: { growth?: Growth; readAt: string }) {
  const t = useT()
  const [activity, setActivity] = useState<'presence' | 'requests'>('requests')
  if (!growth)
    return (
      <Card className="signals-panel">
        <div className="signals-panel-header">
          <h2>{t('beta.signals.growth.historyTitle')}</h2>
        </div>
        <div className="signals-empty">
          <strong>{t('beta.signals.growth.historyUnavailable')}</strong>
          <span>{t('beta.signals.growth.historyUnavailableBody')}</span>
        </div>
      </Card>
    )
  const retentionColumns: SignalColumn<Growth['retention'][number]>[] = [
    {
      key: 'week',
      label: t('beta.signals.growth.firstWeek'),
      help: t('beta.signals.growth.firstWeekHelp'),
      value: (row) => row.week
    },
    { key: 'people', label: t('beta.signals.growth.people'), numeric: true, value: (row) => row.people },
    ...[1, 2, 3, 4].map((week) => ({
      key: `week${week}`,
      label: t('beta.signals.growth.week', { n: week }),
      numeric: true,
      help: t('beta.signals.growth.weekHelp', { from: week * 7, to: (week + 1) * 7 - 1 }),
      value: (row: Growth['retention'][number]) =>
        row.weeks[week - 1][activity === 'presence' ? 'presencePercent' : 'requestPercent'],
      render: (row: Growth['retention'][number]) => {
        const cell = row.weeks[week - 1]
        return (
          <span
            data-growth-retention={`${row.week}:${week}`}
            title={`${t('beta.signals.growth.cellReturned', { ...counted(cell.eligible), returned: cell[activity] })} ${t('beta.signals.growth.cellPendingHelp', counted(cell.pending))}`}
          >
            {cell.eligible
              ? `${percent(t, cell[activity === 'presence' ? 'presencePercent' : 'requestPercent'])} (${cell[activity]}/${cell.eligible})`
              : t('beta.signals.growth.pending')}
            {cell.pending > 0 && (
              <small> · {t('beta.signals.growth.cellPending', { n: cell.pending })}</small>
            )}
          </span>
        )
      }
    }))
  ]
  return (
    <>
      <Card className="signals-panel" data-signal-growth="funnel">
        <div className="signals-panel-header">
          <h2>{t('beta.signals.growth.activationTitle')}</h2>
          <span>{t('beta.signals.growth.peopleCount', counted(growth.people))}</span>
        </div>
        <p className="signals-panel-sub">
          {t('beta.signals.growth.activationSub', { time: exactTime(readAt) })}
        </p>
        <div className="signals-table-scroll">
          <table className="signal-growth-funnel">
            <thead>
              <tr>
                <th>{t('beta.signals.growth.step')}</th>
                <th title={t('beta.signals.growth.peopleHelp')}>{t('beta.signals.growth.people')}</th>
                <th>{t('beta.signals.growth.fromPrevious')}</th>
                <th>
                  <SignalHoverCard
                    label={t('beta.signals.growth.notObservedDefinition')}
                    summary={<span>{t('beta.signals.growth.notObserved')}</span>}
                  >
                    <p>{t('beta.signals.growth.notObservedBody')}</p>
                  </SignalHoverCard>
                </th>
              </tr>
            </thead>
            <tbody>
              {growth.funnel.map((step) => (
                <tr key={step.key} data-growth-step={step.key}>
                  <th>
                    <SignalHoverCard
                      label={t('beta.signals.growth.definitionOf', { label: t(STAGE_KEYS[step.key]) })}
                      summary={<span>{t(STAGE_KEYS[step.key])}</span>}
                    >
                      <p>{t(`${STAGE_KEYS[step.key]}Help`)}</p>
                    </SignalHoverCard>
                  </th>
                  <td data-growth-value="people">{formatNumber(step.people)}</td>
                  <td data-growth-value="conversion">
                    {step.key === 'signedIn'
                      ? t('beta.signals.growth.startingGroup')
                      : percent(t, step.conversionPercent)}
                  </td>
                  <td data-growth-value="dropped">
                    {step.dropped === null
                      ? t('beta.signals.growth.startingGroup')
                      : formatNumber(step.dropped)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="signal-growth-timing">
          {(['firstSite', 'firstRequest'] as const).map((key) => {
            const sample = growth.timing[key]
            return (
              <div key={key} data-growth-timing={key}>
                <h3>
                  {key === 'firstSite'
                    ? t('beta.signals.growth.timeToSite')
                    : t('beta.signals.growth.timeToRequest')}
                </h3>
                <strong title={t('beta.signals.growth.medianHelp')}>
                  {sample.medianSeconds === null
                    ? t('beta.signals.growth.notEnough')
                    : duration(t, sample.medianSeconds)}
                </strong>
                <p>{t('beta.signals.growth.completers', counted(sample.n))}</p>
              </div>
            )
          })}
        </div>
        <StatisticsNote>{t('beta.signals.growth.timingNote')}</StatisticsNote>
        <StatisticsNote>
          {t('beta.signals.growth.coverage', {
            lifetimes: t('beta.signals.growth.siteLifetimes', counted(growth.coverage.unknownSiteLifetimes)),
            requests: t(
              'beta.signals.growth.requests',
              counted(growth.coverage.unknownRequestClassification)
            ),
            nonDemo: t(
              'beta.signals.growth.nonDemoRequests',
              counted(growth.coverage.requestsWithoutIncarnation)
            )
          })}
        </StatisticsNote>
      </Card>
      <Card className="signals-panel" data-signal-growth="retention">
        <div className="signals-panel-header">
          <h2 title={t('beta.signals.growth.retentionHelp')} tabIndex={0}>
            {t('beta.signals.growth.retentionTitle')}
          </h2>
          <label className="signal-growth-activity">
            {t('beta.signals.growth.activity')}{' '}
            <select
              aria-label={t('beta.signals.growth.retentionActivity')}
              value={activity}
              onChange={(event) => setActivity(event.target.value as typeof activity)}
            >
              <option value="requests">{t('beta.signals.growth.chatRequests')}</option>
              <option value="presence">{t('beta.signals.growth.presence')}</option>
            </select>
          </label>
        </div>
        <p className="signals-panel-sub">
          {activity === 'requests'
            ? t('beta.signals.growth.requestsSub')
            : t('beta.signals.growth.presenceSub')}{' '}
          {t('beta.signals.growth.cellsSub')}
        </p>
        <SignalTable
          id="growth-retention"
          columns={retentionColumns}
          rows={growth.retention}
          rowKey={(row) => row.week}
          defaultSort="week"
        />
      </Card>
      <Card className="signals-panel" data-signal-growth="channels">
        <div className="signals-panel-header">
          <h2>{t('beta.signals.growth.channelsTitle')}</h2>
          <span>{t('beta.signals.growth.combinations', counted(growth.channels.length))}</span>
        </div>
        <p className="signals-panel-sub">{t('beta.signals.growth.channelsSub')}</p>
        <SignalTable
          id="growth-channels"
          columns={channelColumns(t)}
          rows={growth.channels}
          rowKey={(row) => row.key}
          defaultSort="signIns"
        />
      </Card>
    </>
  )
}
