/** Customer text stays behind the existing server-enforced named-reader permission. */
import { Card } from '@tracy/ui'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { SignalHoverCard } from './SignalHoverCard'
import { type SignalColumn, SignalTable } from './SignalTable'
import { exactText, relativeText } from './strings'
import { fetchSample, type Sample, type SampleGroup, type SampleTurn, type UsageFilters } from './usage-api'
import { cmsLabel, duration, isPlatform } from './usage-data'

const GROUPS: Record<SampleGroup, string> = {
  bad: 'beta.usage.sample.group.bad',
  good: 'beta.usage.sample.group.good',
  unrated: 'beta.usage.sample.group.unrated',
  undone: 'beta.usage.sample.group.undone',
  failed: 'beta.usage.sample.group.failed',
  'not-shown': 'beta.usage.sample.group.notShown'
}
const ENDINGS: Record<string, string> = {
  completed: 'beta.usage.sample.ending.completed',
  'max-tokens': 'beta.usage.sample.ending.maxTokens',
  error: 'beta.usage.sample.ending.error',
  aborted: 'beta.usage.sample.ending.aborted',
  blocked: 'beta.usage.sample.ending.blocked',
  interrupted: 'beta.usage.sample.ending.interrupted',
  running: 'beta.usage.sample.ending.running',
  stale: 'beta.usage.sample.ending.stale',
  unknown: 'beta.usage.sample.ending.unknown'
}
export function UsageSample({ filters }: { filters: UsageFilters }) {
  const t = useT()
  const [group, setGroup] = useState<SampleGroup>('bad')
  const [sample, setSample] = useState<Sample | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    setSample(null)
    setError(null)
    void fetchSample(filters, group, ac.signal).then((answer) => {
      if (ac.signal.aborted) return
      if (answer.ok) setSample(answer.body)
      else setError(answer.status)
    })
    return () => ac.abort()
  }, [filters, group])
  const columns: SignalColumn<SampleTurn>[] = [
    {
      key: 'openedAt',
      label: t('beta.usage.sample.requested'),
      help: t('beta.usage.sample.requestedHelp'),
      value: (row) => row.openedAt,
      render: (row) =>
        row.openedAt ? (
          <time dateTime={row.openedAt} title={exactText(t, row.openedAt)}>
            {relativeText(t, row.openedAt)}
          </time>
        ) : (
          t('beta.common.notRecorded')
        )
    },
    {
      key: 'siteKey',
      label: t('beta.usage.column.site'),
      help: t('beta.usage.sample.siteHelp'),
      value: (row) => row.siteKey
    },
    {
      key: 'platform',
      label: t('beta.usage.column.cms'),
      help: t('beta.usage.sample.cmsHelp'),
      value: (row) => (isPlatform(row.platform) ? cmsLabel(t, row.platform) : cmsLabel(t, 'unknown'))
    },
    {
      key: 'ending',
      label: t('beta.usage.sample.result'),
      help: t('beta.usage.sample.resultHelp'),
      value: (row) => row.ending,
      render: (row) => (
        <span
          className="signals-chip signals-status-pill"
          data-tone={row.ending === 'completed' ? 'positive' : 'neutral'}
        >
          {t(ENDINGS[row.ending] ?? ENDINGS.unknown)}
        </span>
      )
    },
    {
      key: 'seconds',
      label: t('beta.usage.sample.time'),
      help: t('beta.usage.sample.timeHelp'),
      numeric: true,
      value: (row) => row.seconds,
      render: (row) => duration(t, row.seconds)
    },
    {
      key: 'text',
      label: t('beta.usage.sample.text'),
      help: t('beta.usage.sample.textHelp'),
      value: () => t('beta.usage.sample.view'),
      render: (row) => (
        <SignalHoverCard
          label={t('beta.usage.sample.for', { site: row.siteKey })}
          summary={<span className="signals-primary">{t('beta.usage.sample.view')}</span>}
        >
          <p className="usage-sample-request">{row.request}</p>
          <div className="usage-sample-reply">
            <strong>{t('beta.usage.sample.replied')}</strong>
            <p className="whitespace-pre-wrap">{row.reply ?? t('beta.usage.sample.noReply')}</p>
          </div>
          <p>
            {row.changed.length ? t('beta.usage.sample.changed') : t('beta.usage.sample.unchanged')}
            {row.undone ? ` · ${t('beta.usage.sample.undone')}` : ''}
          </p>
        </SignalHoverCard>
      )
    }
  ]
  return (
    <Card className="signals-panel" data-usage-block="samples" data-usage-sample>
      <div className="signals-panel-header">
        <h2>{t('beta.usage.sample.title')}</h2>
        <span>{t('beta.usage.sample.upTo')}</span>
      </div>
      <p className="signals-panel-sub">{t('beta.usage.sample.sub')}</p>
      <div className="signals-toolbar">
        <div className="signals-segment" role="group" aria-label={t('beta.usage.sample.groupLabel')}>
          {Object.entries(GROUPS).map(([key, labelKey]) => (
            <button
              key={key}
              type="button"
              data-usage-group={key}
              aria-pressed={group === key}
              onClick={() => setGroup(key as SampleGroup)}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>
      <SignalTable
        id="usage-samples"
        rows={sample?.turns || []}
        columns={columns}
        rowKey={(row) => row.turnId}
        defaultSort="openedAt"
        search={{
          label: t('beta.usage.sample.search'),
          match: (row) => [row.siteKey, row.platform, row.request, row.reply || ''].join(' ')
        }}
        loading={!sample && !error}
        error={error === null ? null : t('beta.usage.sample.failed', { status: error })}
      />
    </Card>
  )
}
