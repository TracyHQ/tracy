import { Card } from '@tracy/ui'
import { useT } from '../i18n'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { StatisticsKpi } from './StatisticsKpi'
import { counted } from './strings'
import type { FunnelFigures, Platform, Usage } from './usage-api'
import { cmsLabel, duration, outOf, rateLabel, usagePlatforms } from './usage-data'

type FunnelRow = { cms: Platform; figures: FunnelFigures }
export function UsageFunnel({ body, cms, compare }: { body: Usage; cms: Platform; compare: boolean }) {
  const t = useT()
  const f = (key: string) => t(`beta.usage.funnel.${key}`)
  const wizard = body.funnel.wizard
  const prior = compare ? body.previous?.funnel.wizard : undefined
  const numeric = (
    key: string,
    label: string,
    help: string,
    value: (row: FunnelRow) => number | null
  ): SignalColumn<FunnelRow> => ({
    key,
    label,
    help,
    numeric: true,
    value,
    render: (row) =>
      value(row) === null ? (
        <span className="signals-zero" title={f('notRecordedHelp')}>
          {t('beta.usage.unavailable')}
        </span>
      ) : (
        <span title={help}>
          {value(row) === 0 ? outOf(t, 'beta.usage.rate.sites', 0, row.figures.created) : value(row)}
        </span>
      )
  })
  const columns: SignalColumn<FunnelRow>[] = [
    {
      key: 'cms',
      label: t('beta.usage.column.cms'),
      help: f('cmsHelp'),
      value: (row) => (row.cms === 'all' ? t('beta.usage.total') : cmsLabel(t, row.cms))
    },
    numeric('created', f('created'), f('createdHelp'), (row) => row.figures.created),
    numeric('ready', f('ready'), f('readyHelp'), (row) => row.figures.built.done),
    numeric('failed', f('failed'), f('failedHelp'), (row) => row.figures.built.failed),
    numeric('pending', f('pending'), f('pendingHelp'), (row) => row.figures.built.pending),
    {
      key: 'customize',
      label: f('customize'),
      help: f('customizeHelp'),
      numeric: true,
      value: (row) => row.figures.customize.applied,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.usage.funnel.customizeFor', { cms: cmsLabel(t, row.cms) })}
          summary={<span className="signals-primary">{row.figures.customize.applied}</span>}
        >
          <p>
            {t('beta.usage.funnel.customizeSplit', {
              none: row.figures.customize.none,
              failed: row.figures.customize.failed,
              inProgress: row.figures.customize.inProgress
            })}
          </p>
        </SignalHoverCard>
      )
    },
    {
      key: 'opened',
      label: f('opened'),
      help: f('openedHelp'),
      numeric: true,
      value: (row) => row.figures.entered.a,
      render: (row) => <span title={f('openedCounted')}>{rateLabel(t, row.figures.entered, 'sites')}</span>
    },
    {
      ...numeric(
        'firstRequest',
        f('firstRequest'),
        f('firstRequestHelp'),
        (row) => row.figures.firstRequestWithin24h.a
      ),
      render: (row) => (
        <span title={f('firstRequestCounted')}>
          {rateLabel(t, row.figures.firstRequestWithin24h, 'sites')}
        </span>
      )
    },
    {
      ...numeric('returned', f('returned'), f('returnedHelp'), (row) => row.figures.returnedAnotherDay.a),
      render: (row) => (
        <span title={f('returnedCounted')}>{rateLabel(t, row.figures.returnedAnotherDay, 'sites')}</span>
      )
    },
    {
      key: 'time',
      label: f('time'),
      help: f('timeHelp'),
      numeric: true,
      value: (row) => row.figures.ready.p50,
      render: (row) => (
        <SignalHoverCard
          label={t('beta.usage.funnel.timeFor', { cms: cmsLabel(t, row.cms) })}
          summary={
            <span>
              {row.figures.ready.p50 === null
                ? t('beta.usage.time.notEnough')
                : duration(t, row.figures.ready.p50)}
            </span>
          }
        >
          <p>
            {t('beta.usage.funnel.measuredBuilds', counted(row.figures.ready.n))} ·{' '}
            {t('beta.usage.funnel.warm', { n: row.figures.warm })} ·{' '}
            {row.figures.readyUnknown === undefined
              ? f('missingNotRecorded')
              : t('beta.usage.funnel.withoutTime', { n: row.figures.readyUnknown })}
          </p>
          {row.figures.ready.p90 !== null && (
            <p>{t('beta.usage.funnel.p90', { time: duration(t, row.figures.ready.p90) })}</p>
          )}
        </SignalHoverCard>
      )
    }
  ]
  const steps = [
    {
      key: 'opened',
      label: f('step.opened'),
      series: 'users',
      count: wizard.opened,
      prior: prior?.opened,
      help: f('step.openedHelp'),
      note: f('step.openedNote')
    },
    {
      key: 'created',
      label: f('step.created'),
      series: 'sites',
      count: wizard.reachedCreate,
      prior: prior?.reachedCreate,
      help: f('step.createdHelp'),
      note: outOf(
        t,
        'beta.usage.funnel.step.createdNote',
        wizard.reachedCreateRate.a,
        wizard.reachedCreateRate.b
      )
    },
    {
      key: 'left',
      label: f('step.left'),
      series: 'failures',
      count: wizard.leftBeforeCreate,
      prior: prior?.leftBeforeCreate,
      help: f('step.leftHelp'),
      note: f('step.leftNote')
    },
    {
      key: 'pending',
      label: f('step.pending'),
      series: 'waitlist',
      count: wizard.pending,
      prior: prior?.pending,
      help: f('step.pendingHelp'),
      note: f('step.pendingNote')
    }
  ]
  return (
    <section className="usage-funnel" data-usage-block="funnel">
      <div className="usage-section-title">
        <h2>{f('title')}</h2>
        <p>{f('sub')}</p>
      </div>
      <div className="signals-kpis usage-kpis">
        {steps.map((step) => (
          <StatisticsKpi
            key={step.key}
            label={step.label}
            value={step.count}
            valueLabel={
              step.count === 0
                ? outOf(
                    t,
                    step.key === 'left'
                      ? 'beta.usage.funnel.zero.left'
                      : step.key === 'pending'
                        ? 'beta.usage.funnel.zero.pending'
                        : step.key === 'created'
                          ? 'beta.usage.funnel.zero.created'
                          : 'beta.usage.funnel.zero.opened',
                    0,
                    wizard.opened
                  )
                : undefined
            }
            series={step.series}
            previous={step.prior}
            unit={t('beta.usage.funnel.unit', { count: step.count })}
            definition={step.help}
            note={step.note}
            rows={[]}
            metric={() => 0}
            showTrend={false}
            comparisonNeutral={step.key === 'opened' || step.key === 'pending' || !!body.range?.partialEnd}
            comparisonLabel={body.range?.partialEnd ? t('beta.usage.periodInProgress') : undefined}
            goodWhenUp={step.key !== 'left'}
            scope={f('scope')}
            trendLabel={t('beta.usage.trend.daily')}
          />
        ))}
      </div>
      <Card className="signals-panel">
        <div className="signals-panel-header">
          <h2>{f('tableTitle')}</h2>
          <span>{f('tableNote')}</span>
        </div>
        <SignalTable
          id="usage-funnel"
          columns={columns}
          rows={[...usagePlatforms(body, cms), 'all' as const]
            .filter((key, index, array) => array.indexOf(key) === index)
            .map((key) => ({ cms: key, figures: body.funnel.byPlatform[key] }))}
          rowKey={(row) => row.cms}
          defaultSort="created"
          search={{
            label: f('search'),
            match: (row) => (row.cms === 'all' ? t('beta.usage.total') : cmsLabel(t, row.cms))
          }}
        />
      </Card>
    </section>
  )
}
