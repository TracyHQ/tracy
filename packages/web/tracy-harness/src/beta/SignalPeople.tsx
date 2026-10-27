import { type T, useT } from '../i18n'
import type { Source, SourceBucket } from './api'
import { SignalHoverCard } from './SignalHoverCard'
import { sourceLabel } from './strings'

const sourceBuckets: SourceBucket[] = [
  'email',
  'blog',
  'demo',
  'site',
  'forum',
  'product-page',
  'helpdesk',
  'social',
  'video',
  'owned',
  'other',
  'none'
]

function sourceBucket(source: Source | null): SourceBucket {
  const medium = source?.medium
  if (!medium) return 'none'
  return sourceBuckets.includes(medium as SourceBucket) ? (medium as SourceBucket) : 'other'
}

export function signalChannel(t: T, source: Source | null) {
  return sourceLabel(t, sourceBucket(source))
}

export function SignalSource({ source }: { source: Source | null }) {
  const t = useT()
  const bucket = sourceBucket(source)
  const pill = (
    <span className="signals-source-pill" data-source={bucket}>
      <i className="signals-dot" aria-hidden="true" />
      {sourceLabel(t, bucket)}
    </span>
  )
  if (!source || !Object.values(source).some(Boolean)) return pill
  return (
    <SignalHoverCard label={t('beta.people.sourceDetails')} summary={pill}>
      <div>
        {t('beta.people.channel', { value: sourceLabel(t, bucket) })}
        <br />
        {t('beta.people.source', { value: source.source || t('beta.common.notRecorded') })}
        <br />
        {t('beta.people.campaign', { value: source.campaign || t('beta.common.notRecorded') })}
        <br />
        {t('beta.people.content', { value: source.content || t('beta.common.notRecorded') })}
      </div>
    </SignalHoverCard>
  )
}
